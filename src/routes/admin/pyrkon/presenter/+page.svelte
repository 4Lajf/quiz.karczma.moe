<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { Badge } from '$lib/components/ui/badge';
	import { Monitor, Music } from 'lucide-svelte';

	export let data;
	$: ({ session, user, profile } = data);

	// Current song state
	let currentSong = null;
	let showMetadata = false;
	let showVideoPlaceholder = true;
	let guessingPhase = true;
	let videoSrc = null;
	let currentTime = 0;
	let isPlaying = false;
	let videoElement;

	// WebSocket or polling for real-time updates
	let eventSource = null;

	// Difficulty mapping
	function getDifficultyInPolish(englishDifficulty) {
		const difficultyMap = {
			'easy': 'Łatwa',
			'medium': 'Średnia',
			'hard': 'Trudna',
			'very hard': 'Bardzo trudna'
		};
		return difficultyMap[englishDifficulty?.toLowerCase()] || englishDifficulty;
	}

	// Season/Year translation
	function translateVintage(vintage) {
		if (!vintage) return vintage;

		const seasonMap = {
			'spring': 'Wiosna',
			'summer': 'Lato',
			'fall': 'Jesień',
			'autumn': 'Jesień',
			'winter': 'Zima'
		};

		// Handle formats like "Summer 2023", "Fall 2022", etc.
		return vintage.replace(/\b(spring|summer|fall|autumn|winter)\b/gi, (match) => {
			return seasonMap[match.toLowerCase()] || match;
		});
	}

	onMount(() => {
		// Set up real-time connection to get updates from admin panel
		// For now, we'll use polling - in production you might want WebSocket
		startPolling();

		// Listen for keyboard shortcuts
		if (typeof document !== 'undefined') {
			document.addEventListener('keydown', handleKeydown);

			// Make fullscreen on load
			if (document.documentElement.requestFullscreen) {
				document.documentElement.requestFullscreen().catch(console.error);
			}
		}
	});

	onDestroy(() => {
		if (eventSource) {
			clearInterval(eventSource);
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('keydown', handleKeydown);
		}
	});

	function startPolling() {
		// Poll for current song state every 1 second for better sync
		eventSource = setInterval(async () => {
			try {
				const response = await fetch('/api/pyrkon/presenter-state');
				if (response.ok) {
					const state = await response.json();
					currentSong = state.currentSong;
					showMetadata = state.showMetadata;
					showVideoPlaceholder = state.showVideoPlaceholder;
					guessingPhase = state.guessingPhase;
					videoSrc = state.videoSrc;

					// Sync video playback time
					if (state.currentTime !== undefined) {
						currentTime = state.currentTime;
						syncVideoTime();
					}

					// Sync playing state
					if (state.isPlaying !== undefined) {
						isPlaying = state.isPlaying;
						syncVideoPlayState();
					}
				}
			} catch (error) {
				console.error('Failed to fetch presenter state:', error);
			}
		}, 1000); // Reduced to 1 second for better sync
	}

	function syncVideoTime() {
		if (videoElement && !isNaN(currentTime)) {
			// Only sync if the difference is significant (more than 2 seconds)
			const timeDiff = Math.abs(videoElement.currentTime - currentTime);
			if (timeDiff > 2) {
				videoElement.currentTime = currentTime;
			}
		}
	}

	function syncVideoPlayState() {
		if (videoElement) {
			if (isPlaying && videoElement.paused) {
				videoElement.play().catch(console.error);
			} else if (!isPlaying && !videoElement.paused) {
				videoElement.pause();
			}
		}
	}

	function handleKeydown(event) {
		// Keyboard shortcuts for presenter
		switch (event.key) {
			case 'Escape':
				if (typeof document !== 'undefined' && document.exitFullscreen) {
					document.exitFullscreen();
				}
				break;
			case ' ': // Spacebar to toggle metadata
				event.preventDefault();
				toggleMetadata();
				break;
			case 'f': // F for fullscreen
			case 'F':
				if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
					document.documentElement.requestFullscreen();
				}
				break;
		}
	}

	async function toggleMetadata() {
		try {
			await fetch('/api/pyrkon/presenter-toggle', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'toggleMetadata' })
			});
		} catch (error) {
			console.error('Failed to toggle metadata:', error);
		}
	}


</script>

<svelte:head>
	<title>Pyrkon Presenter - Quiz Karczma</title>
	<style>
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
	</style>
</svelte:head>

