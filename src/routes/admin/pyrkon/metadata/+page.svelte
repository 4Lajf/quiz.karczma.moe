<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { Badge } from '$lib/components/ui/badge';
	import { Monitor, Music } from 'lucide-svelte';

	export let data;
	$: ({ session, user, profile } = data);

	// Current song state - using local state management
	let currentSong = null;
	let showMetadata = false;
	let videoSrc = null;
	let currentTime = 0;
	let isPlaying = false;
	let videoElement;
	let metadataToggleTimeout = null;

	// Local state management - no global polling
	onMount(() => {
		loadLocalState();
		loadPlaybackState();

		// Listen for localStorage changes from other tabs
		window.addEventListener('storage', handleStorageChange);

		// Listen for custom events from same tab
		window.addEventListener('pyrkon-metadata-toggled', handleMetadataToggled);
		window.addEventListener('pyrkon-song-changed', handleSongChanged);
		window.addEventListener('pyrkon-playback-sync', handlePlaybackSync);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('storage', handleStorageChange);
			window.removeEventListener('pyrkon-metadata-toggled', handleMetadataToggled);
			window.removeEventListener('pyrkon-song-changed', handleSongChanged);
			window.removeEventListener('pyrkon-playback-sync', handlePlaybackSync);
		}
	});

	function loadLocalState() {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('pyrkon_local_state');
			if (saved) {
				try {
					const state = JSON.parse(saved);
					const previousMetadata = showMetadata;
					currentSong = state.currentSong;

					// Only apply delay if metadata state is changing
					if (previousMetadata !== state.showMetadata) {
						// Clear any existing timeout
						if (metadataToggleTimeout) {
							clearTimeout(metadataToggleTimeout);
						}

						// Set a 2-second delay before updating metadata display
						metadataToggleTimeout = setTimeout(() => {
							showMetadata = state.showMetadata;
						}, 2000);
					} else {
						showMetadata = state.showMetadata;
					}
				} catch (e) {
					console.error('Failed to parse local state:', e);
				}
			}
		}
	}

	function loadPlaybackState() {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('pyrkon_playback_state');
			if (saved) {
				try {
					const state = JSON.parse(saved);
					currentTime = state.currentTime || 0;
					isPlaying = state.isPlaying || false;
					
					// Sync video if element exists
					if (videoElement && currentTime > 0) {
						videoElement.currentTime = currentTime;
						if (isPlaying) {
							videoElement.play().catch(console.error);
						}
					}
				} catch (e) {
					console.error('Failed to parse playback state:', e);
				}
			}
		}
	}

	function syncVideoTime() {
		if (videoElement && typeof window !== 'undefined') {
			const saved = localStorage.getItem('pyrkon_playback_state');
			if (saved) {
				try {
					const state = JSON.parse(saved);
					if (state.currentTime && Math.abs(videoElement.currentTime - state.currentTime) > 1) {
						videoElement.currentTime = state.currentTime;
					}
					if (state.isPlaying && videoElement.paused) {
						videoElement.play().catch(console.error);
					} else if (!state.isPlaying && !videoElement.paused) {
						videoElement.pause();
					}
				} catch (e) {
					console.error('Failed to sync video time:', e);
				}
			}
		}
	}

	function handleSongChanged(event) {
		currentSong = event.detail.currentSong;
		loadPlaybackState();
	}

	function handlePlaybackSync(event) {
		const { currentTime: newTime, isPlaying: newIsPlaying } = event.detail;
		currentTime = newTime;
		isPlaying = newIsPlaying;
		
		if (videoElement) {
			if (Math.abs(videoElement.currentTime - newTime) > 1) {
				videoElement.currentTime = newTime;
			}
			if (newIsPlaying && videoElement.paused) {
				videoElement.play().catch(console.error);
			} else if (!newIsPlaying && !videoElement.paused) {
				videoElement.pause();
			}
		}
	}

	function handleMetadataToggled(event) {
		// Clear any existing timeout
		if (metadataToggleTimeout) {
			clearTimeout(metadataToggleTimeout);
		}

		// Set a 2-second delay before updating metadata display
		metadataToggleTimeout = setTimeout(() => {
			showMetadata = event.detail.showMetadata;
		}, 2000);
	}

	function handleStorageChange(event) {
		// Handle localStorage changes from other tabs
		if (event.key === 'pyrkon_local_state') {
			loadLocalState();
		} else if (event.key === 'pyrkon_playback_state') {
			loadPlaybackState();
		}
	}

	function getDifficultyInPolish(difficulty) {
		const difficultyMap = {
			'easy': 'Łatwa',
			'medium': 'Średnia', 
			'hard': 'Trudna',
			'very hard': 'Bardzo trudna'
		};
		return difficultyMap[difficulty] || difficulty;
	}

	function getTypeInPolish(type) {
		const typeMap = {
			'OP': 'Opening',
			'ED': 'Ending',
			'OST': 'Soundtrack',
			'IN': 'Insert Song'
		};
		return typeMap[type] || type;
	}
