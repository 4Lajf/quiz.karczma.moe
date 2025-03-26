<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	export let screenImage;
	export let room;
	export let supabase;

	let gameContainer;
	let initial;
	let pointsCounter;
	let configButton;

	// Fixed grid configuration
	const GRID_ROWS = 4;
	const GRID_COLUMNS = 4;

	// Game state
	let isImageLoaded = false;
	let pointsValue = 10; // Start with 10 points
	let isPointsEnlarged = false;
	let showConfigPanel = false;
	let revealCount = 0;

	// Takeover and hand raise state
	let isTakeoverActive = false;
	let handRaiseResults = [];
	let channel;

	// Image and piece management
	let image = null;
	let fullImageContainer = null;
	let imagePieces = [];
	let revealedPieces = new Set();

	// Track which pieces have been revealed
	let revealedPositions = new Set();

	// Load image when screenImage changes
	$: if (browser && screenImage && screenImage.url && image && image.src !== screenImage.url) {
		loadNewImage();
	}

	function loadNewImage() {
		resetGame();
		isImageLoaded = false;

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
		fullImageContainer.style.backgroundColor = 'black';
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

		// Calculate piece dimensions
		const pieceWidth = displayWidth / GRID_COLUMNS;
		const pieceHeight = displayHeight / GRID_ROWS;

		imagePieces = [];
		revealedPieces = new Set();
		revealedPositions = new Set();

		// Create grid pieces
		for (let row = 0; row < GRID_ROWS; row++) {
			for (let col = 0; col < GRID_COLUMNS; col++) {
				const pieceElement = document.createElement('div');
				pieceElement.className = 'image-piece';

				// Position and size the piece
				pieceElement.style.width = `${pieceWidth}px`;
				pieceElement.style.height = `${pieceHeight}px`;
				pieceElement.style.position = 'absolute';
				pieceElement.style.top = `${row * pieceHeight}px`;
				pieceElement.style.left = `${col * pieceWidth}px`;

				// Hide image initially - will be revealed on click
				pieceElement.style.backgroundImage = 'none';
				pieceElement.style.opacity = '1';
				pieceElement.style.backgroundColor = 'black';

				// Store the background information for later reveal
				pieceElement.dataset.imageUrl = image.src;
				pieceElement.dataset.bgSize = `${displayWidth}px ${displayHeight}px`;
				pieceElement.dataset.bgPosition = `-${col * pieceWidth}px -${row * pieceHeight}px`;

				// Create number overlay
				const pieceNumber = row * GRID_COLUMNS + col + 1;
				const numberOverlay = document.createElement('div');
				numberOverlay.className = 'number-overlay';
				numberOverlay.style.position = 'absolute';
				numberOverlay.style.top = '0';
				numberOverlay.style.left = '0';
				numberOverlay.style.width = '100%';
				numberOverlay.style.height = '100%';
				numberOverlay.style.display = 'flex';
				numberOverlay.style.alignItems = 'center';
				numberOverlay.style.justifyContent = 'center';
				numberOverlay.style.fontSize = '48px'; // Make numbers bigger
				numberOverlay.style.fontWeight = 'bold';

				// Determine if this is a center tile
				const isCenter = (row === 1 || row === 2) && (col === 1 || col === 2);
				numberOverlay.style.color = isCenter ? 'red' : 'white';

				numberOverlay.textContent = pieceNumber.toString();
				pieceElement.appendChild(numberOverlay);

				// Store metadata
				pieceElement.dataset.row = row.toString();
				pieceElement.dataset.col = col.toString();
				pieceElement.dataset.number = pieceNumber.toString();
				pieceElement.dataset.isCenter = isCenter.toString();

				// Add click event to reveal tile
				pieceElement.addEventListener('click', () => revealTile(pieceElement, row, col));

				imagePieces.push(pieceElement);
			}
		}

		// Append pieces to mask container
		imagePieces.forEach((piece) => maskContainer.appendChild(piece));

		// Add mask container and full image container to game container
		fullImageContainer.appendChild(maskContainer);
		gameContainer.appendChild(fullImageContainer);

		// Reset game state
		pointsValue = 10;
		revealCount = 0;
	}

	function revealTile(pieceElement, row, col) {
		// If already revealed, do nothing
		if (revealedPieces.has(pieceElement)) return;

		// Apply reveal effect
		pieceElement.style.backgroundImage = `url(${pieceElement.dataset.imageUrl})`;
		pieceElement.style.backgroundSize = pieceElement.dataset.bgSize;
		pieceElement.style.backgroundPosition = pieceElement.dataset.bgPosition;
		pieceElement.style.backgroundColor = 'transparent';

		// Hide the number
		const numberOverlay = pieceElement.querySelector('.number-overlay');
		if (numberOverlay) {
			numberOverlay.style.opacity = '0';
		}

		revealedPieces.add(pieceElement);

		// Store position
		const position = `${row},${col}`;
		revealedPositions.add(position);

		// Update score based on reveal count
		revealCount++;
		if (revealCount === 1) {
			pointsValue -= 1; // 10 -> 9
		} else if (revealCount === 2) {
			pointsValue -= 2; // 9 -> 7
		} else if (revealCount === 3) {
			pointsValue -= 3; // 7 -> 4
		} else if (revealCount === 4) {
			pointsValue -= 3; // 4 -> 1
		} else {
			pointsValue = Math.max(0, pointsValue - 1); // Ensure score doesn't go below 0
		}

		// Update center tiles color if needed
		updateCenterTilesColor();
	}

	function updateCenterTilesColor() {
		// Check all pieces to see if they are center tiles and need color update
		imagePieces.forEach((piece) => {
			if (piece.dataset.isCenter === 'true' && !revealedPieces.has(piece)) {
				const row = parseInt(piece.dataset.row);
				const col = parseInt(piece.dataset.col);

				// Check for adjacent (including diagonal) revealed tiles
				let hasAdjacentRevealed = false;
				for (let r = Math.max(0, row - 1); r <= Math.min(GRID_ROWS - 1, row + 1); r++) {
					for (let c = Math.max(0, col - 1); c <= Math.min(GRID_COLUMNS - 1, col + 1); c++) {
						// Skip self
						if (r === row && c === col) continue;

						// Check if this adjacent position is revealed
						if (revealedPositions.has(`${r},${c}`)) {
							hasAdjacentRevealed = true;
							break;
						}
					}
					if (hasAdjacentRevealed) break;
				}

				// Update number color
				const numberOverlay = piece.querySelector('.number-overlay');
				if (numberOverlay) {
					numberOverlay.style.color = hasAdjacentRevealed ? 'white' : 'red';
				}
			}
		});
	}

	function resetGame() {
		if (!gameContainer) return;

		// Clear all content
		while (gameContainer.firstChild) {
			gameContainer.removeChild(gameContainer.firstChild);
		}

		// Reset state
		imagePieces = [];
		revealedPieces = new Set();
		revealedPositions = new Set();
		pointsValue = 10;
		revealCount = 0;
	}

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

				// Enlarge points when there are hand raises
				isPointsEnlarged = true;
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
			// If no more takeovers, clear the list
			handRaiseResults = [];
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

	function toggleConfigPanel() {
		showConfigPanel = !showConfigPanel;
	}

	function togglePointsEnlarged() {
		isPointsEnlarged = !isPointsEnlarged;
	}

	onMount(async () => {
		if (browser) {
			// Create image object
			image = new Image();
			image.crossOrigin = 'anonymous';
			image.onload = function () {
				isImageLoaded = true;
				generateImagePieces();
			};

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

			// Set up subscription to hand raises
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
					async () => {
						await loadHandRaiseResults();
					}
				)
				.subscribe();
		}
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="relative h-full w-full bg-black" bind:this={gameContainer}>
	<!-- Initial message -->
	<div bind:this={initial} class="absolute bottom-4 right-4 z-10 text-xl font-bold text-white">
		{#if !screenImage}
			Brak obrazu dla aktualnej rundy
		{:else if !isImageLoaded}
			Ładowanie obrazu...
		{/if}
	</div>

	<!-- Points counter -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div bind:this={pointsCounter} class="absolute bottom-4 right-4 z-20 flex items-center justify-center rounded-md bg-gray-800/80 p-2 font-bold text-white transition-all duration-300" class:text-2xl={!isPointsEnlarged} class:text-6xl={isPointsEnlarged} on:click={togglePointsEnlarged}>
		{pointsValue}
	</div>

	<!-- Configuration button -->
	<!-- svelte-ignore a11y_consider_explicit_label -->
	<button bind:this={configButton} class="config-button absolute right-4 top-4 z-20 rounded-full bg-gray-800 p-2 text-white opacity-0 transition-opacity duration-300" on:click={toggleConfigPanel}>
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
			<h3 class="mb-4 text-lg font-bold">Ustawienia</h3>

			<p class="mb-2">Ten tryb pozwala na ręczne odkrywanie kafelków przez kliknięcie. Każdy kafelek ma numer od 1 do 16.</p>

			<p class="mb-2">Punktacja:</p>
			<ul class="mb-4 list-inside list-disc text-sm">
				<li>Start: 10 punktów</li>
				<li>Pierwsza kafelka: -1 punkt</li>
				<li>Druga kafelka: -2 punkty</li>
				<li>Trzecia kafelka: -3 punkty</li>
				<li>Czwarta kafelka: -3 punkty</li>
				<li>Kolejne: -1 punkt (minimum 0)</li>
			</ul>

			<div class="flex gap-2">
				<button on:click={resetGame} class="flex-1 rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700"> Resetuj grę </button>
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
	:global(.image-piece) {
		cursor: pointer;
		transition: all 0.3s ease;
		background-color: black;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	:global(.image-piece:hover) {
		background-color: rgba(0, 0, 0, 0.8);
	}

	:global(.number-overlay) {
		transition: opacity 0.3s ease;
		user-select: none;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
	}

	:global(.full-image-container) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: black;
		z-index: 1;
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
