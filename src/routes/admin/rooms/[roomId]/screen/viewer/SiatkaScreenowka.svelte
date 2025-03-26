<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Shell as Spirals } from 'lucide-svelte';

	export let screenImage;
	export let room;
	export let supabase;

	let gameContainer;
	let countdown;
	let initial;
	let info;
	let pointsCounter;
	let configButton;

	// Configuration state
	let config = {
		gridRows: 8,
		gridColumns: 8,
		animationSpeed: 3000, // 3 seconds between reveals
		randomReveal: true
	};

	// Game state
	let isImageLoaded = false;
	let isImagePlaying = false;
	let isImagePaused = false;
	let pointsValue = 100;
	let isPointsEnlarged = false;
	let showConfigPanel = false;

	// Takeover and hand raise state
	let isTakeoverActive = false;
	let handRaiseResults = [];
	let channel;
	let lastChangedPlayer = null;

	// Image and piece management
	let image = null;
	let fullImageContainer = null;
	let imagePieces = [];
	let revealedPieces = [];
	let totalPieces = 0;
	let partInterval = null;

	// Load image when screenImage changes
	$: if (browser && screenImage && screenImage.url && image && image.src !== screenImage.url) {
		loadNewImage();
	}

	function loadNewImage() {
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}
		resetGame();

		isImageLoaded = false;
		isImagePlaying = false;
		isImagePaused = false;

		image.src = screenImage.url;
		image.onload = () => {
			isImageLoaded = true;
			generateImagePieces();
		};
	}

	function generateImagePieces() {
		if (!gameContainer || !image) return;

		const screenWidth = gameContainer.clientWidth;
		const screenHeight = gameContainer.clientHeight;

		// Create a container for the full image
		fullImageContainer = document.createElement('div');
		fullImageContainer.className = 'full-image-container';
		fullImageContainer.style.position = 'absolute';
		fullImageContainer.style.top = '0';
		fullImageContainer.style.left = '0';
		fullImageContainer.style.width = '100%';
		fullImageContainer.style.height = '100%';
		fullImageContainer.style.backgroundColor = 'white'; // Changed to white
		fullImageContainer.style.opacity = '1'; // Fully opaque white

		// Calculate image scaling to fit screen while maintaining aspect ratio
		const imgRatio = image.width / image.height;
		const screenRatio = screenWidth / screenHeight;

		let displayWidth, displayHeight, offsetX, offsetY;

		if (imgRatio > screenRatio) {
			// Image is wider relative to screen
			displayWidth = screenWidth;
			displayHeight = screenWidth / imgRatio;
			offsetX = 0;
			offsetY = (screenHeight - displayHeight) / 2;
		} else {
			// Image is taller relative to screen
			displayHeight = screenHeight;
			displayWidth = screenHeight * imgRatio;
			offsetY = 0;
			offsetX = (screenWidth - displayWidth) / 2;
		}

		// Create a mask container to precisely clip the image area
		const maskContainer = document.createElement('div');
		maskContainer.style.position = 'absolute';
		maskContainer.style.top = `${offsetY}px`;
		maskContainer.style.left = `${offsetX}px`;
		maskContainer.style.width = `${displayWidth}px`;
		maskContainer.style.height = `${displayHeight}px`;
		maskContainer.style.overflow = 'hidden'; // Critical for preventing overflow

		// Calculate piece dimensions
		const pieceWidth = displayWidth / config.gridColumns;
		const pieceHeight = displayHeight / config.gridRows;

		imagePieces = [];
		revealedPieces = [];

		// Create grid pieces
		for (let row = 0; row < config.gridRows; row++) {
			for (let col = 0; col < config.gridColumns; col++) {
				const pieceElement = document.createElement('div');
				pieceElement.className = 'image-piece';

				// Position and size the piece
				pieceElement.style.width = `${pieceWidth}px`;
				pieceElement.style.height = `${pieceHeight}px`;
				pieceElement.style.position = 'absolute';
				pieceElement.style.top = `${row * pieceHeight}px`;
				pieceElement.style.left = `${col * pieceWidth}px`;

				// Background settings
				pieceElement.style.backgroundImage = `url(${image.src})`;
				pieceElement.style.backgroundSize = `${displayWidth}px ${displayHeight}px`;
				pieceElement.style.backgroundPosition = `-${col * pieceWidth}px -${row * pieceHeight}px`;

				// Initially hidden
				pieceElement.style.opacity = '0';
				pieceElement.style.backgroundColor = 'white'; // Changed to white

				// Store metadata
				pieceElement.dataset.row = row.toString();
				pieceElement.dataset.col = col.toString();

				imagePieces.push(pieceElement);
			}
		}

		// Append pieces to mask container
		imagePieces.forEach((piece) => maskContainer.appendChild(piece));

		// Add mask container and full image container to game container
		fullImageContainer.appendChild(maskContainer);
		gameContainer.appendChild(fullImageContainer);

		totalPieces = imagePieces.length;

		// Add initial text
		if (initial) {
			initial.textContent = 'Naciśnij spację, aby rozpocząć...';
		}
	}

	function splitImage() {
		if (!gameContainer || !isImageLoaded) return;

		// Set loading text
		if (countdown) countdown.textContent = 'Ładowanie...';
		if (initial) initial.textContent = '';

		setTimeout(() => {
			if (!gameContainer) return;

			isImagePlaying = true;
			if (countdown) countdown.textContent = '';

			// Shuffle pieces if random reveal is enabled
			const piecesToReveal = config.randomReveal ? imagePieces.sort(() => Math.random() - 0.5) : [...imagePieces];

			let revealedCount = 0;

			partInterval = setInterval(() => {
				if (!gameContainer) {
					clearInterval(partInterval);
					partInterval = null;
					return;
				}

				if (!isImagePlaying || isTakeoverActive) {
					return;
				}

				if (revealedCount < piecesToReveal.length) {
					const piece = piecesToReveal[revealedCount];

					setTimeout(() => {
						if (piece) {
							// Remove black overlay and show piece
							piece.style.backgroundColor = 'transparent';
							piece.style.opacity = '1';
						}
					}, 10);

					revealedCount++;

					// Calculate points
					pointsValue = Math.ceil((1 - revealedCount / totalPieces) * 100);

					revealedPieces.push(piece);
				} else {
					// All pieces revealed
					clearInterval(partInterval);
					partInterval = null;
					isImagePlaying = false;
					isImagePaused = false;
					pointsValue = 0;
				}
			}, config.animationSpeed);
		}, 500);
	}

	function togglePlayPause() {
		if (!isImageLoaded) return;

		if (isImagePlaying) {
			// Pause
			isImagePlaying = false;
			isImagePaused = true;
			isPointsEnlarged = true;
		} else {
			if (isImagePaused) {
				// Resume
				isImagePlaying = true;
				isImagePaused = false;
				isPointsEnlarged = false;
			} else {
				// Start new reveal
				splitImage();
				if (initial) initial.textContent = '';
				isPointsEnlarged = false;
			}
		}
	}

	function resetGame() {
		if (!gameContainer) return;

		// Clear image pieces
		const pieces = gameContainer.querySelectorAll('.image-piece');
		pieces.forEach((piece) => {
			if (piece && piece.parentNode) {
				piece.parentNode.removeChild(piece);
			}
		});

		// Reset state
		imagePieces = [];
		revealedPieces = [];
		isImagePlaying = false;
		isImagePaused = false;
		pointsValue = 100;

		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}
	}

	function updateConfig() {
		// Validate config
		config.gridRows = Math.max(2, Math.min(config.gridRows, 20));
		config.gridColumns = Math.max(2, Math.min(config.gridColumns, 20));

		// Save to localStorage
		saveConfigToLocalStorage();

		// Reset game to regenerate pieces
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}
		resetGame();
		generateImagePieces();

		// Hide config panel
		showConfigPanel = false;
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
					togglePlayPause();
				}
			} else {
				handRaiseResults = [];
			}
		} catch (error) {
			console.error('Failed to load hand raise results:', error);
		}
	}

	function handleNextTakeover() {
		if (handRaiseResults.length > 1) {
			handRaiseResults = handRaiseResults.slice(1);
		} else {
			handRaiseResults = [];
		}
	}

	function saveConfigToLocalStorage() {
		if (browser) {
			try {
				localStorage.setItem('siatkaScreenowkaConfig', JSON.stringify(config));
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
	}

	onMount(async () => {
		if (browser) {
			// Load configuration from localStorage
			const savedConfig = localStorage.getItem('siatkaScreenowkaConfig');
			if (savedConfig) {
				try {
					const parsedConfig = JSON.parse(savedConfig);
					config = { ...config, ...parsedConfig };
				} catch (error) {
					console.error('Failed to load config from localStorage:', error);
				}
			}

			// Create image object
			image = new Image();
			image.crossOrigin = 'anonymous';
			image.onload = function () {
				isImageLoaded = true;
				if (initial) {
					initial.textContent = 'Naciśnij spację, aby rozpocząć...';
				}
				generateImagePieces();
			};

			// Load D3 dynamically (similar to RozbitaScreenowka)
			try {
				const d3Module = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm');
				const d3VoronoiModule = await import('https://cdn.jsdelivr.net/npm/d3-voronoi@1/+esm');

				window.d3 = d3Module;
				window.d3Voronoi = d3VoronoiModule;
			} catch (error) {
				console.error('Failed to load D3 libraries:', error);
			}

			// Set up event listeners
			window.addEventListener('keydown', handleKeyDown);
			gameContainer.addEventListener('click', handleGameClick);

			// Setup config button hover behavior
			setupHoverDetection();

			// Load image if available
			if (screenImage && screenImage.url) {
				image.src = screenImage.url;
			}

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
		}

		return () => {
			if (browser) {
				window.removeEventListener('keydown', handleKeyDown);
				gameContainer?.removeEventListener('click', handleGameClick);
				document.removeEventListener('mousemove', handleMouseMove);
			}
		};
	});

	function handleKeyDown(event) {
		if (event.code === 'Space') {
			event.preventDefault();
			togglePlayPause();
		}
	}

	function handleGameClick(event) {
		// Prevent triggering on config panel
		if (event.target.closest('.config-panel') || event.target.closest('.config-button')) {
			return;
		}
		togglePlayPause();
	}

	onDestroy(() => {
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}
		if (channel) channel.unsubscribe();
	});
</script>

<div class="relative h-full w-full bg-white" bind:this={gameContainer}>
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

	<!-- Hand raise results -->
	{#if handRaiseResults.length > 0}
		<div class="absolute left-4 top-4 z-30 flex items-center gap-2 rounded bg-black/70 px-3 py-2 text-white">
			<span class="font-bold">Odpowiada: {handRaiseResults[0].name}</span>
			<button on:click={handleNextTakeover} class="ml-2 rounded bg-black px-3 py-1 text-sm font-bold text-white transition-colors duration-300 hover:bg-black/30"> Next </button>
		</div>
	{/if}

	<!-- Configuration Panel -->
	{#if showConfigPanel}
		<div class="config-panel absolute right-4 top-14 z-20 w-64 rounded-md bg-gray-800 p-4 text-white shadow-md">
			<h3 class="mb-4 text-lg font-bold">Ustawienia siatki</h3>

			<div class="mb-4">
				<!-- Continuing from previous code -->
				<label for="grid-rows" class="mb-2 block">Liczba wierszy ({config.gridRows})</label>
				<input type="range" id="grid-rows" min="2" max="20" bind:value={config.gridRows} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
			</div>

			<div class="mb-4">
				<label for="grid-columns" class="mb-2 block">Liczba kolumn ({config.gridColumns})</label>
				<input type="range" id="grid-columns" min="2" max="20" bind:value={config.gridColumns} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
			</div>

			<div class="mb-4">
				<label for="reveal-speed" class="mb-2 block">Prędkość odkrywania ({config.animationSpeed}ms)</label>
				<input type="range" id="reveal-speed" min="1000" max="5000" step="500" bind:value={config.animationSpeed} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
			</div>

			<div class="mb-4">
				<div class="flex items-center">
					<input type="checkbox" id="random-reveal" bind:checked={config.randomReveal} class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
					<label for="random-reveal">Losowe odkrywanie elementów</label>
				</div>
			</div>

			<div class="flex gap-2">
				<button on:click={updateConfig} class="flex-1 rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700"> Zastosuj </button>
				<button
					on:click={() => {
						// Reset to default configuration
						config = {
							gridRows: 8,
							gridColumns: 8,
							animationSpeed: 3000,
							randomReveal: true
						};
						updateConfig();
					}}
					class="rounded-md bg-gray-600 px-2 py-2 text-white hover:bg-gray-700"
				>
					Reset
				</button>
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
	/* Existing styles from previous implementation */
	:global(.image-piece) {
		position: absolute;
		background-color: black;
		transition:
			opacity 0.2s ease-in-out,
			background-color 0.2s ease-in-out;
		z-index: 10;
		background-size: cover;
		background-position: center;
	}

	:global(.full-image-container) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center;
		opacity: 0;
		transition: opacity 0.2s ease-in-out;
		z-index: 1;
		background-color: black;
	}

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