</script>

<svelte:head>
	<title>Pyrkon Metadata - Quiz Karczma</title>
	<style>
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
		}
	</style>
</svelte:head>

<!-- Full screen background -->
<div class="fixed inset-0 bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900">
	<!-- Animated background elements -->
	<div class="absolute inset-0 overflow-hidden">
		<div class="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
		<div class="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
		<div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-green-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse animation-delay-4000"></div>
	</div>

	{#if currentSong && showMetadata}
		<!-- Metadata display with video -->
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
				<!-- Anime titles header -->
				<div class="space-y-4 mb-6">
					<h2 class="text-5xl font-bold text-green-400 drop-shadow-lg">{currentSong.JPName}</h2>
					<p class="text-3xl text-gray-300 font-light">{currentSong.ENName}</p>
				</div>

				<!-- Metadata grid - more compact horizontal layout -->
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
					<div class="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 rounded-xl p-4 border border-blue-700/50">
						<div class="flex items-center space-x-3">
							<div class="text-2xl">🎵</div>
							<div>
								<p class="text-xs text-blue-300 uppercase tracking-wide">Tytuł piosenki</p>
								<p class="text-lg font-semibold text-white">{currentSong.SongTitle || currentSong.JPName}</p>
							</div>
						</div>
					</div>

					<div class="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-xl p-4 border border-green-700/50">
						<div class="flex items-center space-x-3">
							<div class="text-2xl">🎤</div>
							<div>
								<p class="text-xs text-green-300 uppercase tracking-wide">Artysta</p>
								<p class="text-lg font-semibold text-white">{currentSong.Artist}</p>
							</div>
						</div>
					</div>

					{#if currentSong.Vintage}
						<div class="bg-gradient-to-r from-amber-900/30 to-yellow-900/30 rounded-xl p-4 border border-amber-700/50">
							<div class="flex items-center space-x-3">
								<div class="text-2xl">📅</div>
								<div>
									<p class="text-xs text-amber-300 uppercase tracking-wide">Rocznik</p>
									<p class="text-lg font-semibold text-white">{currentSong.Vintage}</p>
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
		<!-- No metadata to show -->
		<div class="flex flex-col items-center justify-center h-full text-white relative z-10">
			<div class="text-center space-y-6">
				<div class="text-8xl mb-6 animate-pulse">🎌</div>
				<h2 class="text-4xl font-bold mb-4">Widok metadanych</h2>
				<p class="text-xl text-gray-300">
					{#if !currentSong}
						Brak aktualnej piosenki
					{:else if !showMetadata}
						Metadane są ukryte
					{/if}
				</p>
				<p class="text-lg text-gray-400">Zarządzaj wyświetlaniem z panelu administratora</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.animation-delay-2000 {
		animation-delay: 2s;
	}
	.animation-delay-4000 {
		animation-delay: 4s;
	}
	
	.video-container {
		position: relative;
		display: inline-block;
	}
</style>
