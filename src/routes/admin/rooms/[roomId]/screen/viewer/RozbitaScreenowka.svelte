<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Shell as Spirals } from 'lucide-svelte';
	import FortuneWheel from './FortuneWheel.svelte';

	export let screenImage;
	export let room;
	export let supabase;
	export let currentRound;

	let showFortuneWheel = false;
	let fortuneWheelOptions = [
		{ id: 'random', label: 'Losowo', color: '#3b82f6', enabled: true },
		{ id: 'spiral', label: 'Spirala', color: '#8b5cf6', enabled: true },
		{ id: 'left', label: 'Lewo', color: '#ec4899', enabled: true },
		{ id: 'right', label: 'Prawo', color: '#f43f5e', enabled: true },
		{ id: 'top', label: 'Góra', color: '#10b981', enabled: true },
		{ id: 'bottom', label: 'Dół', color: '#f59e0b', enabled: true },
		{ id: 'left-right', label: 'Lewo + Prawo', color: '#6366f1', enabled: true },
		{ id: 'left-top', label: 'Lewo + Góra', color: '#84cc16', enabled: true },
		{ id: 'left-bottom', label: 'Lewo + Dół', color: '#ef4444', enabled: true },
		{ id: 'right-top', label: 'Prawo + Góra', color: '#06b6d4', enabled: true },
		{ id: 'right-bottom', label: 'Prawo + Dół', color: '#8b5cf6', enabled: true },
		{ id: 'top-bottom', label: 'Góra + Dół', color: '#d946ef', enabled: true },
		{ id: 'left-right-top', label: 'L + P + G', color: '#f97316', enabled: false },
		{ id: 'left-right-bottom', label: 'L + P + D', color: '#14b8a6', enabled: false },
		{ id: 'left-top-bottom', label: 'L+ G + D', color: '#a3e635', enabled: false },
		{ id: 'right-top-bottom', label: 'P + G + D', color: '#fb7185', enabled: false },
		{ id: 'all', label: 'Wszystkie', color: '#fbbf24', enabled: true }
	];

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
	let roundStarted = false;

	let partInterval;
	let polygonMasks = [];
	let isImageLoaded = false;
	let isImagePlaying = false;
	let isImagePaused = false;
	let imagePieces = [];
	let revealedPieces = new Set();

	let showWheelSettings = false;
	let wheelSettingOptions = [...fortuneWheelOptions]; // Create a copy for editing
	let savedWheelOptions = [];

	const DEFAULT_CONFIG = {
		numParts: 75,
		minParts: 50,
		maxParts: 150,
		randomPolygons: false,
		speedMode: 'constant', // 'constant', 'randomOnce', or 'randomEach'
		animationSpeed: 400,
		minRandomSpeed: 100,
		maxRandomSpeed: 600,
		randomDelay: false,
		minRandomDelay: 10,
		maxRandomDelay: 200,
		revealDirections: [], // Empty array = random
		useSpiral: false, // Just one spiral mode now (center outward)
		revealInBatches: false, // New option for batch reveals
		numberOfBatches: 3 // Default number of batches
	};

	async function savePointsValue() {
		if (!currentRound || !room) return;

		try {
			// Store points in the same 'screen_game_points' table used by ZakrywanaScreenowka
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

	function loadWheelOptionsFromLocalStorage() {
		if (browser) {
			try {
				const savedOptions = localStorage.getItem('rozbitaWheelOptions');
				if (savedOptions) {
					const parsedOptions = JSON.parse(savedOptions);
					// Only use saved options if valid
					if (Array.isArray(parsedOptions) && parsedOptions.length > 0) {
						savedWheelOptions = parsedOptions;
						fortuneWheelOptions = parsedOptions;
					}
				}
			} catch (error) {
				console.error('Failed to load wheel options from localStorage:', error);
			}
		}
	}

	function saveWheelOptionsToLocalStorage() {
		if (browser) {
			try {
				localStorage.setItem('rozbitaWheelOptions', JSON.stringify(fortuneWheelOptions));
				savedWheelOptions = [...fortuneWheelOptions];
			} catch (error) {
				console.error('Failed to save wheel options to localStorage:', error);
			}
		}
	}

	function openWheelSettings() {
		// Reset the working copy of options
		wheelSettingOptions = [...fortuneWheelOptions];
		showWheelSettings = true;
	}

	function saveWheelSettings() {
		// Filter out unchecked options
		fortuneWheelOptions = wheelSettingOptions.filter((option) => option.enabled !== false);
		saveWheelOptionsToLocalStorage();
		showWheelSettings = false;
	}

	function cancelWheelSettings() {
		showWheelSettings = false;
	}

	function resetWheelOptions() {
		// Define all defaults again
		const defaultOptions = [
			{ id: 'random', label: 'Losowo', color: '#3b82f6', enabled: true },
			{ id: 'spiral', label: 'Spirala', color: '#8b5cf6', enabled: true },
			{ id: 'left', label: 'Lewo', color: '#ec4899', enabled: true },
			{ id: 'right', label: 'Prawo', color: '#f43f5e', enabled: true },
			{ id: 'top', label: 'Góra', color: '#10b981', enabled: true },
			{ id: 'bottom', label: 'Dół', color: '#f59e0b', enabled: true },
			{ id: 'left-right', label: 'Lewo+Prawo', color: '#6366f1', enabled: true },
			{ id: 'left-top', label: 'Lewo+Góra', color: '#84cc16', enabled: true },
			{ id: 'left-bottom', label: 'Lewo+Dół', color: '#ef4444', enabled: true },
			{ id: 'right-top', label: 'Prawo+Góra', color: '#06b6d4', enabled: true },
			{ id: 'right-bottom', label: 'Prawo+Dół', color: '#8b5cf6', enabled: true },
			{ id: 'top-bottom', label: 'Góra+Dół', color: '#d946ef', enabled: true },
			{ id: 'left-right-top', label: 'L+P+G', color: '#f97316', enabled: true },
			{ id: 'left-right-bottom', label: 'L+P+D', color: '#14b8a6', enabled: true },
			{ id: 'left-top-bottom', label: 'L+G+D', color: '#a3e635', enabled: true },
			{ id: 'right-top-bottom', label: 'P+G+D', color: '#fb7185', enabled: true },
			{ id: 'all', label: 'Wszystkie', color: '#fbbf24', enabled: true }
		];

		wheelSettingOptions = defaultOptions;
	}

	function handleWheelSelection(event) {
		const selection = event.detail;
		console.log('Selected option:', selection); // Debug logging

		// Reset current config first
		config.useSpiral = false;
		config.revealDirections = [];

		// Apply the selected option based on id
		switch (selection.id) {
			case 'spiral':
				config.useSpiral = true;
				break;
			case 'left':
				config.revealDirections = ['left'];
				break;
			case 'right':
				config.revealDirections = ['right'];
				break;
			case 'top':
				config.revealDirections = ['top'];
				break;
			case 'bottom':
				config.revealDirections = ['bottom'];
				break;
			case 'left-right':
				config.revealDirections = ['left', 'right'];
				break;
			case 'left-top':
				config.revealDirections = ['left', 'top'];
				break;
			case 'left-bottom':
				config.revealDirections = ['left', 'bottom'];
				break;
			case 'right-top':
				config.revealDirections = ['right', 'top'];
				break;
			case 'right-bottom':
				config.revealDirections = ['right', 'bottom'];
				break;
			case 'top-bottom':
				config.revealDirections = ['top', 'bottom'];
				break;
			case 'left-right-top':
				config.revealDirections = ['left', 'right', 'top'];
				break;
			case 'left-right-bottom':
				config.revealDirections = ['left', 'right', 'bottom'];
				break;
			case 'left-top-bottom':
				config.revealDirections = ['left', 'top', 'bottom'];
				break;
			case 'right-top-bottom':
				config.revealDirections = ['right', 'top', 'bottom'];
				break;
			case 'all':
				config.revealDirections = ['left', 'right', 'top', 'bottom'];
				break;
			case 'random':
			default:
				// For random, we leave both properties empty
				break;
		}

		// For debugging
		console.log('Applied config:', {
			useSpiral: config.useSpiral,
			revealDirections: [...config.revealDirections]
		});

		// Apply the changes
		applyConfig();
		showFortuneWheel = false;
	}

	function openFortuneWheel() {
		showFortuneWheel = true;
	}

	function toggleDirection(direction) {
		if (config.useSpiral) return;

		const index = config.revealDirections.indexOf(direction);
		if (index === -1) {
			// Add direction
			config.revealDirections = [...config.revealDirections, direction];
		} else {
			// Remove direction
			config.revealDirections = config.revealDirections.filter((d) => d !== direction);
		}
	}

	function toggleSpiral() {
		config.useSpiral = !config.useSpiral;

		// If enabling spiral, clear other directions
		if (config.useSpiral) {
			config.revealDirections = [];
		}
	}

	function toggleSpiralDirection() {
		config.spiralOutward = !config.spiralOutward;
	}

	// Configuration options with defaults
	let config = { ...DEFAULT_CONFIG };

	function saveConfigToLocalStorage() {
		if (browser) {
			try {
				localStorage.setItem('rozbitaScreenowkaConfig', JSON.stringify(config));
			} catch (error) {
				console.error('Failed to save config to localStorage:', error);
			}
		}
	}

	function loadConfigFromLocalStorage() {
		if (browser) {
			try {
				const savedConfig = localStorage.getItem('rozbitaScreenowkaConfig');
				if (savedConfig) {
					config = { ...config, ...JSON.parse(savedConfig) };
				}
			} catch (error) {
				console.error('Failed to load config from localStorage:', error);
			}
		}
	}

	function resetConfig() {
		config = { ...DEFAULT_CONFIG };
		saveConfigToLocalStorage();
		generateMasks(); // Regenerate masks with default settings
	}

	// Generate random points for polygon masks
	function generateMasks() {
		polygonMasks = [];

		// Determine how many polygons to generate
		let partsToGenerate = config.numParts;

		if (config.randomPolygons) {
			// Generate a random number between min and max
			partsToGenerate = Math.floor(config.minParts + Math.random() * (config.maxParts - config.minParts + 1));
			console.log(`Gene	rating ${partsToGenerate} random polygons`);
		}

		for (let i = 0; i < partsToGenerate; i++) {
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
			loadConfigFromLocalStorage();
			loadWheelOptionsFromLocalStorage();
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
			roundStarted = true;
		}
	}

	function handleGameClick(event) {
		// Don't trigger if clicking on config panel or button
		if (event.target.closest('.config-panel') || event.target.closest('.config-button')) {
			return;
		}
		console.log('before play pause', isImagePlaying);
		togglePlayPause();
		roundStarted = true;
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
		// Validate config values
		if (config.randomPolygons) {
			// Ensure min is at least 20
			config.minParts = Math.max(20, config.minParts);

			// Ensure max is at least min + 10 and at most 150
			config.maxParts = Math.min(150, Math.max(config.minParts + 10, config.maxParts));
		}

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

		// Save configuration to localStorage
		saveConfigToLocalStorage();

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

			// Save current points when pausing
			savePointsValue();
		} else {
			if (isImagePaused) {
				// Check if we're in batch reveal mode and need to continue to the next batch
				if (config.revealInBatches) {
					console.log('Continuing to next batch');
					// Continue with the next batch
					continueNextBatch();
				} else {
					// Resume normal animation that was paused
					isImagePlaying = true;
					isImagePaused = false;
					isPointsEnlarged = false;
				}
			} else {
				// Start new animation if it's the first time
				splitImage();
				if (initial) {
					initial.textContent = '';
				}
				// Always start with 100 points regardless of mode
				pointsValue = 100;

				// Save initial points value
				savePointsValue();

				isPointsEnlarged = false;
			}
		}
	}

	// Store batch information for consistent batch sizes
	let batchSizes = [];
	let currentBatchIndex = 0;
	// Store image parts for batch reveal
	let storedImageParts = [];

	// Function to continue to the next batch in batch reveal mode
	function continueNextBatch() {
		console.log('continueNextBatch called');
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

	// Function to continue revealing the next batch
	function continueBatchReveal() {
		console.log('continueBatchReveal called');
		if (!gameContainer || !isImageLoaded) {
			console.log('gameContainer or image not loaded');
			return;
		}

		isImagePlaying = true;

		// Get the current batch of pieces to reveal
		console.log('batchSizes:', batchSizes);
		console.log('currentBatchIndex:', currentBatchIndex);
		console.log('storedImageParts.length:', storedImageParts.length);

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
		for (let i = startIndex; i < endIndex && i < storedImageParts.length; i++) {
			const part = storedImageParts[i];
			gameContainer.appendChild(part);

			// Apply a random delay if enabled
			const revealDelay = config.randomDelay ? config.minRandomDelay + Math.random() * (config.maxRandomDelay - config.minRandomDelay) : 10;

			setTimeout(() => {
				if (part && part.parentNode) {
					// Check if part is still in DOM
					part.style.opacity = '1';
				}
			}, revealDelay);
		}

		// Check if this was the last batch
		if (currentBatchIndex >= config.numberOfBatches - 1 || endIndex >= storedImageParts.length) {
			// All parts revealed, set final state
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

	function splitImage(continueFromPrevious = false) {
		if (!gameContainer || !image || !image.complete) return;

		// Reset batch information if starting fresh
		if (!continueFromPrevious) {
			currentBatchIndex = 0;
			batchSizes = [];
		}

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

			// Calculate polygon areas and filter out tiny ones
			const validPolygons = [];
			const minArea = 400; // Minimum area in square pixels (e.g., 20x20)

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

			// Replace original polygons with filtered ones
			const filteredPolygons = validPolygons.length > 0 ? validPolygons : polygons;

			// Log how many small polygons were filtered
			if (validPolygons.length < polygons.length) {
				console.log(`Filtered out ${polygons.length - validPolygons.length} small polygons`);
			}

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
			filteredPolygons.forEach((polygon) => {
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

			// Helper function to get center of a polygon piece
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

			// Center of the screen
			const centerScreenX = screenWidth / 2;
			const centerScreenY = screenHeight / 2;

			// Sort parts based on reveal settings
			if (config.useSpiral) {
				// Sort from center outward
				const centerX = screenWidth / 2;
				const centerY = screenHeight / 2;

				imageParts.sort((a, b) => {
					const centerA = getCenter(a);
					const centerB = getCenter(b);

					const distA = Math.sqrt(Math.pow(centerA[0] - centerX, 2) + Math.pow(centerA[1] - centerY, 2));
					const distB = Math.sqrt(Math.pow(centerB[0] - centerX, 2) + Math.pow(centerB[1] - centerY, 2));

					return distA - distB; // Center to outside
				});
			} else if (config.revealDirections.length > 0) {
				// Calculate scores for each piece based on selected directions
				const partsWithScores = imageParts.map((part) => {
					const center = getCenter(part);

					// Calculate a score for each direction (higher = further from center in that direction)
					const scores = {
						left: centerScreenX - center[0], // Higher when further left
						right: center[0] - centerScreenX, // Higher when further right
						top: centerScreenY - center[1], // Higher when further up
						bottom: center[1] - centerScreenY // Higher when further down
					};

					// Normalize scores based on screen dimensions (0-1 scale)
					const normalizedScores = {
						left: scores.left / centerScreenX,
						right: scores.right / centerScreenX,
						top: scores.top / centerScreenY,
						bottom: scores.bottom / centerScreenY
					};

					// For each piece, find its best score among the selected directions
					let bestScore = -Infinity;
					let bestDirection = null;

					config.revealDirections.forEach((direction) => {
						if (normalizedScores[direction] > bestScore) {
							bestScore = normalizedScores[direction];
							bestDirection = direction;
						}
					});

					// If all scores are negative, this piece is not ideal for any of the selected directions
					// In that case, use the direction with the least negative score
					if (bestScore < 0 && bestDirection) {
						bestScore = -100; // A very low score
					}

					return {
						part,
						score: bestScore,
						direction: bestDirection
					};
				});

				// Sort parts by their best score (highest first)
				partsWithScores.sort((a, b) => b.score - a.score);

				// Extract just the parts in the sorted order
				imageParts.length = 0; // Clear array
				partsWithScores.forEach((item) => {
					imageParts.push(item.part);
				});
			} else {
				// Default: Random order (shuffle)
				imageParts.sort(() => Math.random() - 0.5);
			}

			// Initialize counters and state
			const totalParts = imageParts.length;

			// Store image parts for batch reveal
			storedImageParts = [...imageParts];

			// For batch reveals, calculate the batch sizes
			if (config.revealInBatches) {
				console.log('Batch reveal mode enabled');
				// If we're not continuing from a previous batch, calculate the batch sizes
				if (!continueFromPrevious) {
					console.log('Calculating batch sizes for', totalParts, 'parts and', config.numberOfBatches, 'batches');
					// Calculate batch sizes - divide total parts into equal batches
					const baseBatchSize = Math.floor(totalParts / config.numberOfBatches);
					const remainder = totalParts % config.numberOfBatches;

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
			let counter = 0;

			// Clear any existing interval
			if (partInterval) {
				clearInterval(partInterval);
				partInterval = null;
			}

			// Reset points value
			if (!config.revealInBatches) {
				pointsValue = 100;
			}

			// If using randomOnce mode, determine the animation speed now
			let animationSpeedToUse = config.animationSpeed;
			if (config.speedMode === 'randomOnce') {
				animationSpeedToUse = Math.floor(config.minRandomSpeed + Math.random() * (config.maxRandomSpeed - config.minRandomSpeed));
				console.log('Using random speed (once):', animationSpeedToUse);
			}

			// Start the animation
			const animationFunc = function () {
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
						// In batch mode, reveal multiple pieces at once
						if (config.revealInBatches) {
							// Calculate how many pieces to reveal in this iteration
							const currentBatch = Math.floor(counter / batchSize);
							const nextBatchStart = (currentBatch + 1) * batchSize;
							const piecesToReveal = Math.min(nextBatchStart - counter, imageParts.length - counter);

							// Reveal all pieces in this batch
							for (let i = 0; i < piecesToReveal; i++) {
								if (counter + i < imageParts.length) {
									const part = imageParts[counter + i];
									gameContainer.appendChild(part);

									// Apply a random delay if enabled
									const revealDelay = config.randomDelay ? config.minRandomDelay + Math.random() * (config.maxRandomDelay - config.minRandomDelay) : 10;

									setTimeout(() => {
										if (part && part.parentNode) {
											// Check if part is still in DOM
											part.style.opacity = '1';
										}
									}, revealDelay);
								}
							}

							// Update counter
							counter += piecesToReveal;

							// Calculate and update points value
							const newBatchCounter = Math.floor(counter / batchSize);
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
							const part = imageParts[counter];
							gameContainer.appendChild(part);

							// Apply a random delay if enabled
							const revealDelay = config.randomDelay ? config.minRandomDelay + Math.random() * (config.maxRandomDelay - config.minRandomDelay) : 10;

							setTimeout(() => {
								if (part && part.parentNode) {
									// Check if part is still in DOM
									part.style.opacity = '1';
								}
							}, revealDelay);

							counter++;

							// Original gradual reveal scoring (100 to 0)
							pointsValue = Math.ceil((1 - counter / totalParts) * 100);
						}

						// If using randomEach mode, update the interval timing
						if (config.speedMode === 'randomEach' && partInterval) {
							clearInterval(partInterval);
							const newSpeed = Math.floor(config.minRandomSpeed + Math.random() * (config.maxRandomSpeed - config.minRandomSpeed));
							partInterval = setInterval(animationFunc, newSpeed);
						}
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
					pointsValue = 0; // Final score is 0 in both modes
				}
			};

			// Start the interval with appropriate speed
			partInterval = setInterval(animationFunc, config.speedMode === 'randomOnce' ? animationSpeedToUse : config.animationSpeed);
		}, 500);
	}

	function revealAllTiles() {
		if (!gameContainer || !isImageLoaded || !image || !image.complete) return;

		// Stop any ongoing animation
		if (partInterval) {
			clearInterval(partInterval);
			partInterval = null;
		}

		// Clear existing parts first
		const existingParts = gameContainer.querySelectorAll('.image-part');
		existingParts.forEach((part) => {
			if (part && part.parentNode) {
				part.parentNode.removeChild(part);
			}
		});

		// Create a full-size image container that shows the entire image
		const fullImageDiv = document.createElement('div');
		fullImageDiv.className = 'image-part full-reveal';
		fullImageDiv.style.position = 'absolute';
		fullImageDiv.style.top = '0';
		fullImageDiv.style.left = '0';
		fullImageDiv.style.width = '100%';
		fullImageDiv.style.height = '100%';
		fullImageDiv.style.opacity = '1';
		fullImageDiv.style.zIndex = '100';

		// Calculate image scaling to fit screen while maintaining aspect ratio
		const screenWidth = gameContainer.clientWidth;
		const screenHeight = gameContainer.clientHeight;
		const imgWidth = image.width;
		const imgHeight = image.height;
		const ratio = Math.min(screenWidth / imgWidth, screenHeight / imgHeight);
		const centerX = (screenWidth - imgWidth * ratio) / 2;
		const centerY = (screenHeight - imgHeight * ratio) / 2;

		// Set background image to show the full image
		fullImageDiv.style.backgroundImage = `url(${image.src})`;
		fullImageDiv.style.backgroundSize = 'contain';
		fullImageDiv.style.backgroundPosition = 'center';
		fullImageDiv.style.backgroundRepeat = 'no-repeat';
		fullImageDiv.style.backgroundColor = 'white';

		// Add the full image to the container
		gameContainer.appendChild(fullImageDiv);

		// Set points to 0 after revealing all
		pointsValue = 0;
		isImagePlaying = false;
		isImagePaused = false;

		// Save final points value
		savePointsValue();
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
		// Save final points value when component is destroyed
		savePointsValue();

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

	<!-- Configuration panel -->
	{#if showConfigPanel}
		<div class="config-panel absolute right-4 top-14 z-20 w-auto max-w-4xl rounded-md bg-gray-800 p-4 text-white shadow-md">
			<h3 class="mb-4 text-lg font-bold">Ustawienia</h3>

			<div class="grid grid-cols-2 gap-4">
				<!-- Left Column -->
				<div>
					<!-- Polygon settings -->
					<div class="mb-4">
						<h4 class="mb-2 border-b border-gray-700 pb-1 text-sm font-medium uppercase tracking-wider">Elementy</h4>
						<div class="mb-2 flex items-center">
							<input type="checkbox" id="random-polygons" bind:checked={config.randomPolygons} class="mr-2 h-4 w-4 rounded border-gray-300 bg-gray-700" />
							<label for="random-polygons">Losowa liczba elementów</label>
						</div>

						{#if !config.randomPolygons}
							<div class="mb-2 flex items-center justify-between">
								<label for="num-parts" class="block">Ilość elementów</label>
								<span class="text-sm text-gray-300">{config.numParts}</span>
							</div>
							<input id="num-parts" type="range" min="20" max="150" bind:value={config.numParts} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
						{:else}
							<div class="mb-1 flex items-center justify-between">
								<!-- svelte-ignore a11y_label_has_associated_control -->
								<label class="block">Zakres elementów</label>
								<span class="text-sm text-gray-300">{config.minParts}-{config.maxParts}</span>
							</div>
							<div class="mb-1 flex items-center gap-2">
								<span class="w-8 text-xs">{config.minParts}</span>
								<input type="range" min="20" max={config.maxParts - 10} bind:value={config.minParts} class="h-2 flex-1 appearance-none rounded-md bg-gray-700" />
							</div>
							<div class="flex items-center gap-2">
								<span class="w-8 text-xs">{config.maxParts}</span>
								<input type="range" min={config.minParts + 10} max="150" bind:value={config.maxParts} class="h-2 flex-1 appearance-none rounded-md bg-gray-700" />
							</div>
						{/if}
					</div>

					<!-- Batch reveal settings -->
					<div class="mb-4">
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

					<!-- Animation speed settings (moved from right column) -->
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

							{#if config.speedMode === 'constant'}
								<div class="mb-2 flex items-center justify-between">
									<label for="animation-speed" class="block">Podstawowa szybkość</label>
									<span class="text-sm text-gray-300">{config.animationSpeed}ms</span>
								</div>
								<input id="animation-speed" type="range" min="100" max="1000" step="50" bind:value={config.animationSpeed} class="h-2 w-full appearance-none rounded-md bg-gray-700" />
							{/if}

							{#if config.speedMode !== 'constant'}
								<div class="mb-1 flex items-center justify-between">
									<!-- svelte-ignore a11y_label_has_associated_control -->
									<label class="block">Zakres losowej prędkości</label>
									<span class="text-sm text-gray-300">{config.minRandomSpeed}-{config.maxRandomSpeed}ms</span>
								</div>
								<div class="mb-1 flex items-center gap-2">
									<span class="w-8 text-xs">{config.minRandomSpeed}</span>
									<input type="range" min="50" max={config.maxRandomSpeed - 50} bind:value={config.minRandomSpeed} class="h-2 flex-1 appearance-none rounded-md bg-gray-700" />
								</div>
								<div class="flex items-center gap-2">
									<span class="w-8 text-xs">{config.maxRandomSpeed}</span>
									<input type="range" min={config.minRandomSpeed + 50} max="1000" bind:value={config.maxRandomSpeed} class="h-2 flex-1 appearance-none rounded-md bg-gray-700" />
								</div>
							{/if}
						{/if}
					</div>
				</div>

				<!-- Right Column -->
				<div>
					<!-- Visual Direction Selector -->
					<div class="mb-4">
						<h4 class="mb-2 border-b border-gray-700 pb-1 text-sm font-medium uppercase tracking-wider">Kierunek odkrywania</h4>

						<div class="mb-2 grid grid-cols-3 gap-1 rounded-md bg-gray-700/50 p-1" style="height: 120px;">
							<!-- Top Left -->
							<div class="corner-cell"></div>
							<!-- Top -->
							<div class="edge-cell flex items-center justify-center">
								<!-- svelte-ignore a11y_consider_explicit_label -->
								<button class="direction-button {config.revealDirections.includes('top') ? 'active' : ''}" on:click={() => toggleDirection('top')} disabled={config.useSpiral}>
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="18 15 12 9 6 15"></polyline>
									</svg>
								</button>
							</div>
							<!-- Top Right -->
							<div class="corner-cell"></div>

							<!-- Left -->
							<div class="edge-cell flex items-center justify-center">
								<!-- svelte-ignore a11y_consider_explicit_label -->
								<button class="direction-button {config.revealDirections.includes('left') ? 'active' : ''}" on:click={() => toggleDirection('left')} disabled={config.useSpiral}>
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="15 18 9 12 15 6"></polyline>
									</svg>
								</button>
							</div>

							<!-- Center -->
							<div class="center-cell flex items-center justify-center">
								<button class="spiral-button {config.useSpiral ? 'active' : ''}" on:click={toggleSpiral} title="Od środka na zewnątrz">
									<Spirals size={24} />
								</button>
							</div>

							<!-- Right -->
							<div class="edge-cell flex items-center justify-center">
								<!-- svelte-ignore a11y_consider_explicit_label -->
								<button class="direction-button {config.revealDirections.includes('right') ? 'active' : ''}" on:click={() => toggleDirection('right')} disabled={config.useSpiral}>
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="9 18 15 12 9 6"></polyline>
									</svg>
								</button>
							</div>

							<!-- Bottom Left -->
							<div class="corner-cell"></div>
							<!-- Bottom -->
							<div class="edge-cell flex items-center justify-center">
								<!-- svelte-ignore a11y_consider_explicit_label -->
								<button class="direction-button {config.revealDirections.includes('bottom') ? 'active' : ''}" on:click={() => toggleDirection('bottom')} disabled={config.useSpiral}>
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="6 9 12 15 18 9"></polyline>
									</svg>
								</button>
							</div>
							<!-- Bottom Right -->
							<div class="corner-cell"></div>
						</div>

						<div class="mt-1 text-xs text-gray-400">
							{#if config.useSpiral}
								Aktywny tryb spiralny (od środka)
							{:else if config.revealDirections.length === 0}
								Aktywny tryb losowy
							{:else}
								Aktywne kierunki: {config.revealDirections
									.map((d) => {
										if (d === 'left') return 'Lewy';
										if (d === 'right') return 'Prawy';
										if (d === 'top') return 'Góra';
										if (d === 'bottom') return 'Dół';
										return '';
									})
									.join(', ')}
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Wheel of Fortune buttons -->
			<div class="mb-4 grid grid-cols-2 gap-4">
				<button on:click={openFortuneWheel} class="flex items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-white hover:bg-purple-700">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"></circle>
						<path d="M12 2v4"></path>
						<path d="M12 18v4"></path>
						<path d="M4.93 4.93l2.83 2.83"></path>
						<path d="M16.24 16.24l2.83 2.83"></path>
						<path d="M2 12h4"></path>
						<path d="M18 12h4"></path>
						<path d="M4.93 19.07l2.83-2.83"></path>
						<path d="M16.24 7.76l2.83-2.83"></path>
					</svg>
					Koło Fortuny
				</button>
				<button on:click={openWheelSettings} class="flex items-center justify-center gap-2 rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 20h9"></path>
						<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
					</svg>
					Konfiguruj koło
				</button>
			</div>

			<!-- Bottom Action Buttons -->
			<div class="flex gap-2">
				<button on:click={applyConfig} class="flex-1 rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700"> Zastosuj </button>
				<button on:click={resetConfig} class="rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"> Reset </button>
				<button on:click={revealAllTiles} class="rounded-md bg-amber-600 px-4 py-2 text-white hover:bg-amber-700">Odkryj wszystkie</button>
			</div>
		</div>
	{/if}

	{#if !screenImage}
		<div class="flex h-full w-full items-center justify-center">
			<p class="text-xl text-gray-400">Brak obrazu dla aktualnej rundy</p>
		</div>
	{/if}
</div>

{#if showFortuneWheel}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
		<FortuneWheel options={fortuneWheelOptions} on:selection={handleWheelSelection} on:close={() => (showFortuneWheel = false)} />
	</div>
{/if}

{#if showWheelSettings}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
		<div class="wheel-settings-modal max-h-[80vh] w-[500px] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-bold text-white">Konfiguracja koła</h2>
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button class="text-gray-400 hover:text-white" on:click={cancelWheelSettings}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<p class="mb-4 text-gray-300">Wybierz opcje, które mają być dostępne na kole fortuny:</p>

			<div class="mb-6 grid grid-cols-2 gap-2">
				{#each wheelSettingOptions as option, index}
					<div class="flex items-center gap-2 rounded border border-gray-700 bg-gray-800 p-2">
						<input type="checkbox" id={`wheel-option-${option.id}`} bind:checked={option.enabled} class="h-4 w-4 rounded border-gray-300 bg-gray-700" />
						<label for={`wheel-option-${option.id}`} class="flex cursor-pointer items-center gap-2">
							<span class="h-4 w-4 rounded-full" style="background-color: {option.color}"></span>
							<span class="text-white">{option.label}</span>
						</label>
					</div>
				{/each}
			</div>

			<div class="flex justify-between">
				<button on:click={resetWheelOptions} class="rounded bg-amber-600 px-4 py-2 text-white hover:bg-amber-700"> Resetuj </button>

				<div class="flex gap-2">
					<button on:click={cancelWheelSettings} class="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600"> Anuluj </button>

					<button on:click={saveWheelSettings} class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"> Zapisz </button>
				</div>
			</div>
		</div>
	</div>
{/if}

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

	.corner-cell {
		background-color: rgba(30, 30, 30, 0.5);
		border-radius: 4px;
	}

	.edge-cell {
		background-color: rgba(40, 40, 40, 0.7);
		border-radius: 4px;
	}

	.center-cell {
		background-color: rgba(50, 50, 50, 0.9);
		border-radius: 4px;
		position: relative;
	}

	.direction-button {
		width: 32px;
		height: 32px;
		border-radius: 4px;
		background-color: rgba(60, 60, 60, 0.7);
		color: #9ca3af;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.direction-button:hover:not(:disabled) {
		background-color: rgba(80, 80, 80, 0.9);
		color: white;
	}

	.direction-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.direction-button.active {
		background-color: #2563eb;
		color: white;
	}

	.spiral-button {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background-color: rgba(60, 60, 60, 0.7);
		color: #9ca3af;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.spiral-button:hover {
		background-color: rgba(80, 80, 80, 0.9);
		color: white;
	}

	.spiral-button.active {
		background-color: #2563eb;
		color: white;
	}

	.wheel-settings-modal {
		animation: fadeIn 0.2s ease-in-out;
	}

	/* Make sure to select only enabled options for the wheel */
	:global(.wheel-option-hidden) {
		display: none;
	}
</style>
