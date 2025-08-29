<script>
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Play, Square, RotateCcw, Eye, EyeOff, Monitor } from 'lucide-svelte';
	import { screenFileSystemClient } from '$lib/utils/screenFileSystemAPI.js';

	let presenterState = {
		currentScreen: null,
		showMetadata: false,
		showImagePlaceholder: true,
		guessingPhase: true,
		imageSrc: '',
		currentMode: 'normal',
		modeSettings: {
			gridRows: 4,
			gridCols: 4,
			revealDelay: 100,
			partsCount: 100,
			pixelationLevel: 64
		},
		lastUpdated: Date.now()
	};

	let canvas;
	let ctx;
	let image;
	let isRevealing = false;
	let revealProgress = 0;
	let currentRevealIndex = 0;
	let revealTimeout;

	// Access & diagnostics
	let needDirectoryAccess = false;
	let accessMessage = '';

	// Grid reveal variables
	let gridCells = [];
	let revealedCells = new Set();

	// Stripes reveal variables
	let stripes = [];
	let revealedStripes = new Set();

	// Shattered reveal variables
	let pieces = [];

	// Pixelation variables
	let pixelBlocks = [];

	let stateSyncInterval;
	let lastStateUpdate = 0;

	onMount(() => {
		// Set up periodic state sync
		stateSyncInterval = setInterval(fetchPresenterState, 1000);

		// Listen for state changes from main window
		if (typeof window !== 'undefined') {
			window.addEventListener('storage', handleStorageEvent);

			// Also listen for custom events
			window.addEventListener('screens-metadata-toggled', handleMetadataToggle);
			window.addEventListener('screens-screen-changed', handleScreenChange);
		}

		// Initial state fetch
		fetchPresenterState();
	});

	onDestroy(() => {
		if (stateSyncInterval) {
			clearInterval(stateSyncInterval);
		}

		if (revealTimeout) {
			clearTimeout(revealTimeout);
		}

		if (typeof window !== 'undefined') {
			window.removeEventListener('storage', handleStorageEvent);
			window.removeEventListener('screens-metadata-toggled', handleMetadataToggle);
			window.removeEventListener('screens-screen-changed', handleScreenChange);
		}
	});

	async function fetchPresenterState() {
		try {
			const response = await fetch('/api/screens/presenter-state');
			if (response.ok) {
				const data = await response.json();
				if (data.success && data.state.lastUpdated > lastStateUpdate) {
					presenterState = data.state;
					lastStateUpdate = data.state.lastUpdated;
					updateDisplay();
				}
			}
		} catch (error) {
			console.error('Failed to fetch presenter state:', error);
		}
	}

	function handleStorageEvent(event) {
		if (event.key === 'screens_local_state') {
			try {
				const newState = JSON.parse(event.newValue);
				if (newState && newState.lastUpdated > lastStateUpdate) {
					presenterState = { ...presenterState, ...newState };
					lastStateUpdate = newState.lastUpdated || Date.now();
					updateDisplay();
				}
			} catch (error) {
				console.error('Failed to parse storage event:', error);
			}
		}
	}

	function handleMetadataToggle(event) {
		if (event.detail) {
			presenterState.showMetadata = event.detail.showMetadata;
			updateDisplay();
		}
	}

	function handleScreenChange(event) {
		if (event.detail && event.detail.currentScreen) {
			presenterState.currentScreen = event.detail.currentScreen;
			updateDisplay();
		}
	}

	async function updateDisplay() {
		if (canvas) {
			await loadImage();
		}

		// Update metadata display
		updateMetadataDisplay();
	}

	function updateMetadataDisplay() {
		// This will be handled by the template reactivity
	}

	async function loadImage() {
		if (!canvas) return;

		let src = presenterState.imageSrc;
		// Blob URLs from another tab/origin are invalid here. If we have a currentScreen
		// with a local file, rebuild an object URL using the stored directory handle.
		if ((!src || src.startsWith('blob:')) && presenterState.currentScreen?.FileName) {
			try {
				// Try to restore previously allowed directory
				if (!screenFileSystemClient.hasDirectory()) {
					await screenFileSystemClient.restoreDirectoryHandle();
				}
				if (screenFileSystemClient.hasDirectory()) {
					try {
						src = await screenFileSystemClient.createFileURL(presenterState.currentScreen.FileName);
						needDirectoryAccess = false;
						accessMessage = '';
					} catch (permErr) {
						// Likely missing permission; ask user to grant access
						needDirectoryAccess = true;
						accessMessage = 'Brak dostępu do katalogu. Nadaj uprawnienia, aby wyświetlić obraz.';
						console.warn('Permission needed to access local files in presenter:', permErr);
					}
				} else {
					needDirectoryAccess = true;
					accessMessage = 'Wybierz katalog z ekranami na tym ekranie prezentera.';
				}
			} catch (e) {
				console.warn('Presenter could not rebuild local file URL:', e);
			}
		}

		if (!src) return;

		image = new Image();
		image.crossOrigin = 'anonymous';

		image.onload = () => {
			canvas.width = image.width;
			canvas.height = image.height;
			ctx = canvas.getContext('2d');
			isLoaded = true;

			if (presenterState.guessingPhase && !presenterState.showMetadata) {
				initializeMode();
			} else {
				ctx.drawImage(image, 0, 0);
			}
		};

		image.onerror = () => {
			console.error('Failed to load presenter image:', src);
		};

		image.src = src;
	}

	async function grantDirectoryAccess() {
		try {
			// If we don't have a handle, ask the user to pick the directory again
			if (!screenFileSystemClient.hasDirectory()) {
				const selected = await screenFileSystemClient.selectDirectory();
				if (!selected) return; // user canceled
			} else if (screenFileSystemClient.directoryHandle?.requestPermission) {
				// Request read permission explicitly
				await screenFileSystemClient.directoryHandle.requestPermission({ mode: 'read' });
			}

			needDirectoryAccess = false;
			accessMessage = '';
			await loadImage();
		} catch (err) {
			console.error('Failed to obtain directory access in presenter:', err);
		}
	}

	function initializeMode() {
		if (!isLoaded || !ctx) return;

		resetReveal();

		switch (presenterState.currentMode) {
			case 'grid':
				initializeGridMode();
				break;
			case 'stripes-vertical':
				initializeStripesMode('vertical');
				break;
			case 'stripes-horizontal':
				initializeStripesMode('horizontal');
				break;
			case 'stripes-random':
				initializeStripesMode('random');
				break;
			case 'shattered':
				initializeShatteredMode();
				break;
			case 'pixelated':
				initializePixelatedMode();
				break;
			default:
				// Normal mode - show full image
				ctx.drawImage(image, 0, 0);
				break;
		}
	}

	function initializeGridMode() {
		const { gridRows, gridCols } = presenterState.modeSettings;
		const cellWidth = canvas.width / gridCols;
		const cellHeight = canvas.height / gridRows;

		gridCells = [];
		for (let row = 0; row < gridRows; row++) {
			for (let col = 0; col < gridCols; col++) {
				gridCells.push({
					row,
					col,
					x: col * cellWidth,
					y: row * cellHeight,
					width: cellWidth,
					height: cellHeight,
					revealed: false
				});
			}
		}

		// Clear canvas
		ctx.fillStyle = '#1f2937';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function initializeStripesMode(direction) {
		const { gridRows, gridCols } = presenterState.modeSettings;

		stripes = [];
		if (direction === 'vertical') {
			const stripeWidth = canvas.width / gridCols;
			for (let col = 0; col < gridCols; col++) {
				stripes.push({
					index: col,
					x: col * stripeWidth,
					y: 0,
					width: stripeWidth,
					height: canvas.height,
					revealed: false
				});
			}
		} else if (direction === 'horizontal') {
			const stripeHeight = canvas.height / gridRows;
			for (let row = 0; row < gridRows; row++) {
				stripes.push({
					index: row,
					x: 0,
					y: row * stripeHeight,
					width: canvas.width,
					height: stripeHeight,
					revealed: false
				});
			}
		} else if (direction === 'random') {
			// Combine both vertical and horizontal stripes
			const stripeWidth = canvas.width / gridCols;
			const stripeHeight = canvas.height / gridRows;

			for (let col = 0; col < gridCols; col++) {
				stripes.push({
					index: col,
					x: col * stripeWidth,
					y: 0,
					width: stripeWidth,
					height: canvas.height,
					revealed: false,
					type: 'vertical'
				});
			}

			for (let row = 0; row < gridRows; row++) {
				stripes.push({
					index: row + gridCols,
					x: 0,
					y: row * stripeHeight,
					width: canvas.width,
					height: stripeHeight,
					revealed: false,
					type: 'horizontal'
				});
			}
		}

		// Clear canvas
		ctx.fillStyle = '#1f2937';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function initializeShatteredMode() {
		const { partsCount } = presenterState.modeSettings;

		pieces = [];
		for (let i = 0; i < partsCount; i++) {
			pieces.push({
				x: Math.random() * canvas.width,
				y: Math.random() * canvas.height,
				width: Math.random() * 50 + 20,
				height: Math.random() * 50 + 20,
				rotation: Math.random() * Math.PI * 2,
				revealed: false
			});
		}

		// Clear canvas
		ctx.fillStyle = '#1f2937';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function initializePixelatedMode() {
		const { pixelationLevel } = presenterState.modeSettings;
		const blockSize = pixelationLevel;

		pixelBlocks = [];
		for (let y = 0; y < canvas.height; y += blockSize) {
			for (let x = 0; x < canvas.width; x += blockSize) {
				pixelBlocks.push({
					x,
					y,
					width: Math.min(blockSize, canvas.width - x),
					height: Math.min(blockSize, canvas.height - y),
					revealed: false
				});
			}
		}

		// Clear canvas
		ctx.fillStyle = '#1f2937';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function resetReveal() {
		isRevealing = false;
		revealProgress = 0;
		currentRevealIndex = 0;
		revealedCells.clear();
		revealedStripes.clear();

		if (revealTimeout) {
			clearTimeout(revealTimeout);
			revealTimeout = null;
		}
	}

	function startReveal() {
		if (!isLoaded || isRevealing) return;

		isRevealing = true;
		revealProgress = 0;
		currentRevealIndex = 0;

		switch (presenterState.currentMode) {
			case 'grid':
				revealGrid();
				break;
			case 'stripes-vertical':
			case 'stripes-horizontal':
			case 'stripes-random':
				revealStripes();
				break;
			case 'shattered':
				revealShattered();
				break;
			case 'pixelated':
				revealPixelated();
				break;
			default:
				// Normal mode - instant reveal
				ctx.drawImage(image, 0, 0);
				isRevealing = false;
				break;
		}
	}

	function revealGrid() {
		const { revealDelay } = presenterState.modeSettings;

		if (currentRevealIndex >= gridCells.length) {
			isRevealing = false;
			return;
		}

		const cell = gridCells[currentRevealIndex];

		// Draw the cell from the original image
		ctx.drawImage(image, cell.x, cell.y, cell.width, cell.height, cell.x, cell.y, cell.width, cell.height);

		revealedCells.add(currentRevealIndex);
		revealProgress = (revealedCells.size / gridCells.length) * 100;
		currentRevealIndex++;

		if (currentRevealIndex < gridCells.length) {
			revealTimeout = setTimeout(() => revealGrid(), revealDelay);
		} else {
			isRevealing = false;
		}
	}

	function revealStripes() {
		const { revealDelay } = presenterState.modeSettings;

		if (currentRevealIndex >= stripes.length) {
			isRevealing = false;
			return;
		}

		const stripe = stripes[currentRevealIndex];

		// Draw the stripe from the original image
		ctx.drawImage(image, stripe.x, stripe.y, stripe.width, stripe.height, stripe.x, stripe.y, stripe.width, stripe.height);

		revealedStripes.add(currentRevealIndex);
		revealProgress = (revealedStripes.size / stripes.length) * 100;
		currentRevealIndex++;

		if (currentRevealIndex < stripes.length) {
			revealTimeout = setTimeout(() => revealStripes(), revealDelay);
		} else {
			isRevealing = false;
		}
	}

	function revealShattered() {
		const { revealDelay } = presenterState.modeSettings;

		if (currentRevealIndex >= pieces.length) {
			isRevealing = false;
			return;
		}

		const piece = pieces[currentRevealIndex];

		// Draw the piece from the original image
		ctx.save();
		ctx.translate(piece.x + piece.width / 2, piece.y + piece.height / 2);
		ctx.rotate(piece.rotation);
		ctx.drawImage(image, piece.x, piece.y, piece.width, piece.height, -piece.width / 2, -piece.height / 2, piece.width, piece.height);
		ctx.restore();

		revealProgress = ((currentRevealIndex + 1) / pieces.length) * 100;
		currentRevealIndex++;

		if (currentRevealIndex < pieces.length) {
			revealTimeout = setTimeout(() => revealShattered(), revealDelay);
		} else {
			isRevealing = false;
		}
	}

	function revealPixelated() {
		const { revealDelay } = presenterState.modeSettings;

		if (currentRevealIndex >= pixelBlocks.length) {
			isRevealing = false;
			return;
		}

		const block = pixelBlocks[currentRevealIndex];

		// Draw the block from the original image
		ctx.drawImage(image, block.x, block.y, block.width, block.height, block.x, block.y, block.width, block.height);

		revealProgress = ((currentRevealIndex + 1) / pixelBlocks.length) * 100;
		currentRevealIndex++;

		if (currentRevealIndex < pixelBlocks.length) {
			revealTimeout = setTimeout(() => revealPixelated(), revealDelay);
		} else {
			isRevealing = false;
		}
	}

	$: isLoaded = image && image.complete && image.naturalWidth > 0;

	// Auto-update when state changes
	$: if (presenterState && presenterState.imageSrc) {
		loadImage();
	}
</script>

<svelte:head>
	<title>Screens - Presenter</title>
	<style>
		/* Full screen styles for presenter view */
		.presenter-container {
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			background: #000;
			z-index: 9999;
		}

		.presenter-content {
			width: 100%;
			height: 100%;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			padding: 2rem;
		}

		.presenter-canvas {
			max-width: 90vw;
			max-height: 70vh;
			border: 2px solid #374151;
			border-radius: 8px;
			box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
		}

		.presenter-metadata {
			margin-top: 2rem;
			text-align: center;
			color: white;
		}

		.presenter-progress {
			position: absolute;
			bottom: 2rem;
			left: 50%;
			transform: translateX(-50%);
			background: rgba(0, 0, 0, 0.8);
			padding: 1rem;
			border-radius: 8px;
			min-width: 300px;
		}
	</style>
</svelte:head>

<div class="presenter-container">
	<div class="presenter-content">
		<!-- Main Image Display -->
		{#if presenterState.currentScreen}
			<div class="relative">
				<canvas bind:this={canvas} class="presenter-canvas"></canvas>

				{#if isRevealing}
					<div class="presenter-progress">
						<div class="mb-2 flex items-center justify-between text-sm text-white">
							<span>Odkrywanie...</span>
							<span>{Math.round(revealProgress)}%</span>
						</div>
						<div class="h-2 w-full rounded-full bg-gray-700">
							<div class="h-2 rounded-full bg-purple-500 transition-all duration-300" style="width: {revealProgress}%"></div>
						</div>
					</div>
				{/if}

				{#if needDirectoryAccess}
					<div class="mt-4 flex flex-col items-center gap-2 text-white">
						<p class="text-sm opacity-80">{accessMessage}</p>
						<Button on:click={grantDirectoryAccess} variant="outline">Wybierz katalog</Button>
					</div>
				{/if}
			</div>

			<!-- Metadata Display -->
			{#if presenterState.showMetadata && presenterState.currentScreen}
				<div class="presenter-metadata">
					<h1 class="mb-2 text-4xl font-bold text-green-400">
						{presenterState.currentScreen.title || presenterState.currentScreen.JPName}
					</h1>
					{#if presenterState.currentScreen.ENName}
						<h2 class="mb-4 text-2xl text-gray-300">
							{presenterState.currentScreen.ENName}
						</h2>
					{/if}

					<div class="flex flex-wrap justify-center gap-4 text-sm">
						{#if presenterState.currentScreen.rank}
							<Badge variant="outline" class="border-yellow-500 text-yellow-400">
								#{presenterState.currentScreen.rank}
							</Badge>
						{/if}
						{#if presenterState.currentScreen.Vintage || presenterState.currentScreen.Year}
							<Badge variant="outline" class="border-blue-500 text-blue-400">
								{presenterState.currentScreen.Vintage || presenterState.currentScreen.Year}
							</Badge>
						{/if}
						{#if presenterState.currentScreen.season}
							<Badge variant="outline" class="border-purple-500 text-purple-400">
								{presenterState.currentScreen.season}
							</Badge>
						{/if}
					</div>
				</div>
			{/if}
		{:else}
			<!-- Placeholder when no screen is loaded -->
			<div class="text-center text-white">
				<Monitor class="mx-auto mb-4 h-24 w-24 text-gray-500" />
				<h2 class="mb-2 text-2xl font-bold">Oczekiwanie na screen...</h2>
				<p class="text-gray-400">Prezenter jest gotowy do wyświetlania</p>
			</div>
		{/if}
	</div>
</div>
