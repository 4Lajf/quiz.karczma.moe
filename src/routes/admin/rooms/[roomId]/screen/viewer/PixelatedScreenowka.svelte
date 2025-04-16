<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Shell as Spirals } from 'lucide-svelte';

	export let screenImage;
	export let room;
	export let supabase;
	export let currentRound;

	let gameContainer;
	let countdown;
	let initial;
	let info;
	let pointsCounter;
	let configButton;
	let sequenceInput;
	let showSequenceModal = false;

	// Example presets
	const presetExamples = [
		{
			name: 'Szybko, potem wolno',
			sequence: '128:800, 64:800, 32:1500, 16:2000, 8:3000, 4:4000, 2:4000, 1'
		},
		{
			name: 'Duże kroki, ręczna kontrola',
			sequence: '64, 32, 16, 8, 4, 2, 1'
		},
		{
			name: 'Powolne zmniejszanie',
			sequence: '64:1000, 48:1000, 32:1500, 24:1500, 16:2000, 12:2000, 8:2500, 6:2500, 4:3000, 2:3000, 1'
		},
		{
			name: 'Wolno duży spaek, szybko mały spadek',
			sequence: '128:2500,86:2500,64:2500, 56:2500, 46:2500, 40:2500, 34:2500, 29:1000, 28:1000,27:1000,26:1000,25:1000,24:1000,23:1000,22:1000,21:1000,20:1000,19:1000,18:1000,17:1000,16:1000,15:1000,14:1000,13:1000,12:1000,11:1000,10:1000,9:1000,8:1000,7:1000,6:1000,5:1000,4:1000'
		}
	];

	// Configuration state
	let config = {
		customSequence: '64:800, 32:1000, 16:2000, 8:3000, 4:4000, 2:4000, 1', // Default sequence
		minPoints: 25 // Minimum points value
	};

	// Parsed sequence
	let parsedSteps = [];

	// Game state
	let isImageLoaded = false;
	let isImagePlaying = false;
	let isImagePaused = false;
	let pointsValue = 100;
	let isPointsEnlarged = false;
	let showConfigPanel = false;
	let currentPixelSize = 0;
	let currentStep = 0;

	// Takeover and hand raise state
	let isTakeoverActive = false;
	let handRaiseResults = [];
	let channel;
	let lastChangedPlayer = null;
	let roundStarted = false;

	// Canvas elements
	let canvas;
	let ctx;
	let nextStepTimeout = null;

	// Parse the sequence string into usable steps
	function parseSequence(sequenceStr) {
		// Split by commas and trim whitespace
		const stepStrings = sequenceStr
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		const steps = [];

		for (let i = 0; i < stepStrings.length; i++) {
			const stepStr = stepStrings[i];

			// Check if step includes timing (format: "PIXELS:TIME_MS")
			if (stepStr.includes(':')) {
				const [pixelSizeStr, timeStr] = stepStr.split(':').map((s) => s.trim());
				const pixelSize = parseInt(pixelSizeStr, 10);
				const time = parseInt(timeStr, 10);

				if (!isNaN(pixelSize) && !isNaN(time)) {
					steps.push({ pixelSize, time });
				}
			} else {
				// If no timing, it requires manual progression
				const pixelSize = parseInt(stepStr, 10);

				if (!isNaN(pixelSize)) {
					steps.push({ pixelSize, time: null }); // null time means manual progression
				}
			}
		}

		// Sort by pixel size (largest to smallest) to ensure proper progression
		steps.sort((a, b) => b.pixelSize - a.pixelSize);

		return steps;
	}

	// Load image when screenImage changes
	$: if (browser && screenImage && screenImage.url && isImageLoaded) {
		loadNewImage();
	}

	// Parse sequence whenever config changes
	$: parsedSteps = parseSequence(config.customSequence);

	async function savePointsValue() {
		if (!currentRound || !room) return;

		try {
			// Store points in the same 'screen_game_points' table used by other components
			const { error } = await supabase.from('screen_game_points').upsert(
				{
					room_id: room.id,
					round_id: currentRound.id,
					points_value: pointsValue,
					updated_at: new Date().toISOString()
				},
				{ onConflict: 'room_id,round_id' }
			);

			if (error) throw error;
			console.log('Saved current points value:', pointsValue);
		} catch (error) {
			console.error('Failed to save points value:', error);
		}
	}

	async function loadCurrentPoints() {
		if (!currentRound || !room) return;

		try {
			// Check if there are any saved points for this round
			const { data, error } = await supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', currentRound.id).maybeSingle();

			if (error) throw error;

			// If we have saved data, use it, otherwise default to 100
			if (data?.points_value !== undefined) {
				console.log('Loaded saved points value:', data.points_value);
				pointsValue = data.points_value;
			} else {
				pointsValue = 100;
			}
		} catch (error) {
			console.error('Failed to load points value:', error);
			// Default to 100 if there's an error
			pointsValue = 100;
		}
	}

	function loadNewImage() {
		clearTimeouts();
		resetGame();

		// Initialize game state
		isImagePaused = false;
		isImagePlaying = false;
		currentStep = 0;

		// Set initial pixel size to the first step in the sequence
		if (parsedSteps.length > 0) {
			currentPixelSize = parsedSteps[0].pixelSize;
		} else {
			currentPixelSize = 64; // Default if no steps defined
		}

		// Show initial prompt
		if (initial) {
			initial.textContent = 'Naciśnij spację, aby rozpocząć...';
		}

		// Draw first pixelated image
		if (isImageLoaded) {
			drawPixelatedImage(currentPixelSize);
		}
	}

	function drawPixelatedImage(pixelSize) {
		if (!canvas || !ctx || !screenImage) return;

		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.src = screenImage.url;

		img.onload = function () {
			// Match canvas size to container
			canvas.width = gameContainer.clientWidth;
			canvas.height = gameContainer.clientHeight;

			// Calculate scaled dimensions to maintain aspect ratio
			const imgRatio = img.width / img.height;
			const canvasRatio = canvas.width / canvas.height;

			let drawWidth, drawHeight, offsetX, offsetY;

			if (imgRatio > canvasRatio) {
				// Image is wider relative to canvas
				drawWidth = canvas.width;
				drawHeight = drawWidth / imgRatio;
				offsetX = 0;
				offsetY = (canvas.height - drawHeight) / 2;
			} else {
				// Image is taller relative to canvas
				drawHeight = canvas.height;
				drawWidth = drawHeight * imgRatio;
				offsetX = (canvas.width - drawWidth) / 2;
				offsetY = 0;
			}

			// Clear canvas
			ctx.fillStyle = 'white';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			if (pixelSize <= 1) {
				// Draw the full resolution image when we reach the end
				ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
			} else {
				// Create a temporary canvas for the pixelation effect
				const tempCanvas = document.createElement('canvas');
				const tempCtx = tempCanvas.getContext('2d');

				// Set small size for pixelation effect
				const tempWidth = Math.floor(drawWidth / pixelSize);
				const tempHeight = Math.floor(drawHeight / pixelSize);

				tempCanvas.width = tempWidth;
				tempCanvas.height = tempHeight;

				// Draw small image (automatically scales down)
				tempCtx.drawImage(img, 0, 0, tempWidth, tempHeight);

				// Draw the small image back to the main canvas but scaled up (creates pixelation)
				// Use nearest-neighbor interpolation for crisp pixels
				ctx.imageSmoothingEnabled = false;
				ctx.drawImage(tempCanvas, offsetX, offsetY, drawWidth, drawHeight);
			}
		};
	}

	function clearTimeouts() {
		if (nextStepTimeout) {
			clearTimeout(nextStepTimeout);
			nextStepTimeout = null;
		}
	}

	function startPixelationAnimation() {
		if (!isImageLoaded || isImagePlaying || parsedSteps.length === 0) return;

		// Set loading text
		if (countdown) countdown.textContent = 'Ładowanie...';
		if (initial) initial.textContent = '';

		setTimeout(() => {
			isImagePlaying = true;
			isPointsEnlarged = false;

			if (countdown) countdown.textContent = '';

			// Reset to starting state
			currentStep = 0;
			pointsValue = 100;
			savePointsValue();

			// Get the first step
			const currentStepData = parsedSteps[currentStep];
			currentPixelSize = currentStepData.pixelSize;

			// Draw initial pixelated image
			drawPixelatedImage(currentPixelSize);

			// If the first step has a time, schedule the next step
			if (currentStepData.time !== null) {
				scheduleNextStep(currentStepData.time);
			}
		}, 500);
	}

	function scheduleNextStep(delay) {
		clearTimeouts();

		nextStepTimeout = setTimeout(() => {
			if (!isImagePlaying || isTakeoverActive) {
				return;
			}

			proceedToNextStep();
		}, delay);
	}

	function proceedToNextStep() {
		// Advance to the next step
		currentStep++;

		// Check if we've completed all steps
		if (currentStep >= parsedSteps.length) {
			// Animation complete
			isImagePlaying = false;

			// Set to min points and save
			pointsValue = config.minPoints;
			savePointsValue();
			return;
		}

		// Get the current step data
		const currentStepData = parsedSteps[currentStep];
		currentPixelSize = currentStepData.pixelSize;

		// Draw the image at new pixelation level
		drawPixelatedImage(currentPixelSize);

		// Calculate points based on current step
		pointsValue = Math.max(Math.ceil(100 - (100 - config.minPoints) * (currentStep / (parsedSteps.length - 1))), config.minPoints);

		// Save current points
		savePointsValue();

		// If this step has a time, schedule the next step automatically
		if (currentStepData.time !== null) {
			scheduleNextStep(currentStepData.time);
		}
	}

	function togglePlayPause() {
		if (!isImageLoaded) return;

		if (isImagePlaying) {
			// Pause animation - cancel any pending timeouts
			clearTimeouts();
			isImagePlaying = false;
			isImagePaused = true;
			isPointsEnlarged = true;
			savePointsValue();
		} else if (isImagePaused) {
			// Resume animation
			isImagePlaying = true;
			isImagePaused = false;
			isPointsEnlarged = false;

			// Get the current step data
			const currentStepData = parsedSteps[currentStep];

			// If this step has a time, schedule the next step automatically
			if (currentStepData && currentStepData.time !== null) {
				scheduleNextStep(currentStepData.time);
			} else {
				// If manual progression, move to the next step now
				proceedToNextStep();
			}
		} else {
			// Start new animation
			startPixelationAnimation();
			roundStarted = true;
		}
	}

	function applyPreset(presetSequence) {
		config.customSequence = presetSequence;
		if (sequenceInput) {
			sequenceInput.value = presetSequence;
		}
	}

	function revealFullImage() {
		if (!isImageLoaded || !screenImage) return;

		// Stop any ongoing animation
		clearTimeouts();

		// Draw the full resolution image
		drawPixelatedImage(1);

		// Set points to minimum after revealing all
		pointsValue = config.minPoints;
		isImagePlaying = false;
		isImagePaused = false;

		// Save final points value
		savePointsValue();
	}

	function resetGame() {
		// Clear canvas
		if (ctx && canvas) {
			ctx.fillStyle = 'white';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}

		// Reset state
		isImagePlaying = false;
		isImagePaused = false;
		pointsValue = 100;
		currentStep = 0;

		// Set initial pixel size to the first step in the sequence
		if (parsedSteps.length > 0) {
			currentPixelSize = parsedSteps[0].pixelSize;
		}

		// Save reset points value
		savePointsValue();

		clearTimeouts();
	}

	function updateConfig() {
		// Ensure minimum points is valid
		config.minPoints = Math.max(0, Math.min(config.minPoints, 50));

		// Save to localStorage
		saveConfigToLocalStorage();

		// Reset game
		clearTimeouts();
		resetGame();
		drawPixelatedImage(currentPixelSize);

		// Hide config panel
		showConfigPanel = false;
	}

	function saveCustomSequence() {
		if (sequenceInput) {
			config.customSequence = sequenceInput.value;
		}
		showSequenceModal = false;

		// Validate and update
		updateConfig();
	}

	// Hand raise and takeover logic
	async function loadHandRaiseResults() {
		try {
			const { data, error } = await supabase.from('hand_raises').select('*').eq('room_id', room.id).order('server_timestamp', { ascending: true });

			if (error) throw error;

			if (data && data.length > 0) {
				handRaiseResults = data.map((result, index) => ({
					name: result.player_name,
					position: index + 1,
					timestamp: result.server_timestamp
				}));

				// Pause game and enlarge points if hand raises exist
				if (handRaiseResults.length > 0) {
					if (!isImagePaused && roundStarted) {
						togglePlayPause();
					}
				}
			} else {
				handRaiseResults = [];
			}
		} catch (error) {
			console.error('Failed to load hand raise results:', error);
		}
	}

	function saveConfigToLocalStorage() {
		if (browser) {
			try {
				localStorage.setItem('pixelatedScreenowkaConfig', JSON.stringify(config));
			} catch (error) {
				console.error('Failed to save config to localStorage:', error);
			}
		}
	}

	function setupHoverDetection() {
		let timeout;
		const cornerSize = 100; // Size of the corner area that activates the button

		const handleMouseMove = (e) => {
			// Check if mouse is in the top right corner
			if (e.clientX > window.innerWidth - cornerSize && e.clientY < cornerSize) {
				if (configButton) {
					configButton.style.opacity = '1';
				}
				clearTimeout(timeout);
			} else {
				// Hide button after a delay if not hovering the button itself
				if (configButton && !configButton.matches(':hover') && !document.querySelector('.config-panel:hover')) {
					timeout = setTimeout(() => {
						configButton.style.opacity = '0';

						// Also hide panel if not hovering it
						if (!document.querySelector('.config-panel:hover')) {
							showConfigPanel = false;
						}
					}, 1000);
				}
			}
		};

		document.addEventListener('mousemove', handleMouseMove);

		return handleMouseMove;
	}

	onMount(async () => {
		if (browser) {
			// Load configuration from localStorage
			const savedConfig = localStorage.getItem('pixelatedScreenowkaConfig');
			if (savedConfig) {
				try {
					const parsedConfig = JSON.parse(savedConfig);
					config = { ...config, ...parsedConfig };
				} catch (error) {
					console.error('Failed to load config from localStorage:', error);
				}
			}

			// Set up canvas
			ctx = canvas.getContext('2d');
			isImageLoaded = true;

			// Load image if available
			if (screenImage && screenImage.url) {
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.src = screenImage.url;
				img.onload = function () {
					isImageLoaded = true;
					if (initial) {
						initial.textContent = 'Naciśnij spację, aby rozpocząć...';
					}
					// Set initial pixel size to the first step in the sequence
					if (parsedSteps.length > 0) {
						currentPixelSize = parsedSteps[0].pixelSize;
					}
					drawPixelatedImage(currentPixelSize);
					loadCurrentPoints();
				};
			}

			// Set up event listeners
			window.addEventListener('keydown', handleKeyDown);
			gameContainer.addEventListener('click', handleGameClick);

			// Setup config button hover behavior
			const handleMouseMove = setupHoverDetection();

			// Check current takeover mode status
			try {
				const { data, error } = await supabase.from('hand_raises').select('player_name').eq('room_id', room.id).limit(1).maybeSingle();

				if (!error && data) {
					isTakeoverActive = true;
					isPointsEnlarged = true;
					await loadHandRaiseResults();
				}
			} catch (error) {
				console.error('Error checking takeover mode:', error);
			}

			// Set up subscription to room changes and hand raises
			channel = supabase
				.channel(`screen-takeover-${room.id}`)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'hand_raises',
						filter: `room_id=eq.${room.id}`
					},
					async (payload) => {
						await loadHandRaiseResults();
					}
				)
				.subscribe();

			return () => {
				window.removeEventListener('keydown', handleKeyDown);
				gameContainer?.removeEventListener('click', handleGameClick);
				document.removeEventListener('mousemove', handleMouseMove);
			};
		}
	});

	function handleKeyDown(event) {
		if (event.code === 'Space') {
			event.preventDefault();
			togglePlayPause();
			roundStarted = true;
		}
	}

	function handleGameClick(event) {
		// Prevent triggering on config panel or sequence modal
		if (event.target.closest('.config-panel') || event.target.closest('.config-button') || event.target.closest('.sequence-modal')) {
			return;
		}
		togglePlayPause();
		roundStarted = true;
	}

	onDestroy(() => {
		clearTimeouts();
		if (channel) channel.unsubscribe();
	});
