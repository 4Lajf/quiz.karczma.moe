<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Settings, Play, Square, RotateCcw, Sliders } from 'lucide-svelte';

	export let src = '';
	export let mode = 'normal';
	export let modeSettings = {
		gridRows: 4,
		gridCols: 4,
		revealDelay: 100,
		partsCount: 100,
		pixelationLevel: 64
	};
	export let showImage = true; // Control whether to show the actual image or placeholder
	export let operatorMode = false; // Special mode for operators (hides image but keeps functionality)

	const dispatch = createEventDispatcher();

	let canvas;
	let ctx;
	let image;
	let isLoaded = false;
	let isRevealing = false;
	let revealProgress = 0;
	let revealTimeout;
	let currentRevealIndex = 0;

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

	// Track the last src to avoid infinite loops
	let lastSrc = '';

	$: if (src && src !== lastSrc && canvas) {
		console.log('[ImagePlayer] Reactive: src changed, loading image', { src, lastSrc });
		lastSrc = src;
		loadImage();
	}

	$: if (mode && isLoaded) {
		console.log('[ImagePlayer] Reactive: mode changed, initializing mode', mode);
		initializeMode();
	}

	function loadImage() {
		if (!src || !canvas) {
			console.log('[ImagePlayer] loadImage skipped - no src or canvas');
			return;
		}

		console.log('[ImagePlayer] Loading image:', src);
		image = new Image();
		image.crossOrigin = 'anonymous';

		image.onload = () => {
			console.log('[ImagePlayer] Image loaded successfully', {
				width: image.width,
				height: image.height,
				showImage
			});
			isLoaded = true;
			canvas.width = image.width;
			canvas.height = image.height;
			ctx = canvas.getContext('2d');
			resetReveal();
		};

		image.onerror = (error) => {
			console.error('[ImagePlayer] Failed to load image:', src, error);
			isLoaded = false;
		};

		image.src = src;
	}

	function initializeMode() {
		if (!isLoaded || !ctx) return;

		resetReveal();

		switch (mode) {
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
		const { gridRows, gridCols } = modeSettings;
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
		ctx.fillStyle = '#1f2937'; // gray-800
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function initializeStripesMode(direction) {
		const { gridRows, gridCols } = modeSettings;

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
		const { partsCount } = modeSettings;

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
		const { pixelationLevel } = modeSettings;
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
		console.log('[ImagePlayer] startReveal called', {
			isRevealing,
			showImage,
			isLoaded,
			mode,
			modeSettings,
			operatorMode
		});

		if (isRevealing) {
			console.log('[ImagePlayer] Already revealing, returning');
			return;
		}

		// In operator mode, only simulate for UI feedback (presenter controls via shortcuts)
		if (operatorMode) {
			isRevealing = true;
			revealProgress = 0;
			currentRevealIndex = 0;
			simulateRevealProgress();
			return;
		}

		// If no image loaded, just simulate the reveal
		if (!isLoaded) {
			console.log('[ImagePlayer] No image loaded, simulating reveal');
			isRevealing = true;
			revealProgress = 0;
			currentRevealIndex = 0;
			simulateRevealProgress();
			return;
		}

		console.log('[ImagePlayer] Starting actual reveal with image');
		isRevealing = true;
		revealProgress = 0;
		currentRevealIndex = 0;

		switch (mode) {
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
				console.log('[ImagePlayer] Normal mode drawing image');
				ctx.drawImage(image, 0, 0);
				isRevealing = false;
				break;
		}
	}

	function simulateRevealProgress() {
		const totalSteps = mode === 'normal' ? 1 : 50; // Simulate 50 steps for non-normal modes
		const interval = setInterval(() => {
			currentRevealIndex++;
			revealProgress = (currentRevealIndex / totalSteps) * 100;

			if (currentRevealIndex >= totalSteps) {
				isRevealing = false;
				clearInterval(interval);
			}
		}, modeSettings.revealDelay || 100);
	}

	function revealGrid() {
		const { revealDelay } = modeSettings;

		if (currentRevealIndex >= gridCells.length) {
			isRevealing = false;
			return;
		}

		const cell = gridCells[currentRevealIndex];

		// Only draw if we have an image and canvas and not in operator mode
		if (!operatorMode && ctx && image) {
			ctx.drawImage(image, cell.x, cell.y, cell.width, cell.height, cell.x, cell.y, cell.width, cell.height);
		}

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
		const { revealDelay } = modeSettings;

		if (currentRevealIndex >= stripes.length) {
			isRevealing = false;
			return;
		}

		const stripe = stripes[currentRevealIndex];

		// Only draw if we have an image and canvas and not in operator mode
		if (!operatorMode && ctx && image) {
			ctx.drawImage(image, stripe.x, stripe.y, stripe.width, stripe.height, stripe.x, stripe.y, stripe.width, stripe.height);
		}

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
		const { revealDelay } = modeSettings;

		if (currentRevealIndex >= pieces.length) {
			isRevealing = false;
			return;
		}

		const piece = pieces[currentRevealIndex];

		// Only draw if we have an image and canvas and not in operator mode
		if (!operatorMode && ctx && image) {
			ctx.save();
			ctx.translate(piece.x + piece.width / 2, piece.y + piece.height / 2);
			ctx.rotate(piece.rotation);
			ctx.drawImage(image, piece.x, piece.y, piece.width, piece.height, -piece.width / 2, -piece.height / 2, piece.width, piece.height);
			ctx.restore();
		}

		revealProgress = ((currentRevealIndex + 1) / pieces.length) * 100;
		currentRevealIndex++;

		if (currentRevealIndex < pieces.length) {
			revealTimeout = setTimeout(() => revealShattered(), revealDelay);
		} else {
			isRevealing = false;
		}
	}

	function revealPixelated() {
		const { revealDelay } = modeSettings;

		if (currentRevealIndex >= pixelBlocks.length) {
			isRevealing = false;
			return;
		}

		const block = pixelBlocks[currentRevealIndex];

		// Only draw if we have an image and canvas and not in operator mode
		if (!operatorMode && ctx && image) {
			ctx.drawImage(image, block.x, block.y, block.width, block.height, block.x, block.y, block.width, block.height);
		}

		revealProgress = ((currentRevealIndex + 1) / pixelBlocks.length) * 100;
		currentRevealIndex++;

		if (currentRevealIndex < pixelBlocks.length) {
			revealTimeout = setTimeout(() => revealPixelated(), revealDelay);
		} else {
			isRevealing = false;
		}
	}

	function stopReveal() {
		console.log('[ImagePlayer] stopReveal called', { isRevealing, revealTimeout, operatorMode });
		isRevealing = false;
		if (revealTimeout) {
			clearTimeout(revealTimeout);
			revealTimeout = null;
			console.log('[ImagePlayer] Cleared reveal timeout');
		}

		// In operator mode, do not propagate to presenter (presenter controls via shortcuts)
	}

	function instantReveal() {
		console.log('[ImagePlayer] instantReveal called', { operatorMode, isLoaded, image });

		// In operator mode, do not propagate to presenter (presenter controls via shortcuts)
		if (operatorMode) {
			resetReveal();
			return;
		}

		if (!isLoaded) {
			console.log('[ImagePlayer] Not loaded, resetting');
			resetReveal();
			return;
		}

		console.log('[ImagePlayer] Drawing full image instantly');
		ctx.drawImage(image, 0, 0);
		resetReveal();
	}

	function handleModeSettingsChange(settings) {
		modeSettings = { ...modeSettings, ...settings };
		dispatch('modeSettingsChange', modeSettings);

		if (isLoaded) {
			initializeMode();
		}
	}

	onMount(() => {
		console.log('[ImagePlayer] Component mounted', { showImage, src, mode });
		if (canvas) {
			ctx = canvas.getContext('2d');
			console.log('[ImagePlayer] Canvas context initialized');
		}
	});
</script>

<div class="image-player space-y-4">
	<!-- Image Canvas -->
	<Card class="border-gray-800 bg-gray-900">
		<CardContent class="p-4">
			<div class="relative">
				<!-- Always render canvas for functionality, but hide visually if needed -->
				<canvas bind:this={canvas} class="h-auto max-w-full rounded-lg border border-gray-700 bg-gray-800" style="display: {isLoaded && !operatorMode ? 'block' : 'none'}"></canvas>

				{#if !isLoaded && src}
					<div class="flex h-64 items-center justify-center rounded-lg border border-gray-700 bg-gray-800">
						<div class="text-center">
							<div class="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-purple-500"></div>
							<p class="text-gray-400">Ładowanie screena...</p>
						</div>
					</div>
				{:else if isLoaded && operatorMode}
					<!-- Placeholder when image is loaded but hidden in operator mode -->
					<div class="flex h-64 items-center justify-center rounded-lg border border-gray-700 bg-gray-800">
						<div class="text-center">
							<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-700">
								<Square class="h-8 w-8 text-gray-500" />
							</div>
							<h3 class="mb-2 text-lg font-medium text-gray-300">Screen załadowany</h3>
							<p class="text-sm text-gray-500">Widoczny tylko w trybie prezentera</p>
						</div>
					</div>
				{/if}

				{#if isLoaded && isRevealing}
					<div class="absolute bottom-2 left-2 right-2">
						<div class="rounded-lg bg-black/70 p-2">
							<div class="mb-1 flex items-center justify-between text-sm text-white">
								<span>Postęp odkrywania</span>
								<span>{Math.round(revealProgress)}%</span>
							</div>
							<div class="h-2 w-full rounded-full bg-gray-700">
								<div class="h-2 rounded-full bg-purple-500 transition-all duration-300" style="width: {revealProgress}%"></div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</CardContent>
	</Card>

	<!-- Controls (hidden in operator mode - presenter controls via keyboard) -->
	{#if (isLoaded || !showImage) && !operatorMode}
		<div class="flex flex-wrap gap-2">
			<Button on:click={startReveal} disabled={isRevealing} class="bg-green-600 text-white hover:bg-green-700">
				{#if isRevealing}
					<div class="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
					Odkrywanie...
				{:else}
					<Play class="mr-2 h-4 w-4" />
					Rozpocznij odkrywanie
				{/if}
			</Button>

			<Button on:click={stopReveal} disabled={!isRevealing} variant="outline" class="border-red-600 text-red-400 hover:bg-red-900/30">
				<Square class="mr-2 h-4 w-4" />
				Zatrzymaj
			</Button>

			<Button on:click={instantReveal} variant="outline" class="border-blue-600 text-blue-400 hover:bg-blue-900/30">
				<RotateCcw class="mr-2 h-4 w-4" />
				Odkryj natychmiast
			</Button>
		</div>
	{:else if operatorMode}
		<div class="text-center text-sm text-gray-500 py-4">
			Sterowanie tylko w trybie prezentera (skróty klawiszowe)
		</div>

		<!-- Mode settings hidden in operator mode (presenter controls via keyboard) -->
	{/if}

	<!-- Mode-specific settings (hidden in operator mode) -->
	{#if !operatorMode && (mode === 'grid' || mode.includes('stripes'))}
		<Card class="border-gray-700 bg-gray-800">
			<CardContent class="p-4">
				<div class="mb-3 flex items-center gap-2">
					<Settings class="h-4 w-4 text-gray-400" />
					<span class="text-sm font-medium text-gray-300">Ustawienia siatki</span>
				</div>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					{#if mode === 'grid'}
						<div>
							<label for="grid-rows" class="mb-1 block text-xs text-gray-400">Wiersze</label>
							<input id="grid-rows" type="range" min="2" max="16" value={modeSettings.gridRows} on:input={(e) => handleModeSettingsChange({ gridRows: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{modeSettings.gridRows}</span>
						</div>
					{/if}
					<div>
						<label for="grid-cols" class="mb-1 block text-xs text-gray-400">Kolumny</label>
						<input id="grid-cols" type="range" min="2" max="16" value={modeSettings.gridCols} on:input={(e) => handleModeSettingsChange({ gridCols: parseInt(e.target.value) })} class="w-full" />
						<span class="text-xs text-gray-500">{modeSettings.gridCols}</span>
					</div>
					<div>
						<label for="reveal-delay" class="mb-1 block text-xs text-gray-400">Opóźnienie (ms)</label>
						<input id="reveal-delay" type="range" min="10" max="1000" value={modeSettings.revealDelay} on:input={(e) => handleModeSettingsChange({ revealDelay: parseInt(e.target.value) })} class="w-full" />
						<span class="text-xs text-gray-500">{modeSettings.revealDelay}ms</span>
					</div>
				</div>
			</CardContent>
		</Card>
	{:else if !operatorMode && mode === 'shattered'}
		<Card class="border-gray-700 bg-gray-800">
			<CardContent class="p-4">
				<div class="mb-3 flex items-center gap-2">
					<Settings class="h-4 w-4 text-gray-400" />
					<span class="text-sm font-medium text-gray-300">Ustawienia rozbicia</span>
				</div>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="parts-count" class="mb-1 block text-xs text-gray-400">Liczba części</label>
						<input id="parts-count" type="range" min="50" max="200" value={modeSettings.partsCount} on:input={(e) => handleModeSettingsChange({ partsCount: parseInt(e.target.value) })} class="w-full" />
						<span class="text-xs text-gray-500">{modeSettings.partsCount}</span>
					</div>
					<div>
						<label for="shatter-delay" class="mb-1 block text-xs text-gray-400">Opóźnienie (ms)</label>
						<input id="shatter-delay" type="range" min="10" max="500" value={modeSettings.revealDelay} on:input={(e) => handleModeSettingsChange({ revealDelay: parseInt(e.target.value) })} class="w-full" />
						<span class="text-xs text-gray-500">{modeSettings.revealDelay}ms</span>
					</div>
				</div>
			</CardContent>
		</Card>
	{:else if !operatorMode && mode === 'pixelated'}
		<Card class="border-gray-700 bg-gray-800">
			<CardContent class="p-4">
				<div class="mb-3 flex items-center gap-2">
					<Settings class="h-4 w-4 text-gray-400" />
					<span class="text-sm font-medium text-gray-300">Ustawienia pixelizacji</span>
				</div>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label for="pixelation-level" class="mb-1 block text-xs text-gray-400">Poziom pixelizacji</label>
						<select id="pixelation-level" value={modeSettings.pixelationLevel} on:change={(e) => handleModeSettingsChange({ pixelationLevel: parseInt(e.target.value) })} class="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1 text-white">
							<option value="64">64 (duże pixele)</option>
							<option value="56">56</option>
							<option value="48">48</option>
							<option value="40">40</option>
							<option value="32">32</option>
							<option value="28">28</option>
							<option value="24">24</option>
							<option value="20">20</option>
							<option value="16">16</option>
							<option value="14">14</option>
							<option value="12">12</option>
							<option value="10">10</option>
							<option value="8">8</option>
							<option value="7">7</option>
							<option value="6">6</option>
							<option value="5">5</option>
							<option value="4">4</option>
							<option value="3">3</option>
							<option value="2">2</option>
							<option value="1">1 (małe pixele)</option>
						</select>
					</div>
					<div>
						<label for="pixel-delay" class="mb-1 block text-xs text-gray-400">Opóźnienie (ms)</label>
						<input id="pixel-delay" type="range" min="5" max="200" value={modeSettings.revealDelay} on:input={(e) => handleModeSettingsChange({ revealDelay: parseInt(e.target.value) })} class="w-full" />
						<span class="text-xs text-gray-500">{modeSettings.revealDelay}ms</span>
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}
</div>
