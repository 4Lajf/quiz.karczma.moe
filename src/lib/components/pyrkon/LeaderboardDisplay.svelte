<script>
	import { onMount, onDestroy } from 'svelte';
	import { Trophy, Medal, Award, Target, TrendingUp } from 'lucide-svelte';

	export let difficulty = null;
	export let limit = 10;
	export let autoRefresh = true;
	export let showAllDifficulties = true;

	let leaderboard = [];
	let leaderboardsByDifficulty = {};
	let loading = false;
	let refreshInterval = null;

	// Cache management
	const CACHE_KEY = 'pyrkon_leaderboard_cache';
	const CACHE_DURATION = 30000; // 30 seconds cache duration
	let lastCacheTime = 0;
	let isUsingCache = false;
	let cacheAge = 0;

	// Zoom sequence state
	let zoomSequenceInterval = null;
	let currentZoomState = 'normal'; // 'normal' or 'zoomed'
	let currentZoomedDifficulty = null;
	let zoomSequenceIndex = 0;
	const difficulties = ['easy', 'medium', 'hard', 'very hard'];
	const NORMAL_VIEW_DURATION = 5000; // 5 seconds
	const ZOOMED_VIEW_DURATION = 7000; // 7 seconds

	// Zoom state persistence
	const ZOOM_STATE_KEY = 'pyrkon_zoom_state';
	let lastZoomStateTime = 0;

	onMount(() => {
		loadAllDifficultiesWithCache();
		if (autoRefresh) {
			refreshInterval = setInterval(() => {
				loadAllDifficultiesWithCache(true); // Force refresh on interval
			}, 10000); // Refresh every 10 seconds
		}

		// Start zoom sequence only for showAllDifficulties mode
		if (showAllDifficulties) {
			restoreZoomState();
			startZoomSequence();
		}

		// Listen for cache invalidation events from other components
		const handleCacheInvalidation = () => {
			invalidateAndRefresh();
		};

		if (typeof window !== 'undefined') {
			window.addEventListener('pyrkon-leaderboard-invalidate', handleCacheInvalidation);

			// Cleanup listener on destroy
			return () => {
				window.removeEventListener('pyrkon-leaderboard-invalidate', handleCacheInvalidation);
			};
		}
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
		if (zoomSequenceInterval) {
			clearInterval(zoomSequenceInterval);
			// Save zoom state before destroying
			saveZoomState();
		}
	});

	async function loadLeaderboard() {
		loading = true;
		try {
			const params = new URLSearchParams({
				type: 'leaderboard',
				limit: limit.toString()
			});

			if (difficulty) {
				params.append('difficulty', difficulty);
			}

			const response = await fetch(`/api/pyrkon/leaderboard?${params}`);
			if (response.ok) {
				leaderboard = await response.json();
			}
		} catch (error) {
			console.error('Failed to load leaderboard:', error);
		} finally {
			loading = false;
		}
	}

	// Cache management functions
	function getCachedData() {
		try {
			const cached = localStorage.getItem(CACHE_KEY);
			if (cached) {
				const { data, timestamp } = JSON.parse(cached);
				const now = Date.now();
				if (now - timestamp < CACHE_DURATION) {
					cacheAge = Math.floor((now - timestamp) / 1000); // Age in seconds
					return data;
				}
			}
		} catch (error) {
			console.error('Failed to get cached data:', error);
		}
		return null;
	}

	function setCachedData(data) {
		try {
			const cacheEntry = {
				data,
				timestamp: Date.now()
			};
			localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
			lastCacheTime = Date.now();
		} catch (error) {
			console.error('Failed to cache data:', error);
		}
	}

	async function loadAllDifficultiesWithCache(forceRefresh = false) {
		// Try to load from cache first if not forcing refresh
		if (!forceRefresh) {
			const cachedData = getCachedData();
			if (cachedData) {
				leaderboardsByDifficulty = cachedData;
				isUsingCache = true;
				return; // Use cached data, no loading state needed
			}
		}

		// If no cache or force refresh, load from API
		isUsingCache = false;
		await loadAllDifficulties();
	}

	async function loadAllDifficulties() {
		const wasLoading = loading;
		if (!wasLoading) loading = true;

		try {
			const difficulties = ['easy', 'medium', 'hard', 'very hard'];
			const newLeaderboards = {};

			for (const diff of difficulties) {
				const params = new URLSearchParams({
					type: 'leaderboard',
					limit: limit.toString(),
					difficulty: diff
				});

				const response = await fetch(`/api/pyrkon/leaderboard?${params}`);
				if (response.ok) {
					const data = await response.json();
					newLeaderboards[diff] = data; // Always include, even if empty
				} else {
					newLeaderboards[diff] = []; // Empty array if request fails
				}
			}

			leaderboardsByDifficulty = newLeaderboards;
			// Cache the new data
			setCachedData(newLeaderboards);
		} catch (error) {
			console.error('Failed to load all difficulties leaderboard:', error);
			// Initialize with empty arrays if error occurs
			leaderboardsByDifficulty = {
				'easy': [],
				'medium': [],
				'hard': [],
				'very hard': []
			};
		} finally {
			if (!wasLoading) loading = false;
		}
	}

	function getPositionIcon(index) {
		switch (index) {
			case 0: return '🥇';
			case 1: return '🥈';
			case 2: return '🥉';
			default: return `${index + 1}.`;
		}
	}

	function getPositionClass(index) {
		switch (index) {
			case 0: return 'text-yellow-400 text-2xl font-bold';
			case 1: return 'text-gray-300 text-xl font-bold';
			case 2: return 'text-amber-600 text-xl font-bold';
			default: return 'text-cyan-400 text-lg font-semibold';
		}
	}

	function getDifficultyText(difficulty) {
		switch (difficulty?.toLowerCase()) {
			case 'easy': return 'Łatwe';
			case 'medium': return 'Średnie';
			case 'hard': return 'Trudne';
			case 'very hard': return 'Bardzo trudne';
			default: return 'Wszystkie';
		}
	}

	function getDifficultyColor(difficulty) {
		switch (difficulty?.toLowerCase()) {
			case 'easy': return 'text-green-400';
			case 'medium': return 'text-yellow-400';
			case 'hard': return 'text-orange-400';
			case 'very hard': return 'text-red-400';
			default: return 'text-purple-400';
		}
	}

	// Function to manually refresh data (useful for external calls)
	export function refreshData() {
		loadAllDifficultiesWithCache(true);
	}

	// Function to clear cache (useful for external calls)
	export function clearCache() {
		try {
			localStorage.removeItem(CACHE_KEY);
			lastCacheTime = 0;
			isUsingCache = false;
		} catch (error) {
			console.error('Failed to clear cache:', error);
		}
	}

	// Function to invalidate cache and refresh (useful when data changes are expected)
	export function invalidateAndRefresh() {
		clearCache();
		loadAllDifficultiesWithCache(true);
	}

	// Zoom state persistence functions
	function saveZoomState() {
		if (typeof window !== 'undefined') {
			try {
				const zoomState = {
					currentZoomState,
					currentZoomedDifficulty,
					zoomSequenceIndex,
					timestamp: Date.now()
				};
				localStorage.setItem(ZOOM_STATE_KEY, JSON.stringify(zoomState));
			} catch (error) {
				console.error('Failed to save zoom state:', error);
			}
		}
	}

	function restoreZoomState() {
		if (typeof window !== 'undefined') {
			try {
				const saved = localStorage.getItem(ZOOM_STATE_KEY);
				if (saved) {
					const zoomState = JSON.parse(saved);
					const now = Date.now();

					// Only restore if saved within the last 30 seconds to avoid stale state
					if (now - zoomState.timestamp < 30000) {
						currentZoomState = zoomState.currentZoomState || 'normal';
						currentZoomedDifficulty = zoomState.currentZoomedDifficulty;
						zoomSequenceIndex = zoomState.zoomSequenceIndex || 0;
						lastZoomStateTime = zoomState.timestamp;
					}
				}
			} catch (error) {
				console.error('Failed to restore zoom state:', error);
			}
		}
	}

	// Zoom sequence functions
	function startZoomSequence() {
		// Clear any existing interval
		if (zoomSequenceInterval) {
			clearInterval(zoomSequenceInterval);
		}

		// Calculate remaining time for current state if we're restoring
		let initialDelay = currentZoomState === 'normal' ? NORMAL_VIEW_DURATION : ZOOMED_VIEW_DURATION;

		if (lastZoomStateTime > 0) {
			const elapsed = Date.now() - lastZoomStateTime;
			const remainingTime = initialDelay - elapsed;

			if (remainingTime > 0) {
				// Use remaining time for first interval
				initialDelay = remainingTime;
			} else {
				// Time has already passed, advance to next step immediately
				nextZoomStep();
				initialDelay = currentZoomState === 'normal' ? NORMAL_VIEW_DURATION : ZOOMED_VIEW_DURATION;
			}
		}

		// Set up the sequence timer
		zoomSequenceInterval = setInterval(() => {
			nextZoomStep();
		}, initialDelay);
	}

	function nextZoomStep() {
		if (currentZoomState === 'normal') {
			// Switch to zoomed view
			currentZoomState = 'zoomed';
			currentZoomedDifficulty = difficulties[zoomSequenceIndex];
		} else {
			// Switch back to normal view and advance to next difficulty
			currentZoomState = 'normal';
			zoomSequenceIndex = (zoomSequenceIndex + 1) % difficulties.length;
			currentZoomedDifficulty = null;
		}

		// Save state after each step
		saveZoomState();

		// Reset the timer with the appropriate duration
		if (zoomSequenceInterval) {
			clearInterval(zoomSequenceInterval);
			zoomSequenceInterval = setInterval(() => {
				nextZoomStep();
			}, currentZoomState === 'normal' ? NORMAL_VIEW_DURATION : ZOOMED_VIEW_DURATION);
		}
	}

	// Reactive statement to reload when difficulty changes
	$: if (difficulty !== null && !showAllDifficulties) {
		loadLeaderboard();
	}