<!-- Full-screen presenter display -->
<div class="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
	<!-- Animated background elements -->
	<div class="absolute inset-0 opacity-10">
		<div class="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse"></div>
		<div class="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500 rounded-full blur-3xl animate-pulse" style="animation-delay: 1s;"></div>
		<div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500 rounded-full blur-3xl animate-pulse" style="animation-delay: 2s;"></div>
	</div>

	{#if currentSong}
		{#if showVideoPlaceholder && !showMetadata}
			<!-- Guessing phase placeholder -->
			<div class="text-center text-white relative z-10 flex flex-col items-center justify-center min-h-[80vh]">
				<div class="relative mb-8">
					<div class="text-9xl mb-4 animate-bounce">🎵</div>
					<div class="absolute inset-0 text-9xl mb-4 animate-pulse opacity-50 text-purple-400">🎵</div>
				</div>
				<div class="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 shadow-2xl max-w-4xl">
					<h2 class="text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent leading-tight">
						Odgadnij anime!
					</h2>
					<div class="flex items-center justify-center space-x-2 text-gray-400">
						<div class="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
						<div class="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style="animation-delay: 0.5s;"></div>
						<div class="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style="animation-delay: 1s;"></div>
					</div>
				</div>
			</div>
		{:else if showMetadata}
			<!-- Answer reveal with video -->
			<div class="flex flex-col items-center justify-center h-full space-y-6 max-w-full px-8 relative z-10">
				<!-- Video player with enhanced styling -->
				<div class="video-container mb-4 relative">
					<div class="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl blur-xl"></div>
					<video
						bind:this={videoElement}
						src={videoSrc || `/api/pyrkon/play?file=${encodeURIComponent(currentSong.FileName)}`}
						autoplay
						loop
						muted
						class="relative max-w-6xl max-h-[60vh] rounded-2xl shadow-2xl border-2 border-gray-700"
						on:loadedmetadata={syncVideoTime}
						on:seeked={syncVideoTime}
					>
						<track kind="captions" />
					</video>
				</div>

				<!-- Enhanced metadata display - more horizontal layout -->
				<div class="text-center text-white bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-700 shadow-2xl w-full max-w-6xl">
					<div class="space-y-4 mb-6">
						<h2 class="text-5xl font-bold text-green-400 drop-shadow-lg">{currentSong.JPName}</h2>
						<p class="text-3xl text-gray-300 font-light">{currentSong.ENName}</p>
					</div>

					<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
						<div class="bg-blue-900/30 rounded-xl p-4 border border-blue-700/50">
							<div class="flex items-center space-x-3">
								<div class="text-2xl">🎵</div>
								<div>
									<p class="text-xs text-blue-300 uppercase tracking-wide">Piosenka</p>
									<p class="text-lg font-semibold text-white">{currentSong.SongName}</p>
								</div>
							</div>
						</div>

						<div class="bg-purple-900/30 rounded-xl p-4 border border-purple-700/50">
							<div class="flex items-center space-x-3">
								<div class="text-2xl">🎤</div>
								<div>
									<p class="text-xs text-purple-300 uppercase tracking-wide">Wykonawca</p>
									<p class="text-lg font-semibold text-white">{currentSong.Artist}</p>
								</div>
							</div>
						</div>

						{#if currentSong.Vintage}
							<div class="bg-gray-800/50 rounded-xl p-4 border border-gray-600/50">
								<div class="flex items-center space-x-3">
									<div class="text-2xl">📅</div>
									<div>
										<p class="text-xs text-gray-400 uppercase tracking-wide">Rok</p>
										<p class="text-lg font-semibold text-white">{translateVintage(currentSong.Vintage)}</p>
									</div>
								</div>
							</div>
						{/if}

						<div class="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl p-4 border border-purple-700/50 {currentSong.Vintage ? '' : 'col-span-2'}">
							<div class="flex items-center space-x-3">
								<div class="text-2xl">⭐</div>
								<div>
									<p class="text-xs text-purple-300 uppercase tracking-wide">Trudność</p>
									<p class="text-lg font-semibold text-white">{getDifficultyInPolish(currentSong.difficulty)}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{:else}
		<!-- Enhanced no song loaded state -->
		<div class="text-center text-gray-400 relative z-10 flex flex-col items-center justify-center min-h-[80vh]">
			<div class="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-12 border border-gray-700 shadow-2xl max-w-4xl">
				<Monitor class="w-32 h-32 mx-auto mb-8 opacity-50 text-gray-500" />
				<h3 class="text-5xl font-medium mb-6 text-gray-300 leading-tight">Brak załadowanej piosenki</h3>
				<p class="text-2xl text-gray-500">Wybierz piosenkę z panelu administracyjnego</p>
				<div class="flex items-center justify-center space-x-2 mt-6">
					<div class="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
					<div class="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style="animation-delay: 0.5s;"></div>
					<div class="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style="animation-delay: 1s;"></div>
				</div>
			</div>
		</div>
	{/if}


</div>

<style>
	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	@keyframes bounce {
		0%, 20%, 53%, 80%, 100% {
			transform: translate3d(0, 0, 0);
		}
		40%, 43% {
			transform: translate3d(0, -30px, 0);
		}
		70% {
			transform: translate3d(0, -15px, 0);
		}
		90% {
			transform: translate3d(0, -4px, 0);
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.animate-bounce {
		animation: bounce 2s infinite;
	}

	/* Enhanced background gradient */
	.bg-gradient-to-br {
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #374151 50%, #000000 100%);
	}

	/* Hide scrollbars */
	:global(body) {
		overflow: hidden;
	}

	/* Enhanced fullscreen styles */
	:global(:fullscreen) {
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #374151 50%, #000000 100%);
	}

	:global(:-webkit-full-screen) {
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #374151 50%, #000000 100%);
	}

	:global(:-moz-full-screen) {
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 25%, #374151 50%, #000000 100%);
	}

	/* Backdrop blur support */
	.backdrop-blur-sm {
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}


</style>
