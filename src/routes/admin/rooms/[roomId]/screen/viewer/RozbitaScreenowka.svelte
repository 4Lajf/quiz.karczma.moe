<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	export let screenImage;
	export let room;
	export let supabase;

	let gameContainer;
	let countdown;
	let info;
	let initial;
	let configButton;
	let showConfigPanel = false;
	let pointsCounter;
	let pointsValue = 100;
	let isPointsEnlarged = false;
	let isTakeoverActive = false;
	let channel;
	let handRaiseResults = [];
	let lastChangedPlayer = null;

	let partInterval;
	let polygonMasks = [];
	let isImageLoaded = false;
	let isImagePlaying = false;
	let isImagePaused = false;

	// Configuration options with defaults
	let config = {
		numParts: 75, // Number of polygons (50-150)
		animationSpeed: 400, // Animation speed in ms (100-1000)
		revealOrder: 'random' // 'random' or 'spiral'
	};

	// Generate random points for polygon masks
	function generateMasks() {
		polygonMasks = [];
		for (let i = 0; i < config.numParts; i++) {
			const pointX = Math.random();
			const pointY = Math.random();
			polygonMasks.push([pointX, pointY]);
		}
	}

	// Initial generation
	generateMasks();

	// Initialize image as null to avoid server-side errors
	let image = null;

	// Load hand raise results
	async function loadHandRaiseResults() {
		try {
			const { data, error } = await supabase.from('hand_raises').select('*').eq('room_id', room.id).order('server_timestamp', { ascending: true });

			if (error) throw error;

			if (data && data.length > 0) {
				const firstTimestamp = new Date(data[0].server_timestamp).getTime();
				const firstLatency = data[0].measured_latency || 0;
				const adjustedFirstTime = firstTimestamp - firstLatency;

				handRaiseResults = data.map((result, index) => {
					const timestamp = new Date(result.server_timestamp).getTime();
					const latency = result.measured_latency || 0;
					const adjustedTime = timestamp - latency;
					const timeDifferenceMs = index === 0 ? 0 : adjustedTime - adjustedFirstTime;

					return {
						name: result.player_name,
						position: index + 1,
						timestamp: result.server_timestamp,
						timeDifferenceMs,
						latency
					};
				});

				// Set takeover as active and enlarge points when there are hand raises
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
		// Remove the first entry from handRaiseResults if it exists
		if (handRaiseResults.length > 1) {
			handRaiseResults = handRaiseResults.slice(1);
		} else {
			// If no more takeovers, clear the list and resume animation
			handRaiseResults = [];
		}
	}

	onMount(async () => {
		if (browser) {
			// Only create the Image object in browser context
			image = new Image();
			image.crossOrigin = 'anonymous';
			image.onload = function () {
				isImageLoaded = true;
				if (initial) {
					initial.textContent = 'Naciśnij spację, aby rozpocząć...';
				}
			};

			if (screenImage && screenImage.url) {
				image.src = screenImage.url;
			}

			// Import D3 dynamically
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

			// Check current takeover mode status first
			try {
				const { data, error } = await supabase.from('hand_raises').select('player_name').eq('room_id', room.id).limit(1).maybeSingle();
				console.log(data);
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
						// Update hand raise results
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
				if (partInterval) {
					clearInterval(partInterval);
					partInterval = null;
				}
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
		// Don't trigger if clicking on config panel or button
		if (event.target.closest('.config-panel') || event.target.closest('.config-button')) {
			return;
		}
		console.log('before play pause', isImagePlaying);
		togglePlayPause();
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

	function toggleConfigPanel() {
		showConfigPanel = !showConfigPanel;
	}

	function applyConfig() {
		// Stop any ongoing animation
		if (isImagePlaying) {
			if (partInterval) {
				clearInterval(partInterval);
				partInterval = null;
			}
			resetGame();
		}

		// Generate new masks with updated config
		generateMasks();

		// Hide panel after applying
		showConfigPanel = false;
	}

	// Toggle between play and pause states
	function togglePlayPause() {
		if (!isImageLoaded) {
			return;
		}

		if (isImagePlaying) {
			isImagePlaying = false;
			isImagePaused = true;
			isPointsEnlarged = true;
		} else {
			if (isImagePaused) {
				// Resume animation that was paused
				isImagePlaying = true;
				isImagePaused = false;
				isPointsEnlarged = false;
			} else {
				// Start new animation if it's the first time
				splitImage();
				if (initial) {
					initial.textContent = '';
				}
				// Reset points to 100 only when starting for the first time
				pointsValue = 100;
				isPointsEnlarged = false;
			}
		}
	}

	function splitImage() {
		if (!gameContainer || !image || !image.complete) return;

		// Set loading text
		if (countdown) countdown.textContent = 'Ładowanie...';
		if (initial) initial.textContent = '';

		setTimeout(() => {
			if (!gameContainer) return; // Safety check - component might have been unmounted

			isImagePlaying = true;
			if (countdown) countdown.textContent = '';

			const screenWidth = gameContainer.clientWidth;
			const screenHeight = gameContainer.clientHeight;

			// Use d3 voronoi to generate polygons
			if (!window.d3Voronoi || !window.d3) {
				console.error('D3 libraries not loaded');
				return;
			}

			const voronoi = window.d3Voronoi.voronoi().extent([
				[0, 0],
				[screenWidth, screenHeight]
			]);
			const polygons = voronoi.polygons(polygonMasks.map((mask) => [mask[0] * screenWidth, mask[1] * screenHeight]));

			// Create canvas for the image
			const partCanvas = document.createElement('canvas');
			partCanvas.width = screenWidth;
			partCanvas.height = screenHeight;
			const partContext = partCanvas.getContext('2d');

			// Draw image with proper sizing
			const imgWidth = image.width;
			const imgHeight = image.height;
			const ratio = Math.min(screenWidth / imgWidth, screenHeight / imgHeight);
			const centerX = (screenWidth - imgWidth * ratio) / 2;
			const centerY = (screenHeight - imgHeight * ratio) / 2;

			partContext.drawImage(image, 0, 0, imgWidth, imgHeight, centerX, centerY, imgWidth * ratio, imgHeight * ratio);

			let partCanvasDataUrl;
			try {
				// Create a data URL from the canvas
				partCanvasDataUrl = partCanvas.toDataURL();
			} catch (error) {
				console.error('Error creating canvas data URL:', error);
				return;
			}

			const imageParts = []; // to store the image parts

			// Create divs for each polygon
			polygons.forEach((polygon) => {
				if (!polygon) return; // Skip if polygon is undefined

				const part = document.createElement('div');
				part.className = 'image-part';
				part.style.clipPath = `polygon(${polygon.map((point) => `${point[0]}px ${point[1]}px`).join(',')})`;
				part.style.backgroundImage = `url(${partCanvasDataUrl})`;
				part.style.width = `${screenWidth}px`;
				part.style.height = `${screenHeight}px`;
				part.style.opacity = '0';
				imageParts.push(part);
			});

			// Sort parts based on reveal order
			if (config.revealOrder === 'spiral') {
				// Sort from center outward
				const centerX = screenWidth / 2;
				const centerY = screenHeight / 2;
				imageParts.sort((a, b) => {
					// Extract center point of polygon from clip-path style
					const getCenter = (el) => {
						const clipPath = el.style.clipPath;
						const points = clipPath.match(/\d+(\.\d+)?px \d+(\.\d+)?px/g);
						if (!points || points.length === 0) return [0, 0];

						let sumX = 0,
							sumY = 0;
						points.forEach((point) => {
							const [x, y] = point.split('px ');
							sumX += parseFloat(x);
							sumY += parseFloat(y.replace('px', ''));
						});
						return [sumX / points.length, sumY / points.length];
					};

					const centerA = getCenter(a);
					const centerB = getCenter(b);

					const distA = Math.sqrt(Math.pow(centerA[0] - centerX, 2) + Math.pow(centerA[1] - centerY, 2));
					const distB = Math.sqrt(Math.pow(centerB[0] - centerX, 2) + Math.pow(centerB[1] - centerY, 2));

					return distA - distB; // Center to outside
				});
			} else {
				// Random order (shuffle)
				imageParts.sort(() => Math.random() - 0.5);
			}

			let counter = 0;
			const totalParts = imageParts.length;

			// Clear any existing interval
			if (partInterval) {
				clearInterval(partInterval);
				partInterval = null;
			}

			// Reset points value
			pointsValue = 100;

			// Start the animation
			partInterval = setInterval(() => {
				// First check if component is still mounted
				if (!gameContainer) {
					clearInterval(partInterval);
					partInterval = null;
					return;
				}

				if (!isImagePlaying || isTakeoverActive) {
					return; // This will preserve the counter value when paused
				}

				if (counter < imageParts.length) {
					try {
						const part = imageParts[counter];
						gameContainer.appendChild(part);

						setTimeout(() => {
							if (part && part.parentNode) {
								// Check if part is still in DOM
								part.style.opacity = '1';
							}
						}, 10);

						counter++;

						// Calculate and update points value (100 down to 0)
						pointsValue = Math.ceil((1 - counter / totalParts) * 100);
					} catch (error) {
						console.error('Error appending part:', error);
						clearInterval(partInterval);
						partInterval = null;
					}
				} else {
					// All parts revealed, stop the animation
					clearInterval(partInterval);
					partInterval = null;
					isImagePlaying = false;
					isImagePaused = false; // Reset pause state
					pointsValue = 0;
				}
			}, config.animationSpeed);
		}, 500);
	}

	function resetGame() {
		if (!gameContainer) return;

		// Clear only the image parts
		try {
			const parts = gameContainer.querySelectorAll('.image-part');
			parts.forEach((part) => {
				if (part && part.parentNode) {
					part.parentNode.removeChild(part);
				}
			});
		} catch (error) {
			console.error('Error clearing parts:', error);
		}

		// Reset state
		isImagePlaying = false;
		isImagePaused = false;
		pointsValue = 100;
	}

	// Ensure cleanup on component destroy
	onDestroy(() => {
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}

		// Clean up channel subscription
		if (channel) {
			channel.unsubscribe();
		}
	});

	// Watch for changes to screenImage
	$: if (browser && screenImage && screenImage.url && image && image.src !== screenImage.url) {
		// Load the new image
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}
		resetGame();

		// Reset state and load new image
		isImageLoaded = false;
		isImagePlaying = false;
		isImagePaused = false;

		image.src = screenImage.url;

		// Generate new polygon masks for variety
		generateMasks();
	}
</script>

<div class="relative h-full w-full bg-white" bind:this={gameContainer}>
	<div bind:this={countdown} class="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transform text-6xl text-black"></div>
	<div bind:this={initial} class="absolute bottom-4 right-4 z-10 text-xl font-bold text-black">
		{#if !screenImage}
			Brak obrazu dla aktualnej rundy
		{:else if !isImageLoaded}
			Ładowanie obrazu...
		{:else if !isImagePlaying}
			Naciśnij spację lub kliknij, aby rozpocząć
		{/if}
	</div>
	<div bind:this={info} class="absolute bottom-4 left-4 z-10 text-xl font-bold text-black"></div>

	<!-- Points counter -->
	<div bind:this={pointsCounter} class="absolute bottom-4 right-4 z-20 flex items-center justify-center rounded-md bg-gray-800/80 p-2 font-bold text-white transition-all duration-300" class:text-2xl={!isPointsEnlarged} class:text-6xl={isPointsEnlarged}>
		{pointsValue}
	</div>

	<!-- Config button that appears on hover -->
	<!-- svelte-ignore a11y_consider_explicit_label -->
	<button bind:this={configButton} class="config-button absolute right-4 top-4 z-20 rounded-full bg-gray-800 p-2 text-white opacity-0 transition-opacity duration-300" on:click={toggleConfigPanel}>
		<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="3"></circle>
			<path
				d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
			></path>
		</svg>
	</button>

	<!-- Hand raise results display -->
	{#if handRaiseResults.length > 0}
		<div class="absolute left-4 top-4 z-30 flex items-center gap-2 rounded bg-black/70 px-3 py-2 text-white">
			<span class="font-bold">Odpowiada: {handRaiseResults[0].name}</span>
			<button on:click={handleNextTakeover} class="ml-2 rounded bg-black px-3 py-1 text-sm font-bold text-white transition-colors duration-300 hover:bg-black/30"> Next </button>
		</div>
	{/if}

	<!-- Configuration panel -->
	{#if showConfigPanel}
		<div class="config-panel absolute right-4 top-14 z-20 w-64 rounded-md bg-gray-800 p-4 text-white shadow-md">
			<h3 class="mb-4 text-lg font-bold">Ustawienia</h3>

			<div class="mb-4">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<label class="mb-1 block">Ilość elementów ({config.numParts})</label>
				<input type="range" min="20" max="150" bind:value={config.numParts} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
			</div>

			<div class="mb-4">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<label class="mb-1 block">Szybkość animacji ({config.animationSpeed}ms)</label>
				<input type="range" min="100" max="1000" step="50" bind:value={config.animationSpeed} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
			</div>

			<div class="mb-4">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<label class="mb-1 block">Styl odkrywania</label>
				<select bind:value={config.revealOrder} class="w-full rounded-md border border-gray-600 bg-gray-700 p-1">
					<option value="random">Losowo</option>
					<option value="spiral">Od środka</option>
				</select>
			</div>

			<button on:click={applyConfig} class="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700"> Zastosuj </button>
		</div>
	{/if}

	{#if !screenImage}
		<div class="flex h-full w-full items-center justify-center">
			<p class="text-xl text-gray-400">Brak obrazu dla aktualnej rundy</p>
		</div>
	{/if}
</div>

<style>
	:global(.image-part) {
		position: absolute;
		top: 0;
		left: 0;
		opacity: 0;
		transition: opacity 0.2s ease-in-out;
		background-size: cover;
		background-repeat: no-repeat;
		background-position: center center;
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
