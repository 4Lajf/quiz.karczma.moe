<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { Badge } from '$lib/components/ui/badge';
	import { Monitor, Music } from 'lucide-svelte';
	import LeaderboardDisplay from '$lib/components/pyrkon/LeaderboardDisplay.svelte';

	export let data;
	$: ({ session, user, profile } = data);

	// Current song state - using local state management
	let currentSong = null;
	let showMetadata = false;
	let videoSrc = null;
	let metadataToggleTimeout = null;
	let currentTime = 0;
	let isPlaying = false;
	let videoElement;

	// Local state management - no global polling

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
		// Load local state from localStorage
		loadLocalState();
		loadPlaybackState();

		// Listen for custom events from other tabs (browser only)
		if (typeof window !== 'undefined') {
			window.addEventListener('pyrkon-song-loaded', handleSongLoaded);
			window.addEventListener('pyrkon-metadata-toggled', handleMetadataToggled);

			// Listen for localStorage changes from other tabs
			window.addEventListener('storage', handleStorageChange);

			// Poll for state changes every 500ms for real-time updates
			const pollInterval = setInterval(() => {
				loadLocalState();
				loadPlaybackState();
			}, 500);

			// Store interval reference for cleanup
			window.pyrkonPollInterval = pollInterval;
		}

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
		if (typeof window !== 'undefined') {
			window.removeEventListener('pyrkon-song-loaded', handleSongLoaded);
			window.removeEventListener('pyrkon-metadata-toggled', handleMetadataToggled);
			window.removeEventListener('storage', handleStorageChange);

			// Clean up polling interval
			if (window.pyrkonPollInterval) {
				clearInterval(window.pyrkonPollInterval);
				window.pyrkonPollInterval = null;
			}
		}

		if (typeof document !== 'undefined') {
			document.removeEventListener('keydown', handleKeydown);
		}
	});

	function loadLocalState() {
		try {
			const savedState = localStorage.getItem('pyrkon_local_state');
			if (savedState) {
				const state = JSON.parse(savedState);
				const newCurrentSong = state.currentSong || null;
				const newShowMetadata = state.showMetadata || false;

				// Only update if there are actual changes to avoid unnecessary re-renders
				if (JSON.stringify(currentSong) !== JSON.stringify(newCurrentSong)) {
					currentSong = newCurrentSong;
				}

				if (showMetadata !== newShowMetadata) {
					showMetadata = newShowMetadata;
				}

				// Set video source if we have a current song
				if (currentSong && currentSong.FileName) {
					// For local files, we need to recreate the file URL
					// This might not work perfectly across tabs, but it's the best we can do
					videoSrc = null; // Will be handled by the video element's src attribute
				}
			}
		} catch (error) {
			console.error('Failed to load local state:', error);
		}
	}

	function saveLocalState() {
		try {
			const state = {
				currentSong,
				showMetadata
			};
			localStorage.setItem('pyrkon_local_state', JSON.stringify(state));
		} catch (error) {
			console.error('Failed to save local state:', error);
		}
	}

	function handleSongLoaded(event) {
		currentSong = event.detail.song;
		showMetadata = false; // Reset metadata display when new song is loaded
		saveLocalState();
	}

	function handleMetadataToggled(event) {
		showMetadata = event.detail.showMetadata;
		saveLocalState();
	}

	function handleStorageChange(event) {
		// Handle localStorage changes from other tabs
		if (event.key === 'pyrkon_local_state') {
			loadLocalState();
		} else if (event.key === 'pyrkon_playback_state') {
			loadPlaybackState();
		}
	}

	function loadPlaybackState() {
		try {
			const savedPlaybackState = localStorage.getItem('pyrkon_playback_state');
			if (savedPlaybackState) {
				const playbackState = JSON.parse(savedPlaybackState);

				// Only sync if the state is recent (within 5 seconds)
				const now = Date.now();
				if (playbackState.timestamp && (now - playbackState.timestamp) < 5000) {
					// Update video playback state
					if (playbackState.currentTime !== undefined) {
						currentTime = playbackState.currentTime;
						syncVideoTime();
					}

					if (playbackState.isPlaying !== undefined) {
						isPlaying = playbackState.isPlaying;
						syncVideoPlayState();
					}
				}
			}
		} catch (error) {
			console.error('Failed to load playback state:', error);
		}
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

	function toggleMetadata() {
		// Clear any existing timeout
		if (metadataToggleTimeout) {
			clearTimeout(metadataToggleTimeout);
		}

		// Set a 2-second delay before toggling
		metadataToggleTimeout = setTimeout(() => {
			// Toggle local metadata state only
			showMetadata = !showMetadata;
			saveLocalState();

			// Dispatch event to notify other tabs (browser only)
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('pyrkon-metadata-toggled', {
					detail: { showMetadata }
				}));
			}
		}, 2000);
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
		{#if showMetadata}
			<!-- Answer reveal with video -->
			<div class="flex flex-col items-center justify-center h-full space-y-6 max-w-full px-8 relative z-10">
				<!-- Video player with enhanced styling -->
				<div class="video-container mb-4 relative">
					<div class="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl blur-xl"></div>
					<video
						bind:this={videoElement}
						src={`/api/pyrkon/play?file=${encodeURIComponent(currentSong.FileName)}`}
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
		{:else}
			<!-- Show leaderboard when metadata is not displayed -->
			<div class="relative z-10 w-full h-full">
				<LeaderboardDisplay showAllDifficulties={true} limit={999} autoRefresh={true} />
			</div>
		{/if}
	{:else}
		<!-- Show general leaderboard when no song is loaded -->
		<div class="relative z-10 w-full h-full">
			<LeaderboardDisplay showAllDifficulties={true} limit={999} autoRefresh={true} />
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

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
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