</script>

<div class="relative h-full w-full bg-white" bind:this={gameContainer}>
	<!-- Canvas element for pixelated image -->
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full"></canvas>

	<!-- Initial message -->
	<div bind:this={initial} class="absolute bottom-4 right-4 z-10 text-xl font-bold text-black">
		{#if !screenImage}
			Brak obrazu dla aktualnej rundy
		{:else if !isImageLoaded}
			Ładowanie obrazu...
		{:else if !isImagePlaying}
			Naciśnij spację lub kliknij, aby rozpocząć
		{/if}
	</div>

	<!-- Points counter -->
	<div bind:this={pointsCounter} class="absolute bottom-4 right-4 z-20 flex items-center justify-center rounded-md bg-gray-800/80 p-2 font-bold text-white transition-all duration-300" class:text-2xl={!isPointsEnlarged} class:text-6xl={isPointsEnlarged}>
		{pointsValue}
	</div>

	<!-- Configuration button -->
	<!-- svelte-ignore a11y_consider_explicit_label -->
	<button bind:this={configButton} class="config-button absolute right-4 top-4 z-20 rounded-full bg-gray-800 p-2 text-white opacity-0 transition-opacity duration-300" on:click={() => (showConfigPanel = !showConfigPanel)}>
		<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="3"></circle>
			<path
				d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
			></path>
		</svg>
	</button>

	<!-- Configuration Panel -->
	{#if showConfigPanel}
		<div class="config-panel absolute right-4 top-14 z-20 w-auto max-w-xl rounded-md bg-gray-800 p-4 text-white shadow-md">
			<h3 class="mb-4 text-lg font-bold">Ustawienia pixelowania</h3>

			<div class="mb-4">
				<div class="flex items-center justify-between">
					<h4 class="font-medium">Sekwencja pixelowania</h4>
					<button on:click={() => (showSequenceModal = true)} class="rounded bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700">Edytuj sekwencję</button>
				</div>
				<div class="mt-2 max-h-20 overflow-auto rounded bg-gray-700 p-2 text-sm">
					<code>{config.customSequence}</code>
				</div>
			</div>

			<div class="mb-2 flex items-center justify-between">
				<label for="min-points" class="block">Minimalna liczba punktów</label>
				<span class="text-sm text-gray-300">{config.minPoints}</span>
			</div>
			<input type="range" id="min-points" min="0" max="50" bind:value={config.minPoints} class="h-2 w-full appearance-none rounded-md bg-gray-700" />

			<div class="mt-4 flex gap-2">
				<button on:click={updateConfig} class="flex-1 rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700"> Zastosuj </button>
				<button on:click={revealFullImage} class="rounded-md bg-amber-600 py-2 text-white hover:bg-amber-700">Pokaż pełny obraz</button>
			</div>
		</div>
	{/if}

	<!-- Sequence Input Modal -->
	{#if showSequenceModal}
		<div class="sequence-modal fixed inset-0 z-30 flex items-center justify-center bg-black/70">
			<div class="w-full max-w-3xl rounded-md bg-gray-800 p-6 text-white shadow-xl">
				<h3 class="mb-3 text-xl font-bold">Edycja sekwencji pixelacji</h3>

				<p class="mb-3 text-sm text-gray-300">
					Wpisz sekwencję w formacie: <code class="rounded bg-gray-700 px-1">PIXELS:TIME_MS, PIXELS:TIME_MS, ...</code><br />
					Jeśli czas nie jest podany, przejście do następnego kroku będzie ręczne. Na przykład: <code class="rounded bg-gray-700 px-1">64, 32, 16</code>
				</p>

				<textarea bind:this={sequenceInput} class="mb-4 h-28 w-full rounded border border-gray-700 bg-gray-900 p-2 text-white" value={config.customSequence}></textarea>

				<div class="mb-4">
					<h4 class="mb-2 font-medium">Presety</h4>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each presetExamples as preset}
							<button on:click={() => applyPreset(preset.sequence)} class="rounded border border-gray-700 bg-gray-700 p-2 text-left text-sm hover:bg-gray-600">
								<strong>{preset.name}</strong>
								<div class="mt-1 line-clamp-1 text-xs text-gray-300">{preset.sequence}</div>
							</button>
						{/each}
					</div>
				</div>

				<div class="flex justify-end gap-2">
					<button on:click={() => (showSequenceModal = false)} class="rounded-md bg-gray-700 px-4 py-2 text-white hover:bg-gray-600">Anuluj</button>
					<button on:click={saveCustomSequence} class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">Zapisz</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- No image placeholder -->
	{#if !screenImage}
		<div class="flex h-full w-full items-center justify-center">
			<p class="text-xl text-gray-400">Brak obrazu dla aktualnej rundy</p>
		</div>
	{/if}
</div>

<style>
	/* Range input styling */
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #4299e1;
		cursor: pointer;
	}

	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #4299e1;
		cursor: pointer;
	}

	.config-button {
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.config-panel {
		animation: fadeIn 0.2s ease-in-out;
	}

	.sequence-modal {
		animation: fadeIn 0.2s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
