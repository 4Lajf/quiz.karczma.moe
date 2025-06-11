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

	onMount(() => {
		loadAllDifficultiesWithCache();
		if (autoRefresh) {
			refreshInterval = setInterval(() => {
				loadAllDifficultiesWithCache(true); // Force refresh on interval
			}, 10000); // Refresh every 10 seconds
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

	// Reactive statement to reload when difficulty changes
	$: if (difficulty !== null && !showAllDifficulties) {
		loadLeaderboard();
	}
</script>

<div class="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
	<!-- Cache status indicator -->
	{#if isUsingCache}
		<div class="fixed top-4 right-4 z-50 bg-blue-600/80 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm">
			📦 Cached ({cacheAge}s ago)
		</div>
	{/if}

	<!-- Leaderboard -->
	<div class="w-full max-w-7xl h-full">
		<!-- All difficulties grid - 4 quarters with fixed heights -->
		<div class="grid grid-cols-2 gap-6 h-full">
				{#each ['easy', 'medium', 'hard', 'very hard'] as difficultyKey}
					{@const players = leaderboardsByDifficulty[difficultyKey] || []}
					<!-- Fixed height container for each difficulty table -->
					<div class="h-[calc(50vh-1.5rem)] bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col">
						<!-- Difficulty header -->
						<div class="bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-4 border-b border-gray-700 flex-shrink-0">
							<h3 class="text-3xl font-bold text-center {getDifficultyColor(difficultyKey)}">
								{getDifficultyText(difficultyKey)}
							</h3>
						</div>

						<!-- Full leaderboard table with flex-1 to fill remaining space -->
						<div class="p-4 flex-1 overflow-hidden flex flex-col">
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
												<tr class="border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors">
													<td class="py-2">
														<span class={index === 0 ? 'text-xl font-bold text-yellow-400' : index === 1 ? 'text-lg font-bold text-gray-300' : index === 2 ? 'text-lg font-bold text-amber-600' : 'text-lg font-semibold text-cyan-400'}>
															{getPositionIcon(index)}
														</span>
													</td>
													<td class="py-2 text-lg text-white font-medium">{player.username}</td>
													<td class="py-2 text-right text-lg font-bold text-cyan-300">{player.total_points}</td>
													<td class="py-2 text-right text-lg text-gray-300">{player.accuracy_percentage}%</td>
													<td class="py-2 text-right text-lg text-gray-300">{player.total_correct}/{player.total_guesses}</td>
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
	</div>
</div>
