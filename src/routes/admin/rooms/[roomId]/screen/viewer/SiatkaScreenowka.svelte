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

	// Configuration state
	let config = {
		gridRows: 8,
		gridColumns: 8,
		animationSpeed: 1000,
		randomReveal: true,
		speedMode: 'constant', // 'constant', 'randomOnce', or 'randomEach'
		minRandomSpeed: 100,
		maxRandomSpeed: 2000,
		gridMode: 'grid', // 'grid' or 'crosshatch'
		stripeCount: 10, // Number of stripes for crosshatch mode
		revealInBatches: false, // New option for batch reveals
		numberOfBatches: 3 // Default number of batches
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
	let roundStarted = false;

	// Image and piece management
	let image = null;
	let fullImageContainer = null;
	let imagePieces = [];
	let revealedPieces = new Set();
	let totalPieces = 0;
	let partInterval = null;

	// Load image when screenImage changes
	$: if (browser && screenImage && screenImage.url && image && image.src !== screenImage.url) {
		loadNewImage();
	}

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

	// Update in the loadNewImage function
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
			loadCurrentPoints(); // Load saved points after generating pieces
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
		fullImageContainer.style.backgroundColor = 'white';
		fullImageContainer.style.opacity = '1';

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
		maskContainer.style.overflow = 'hidden';

		imagePieces = [];
		revealedPieces = [];

		// Generate pieces based on selected grid mode
		if (config.gridMode === 'crosshatch') {
			// Create horizontal stripes
			const stripeHeight = displayHeight / config.stripeCount;

			for (let i = 0; i < config.stripeCount; i++) {
				const stripeElement = document.createElement('div');
				stripeElement.className = 'image-piece stripe horizontal-stripe';

				// Position and size the stripe
				stripeElement.style.width = `${displayWidth}px`;
				stripeElement.style.height = `${stripeHeight}px`;
				stripeElement.style.position = 'absolute';
				stripeElement.style.top = `${i * stripeHeight}px`;
				stripeElement.style.left = '0';

				// Background settings
				stripeElement.style.backgroundImage = `url(${image.src})`;
				stripeElement.style.backgroundSize = `${displayWidth}px ${displayHeight}px`;
				stripeElement.style.backgroundPosition = `0 -${i * stripeHeight}px`;

				// Initially hidden
				stripeElement.style.opacity = '0';
				stripeElement.style.backgroundColor = 'white';

				// Store metadata
				stripeElement.dataset.index = i.toString();
				stripeElement.dataset.type = 'horizontal';

				imagePieces.push(stripeElement);
			}

			// Create vertical stripes
			const stripeWidth = displayWidth / config.stripeCount;

			for (let i = 0; i < config.stripeCount; i++) {
				const stripeElement = document.createElement('div');
				stripeElement.className = 'image-piece stripe vertical-stripe';

				// Position and size the stripe
				stripeElement.style.width = `${stripeWidth}px`;
				stripeElement.style.height = `${displayHeight}px`;
				stripeElement.style.position = 'absolute';
				stripeElement.style.top = '0';
				stripeElement.style.left = `${i * stripeWidth}px`;

				// Background settings
				stripeElement.style.backgroundImage = `url(${image.src})`;
				stripeElement.style.backgroundSize = `${displayWidth}px ${displayHeight}px`;
				stripeElement.style.backgroundPosition = `-${i * stripeWidth}px 0`;

				// Initially hidden
				stripeElement.style.opacity = '0';
				stripeElement.style.backgroundColor = 'white';

				// Store metadata
				stripeElement.dataset.index = i.toString();
				stripeElement.dataset.type = 'vertical';

				imagePieces.push(stripeElement);
			}
		} else {
			// Default grid mode
			// Calculate piece dimensions
			const pieceWidth = displayWidth / config.gridColumns;
			const pieceHeight = displayHeight / config.gridRows;

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
					pieceElement.style.backgroundColor = 'white';

					// Store metadata
					pieceElement.dataset.row = row.toString();
					pieceElement.dataset.col = col.toString();

					imagePieces.push(pieceElement);
				}
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

	function splitImage(continueFromPrevious = false) {
		if (!gameContainer || !isImageLoaded) return;

		// Reset batch information if starting fresh
		if (!continueFromPrevious) {
			currentBatchIndex = 0;
			batchSizes = [];
		}

		// Set loading text
		if (countdown) countdown.textContent = 'Ładowanie...';
		if (initial) initial.textContent = '';

		setTimeout(() => {
			if (!gameContainer) return;

			isImagePlaying = true;
			if (countdown) countdown.textContent = '';

			// Shuffle pieces if random reveal is enabled
			storedPiecesToReveal = config.randomReveal ? imagePieces.sort(() => Math.random() - 0.5) : [...imagePieces];

			// For batch reveals, calculate the batch sizes
			if (config.revealInBatches) {
				console.log('SiatkaScreenowka: Batch reveal mode enabled');
				// If we're not continuing from a previous batch, calculate the batch sizes
				if (!continueFromPrevious) {
					console.log('Calculating batch sizes for', totalPieces, 'pieces and', config.numberOfBatches, 'batches');
					// Calculate batch sizes - divide total pieces into equal batches
					const baseBatchSize = Math.floor(totalPieces / config.numberOfBatches);
					const remainder = totalPieces % config.numberOfBatches;

					console.log('baseBatchSize:', baseBatchSize, 'remainder:', remainder);

					// Distribute the remainder across the first few batches
					batchSizes = [];
					for (let i = 0; i < config.numberOfBatches; i++) {
						if (i < remainder) {
							batchSizes.push(baseBatchSize + 1);
						} else {
							batchSizes.push(baseBatchSize);
						}
					}

					console.log('batchSizes:', batchSizes);

					// Set initial points
					pointsValue = 100;
					currentBatchIndex = 0;
				}

				// Start the batch reveal process
				console.log('Starting batch reveal process');
				continueBatchReveal();
				return; // Exit early as we're handling the animation differently
			}

			// For non-batch reveals, continue with the original logic
			let revealedCount = 0;

			// If using randomOnce mode, determine the animation speed now
			let animationSpeedToUse = config.animationSpeed;
			if (config.speedMode === 'randomOnce') {
				animationSpeedToUse = Math.floor(config.minRandomSpeed + Math.random() * (config.maxRandomSpeed - config.minRandomSpeed));
				console.log('Using random speed (once):', animationSpeedToUse);
			}

			// Create animation function for reuse
			const animationFunc = function () {
				if (!gameContainer) {
					clearInterval(partInterval);
					partInterval = null;
					return;
				}

				if (!isImagePlaying || isTakeoverActive) {
					return;
				}

				if (revealedCount < storedPiecesToReveal.length) {
					// In batch mode, reveal multiple pieces at once
					if (config.revealInBatches) {
						// Calculate how many pieces to reveal in this iteration
						const currentBatch = Math.floor(revealedCount / batchSize);
						const nextBatchStart = (currentBatch + 1) * batchSize;
						const piecesToRevealNow = Math.min(nextBatchStart - revealedCount, storedPiecesToReveal.length - revealedCount);

						// Reveal all pieces in this batch
						for (let i = 0; i < piecesToRevealNow; i++) {
							if (revealedCount + i < storedPiecesToReveal.length) {
								const piece = storedPiecesToReveal[revealedCount + i];

								setTimeout(() => {
									if (piece) {
										// Remove black overlay and show piece
										piece.style.backgroundColor = 'transparent';
										piece.style.opacity = '1';
									}
								}, 10);

								revealedPieces.push(piece);
							}
						}

						// Update counter
						revealedCount += piecesToRevealNow;

						// Calculate and update points value
						const newBatchCounter = Math.floor(revealedCount / batchSize);
						if (newBatchCounter > batchCounter) {
							batchCounter = newBatchCounter;
							// Calculate points based on how many batches are left to reveal
							const batchesRevealed = batchCounter;
							const totalBatches = config.numberOfBatches;
							pointsValue = Math.ceil((1 - batchesRevealed / totalBatches) * 100);

							// Pause after revealing one batch to wait for user interaction
							isImagePlaying = false;
							isImagePaused = true;
							isPointsEnlarged = true;

							// Save current points
							savePointsValue();

							// Clear the interval
							clearInterval(partInterval);
							partInterval = null;
							return;
						}
					} else {
						// Original single piece reveal
						const piece = storedPiecesToReveal[revealedCount];

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
					}

					// If using randomEach mode, update the interval timing
					if (config.speedMode === 'randomEach' && partInterval) {
						clearInterval(partInterval);
						const newSpeed = Math.floor(config.minRandomSpeed + Math.random() * (config.maxRandomSpeed - config.minRandomSpeed));
						partInterval = setInterval(animationFunc, newSpeed);
					}
				} else {
					// All pieces revealed
					clearInterval(partInterval);
					partInterval = null;
					isImagePlaying = false;
					isImagePaused = false;
					pointsValue = 0;
				}
			};

			// Start the interval with appropriate speed
			partInterval = setInterval(animationFunc, config.speedMode === 'randomOnce' ? animationSpeedToUse : config.animationSpeed);
		}, 500);
	}

	function togglePlayPause() {
		if (!isImageLoaded) return;

		if (isImagePlaying) {
			// Pause
			isImagePlaying = false;
			isImagePaused = true;
			isPointsEnlarged = true;

			// Save current points when pausing
			savePointsValue();
		} else {
			if (isImagePaused) {
				// Check if we're in batch reveal mode and need to continue to the next batch
				if (config.revealInBatches) {
					console.log('Continuing to next batch in SiatkaScreenowka');
					// Continue with the next batch
					continueNextBatch();
				} else {
					// Resume normal animation that was paused
					isImagePlaying = true;
					isImagePaused = false;
					isPointsEnlarged = false;
				}
			} else {
				// Start new reveal
				splitImage();
				if (initial) initial.textContent = '';

				// Set initial points value and save it
				pointsValue = 100;
				savePointsValue();

				isPointsEnlarged = false;
			}
		}
	}

	// Store batch information for consistent batch sizes
	let batchSizes = [];
	let currentBatchIndex = 0;

	// Function to continue to the next batch in batch reveal mode
	function continueNextBatch() {
		console.log('SiatkaScreenowka continueNextBatch called');
		console.log('config.revealInBatches:', config.revealInBatches);
		console.log('isImagePaused:', isImagePaused);
		console.log('currentBatchIndex:', currentBatchIndex);
		console.log('batchSizes:', batchSizes);

		if (!config.revealInBatches) {
			console.log('Not in batch reveal mode');
			return;
		}

		// Reset pause state
		isImagePaused = false;
		isPointsEnlarged = false;

		// Increment the batch index
		currentBatchIndex++;
		console.log('New currentBatchIndex:', currentBatchIndex);

		// Calculate points based on remaining batches
		const totalBatches = config.numberOfBatches;
		pointsValue = Math.ceil((1 - currentBatchIndex / totalBatches) * 100);
		console.log('New pointsValue:', pointsValue);

		// Continue the animation for the next batch
		continueBatchReveal();
	}

	// Store the pieces to reveal for batch mode
	let storedPiecesToReveal = [];

	// Function to continue revealing the next batch
	function continueBatchReveal() {
		console.log('SiatkaScreenowka continueBatchReveal called');
		if (!gameContainer || !isImageLoaded) {
			console.log('gameContainer or image not loaded');
			return;
		}

		isImagePlaying = true;

		// Get the current batch of pieces to reveal
		console.log('batchSizes:', batchSizes);
		console.log('currentBatchIndex:', currentBatchIndex);
		console.log('storedPiecesToReveal.length:', storedPiecesToReveal.length);

		if (batchSizes.length === 0 || currentBatchIndex >= batchSizes.length) {
			console.error('Invalid batch configuration');
			return;
		}

		const startIndex = batchSizes.slice(0, currentBatchIndex).reduce((sum, size) => sum + size, 0);
		const batchSize = batchSizes[currentBatchIndex];
		const endIndex = startIndex + batchSize;

		console.log('startIndex:', startIndex);
		console.log('batchSize:', batchSize);
		console.log('endIndex:', endIndex);

		// Reveal all pieces in this batch
		for (let i = startIndex; i < endIndex && i < storedPiecesToReveal.length; i++) {
			const piece = storedPiecesToReveal[i];

			setTimeout(() => {
				if (piece) {
					// Remove black overlay and show piece
					piece.style.backgroundColor = 'transparent';
					piece.style.opacity = '1';
				}
			}, 10);

			revealedPieces.push(piece);
		}

		// Check if this was the last batch
		if (currentBatchIndex >= config.numberOfBatches - 1 || endIndex >= storedPiecesToReveal.length) {
			// All pieces revealed, set final state
			isImagePlaying = false;
			isImagePaused = false;
			pointsValue = 0;
			savePointsValue();
		} else {
			// Pause after revealing this batch
			setTimeout(() => {
				isImagePlaying = false;
				isImagePaused = true;
				isPointsEnlarged = true;
				savePointsValue();
			}, 500);
		}
	}

	function revealAllTiles() {
		if (!gameContainer || !isImageLoaded || !image || !image.complete) return;

		// Stop any ongoing animation
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}

		// Clear existing pieces first
		const existingPieces = gameContainer.querySelectorAll('.image-piece');
		existingPieces.forEach((piece) => {
			if (piece && piece.parentNode) {
				piece.parentNode.removeChild(piece);
			}
		});

		// Remove any existing full image container
		if (fullImageContainer && fullImageContainer.parentNode) {
			fullImageContainer.parentNode.removeChild(fullImageContainer);
		}

		// Create a new full image container
		const newFullImageContainer = document.createElement('div');
		newFullImageContainer.className = 'full-image-container';
		newFullImageContainer.style.position = 'absolute';
		newFullImageContainer.style.top = '0';
		newFullImageContainer.style.left = '0';
		newFullImageContainer.style.width = '100%';
		newFullImageContainer.style.height = '100%';
		newFullImageContainer.style.backgroundImage = `url(${image.src})`;
		newFullImageContainer.style.backgroundSize = 'contain';
		newFullImageContainer.style.backgroundPosition = 'center';
		newFullImageContainer.style.backgroundRepeat = 'no-repeat';
		newFullImageContainer.style.backgroundColor = 'white';
		newFullImageContainer.style.opacity = '1';
		newFullImageContainer.style.zIndex = '100';

		// Add the full image to the container
		gameContainer.appendChild(newFullImageContainer);

		// Set points to 0 after revealing all
		pointsValue = 0;
		isImagePlaying = false;
		isImagePaused = false;

		// Save final points value
		savePointsValue();
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

		// Save reset points value
		savePointsValue();

		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}
	}

	function updateConfig() {
		// Validate config
		config.gridRows = Math.max(1, Math.min(config.gridRows, 20));
		config.gridColumns = Math.max(1, Math.min(config.gridColumns, 20));

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
			roundStarted = true;
		}
	}

	function handleGameClick(event) {
		// Prevent triggering on config panel
		if (event.target.closest('.config-panel') || event.target.closest('.config-button')) {
			return;
		}
		togglePlayPause();
		roundStarted = true;
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

	<!-- Configuration Panel -->
	{#if showConfigPanel}
		<div class="config-panel absolute right-4 top-14 z-20 w-auto max-w-xl rounded-md bg-gray-800 p-4 text-white shadow-md">
			<h3 class="mb-4 text-lg font-bold">Ustawienia siatki</h3>

			<div class="grid grid-cols-2 gap-4">
				<!-- Left Column -->
				<div>
					<div class="mb-4">
						<h4 class="mb-2 border-b border-gray-700 pb-1 text-sm font-medium uppercase tracking-wider">Tryb podziału</h4>

						<div class="mb-2 flex items-center">
							<input type="radio" id="grid-mode-grid" bind:group={config.gridMode} value="grid" class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
							<label for="grid-mode-grid">Siatka</label>
						</div>

						<div class="mb-3 flex items-center">
							<input type="radio" id="grid-mode-crosshatch" bind:group={config.gridMode} value="crosshatch" class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
							<label for="grid-mode-crosshatch">Kratka (paski krzyżowe)</label>
						</div>

						{#if config.gridMode === 'grid'}
							<div class="mb-2 flex items-center justify-between">
								<label for="grid-rows" class="block">Liczba wierszy</label>
								<span class="text-sm text-gray-300">{config.gridRows}</span>
							</div>
							<input type="range" id="grid-rows" min="1" max="20" bind:value={config.gridRows} class="h-2 w-full appearance-none rounded-md bg-gray-700" />

							<div class="mb-2 mt-2 flex items-center justify-between">
								<label for="grid-columns" class="block">Liczba kolumn</label>
								<span class="text-sm text-gray-300">{config.gridColumns}</span>
							</div>
							<input type="range" id="grid-columns" min="1" max="20" bind:value={config.gridColumns} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
						{:else}
							<div class="mb-2 flex items-center justify-between">
								<label for="stripe-count" class="block">Liczba pasków</label>
								<span class="text-sm text-gray-300">{config.stripeCount}</span>
							</div>
							<input type="range" id="stripe-count" min="2" max="30" bind:value={config.stripeCount} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
						{/if}

						<div class="mt-4 flex items-center">
							<input type="checkbox" id="random-reveal" bind:checked={config.randomReveal} class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
							<label for="random-reveal">Losowe odkrywanie elementów</label>
						</div>

						<!-- Batch reveal settings -->
						<div class="mt-4">
							<h4 class="mb-2 border-b border-gray-700 pb-1 text-sm font-medium uppercase tracking-wider">Sposób odsłaniania</h4>
							<div class="mb-2 flex items-center">
								<input type="checkbox" id="reveal-in-batches" bind:checked={config.revealInBatches} class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
								<label for="reveal-in-batches">Odsłaniaj w częściach</label>
							</div>

							{#if config.revealInBatches}
								<div class="mb-2 flex items-center justify-between">
									<label for="num-batches" class="block">Liczba części</label>
									<span class="text-sm text-gray-300">{config.numberOfBatches}</span>
								</div>
								<input id="num-batches" type="range" min="2" max="10" bind:value={config.numberOfBatches} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
							{/if}
						</div>
					</div>
				</div>

				<!-- Right Column -->
				<div>
					<!-- Animation speed settings -->
					<div class="mb-4">
						<h4 class="mb-2 border-b border-gray-700 pb-1 text-sm font-medium uppercase tracking-wider">Szybkość animacji</h4>

						{#if config.revealInBatches}
							<div class="mb-2 p-2 rounded bg-gray-700/50 text-sm">
								Ustawienia szybkości są nieaktywne w trybie odsłaniania w częściach.
								Kliknij lub naciśnij spację, aby odsłonić kolejną część.
							</div>
						{:else}
							<div class="mb-2">
								<!-- svelte-ignore a11y_label_has_associated_control -->
								<label class="block font-medium">Tryb szybkości animacji</label>
							</div>

							<div class="mb-2 flex items-center">
								<input type="radio" id="speed-mode-constant" bind:group={config.speedMode} value="constant" class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
								<label for="speed-mode-constant">Stała prędkość</label>
							</div>

							<div class="mb-2 flex items-center">
								<input type="radio" id="speed-mode-random-once" bind:group={config.speedMode} value="randomOnce" class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
								<label for="speed-mode-random-once">Losowa prędkość (na początku)</label>
							</div>

							<div class="mb-3 flex items-center">
								<input type="radio" id="speed-mode-random-each" bind:group={config.speedMode} value="randomEach" class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
								<label for="speed-mode-random-each">Losowa prędkość (dla każdego elementu)</label>
							</div>
						{/if}

						{#if !config.revealInBatches}
							{#if config.speedMode === 'constant'}
								<div class="mb-2 flex items-center justify-between">
									<label for="animation-speed" class="block">Podstawowa szybkość</label>
									<span class="text-sm text-gray-300">{config.animationSpeed}ms</span>
								</div>
								<input id="animation-speed" type="range" min="100" max="3000" step="100" bind:value={config.animationSpeed} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
							{/if}

							{#if config.speedMode !== 'constant'}
								<div class="mb-1 flex items-center justify-between">
									<!-- svelte-ignore a11y_label_has_associated_control -->
									<label class="block">Zakres losowej prędkości</label>
									<span class="text-sm text-gray-300">{config.minRandomSpeed}-{config.maxRandomSpeed}ms</span>
								</div>
								<div class="mb-1 flex items-center gap-2">
									<span class="w-8 text-xs">{config.minRandomSpeed}</span>
									<input type="range" min="100" max={config.maxRandomSpeed - 100} step="100" bind:value={config.minRandomSpeed} class="h-2 flex-1 appearance-none rounded-md bg-gray-700" />
								</div>
								<div class="flex items-center gap-2">
									<span class="w-8 text-xs">{config.maxRandomSpeed}</span>
									<input type="range" min={config.minRandomSpeed + 100} max="3000" step="100" bind:value={config.maxRandomSpeed} class="h-2 flex-1 appearance-none rounded-md bg-gray-700" />
								</div>
							{/if}
						{/if}
					</div>
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
							animationSpeed: 1000,
							randomReveal: true,
							speedMode: 'constant',
							minRandomSpeed: 100,
							maxRandomSpeed: 2000,
							gridMode: 'grid',
							stripeCount: 10,
							revealInBatches: false,
							numberOfBatches: 3
						};
						updateConfig();
					}}
					class="rounded-md bg-gray-600 px-2 py-2 text-white hover:bg-gray-700"
				>
					Reset
				</button>
				<button on:click={revealAllTiles} class="rounded-md bg-amber-600 py-2 text-white hover:bg-amber-700">Odkryj wszystkie</button>
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

	:global(.horizontal-stripe) {
		z-index: 11; /* Horizontal stripes should appear on top of vertical ones */
	}

	:global(.vertical-stripe) {
		z-index: 10;
	}

	:global(.image-piece.stripe) {
		clip-path: none; /* Ensure stripes don't get clipped by other pieces */
	}
</style>