</script>

<div class="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
	<!-- Leaderboard -->
	<div class="w-full max-w-7xl h-full relative">
		<!-- All difficulties grid - 4 quarters with fixed heights -->
		<div class="grid grid-cols-2 gap-6 h-full {currentZoomState === 'zoomed' ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}">
				{#each ['easy', 'medium', 'hard', 'very hard'] as difficultyKey}
					{@const players = leaderboardsByDifficulty[difficultyKey] || []}
					<!-- Fixed height container for each difficulty table -->
					<div class="h-[calc(50vh-1.5rem)] bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col">
						<!-- Difficulty header - smaller to fit more results -->
						<div class="bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-2 border-b border-gray-700 flex-shrink-0">
							<h3 class="text-xl font-bold text-center {getDifficultyColor(difficultyKey)}">
								{getDifficultyText(difficultyKey)}
							</h3>
						</div>

						<!-- Full leaderboard table with flex-1 to fill remaining space -->
						<div class="p-2 flex-1 overflow-hidden flex flex-col">
							{#if players.length === 0}
								<div class="text-center py-8 text-gray-400 flex-1 flex flex-col justify-center">
									<div class="text-4xl mb-4">🏆</div>
									<p class="text-lg">Brak graczy</p>
									<p class="text-sm mt-2">Zagraj kilka piosenek!</p>
								</div>
							{:else}
								<!-- Table container that fills available space and cuts off overflow -->
								<div class="flex-1 overflow-hidden">
									<table class="w-full h-full">
										<thead>
											<tr class="border-b border-gray-700 text-left bg-gray-900">
												<th class="pb-3 text-lg font-semibold text-cyan-200">#</th>
												<th class="pb-3 text-lg font-semibold text-cyan-200">Gracz</th>
												<th class="pb-3 text-right text-lg font-semibold text-cyan-200">Punkty</th>
												<th class="pb-3 text-right text-lg font-semibold text-cyan-200">Celność</th>
												<th class="pb-3 text-right text-lg font-semibold text-cyan-200">Poprawne</th>
											</tr>
										</thead>
										<tbody>
											{#each players.slice(0, 15) as player, index}
												<tr class="border-b border-gray-800/30 hover:bg-gray-800/20">
													<td class="py-1">
														<span class={index === 0 ? 'text-xl font-bold text-yellow-400' : index === 1 ? 'text-lg font-bold text-gray-300' : index === 2 ? 'text-lg font-bold text-amber-600' : 'text-lg font-semibold text-cyan-400'}>
															{getPositionIcon(index)}
														</span>
													</td>
													<td class="py-1 text-lg text-white font-medium">{player.username}</td>
													<td class="py-1 text-right text-lg font-bold text-cyan-300">{player.total_points}</td>
													<td class="py-1 text-right text-lg text-gray-300">{player.accuracy_percentage}%</td>
													<td class="py-1 text-right text-lg text-gray-300">{player.total_correct}/{player.total_guesses}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					</div>
				{/each}
		</div>

		<!-- Zoomed view - single difficulty fullscreen -->
		{#if currentZoomState === 'zoomed' && currentZoomedDifficulty}
			{@const players = leaderboardsByDifficulty[currentZoomedDifficulty] || []}
			<div class="absolute inset-0 {currentZoomState === 'zoomed' ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}">
				<div class="w-full h-full bg-gray-900/90 backdrop-blur-sm rounded-2xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col">
					<!-- Difficulty header - smaller to fit more results -->
					<div class="bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-2 border-b border-gray-700 flex-shrink-0">
						<h3 class="text-2xl font-bold text-center {getDifficultyColor(currentZoomedDifficulty)}">
							{getDifficultyText(currentZoomedDifficulty)}
						</h3>
					</div>

					<!-- Full leaderboard table with flex-1 to fill remaining space -->
					<div class="p-2 flex-1 overflow-hidden flex flex-col">
						{#if players.length === 0}
							<div class="text-center py-8 text-gray-400 flex-1 flex flex-col justify-center">
								<div class="text-6xl mb-4">🏆</div>
								<p class="text-3xl">Brak graczy</p>
								<p class="text-xl mt-2">Zagraj kilka piosenek!</p>
							</div>
						{:else}
							<!-- Table container that fills available space and shows more entries -->
							<div class="flex-1 overflow-hidden">
								<table class="w-full h-full">
									<thead>
										<tr class="border-b border-gray-700 text-left bg-gray-900">
											<th class="pb-2 text-xl font-semibold text-cyan-200">#</th>
											<th class="pb-2 text-xl font-semibold text-cyan-200">Gracz</th>
											<th class="pb-2 text-right text-xl font-semibold text-cyan-200">Punkty</th>
											<th class="pb-2 text-right text-xl font-semibold text-cyan-200">Celność</th>
											<th class="pb-2 text-right text-xl font-semibold text-cyan-200">Poprawne</th>
										</tr>
									</thead>
									<tbody>
										{#each players as player, index}
											<tr class="border-b border-gray-800/30 hover:bg-gray-800/20">
												<td class="py-0.5">
													<span class={index === 0 ? 'text-2xl font-bold text-yellow-400' : index === 1 ? 'text-xl font-bold text-gray-300' : index === 2 ? 'text-xl font-bold text-amber-600' : 'text-lg font-semibold text-cyan-400'}>
														{getPositionIcon(index)}
													</span>
												</td>
												<td class="py-0.5 text-lg text-white font-medium">{player.username}</td>
												<td class="py-0.5 text-right text-lg font-bold text-cyan-300">{player.total_points}</td>
												<td class="py-0.5 text-right text-lg text-gray-300">{player.accuracy_percentage}%</td>
												<td class="py-0.5 text-right text-lg text-gray-300">{player.total_correct}/{player.total_guesses}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
