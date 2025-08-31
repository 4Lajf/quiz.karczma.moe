<script>
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Play, Square, RotateCcw, Eye, EyeOff, Monitor } from 'lucide-svelte';
	import { screenFileSystemClient } from '$lib/utils/screenFileSystemAPI.js';
	import LeaderboardDisplay from '$lib/components/screens/LeaderboardDisplay.svelte';

	let presenterState = {
		currentScreen: null,
		showMetadata: false,
		showLeaderboard: false,
		showImagePlaceholder: true,
		guessingPhase: true,
		imageSrc: '',
		currentMode: 'normal',
		modeSettings: {
			gridRows: 8,
			gridCols: 8,
			revealDelay: 1000,
			partsCount: 75,
			pixelationLevel: 64,
			stripeCount: 10,
			randomReveal: true,
			randomDirection: false,
			speedMode: 'constant',
			minRandomSpeed: 100,
			maxRandomSpeed: 2000,
			customSequence: '64:1000, 56:1000, 48:1000, 40:1000, 32:1000, 28:1000, 24:1000, 20:1000, 16:1000, 14:1000, 12:1000, 10:1000, 8:1000, 7:1000, 6:1000, 5:1000, 4:1000, 3:1000, 2:1000, 1',
			minPoints: 25,
			minArea: 400,
			randomPolygons: false,
			minParts: 50,
			maxParts: 150
		},
		lastUpdated: Date.now()
	};

	// Current screen and playback state
	let currentScreen = null;
	let currentImageSrc = '';

	// Canvas and image
	let gameContainer;
	let canvas;
	let ctx;
	let image;
	let isImageLoaded = false;

	// Animation state
	let isImagePlaying = false;
	let isImagePaused = false;
	let revealProgress = 0;
	let pointsValue = 100;

	// Mode-specific data
	let imagePieces = [];
	let revealedPieces = [];
	let totalPieces = 0;
	let currentRevealIndex = 0;
	let revealTimeout = null;
	let partInterval = null;

	// Shattered mode specific
	let polygonMasks = [];
	let d3Loaded = false;

	// Access & diagnostics
	let needDirectoryAccess = true;
	let accessMessage = '';

	let stateSyncInterval;
	let lastStateUpdate = 0;
	let showSettingsPanel = false;
	let showHelpOverlay = false;

	// Local reactive variables for settings panel binding
	let gridRows = presenterState.modeSettings.gridRows;
	let gridCols = presenterState.modeSettings.gridCols;
	let revealDelay = presenterState.modeSettings.revealDelay;
	let stripeCount = presenterState.modeSettings.stripeCount;
	let partsCount = presenterState.modeSettings.partsCount;
	let pixelationLevel = presenterState.modeSettings.pixelationLevel;
	let minPoints = presenterState.modeSettings.minPoints;
	let customSequence = presenterState.modeSettings.customSequence;

	// Reactive statements to sync local variables with presenterState
	$: if (gridRows !== presenterState.modeSettings.gridRows) {
		presenterState.modeSettings.gridRows = gridRows;
	}
	$: if (gridCols !== presenterState.modeSettings.gridCols) {
		presenterState.modeSettings.gridCols = gridCols;
	}
	$: if (revealDelay !== presenterState.modeSettings.revealDelay) {
		presenterState.modeSettings.revealDelay = revealDelay;
	}
	$: if (stripeCount !== presenterState.modeSettings.stripeCount) {
		presenterState.modeSettings.stripeCount = stripeCount;
	}
	$: if (partsCount !== presenterState.modeSettings.partsCount) {
		presenterState.modeSettings.partsCount = partsCount;
	}
	$: if (pixelationLevel !== presenterState.modeSettings.pixelationLevel) {
		presenterState.modeSettings.pixelationLevel = pixelationLevel;
	}
	$: if (minPoints !== presenterState.modeSettings.minPoints) {
		presenterState.modeSettings.minPoints = minPoints;
	}
	$: if (customSequence !== presenterState.modeSettings.customSequence) {
		presenterState.modeSettings.customSequence = customSequence;
	}

	onMount(async () => {
		// Load saved local state (including mode settings)
		loadLocalState();

		// Update display after loading settings to ensure UI reflects loaded values
		updateDisplay();

		// Check if we have a stored directory handle on startup
		if (screenFileSystemClient.hasDirectory()) {
			needDirectoryAccess = false;
		} else {
			try {
				const restored = await screenFileSystemClient.restoreDirectoryHandle();
				if (restored) {
					needDirectoryAccess = false;
				}
			} catch (err) {
				console.log('[Presenter] No stored directory handle found');
			}
		}

		// Set up periodic state sync
		stateSyncInterval = setInterval(fetchPresenterState, 1000);

		// Listen for state changes and presenter keyboard shortcuts
		if (typeof window !== 'undefined') {
			window.addEventListener('storage', handleStorageEvent);
			window.addEventListener('screens-metadata-toggled', handleMetadataToggle);
			window.addEventListener('screens-screen-changed', handleScreenChange);
			document.addEventListener('keydown', handleKeydown);
		}

		// Load D3 for shattered mode
		loadD3Libraries();

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

		if (partInterval) {
			clearInterval(partInterval);
		}

		if (typeof window !== 'undefined') {
			window.removeEventListener('storage', handleStorageEvent);
			window.removeEventListener('screens-metadata-toggled', handleMetadataToggle);
			window.removeEventListener('screens-screen-changed', handleScreenChange);
			document.removeEventListener('keydown', handleKeydown);
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
		} else if (event.key === 'screens_presenter_state') {
			try {
				const newState = JSON.parse(event.newValue);
				if (newState) {
					// Restore mode settings and presenter state from localStorage
					if (newState.modeSettings) {
						presenterState.modeSettings = { ...presenterState.modeSettings, ...newState.modeSettings };
					}
					if (newState.showMetadata !== undefined) {
						presenterState.showMetadata = newState.showMetadata;
					}
					if (newState.showLeaderboard !== undefined) {
						presenterState.showLeaderboard = newState.showLeaderboard;
					}
					if (newState.currentMode !== undefined) {
						presenterState.currentMode = newState.currentMode;
					}
					updateDisplay();
				}
			} catch (error) {
				console.error('Failed to parse presenter storage event:', error);
			}
		}
	}

	function handleMetadataToggle(event) {
		if (event.detail) {
			presenterState.showMetadata = event.detail.showMetadata;
			saveLocalState();
			updateDisplay();
		}
	}

	function toggleMetadataViewer() {
		// Toggle between screen view and metadata view (no scoreboard)
		if (presenterState.showMetadata) {
			// Currently showing metadata, switch back to normal screen view
			presenterState.showMetadata = false;
			presenterState.showLeaderboard = false; // Ensure leaderboard is also off
			// Ensure canvas is properly set up when returning to normal view
			if (canvas && presenterState.currentScreen) {
				updateDisplay();
			}
		} else {
			// Currently showing screen, switch to metadata view
			presenterState.showMetadata = true;
			presenterState.showLeaderboard = false; // Ensure leaderboard stays off
		}
		updateDisplay();
		saveLocalState();
	}

	async function loadRandomScreen() {
		try {
			// Check if we have directory access
			if (!screenFileSystemClient.hasDirectory()) {
				console.warn('[Presenter] No directory access for random screen');
				return;
			}

			// Get all available screens
			const availableScreens = await screenFileSystemClient.getImageFiles();

			if (!availableScreens || availableScreens.length === 0) {
				console.warn('[Presenter] No screens available');
				return;
			}

			// Select a random screen
			const randomIndex = Math.floor(Math.random() * availableScreens.length);
			const randomScreen = availableScreens[randomIndex];

			console.log('[Presenter] Loading random screen:', randomScreen.FileName);

			// Load the selected screen
			await loadScreenForPresenter(randomScreen);

		} catch (error) {
			console.error('[Presenter] Failed to load random screen:', error);
		}
	}

	async function loadScreenForPresenter(screen) {
		// Step 1: First turn off metadata display to prevent leakage
		presenterState.showMetadata = false;
		presenterState.showLeaderboard = false;

		// Save metadata off state immediately
		const metadataOffState = {
			currentScreen: presenterState.currentScreen,
			showMetadata: false,
			showLeaderboard: false
		};
		localStorage.setItem('screens_presenter_state', JSON.stringify(metadataOffState));

		// Step 2: Wait a brief moment before loading new screen
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Step 3: Now load the new screen
		presenterState.currentScreen = screen;

		// Set image source for local file
		if (typeof window !== 'undefined') {
			try {
				currentImageSrc = await screenFileSystemClient.createFileURL(screen.FileName);
			} catch (error) {
				console.error('Error creating file URL:', error);
				return;
			}
		}

		// Update presenter state
		await updatePresenterState({
			currentScreen: screen,
			showMetadata: false,
			showLeaderboard: false,
			showImagePlaceholder: true,
			guessingPhase: true,
			imageSrc: currentImageSrc,
			currentMode: presenterState.currentMode,
			modeSettings: presenterState.modeSettings
		});

		// Save final state
		saveLocalState();

		console.log(`[Presenter] Loaded random screen: ${screen.title || screen.JPName || screen.FileName}`);
	}

	async function updatePresenterState(updates) {
		try {
			await fetch('/api/screens/presenter-state', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			});
		} catch (error) {
			console.error('[Presenter] Failed to update presenter state:', error);
		}
	}

	function loadLocalState() {
		try {
			const savedState = localStorage.getItem('screens_presenter_state');
			if (savedState) {
				const state = JSON.parse(savedState);

				// Restore mode settings
				if (state.modeSettings) {
					presenterState.modeSettings = { ...presenterState.modeSettings, ...state.modeSettings };

					// Update local reactive variables for settings panel
					gridRows = presenterState.modeSettings.gridRows;
					gridCols = presenterState.modeSettings.gridCols;
					revealDelay = presenterState.modeSettings.revealDelay;
					stripeCount = presenterState.modeSettings.stripeCount;
					partsCount = presenterState.modeSettings.partsCount;
					pixelationLevel = presenterState.modeSettings.pixelationLevel;
					minPoints = presenterState.modeSettings.minPoints;
					customSequence = presenterState.modeSettings.customSequence;
				}

				// Restore other presenter state
				if (state.showMetadata !== undefined) {
					presenterState.showMetadata = state.showMetadata;
				}
				if (state.showLeaderboard !== undefined) {
					presenterState.showLeaderboard = state.showLeaderboard;
				}
				if (state.currentMode !== undefined) {
					presenterState.currentMode = state.currentMode;
				}
			}
		} catch (error) {
			console.error('Failed to load local state:', error);
		}
	}

	function saveLocalState() {
		try {
			const state = {
				modeSettings: presenterState.modeSettings,
				showMetadata: presenterState.showMetadata,
				showLeaderboard: presenterState.showLeaderboard,
				currentMode: presenterState.currentMode
			};
			localStorage.setItem('screens_presenter_state', JSON.stringify(state));
		} catch (error) {
			console.error('Failed to save local state:', error);
		}
	}

	function handleScreenChange(event) {
		if (event.detail && event.detail.currentScreen) {
			presenterState.currentScreen = event.detail.currentScreen;
			saveLocalState();
			updateDisplay();
		}
	}

	async function loadD3Libraries() {
		try {
			const d3Module = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm');
			const d3VoronoiModule = await import('https://cdn.jsdelivr.net/npm/d3-voronoi@1/+esm');

			window.d3 = d3Module;
			window.d3Voronoi = d3VoronoiModule;
			d3Loaded = true;
			console.log('[Presenter] D3 libraries loaded successfully');
		} catch (error) {
			console.error('[Presenter] Failed to load D3 libraries:', error);
			d3Loaded = false;
		}
	}

	// Presenter keyboard shortcuts
	function handleKeydown(event) {
		const tag = (event.target && event.target.tagName) || 'BODY';
		const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (event.target && event.target.isContentEditable);
		if (isTyping) return;

		// Toggle reveal: Enter or Space (start if stopped, stop if running)
		if (!event.ctrlKey && !event.metaKey && (event.key === 'Enter' || event.code === 'Space')) {
			event.preventDefault();
			if (isImagePlaying) {
				pauseReveal();
			} else {
				startReveal();
			}
			return;
	}

		// Force stop reveal: Escape
		if (!event.ctrlKey && !event.metaKey && event.key === 'Escape') {
			event.preventDefault();
		stopReveal();
			return;
		}

		// Instant reveal: Ctrl+R
		if (event.ctrlKey && (event.key === 'r' || event.key === 'R')) {
			event.preventDefault();
			if (image && ctx) {
				revealFullImage();
			}
			return;
		}

		// Mode switching: Ctrl+1..7
		if (event.ctrlKey && !event.shiftKey && !event.altKey) {
			const modeMap = {
				'1': 'normal',
				'2': 'grid',
				'3': 'stripes-vertical',
				'4': 'stripes-horizontal',
				'5': 'stripes-random',
				'6': 'pixelated',
				'7': 'shattered'
			};
			if (modeMap[event.key]) {
				event.preventDefault();
				setMode(modeMap[event.key]);
				return;
			}
		}

		// Toggle settings: Ctrl+Shift+M
		if (event.ctrlKey && event.shiftKey && (event.key === 'm' || event.key === 'M')) {
			event.preventDefault();
			showSettingsPanel = !showSettingsPanel;
			return;
		}

		// Toggle help: Ctrl+/
		if (event.ctrlKey && event.key === '/') {
			event.preventDefault();
			showHelpOverlay = !showHelpOverlay;
			return;
		}

		// Toggle metadata viewer: M
		if (!event.ctrlKey && !event.metaKey && event.key === 'm' || event.key === 'M') {
			event.preventDefault();
			toggleMetadataViewer();
			return;
		}

		// Load random screen: Ctrl + Right Arrow
		if (event.ctrlKey && event.key === 'ArrowRight') {
			event.preventDefault();
			loadRandomScreen();
			return;
		}

		// Close help with Escape when help is open
		if (showHelpOverlay && event.key === 'Escape') {
			event.preventDefault();
			showHelpOverlay = false;
			return;
		}
	}

	function setMode(modeId) {
		if (presenterState.currentMode === modeId) return;

		// Stop any current reveals
		stopReveal();

		presenterState.currentMode = modeId;

		// Save the mode change to localStorage
		saveLocalState();

		// Always reset game state when switching modes
		resetGame();

		// Re-initialize the new mode
		if (isImageLoaded && ctx) {
			initializeMode();
		}
	}

	function handleSettingsChange(settings) {
		// Stop any current reveals
		stopReveal();

		presenterState.modeSettings = { ...presenterState.modeSettings, ...settings };

		// Save settings to localStorage
		saveLocalState();

		// Reset and re-initialize
		resetGame();
		if (isImageLoaded && ctx) {
			initializeMode();
		}
	}

	function pauseReveal() {
		isImagePlaying = false;
		isImagePaused = true;
		if (revealTimeout) {
			clearTimeout(revealTimeout);
			revealTimeout = null;
		}
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}
	}

	function stopReveal() {
		isImagePlaying = false;
		isImagePaused = false;
		currentRevealIndex = 0;
		revealProgress = 0;
		if (revealTimeout) {
			clearTimeout(revealTimeout);
			revealTimeout = null;
		}
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}
	}

	function resetGame() {
		// Stop any ongoing reveals
		stopReveal();
		
		// Reset all state variables
		isImagePlaying = false;
		isImagePaused = false;
		revealProgress = 0;
		currentRevealIndex = 0;
		pointsValue = 100;
		imagePieces = [];
		revealedPieces = [];
		totalPieces = 0;

		// Clear the canvas
		if (ctx && canvas) {
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, canvas.width || 0, canvas.height || 0);
		}
	}

	async function updateDisplay() {
		if (canvas) {
			await loadImage();
		}
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
					console.log('[Presenter] No directory handle, trying to restore...');
					await screenFileSystemClient.restoreDirectoryHandle();
				}

				if (screenFileSystemClient.hasDirectory()) {
					console.log('[Presenter] Directory available, creating file URL...');
					try {
						src = await screenFileSystemClient.createFileURL(presenterState.currentScreen.FileName);
						needDirectoryAccess = false;
						accessMessage = '';
						console.log('[Presenter] File URL created successfully');
					} catch (permErr) {
						// Likely missing permission; ask user to grant access
						console.warn('[Presenter] Permission error:', permErr);
						needDirectoryAccess = true;
						accessMessage = 'Brak dostępu do katalogu. Nadaj uprawnienia, aby wyświetlić obraz.';
					}
				} else {
					console.log('[Presenter] No directory available, need user selection');
					needDirectoryAccess = true;
					accessMessage = 'Wybierz katalog ze screenami na tym ekranie prezentera.';
				}
			} catch (e) {
				console.warn('[Presenter] Could not rebuild local file URL:', e);
			}
		}

		if (!src) return;

		image = new Image();
		image.crossOrigin = 'anonymous';

		image.onload = () => {
			// Set canvas to fullscreen dimensions
			if (canvas) {
				canvas.width = window.innerWidth;
				canvas.height = window.innerHeight;
				ctx = canvas.getContext('2d');
				isImageLoaded = true;
			}

			if (canvas) {
				console.log('[Presenter] Image loaded, canvas size:', canvas.width, 'x', canvas.height);
			}
			console.log('[Presenter] Image size:', image.width, 'x', image.height);

			if (presenterState.guessingPhase && !presenterState.showMetadata) {
				initializeMode();
			} else {
				// Scale and center the image to fit the screen
				drawImageFullscreen();
			}
		};

		image.onerror = () => {
			console.error('Failed to load presenter image:', src);
		};

		image.src = src;
	}

	async function grantDirectoryAccess() {
		try {
			console.log('[Presenter] Starting directory selection...');

			const selected = await screenFileSystemClient.selectDirectory();
			if (!selected) {
				console.log('[Presenter] User canceled directory selection');
				return;
			}

			console.log('[Presenter] Directory selected successfully');

			if (screenFileSystemClient.hasDirectory()) {
				console.log('[Presenter] Directory handle confirmed');

				needDirectoryAccess = false;
				accessMessage = '';

				if (presenterState.currentScreen) {
					console.log('[Presenter] Loading image for current screen...');
					await loadImage();
				}

				presenterState = { ...presenterState };
				needDirectoryAccess = false;
				accessMessage = '';

				setTimeout(() => {
					console.log('[Presenter] Directory access setup complete');
				}, 100);
			} else {
				console.warn('[Presenter] Directory selection failed - no handle available');
				needDirectoryAccess = true;
				accessMessage = 'Wybór katalogu nie powiódł się. Spróbuj ponownie.';
			}

		} catch (err) {
			console.error('Failed to obtain directory access in presenter:', err);
			needDirectoryAccess = true;
			accessMessage = 'Błąd podczas wybierania katalogu. Spróbuj ponownie.';
		}
	}

	function getImageScaling() {
		if (!image || !canvas) return null;

		const imageAspect = image.width / image.height;
		const screenAspect = canvas.width / canvas.height;

		let drawWidth, drawHeight, offsetX, offsetY;

		if (imageAspect > screenAspect) {
			drawWidth = canvas.width;
			drawHeight = canvas.width / imageAspect;
			offsetX = 0;
			offsetY = (canvas.height - drawHeight) / 2;
		} else {
			drawWidth = canvas.height * imageAspect;
			drawHeight = canvas.height;
			offsetX = (canvas.width - drawWidth) / 2;
			offsetY = 0;
		}

		return {
			drawWidth,
			drawHeight,
			offsetX,
			offsetY,
			scaleX: drawWidth / image.width,
			scaleY: drawHeight / image.height
		};
	}

	function drawImageFullscreen() {
		if (!ctx || !image || !canvas) return;

		const scaling = getImageScaling();
		if (!scaling) return;

		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width || 0, canvas.height || 0);
		ctx.drawImage(image, scaling.offsetX, scaling.offsetY, scaling.drawWidth, scaling.drawHeight);
	}

	function initializeMode() {
		if (!isImageLoaded || !ctx) return;

		resetGame();

		switch (presenterState.currentMode) {
			case 'normal':
				// Normal mode just shows the full image
				drawImageFullscreen();
				break;
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
			case 'pixelated':
				initializePixelatedMode();
				break;
			case 'shattered':
				initializeShatteredMode();
				break;
		}
	}

	function initializeGridMode() {
		const { randomReveal } = presenterState.modeSettings;
		let gridRows = presenterState.modeSettings.gridRows;
		let gridCols = presenterState.modeSettings.gridCols;
		gridRows = Math.max(1, Math.floor(gridRows || 1));
		gridCols = Math.max(1, Math.floor(gridCols || 1));
		const scaling = getImageScaling();
		if (!scaling) return;

		// Calculate piece dimensions based on screen space
		const pieceWidth = scaling.drawWidth / gridCols;
		const pieceHeight = scaling.drawHeight / gridRows;

		imagePieces = [];
		for (let row = 0; row < gridRows; row++) {
			for (let col = 0; col < gridCols; col++) {
				imagePieces.push({
					row,
					col,
					// Source coordinates in original image
					srcX: (col * image.width) / gridCols,
					srcY: (row * image.height) / gridRows,
					srcWidth: image.width / gridCols,
					srcHeight: image.height / gridRows,
					// Destination coordinates on screen
					destX: scaling.offsetX + col * pieceWidth,
					destY: scaling.offsetY + row * pieceHeight,
					destWidth: pieceWidth,
					destHeight: pieceHeight,
					revealed: false
				});
			}
		}

		// Shuffle pieces if random reveal is enabled
		if (randomReveal) {
			imagePieces.sort(() => Math.random() - 0.5);
		}

		totalPieces = imagePieces.length;
		revealedPieces = [];

		// Clear canvas with black background
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function initializeStripesMode(direction) {
		const { randomReveal, randomDirection } = presenterState.modeSettings;
		let stripeCount = presenterState.modeSettings.stripeCount;
		stripeCount = Math.max(1, Math.floor(stripeCount || 1));
		const scaling = getImageScaling();
		if (!scaling) return;

		imagePieces = [];

		if (direction === 'vertical') {
			const stripeWidth = scaling.drawWidth / stripeCount;
			for (let i = 0; i < stripeCount; i++) {
				imagePieces.push({
					type: 'vertical',
					index: i,
					srcX: (i * image.width) / stripeCount,
					srcY: 0,
					srcWidth: image.width / stripeCount,
					srcHeight: image.height,
					destX: scaling.offsetX + i * stripeWidth,
					destY: scaling.offsetY,
					destWidth: stripeWidth,
					destHeight: scaling.drawHeight,
					revealed: false
				});
			}
		} else if (direction === 'horizontal') {
			const stripeHeight = scaling.drawHeight / stripeCount;
			for (let i = 0; i < stripeCount; i++) {
				imagePieces.push({
					type: 'horizontal',
					index: i,
					srcX: 0,
					srcY: (i * image.height) / stripeCount,
					srcWidth: image.width,
					srcHeight: image.height / stripeCount,
					destX: scaling.offsetX,
					destY: scaling.offsetY + i * stripeHeight,
					destWidth: scaling.drawWidth,
					destHeight: stripeHeight,
					revealed: false
				});
			}
		} else if (direction === 'random') {
			// Mix of vertical and horizontal stripes
			const stripeWidth = scaling.drawWidth / stripeCount;
			const stripeHeight = scaling.drawHeight / stripeCount;

			if (randomDirection) {
				// Create random mix of vertical and horizontal stripes
				for (let i = 0; i < stripeCount * 2; i++) {
					const isVertical = Math.random() > 0.5;
					
					if (isVertical) {
						const colIndex = Math.floor(Math.random() * stripeCount);
						imagePieces.push({
							type: 'vertical',
							index: i,
							srcX: (colIndex * image.width) / stripeCount,
							srcY: 0,
							srcWidth: image.width / stripeCount,
							srcHeight: image.height,
							destX: scaling.offsetX + colIndex * stripeWidth,
							destY: scaling.offsetY,
							destWidth: stripeWidth,
							destHeight: scaling.drawHeight,
							revealed: false
						});
					} else {
						const rowIndex = Math.floor(Math.random() * stripeCount);
						imagePieces.push({
							type: 'horizontal',
							index: i,
							srcX: 0,
							srcY: (rowIndex * image.height) / stripeCount,
							srcWidth: image.width,
							srcHeight: image.height / stripeCount,
							destX: scaling.offsetX,
							destY: scaling.offsetY + rowIndex * stripeHeight,
							destWidth: scaling.drawWidth,
							destHeight: stripeHeight,
							revealed: false
						});
					}
				}
			} else {
				// Add all vertical stripes
				for (let i = 0; i < stripeCount; i++) {
					imagePieces.push({
						type: 'vertical',
						index: i,
						srcX: (i * image.width) / stripeCount,
						srcY: 0,
						srcWidth: image.width / stripeCount,
						srcHeight: image.height,
						destX: scaling.offsetX + i * stripeWidth,
						destY: scaling.offsetY,
						destWidth: stripeWidth,
						destHeight: scaling.drawHeight,
						revealed: false
					});
				}

				// Add all horizontal stripes
				for (let i = 0; i < stripeCount; i++) {
					imagePieces.push({
						type: 'horizontal',
						index: i + stripeCount,
						srcX: 0,
						srcY: (i * image.height) / stripeCount,
						srcWidth: image.width,
						srcHeight: image.height / stripeCount,
						destX: scaling.offsetX,
						destY: scaling.offsetY + i * stripeHeight,
						destWidth: scaling.drawWidth,
						destHeight: stripeHeight,
						revealed: false
					});
				}
			}
		}

		// Shuffle pieces if random reveal is enabled
		if (randomReveal) {
			imagePieces.sort(() => Math.random() - 0.5);
		}

		totalPieces = imagePieces.length;
		revealedPieces = [];

		// Clear canvas with black background
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function initializePixelatedMode() {
		// Parse the sequence string to get pixel levels
		const { customSequence } = presenterState.modeSettings;
		const steps = parsePixelationSequence(customSequence);
		
		imagePieces = steps;
		totalPieces = steps.length;
		revealedPieces = [];

		// Start with first (most pixelated) step
		drawPixelatedImage(steps[0]?.pixelSize || 64);
	}

	function parsePixelationSequence(sequenceStr) {
		// Provide fallback if sequenceStr is undefined or empty
		if (!sequenceStr || typeof sequenceStr !== 'string') {
			console.warn('Invalid pixelation sequence, using default');
			sequenceStr = '64:1000, 56:1000, 48:1000, 40:1000, 32:1000, 28:1000, 24:1000, 20:1000, 16:1000, 14:1000, 12:1000, 10:1000, 8:1000, 7:1000, 6:1000, 5:1000, 4:1000, 3:1000, 2:1000, 1';
		}

		const stepStrings = sequenceStr
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		const steps = [];

		for (let i = 0; i < stepStrings.length; i++) {
			const stepStr = stepStrings[i];

			if (stepStr.includes(':')) {
				const [pixelSizeStr, timeStr] = stepStr.split(':').map((s) => s.trim());
				const pixelSize = parseInt(pixelSizeStr, 10);
				const time = parseInt(timeStr, 10);

				if (!isNaN(pixelSize) && !isNaN(time)) {
					steps.push({ pixelSize, time });
				}
			} else {
				const pixelSize = parseInt(stepStr, 10);
				if (!isNaN(pixelSize)) {
					steps.push({ pixelSize, time: null });
				}
			}
		}

		// Sort by pixel size (largest to smallest)
		steps.sort((a, b) => b.pixelSize - a.pixelSize);
		return steps;
	}

	function drawPixelatedImage(pixelSize) {
		if (!ctx || !image) return;

		const scaling = getImageScaling();
		if (!scaling) return;

		// Clear canvas
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		if (pixelSize <= 1) {
			// Draw full resolution image
			ctx.drawImage(image, scaling.offsetX, scaling.offsetY, scaling.drawWidth, scaling.drawHeight);
		} else {
			// Create pixelated effect
			const tempCanvas = document.createElement('canvas');
			const tempCtx = tempCanvas.getContext('2d');

			const tempWidth = Math.floor(scaling.drawWidth / pixelSize);
			const tempHeight = Math.floor(scaling.drawHeight / pixelSize);

			tempCanvas.width = tempWidth;
			tempCanvas.height = tempHeight;

			// Draw small image
			tempCtx.drawImage(image, 0, 0, tempWidth, tempHeight);

			// Scale back up with nearest-neighbor
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(tempCanvas, scaling.offsetX, scaling.offsetY, scaling.drawWidth, scaling.drawHeight);
		}
	}

	function generateMasks() {
		const { partsCount, randomPolygons, minParts, maxParts } = presenterState.modeSettings;
		polygonMasks = [];

		// Determine how many polygons to generate
		let partsToGenerate = partsCount;
		if (randomPolygons) {
			partsToGenerate = Math.floor(minParts + Math.random() * (maxParts - minParts + 1));
			console.log(`Generating ${partsToGenerate} random polygons`);
		}

		for (let i = 0; i < partsToGenerate; i++) {
			const pointX = Math.random();
			const pointY = Math.random();
			polygonMasks.push([pointX, pointY]);
		}
	}

	function initializeShatteredMode() {
		if (!d3Loaded) {
			console.error('D3 libraries not loaded for shattered mode');
			// Fallback to simple mode
			initializeSimpleShatteredMode();
			return;
		}

		const { randomReveal, minArea } = presenterState.modeSettings;
		const scaling = getImageScaling();
		if (!scaling) return;
		
		// Generate random masks
		generateMasks();

		const screenWidth = scaling.drawWidth;
		const screenHeight = scaling.drawHeight;

		// Use d3 voronoi to generate polygons
		const voronoi = window.d3Voronoi.voronoi().extent([
			[0, 0],
			[screenWidth, screenHeight]
		]);
		const polygons = voronoi.polygons(polygonMasks.map((mask) => [mask[0] * screenWidth, mask[1] * screenHeight]));

		// Calculate polygon areas and filter out tiny ones
		const validPolygons = [];
		for (let i = 0; i < polygons.length; i++) {
			const polygon = polygons[i];
			if (!polygon) continue;

			// Calculate polygon area using shoelace formula
			let area = 0;
			for (let j = 0; j < polygon.length; j++) {
				const k = (j + 1) % polygon.length;
				area += polygon[j][0] * polygon[k][1];
				area -= polygon[j][1] * polygon[k][0];
			}
			area = Math.abs(area) / 2;

			// Only keep polygons larger than minimum area
			if (area >= minArea) {
				validPolygons.push(polygon);
			}
		}

		// Use filtered polygons or fallback to all polygons
		const filteredPolygons = validPolygons.length > 0 ? validPolygons : polygons;
		
		if (validPolygons.length < polygons.length) {
			console.log(`Filtered out ${polygons.length - validPolygons.length} small polygons`);
		}

		imagePieces = [];
		filteredPolygons.forEach((polygon, index) => {
			if (!polygon) return;

			// Calculate bounding box of polygon for image mapping
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			polygon.forEach(point => {
				minX = Math.min(minX, point[0]);
				minY = Math.min(minY, point[1]);
				maxX = Math.max(maxX, point[0]);
				maxY = Math.max(maxY, point[1]);
			});

			// Convert screen coordinates to image coordinates
			const srcX = (minX / screenWidth) * image.width;
			const srcY = (minY / screenHeight) * image.height;
			const srcWidth = ((maxX - minX) / screenWidth) * image.width;
			const srcHeight = ((maxY - minY) / screenHeight) * image.height;

			imagePieces.push({
				index,
				polygon: polygon.map(point => [
					scaling.offsetX + point[0], 
					scaling.offsetY + point[1]
				]),
				srcX,
				srcY,
				srcWidth,
				srcHeight,
				destX: scaling.offsetX + minX,
				destY: scaling.offsetY + minY,
				destWidth: maxX - minX,
				destHeight: maxY - minY,
				revealed: false,
				clipPath: `polygon(${polygon.map(point => `${point[0]}px ${point[1]}px`).join(',')})`
			});
		});

		// Shuffle pieces if random reveal is enabled
		if (randomReveal) {
			imagePieces.sort(() => Math.random() - 0.5);
		}

		totalPieces = imagePieces.length;
		revealedPieces = [];

		// Clear canvas with black background
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function initializeSimpleShatteredMode() {
		// Fallback simple shattered mode for when D3 is not available
		const { partsCount, randomReveal } = presenterState.modeSettings;
		const scaling = getImageScaling();
		if (!scaling) return;
		
		imagePieces = [];
		for (let i = 0; i < partsCount; i++) {
			const size = Math.random() * 50 + 20;
			const x = Math.random() * (scaling.drawWidth - size);
			const y = Math.random() * (scaling.drawHeight - size);
			
			imagePieces.push({
				index: i,
				srcX: (x / scaling.drawWidth) * image.width,
				srcY: (y / scaling.drawHeight) * image.height,
				srcWidth: (size / scaling.drawWidth) * image.width,
				srcHeight: (size / scaling.drawHeight) * image.height,
				destX: scaling.offsetX + x,
				destY: scaling.offsetY + y,
				destWidth: size,
				destHeight: size,
				revealed: false
			});
		}

		// Shuffle pieces if random reveal is enabled
		if (randomReveal) {
			imagePieces.sort(() => Math.random() - 0.5);
		}

		totalPieces = imagePieces.length;
		revealedPieces = [];

		// Clear canvas with black background
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function startReveal() {
		if (!isImageLoaded || isImagePlaying) return;

		isImagePlaying = true;
		
		// Only reset if not resuming from pause
		if (!isImagePaused) {
			currentRevealIndex = 0;
			revealProgress = 0;
		}
		isImagePaused = false;

		switch (presenterState.currentMode) {
			case 'normal':
				// Normal mode - instant reveal
				drawImageFullscreen();
				isImagePlaying = false;
				break;
			case 'grid':
			case 'stripes-vertical':
			case 'stripes-horizontal':
			case 'stripes-random':
			case 'shattered':
				revealNextPiece();
				break;
			case 'pixelated':
				revealNextPixelationStep();
				break;
		}
	}

	function revealNextPiece() {
		if (currentRevealIndex >= imagePieces.length) {
			isImagePlaying = false;
			return;
		}

		const piece = imagePieces[currentRevealIndex];
		
		// Handle shattered mode with polygon clipping
		if (presenterState.currentMode === 'shattered' && piece.polygon) {
			ctx.save();
			ctx.beginPath();
			
			// Create clip path from polygon
			piece.polygon.forEach((point, index) => {
				if (index === 0) {
					ctx.moveTo(point[0], point[1]);
				} else {
					ctx.lineTo(point[0], point[1]);
				}
			});
			ctx.closePath();
			ctx.clip();
			
			// Draw the full image within the clipped area
			const scaling = getImageScaling();
			if (scaling) {
				ctx.drawImage(image, scaling.offsetX, scaling.offsetY, scaling.drawWidth, scaling.drawHeight);
			}
			
		ctx.restore();
		} else {
			// Draw regular rectangular piece
			ctx.drawImage(
				image,
				piece.srcX, piece.srcY, piece.srcWidth, piece.srcHeight,
				piece.destX, piece.destY, piece.destWidth, piece.destHeight
			);
		}

		piece.revealed = true;
		revealedPieces.push(piece);
		revealProgress = ((currentRevealIndex + 1) / imagePieces.length) * 100;
		pointsValue = Math.ceil((1 - (currentRevealIndex + 1) / imagePieces.length) * 100);
		currentRevealIndex++;

		if (currentRevealIndex < imagePieces.length && isImagePlaying) {
			revealTimeout = setTimeout(() => revealNextPiece(), presenterState.modeSettings.revealDelay);
		} else {
			isImagePlaying = false;
		}
	}

	function revealNextPixelationStep() {
		if (currentRevealIndex >= imagePieces.length) {
			isImagePlaying = false;
			return;
		}

		const step = imagePieces[currentRevealIndex];
		drawPixelatedImage(step.pixelSize);

		revealProgress = ((currentRevealIndex + 1) / imagePieces.length) * 100;
		const minPts = typeof presenterState.modeSettings.minPoints === 'number' ? presenterState.modeSettings.minPoints : 25;
		const denom = Math.max(1, imagePieces.length - 1);
		let computedPoints = Math.ceil(100 - (100 - minPts) * (currentRevealIndex / denom));
		if (!Number.isFinite(computedPoints)) {
			computedPoints = minPts;
		}
		pointsValue = Math.max(computedPoints, minPts);
		currentRevealIndex++;

		if (currentRevealIndex < imagePieces.length && isImagePlaying) {
			const delay = step.time || presenterState.modeSettings.revealDelay;
			revealTimeout = setTimeout(() => revealNextPixelationStep(), delay);
		} else {
			isImagePlaying = false;
			pointsValue = minPts;
		}
	}

	function revealFullImage() {
		stopReveal();
		drawImageFullscreen();
		revealProgress = 100;
		pointsValue = 0;
		isImagePlaying = false;
		isImagePaused = false;

		// Mark all pieces as revealed
		imagePieces.forEach(piece => piece.revealed = true);
		revealedPieces = [...imagePieces];
		currentRevealIndex = imagePieces.length;
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
			align-items: stretch;
			justify-content: stretch;
			padding: 0;
		}

		.presenter-canvas {
			width: 100vw;
			height: 100vh;
			border: none;
			border-radius: 0;
			box-shadow: none;
			object-fit: contain;
			display: block;
			position: absolute;
			top: 0;
			left: 0;
		}

		.presenter-metadata {
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			text-align: center;
			color: white;
			background: rgba(0, 0, 0, 0.8);
			padding: 2rem;
			border-radius: 12px;
			max-width: 80vw;
			z-index: 10000;
		}

		.presenter-progress {
			position: fixed;
			bottom: 2rem;
			left: 50%;
			transform: translateX(-50%);
			background: rgba(0, 0, 0, 0.8);
			padding: 1rem;
			border-radius: 8px;
			min-width: 300px;
			z-index: 10000;
		}
	</style>
</svelte:head>

<div class="presenter-container">
	<div class="presenter-content">
		<!-- Directory access overlay (always shown if no directory) -->
		{#if needDirectoryAccess}
			<div class="fixed inset-0 flex flex-col items-center justify-center bg-black/90 text-white z-10001">
				<div class="text-center max-w-md">
					<h2 class="mb-4 text-2xl font-bold">Wymagany wybór katalogu</h2>
					<p class="mb-6 text-lg">
						{needDirectoryAccess ? accessMessage : 'Wybierz katalog zawierający screeny, aby móc wyświetlać obrazy w trybie prezentera.'}
					</p>
					<Button on:click={grantDirectoryAccess} variant="outline" class="bg-white text-black hover:bg-gray-200 text-lg px-6 py-3">
						Wybierz katalog ze screenami
					</Button>
				</div>
			</div>
		{:else}
			<!-- Main Image Display (only show when not in metadata or leaderboard mode) -->
			{#if presenterState.currentScreen && !presenterState.showMetadata && !presenterState.showLeaderboard}
				<!-- Create a container for the canvas -->
				<div bind:this={gameContainer} class="w-full h-full relative">
				<canvas bind:this={canvas} class="presenter-canvas"></canvas>
				</div>

				<!-- Progress overlay -->
				{#if isImagePlaying || isImagePaused}
					<div class="presenter-progress">
						<div class="mb-2 flex items-center justify-between text-sm text-white">
							<span>
								{#if isImagePaused}
									Zatrzymano ({presenterState.currentMode})...
								{:else}
									Odkrywanie ({presenterState.currentMode})...
								{/if}
							</span>
							<span>{Math.round(revealProgress)}% | {pointsValue} pkt | {currentRevealIndex}/{totalPieces}</span>
						</div>
						<div class="h-2 w-full rounded-full bg-gray-700">
							<div class="h-2 rounded-full bg-purple-500 transition-all duration-300" style="width: {revealProgress}%"></div>
						</div>
					</div>
				{/if}
			{:else}
				<!-- Placeholder when no screen is loaded or when showing metadata/leaderboard -->
				<div class="fixed inset-0 flex flex-col items-center justify-center text-white">
					<div class="text-center">
						<h2 class="mb-4 text-3xl font-bold">Oczekiwanie na screen...</h2>
						<p class="text-xl text-gray-400">Prezenter jest gotowy do wyświetlania</p>
						<p class="text-lg text-gray-500 mt-4">Wybierz screen w panelu operatora</p>
					</div>
				</div>
			{/if}
		{/if}

		<!-- Metadata/Leaderboard Display -->
		{#if presenterState.showMetadata && presenterState.currentScreen && !needDirectoryAccess}
			<!-- Fullscreen Metadata Display -->
			<div class="fixed inset-0 z-10 flex flex-col h-screen bg-black">
				<!-- Top section with scaled screen -->
				<div class="flex-1 flex items-center justify-center p-4">
					<div class="relative w-full h-full max-w-5xl max-h-[60vh]">
						<div class="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl blur-xl"></div>
						<div class="relative w-full h-full rounded-2xl shadow-2xl border-2 border-gray-700 overflow-hidden bg-black flex items-center justify-center">
							{#if image && ctx}
								<div class="w-full h-full flex items-center justify-center">
									<canvas bind:this={canvas} class="max-w-full max-h-full object-contain rounded-lg"></canvas>
								</div>
							{:else}
								<div class="w-full h-full bg-black flex items-center justify-center text-white text-xl">
									Loading...
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Bottom section with metadata -->
				<div class="flex-shrink-0 p-6">
					<div class="max-w-6xl mx-auto">
						<div class="mb-6 space-y-4 text-center">
							<h2 class="text-5xl font-bold text-green-400 drop-shadow-lg">{presenterState.currentScreen.title || presenterState.currentScreen.JPName}</h2>
							<p class="text-3xl font-light text-gray-300">{presenterState.currentScreen.ENName}</p>
						</div>

						<div class="grid grid-cols-2 gap-4 text-left md:grid-cols-4 max-w-4xl mx-auto">
							<div class="p-4 border bg-blue-900/30 rounded-xl border-blue-700/50">
								<div class="flex items-center space-x-3">
									<div class="text-2xl">🖼️</div>
									<div>
										<p class="text-xs tracking-wide text-blue-300 uppercase">Screen</p>
										<p class="text-lg font-semibold text-white">{presenterState.currentScreen.FileName}</p>
									</div>
								</div>
							</div>

							{#if presenterState.currentScreen.rank}
								<div class="p-4 border bg-yellow-900/30 rounded-xl border-yellow-700/50">
									<div class="flex items-center space-x-3">
										<div class="text-2xl">🏆</div>
										<div>
											<p class="text-xs tracking-wide text-yellow-300 uppercase">Ranking</p>
											<p class="text-lg font-semibold text-white">#{presenterState.currentScreen.rank}</p>
										</div>
									</div>
								</div>
							{/if}

							{#if presenterState.currentScreen.Vintage || presenterState.currentScreen.Year}
								<div class="p-4 border bg-purple-900/30 rounded-xl border-purple-700/50">
									<div class="flex items-center space-x-3">
										<div class="text-2xl">📅</div>
										<div>
											<p class="text-xs tracking-wide text-purple-300 uppercase">Rok</p>
											<p class="text-lg font-semibold text-white">{presenterState.currentScreen.Vintage || presenterState.currentScreen.Year}</p>
										</div>
									</div>
								</div>
							{/if}

							{#if presenterState.currentScreen.season}
								<div class="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl p-4 border border-purple-700/50 {presenterState.currentScreen.rank ? '' : 'col-span-2'}">
									<div class="flex items-center space-x-3">
										<div class="text-2xl">🌸</div>
										<div>
											<p class="text-xs tracking-wide text-purple-300 uppercase">Sezon</p>
											<p class="text-lg font-semibold text-white">{presenterState.currentScreen.season}</p>
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{:else if presenterState.showLeaderboard && !needDirectoryAccess}
			<!-- Fullscreen Leaderboard Display -->
			<div class="fixed inset-0 z-10 bg-black">
				<LeaderboardDisplay showAllDifficulties={true} limit={999} autoRefresh={true} fullscreen={true} />
			</div>
		{/if}

		<!-- Settings Panel -->
		{#if showSettingsPanel}
			<div class="fixed right-4 top-4 z-10001 w-[360px] rounded-lg border border-gray-700 bg-black/85 p-4 text-white shadow-xl">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="text-lg font-semibold">Ustawienia trybu</h3>
					<Button size="sm" variant="outline" class="border-gray-600 text-gray-300 hover:bg-gray-800" on:click={() => (showSettingsPanel = false)}>Zamknij</Button>
	</div>

				<div class="mb-4 text-sm text-gray-400">Bieżący tryb: <span class="text-purple-300">{presenterState.currentMode}</span></div>

				{#if presenterState.currentMode === 'grid'}
					<div class="space-y-3">
						<div>
							<label for="presenter-grid-rows" class="mb-1 block text-xs text-gray-400">Wiersze</label>
							<input id="presenter-grid-rows" type="range" min="2" max="16" bind:value={gridRows} on:input={(e) => handleSettingsChange({ gridRows: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{gridRows}</span>
</div>
						<div>
							<label for="presenter-grid-cols" class="mb-1 block text-xs text-gray-400">Kolumny</label>
							<input id="presenter-grid-cols" type="range" min="2" max="16" bind:value={gridCols} on:input={(e) => handleSettingsChange({ gridCols: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{gridCols}</span>
						</div>
						<div>
							<label for="presenter-reveal-delay" class="mb-1 block text-xs text-gray-400">Opóźnienie (ms)</label>
							<input id="presenter-reveal-delay" type="range" min="10" max="2000" bind:value={revealDelay} on:input={(e) => handleSettingsChange({ revealDelay: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{revealDelay}ms</span>
						</div>
						<div class="flex items-center">
							<input id="presenter-random-reveal" type="checkbox" checked={presenterState.modeSettings.randomReveal} on:change={(e) => handleSettingsChange({ randomReveal: e.target.checked })} class="mr-2" />
							<label for="presenter-random-reveal" class="text-xs text-gray-400">Losowe odkrywanie</label>
						</div>
					</div>
				{:else if presenterState.currentMode.includes('stripes')}
					<div class="space-y-3">
						<div>
							<label for="presenter-stripe-count" class="mb-1 block text-xs text-gray-400">Liczba pasków</label>
							<input id="presenter-stripe-count" type="range" min="2" max="20" bind:value={stripeCount} on:input={(e) => handleSettingsChange({ stripeCount: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{stripeCount}</span>
						</div>
						<div>
							<label for="presenter-reveal-delay" class="mb-1 block text-xs text-gray-400">Opóźnienie (ms)</label>
							<input id="presenter-reveal-delay" type="range" min="10" max="2000" bind:value={revealDelay} on:input={(e) => handleSettingsChange({ revealDelay: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{revealDelay}ms</span>
						</div>
						<div class="flex items-center">
							<input id="presenter-random-reveal-stripes" type="checkbox" checked={presenterState.modeSettings.randomReveal} on:change={(e) => handleSettingsChange({ randomReveal: e.target.checked })} class="mr-2" />
							<label for="presenter-random-reveal-stripes" class="text-xs text-gray-400">Losowe odkrywanie</label>
						</div>
						{#if presenterState.currentMode === 'stripes-random'}
							<div class="flex items-center">
								<input id="presenter-random-direction" type="checkbox" checked={presenterState.modeSettings.randomDirection} on:change={(e) => handleSettingsChange({ randomDirection: e.target.checked })} class="mr-2" />
								<label for="presenter-random-direction" class="text-xs text-gray-400">Losowy kierunek pasków</label>
							</div>
						{/if}
					</div>
				{:else if presenterState.currentMode === 'shattered'}
					<div class="space-y-3">
						<div class="flex items-center">
							<input id="presenter-random-polygons" type="checkbox" checked={presenterState.modeSettings.randomPolygons} on:change={(e) => handleSettingsChange({ randomPolygons: e.target.checked })} class="mr-2" />
							<label for="presenter-random-polygons" class="text-xs text-gray-400">Losowa liczba elementów</label>
						</div>
						{#if !presenterState.modeSettings.randomPolygons}
							<div>
								<label for="presenter-parts-count" class="mb-1 block text-xs text-gray-400">Liczba części</label>
								<input id="presenter-parts-count" type="range" min="20" max="150" bind:value={partsCount} on:input={(e) => handleSettingsChange({ partsCount: parseInt(e.target.value) })} class="w-full" />
								<span class="text-xs text-gray-500">{partsCount}</span>
							</div>
						{:else}
							<div>
								<label for="presenter-min-parts" class="mb-1 block text-xs text-gray-400">Min części</label>
								<input id="presenter-min-parts" type="range" min="20" max={presenterState.modeSettings.maxParts - 10} value={presenterState.modeSettings.minParts} on:input={(e) => handleSettingsChange({ minParts: parseInt(e.target.value) })} class="w-full" />
								<span class="text-xs text-gray-500">{presenterState.modeSettings.minParts}</span>
							</div>
							<div>
								<label for="presenter-max-parts" class="mb-1 block text-xs text-gray-400">Max części</label>
								<input id="presenter-max-parts" type="range" min={presenterState.modeSettings.minParts + 10} max="200" value={presenterState.modeSettings.maxParts} on:input={(e) => handleSettingsChange({ maxParts: parseInt(e.target.value) })} class="w-full" />
								<span class="text-xs text-gray-500">{presenterState.modeSettings.maxParts}</span>
							</div>
						{/if}
						<div>
							<label for="presenter-min-area" class="mb-1 block text-xs text-gray-400">Minimalny obszar</label>
							<input id="presenter-min-area" type="range" min="100" max="1000" value={presenterState.modeSettings.minArea} on:input={(e) => handleSettingsChange({ minArea: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{presenterState.modeSettings.minArea}px²</span>
						</div>
						<div>
							<label for="presenter-shatter-delay" class="mb-1 block text-xs text-gray-400">Opóźnienie (ms)</label>
							<input id="presenter-shatter-delay" type="range" min="10" max="1000" value={presenterState.modeSettings.revealDelay} on:input={(e) => handleSettingsChange({ revealDelay: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{presenterState.modeSettings.revealDelay}ms</span>
						</div>
						<div class="flex items-center">
							<input id="presenter-random-reveal-shattered" type="checkbox" checked={presenterState.modeSettings.randomReveal} on:change={(e) => handleSettingsChange({ randomReveal: e.target.checked })} class="mr-2" />
							<label for="presenter-random-reveal-shattered" class="text-xs text-gray-400">Losowe odkrywanie</label>
						</div>
					</div>
				{:else if presenterState.currentMode === 'pixelated'}
					<div class="space-y-3">
						<div>
							<label for="presenter-custom-sequence" class="mb-1 block text-xs text-gray-400">Sekwencja pixelacji</label>
							<textarea id="presenter-custom-sequence" bind:value={customSequence} on:input={(e) => handleSettingsChange({ customSequence: e.target.value })} class="w-full h-20 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white text-xs"></textarea>
							<div class="mt-1 text-[10px] text-gray-500">Domyślna: <code>64:1000, 56:1000, 48:1000, 40:1000, 32:1000, 28:1000, 24:1000, 20:1000, 16:1000, 14:1000, 12:1000, 10:1000, 8:1000, 7:1000, 6:1000, 5:1000, 4:1000, 3:1000, 2:1000, 1</code></div>
						</div>
						<div>
							<label for="presenter-min-points" class="mb-1 block text-xs text-gray-400">Minimalne punkty</label>
							<input id="presenter-min-points" type="range" min="0" max="50" bind:value={minPoints} on:input={(e) => handleSettingsChange({ minPoints: parseInt(e.target.value) })} class="w-full" />
							<span class="text-xs text-gray-500">{minPoints}</span>
						</div>
					</div>
				{/if}

				<div class="mt-4 text-xs text-gray-500">Skróty: Enter/Space start/stop, Esc force stop, Ctrl+R natychmiast, Ctrl+1..7 tryby, Ctrl+Shift+M ustawienia</div>
			</div>
		{/if}

		<!-- Help Overlay -->
		{#if showHelpOverlay}
			<div class="fixed inset-0 z-10002 bg-black/90 flex items-center justify-center p-4" on:click={() => (showHelpOverlay = false)} on:keydown={(e) => { if (e.key === 'Escape') showHelpOverlay = false; }} role="dialog" aria-modal="true" aria-labelledby="help-title" tabindex="-1">
				<div class="bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto" role="document">
					<div class="p-6">
						<div class="flex items-center justify-between mb-6">
							<h2 id="help-title" class="text-2xl font-bold text-white flex items-center gap-3">
								<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
								<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">/</kbd>
								<span>Pomoc - Skróty klawiszowe</span>
							</h2>
							<Button size="sm" variant="outline" class="border-gray-600 text-gray-300 hover:bg-gray-800" on:click={() => (showHelpOverlay = false)}>
								<kbd class="px-2 py-1 text-xs bg-gray-700 rounded mr-2">Esc</kbd> Zamknij
							</Button>
						</div>

						<div class="space-y-6">
							<!-- Basic Controls -->
							<div>
								<h3 class="text-lg font-semibold text-purple-400 mb-3">Sterowanie odtwarzaniem</h3>
								<div class="grid gap-3">
									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Enter</kbd> lub
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Space</kbd>
											<span class="text-gray-300">Rozpocznij/Zatrzymaj odkrywanie</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Esc</kbd>
											<span class="text-gray-300">Przymusowe zatrzymanie odkrywania</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">R</kbd>
											<span class="text-gray-300">Natychmiastowe pełne odkrycie</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">→</kbd>
											<span class="text-gray-300">Losowy screen</span>
										</div>
									</div>
								</div>
							</div>

							<!-- Mode Selection -->
							<div>
								<h3 class="text-lg font-semibold text-blue-400 mb-3">Wybór trybu odkrywania</h3>
								<div class="grid gap-2">
									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">1</kbd>
											<span class="text-gray-300">Normalny</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">2</kbd>
											<span class="text-gray-300">Siatka</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">3</kbd>
											<span class="text-gray-300">Paski pionowe</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">4</kbd>
											<span class="text-gray-300">Paski poziome</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">5</kbd>
											<span class="text-gray-300">Paski losowe</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">6</kbd>
											<span class="text-gray-300">Pikselizacja</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">7</kbd>
											<span class="text-gray-300">Rozbite</span>
										</div>
									</div>
								</div>
							</div>

							<!-- Settings -->
							<div>
								<h3 class="text-lg font-semibold text-green-400 mb-3">Ustawienia</h3>
								<div class="grid gap-3">
									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Shift</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">M</kbd>
											<span class="text-gray-300">Pokaż/ukryj panel ustawień</span>
										</div>
									</div>
								</div>
							</div>

							<!-- Metadata Viewer -->
							<div>
								<h3 class="text-lg font-semibold text-green-400 mb-3">Przeglądarka metadanych</h3>
								<div class="grid gap-3">
									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">M</kbd>
											<span class="text-gray-300">Przełącz między metadanymi a widokiem normalnym</span>
										</div>
									</div>
								</div>
							</div>

							<!-- Help -->
							<div>
								<h3 class="text-lg font-semibold text-yellow-400 mb-3">Pomoc</h3>
								<div class="grid gap-3">
									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd> +
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">/</kbd>
											<span class="text-gray-300">Pokaż/ukryj tę pomoc</span>
										</div>
									</div>

									<div class="flex items-center justify-between p-3 bg-gray-800 rounded">
										<div class="flex items-center gap-3">
											<kbd class="px-2 py-1 text-xs bg-gray-700 rounded">Esc</kbd>
											<span class="text-gray-300">Zamknij pomoc (gdy jest otwarta)</span>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="mt-6 p-4 bg-gray-800 rounded-lg">
							<p class="text-sm text-gray-400">
								<strong>💡 Wskazówka:</strong> Wszystkie skróty klawiszowe działają tylko wtedy, gdy nie edytujesz tekstu w polach formularza.
								Panel ustawień pozwala na dostosowanie parametrów dla każdego trybu odkrywania.
							</p>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>