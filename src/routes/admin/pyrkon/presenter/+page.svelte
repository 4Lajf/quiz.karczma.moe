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

	// WebSocket or polling for real-time updates
	let eventSource = null;

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
		// Poll for current song state every 2 seconds
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
				}
			} catch (error) {
				console.error('Failed to fetch presenter state:', error);
			}
		}, 2000);
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
<div class="min-h-screen bg-black flex items-center justify-center relative">
	{#if currentSong}
		{#if showVideoPlaceholder && !showMetadata}
			<!-- Guessing phase placeholder -->
			<div class="text-center text-white">
				<div class="text-9xl mb-8 animate-pulse">🎵</div>
				<h2 class="text-5xl font-bold mb-6">Odgadnij anime!</h2>
			</div>
		{:else if showMetadata}
			<!-- Answer reveal with video -->
			<div class="flex flex-col items-center justify-center h-full space-y-6 max-w-6xl px-8">
				<!-- Video player -->
				<div class="video-container mb-6">
					<video
						src={videoSrc || `/api/pyrkon/play?file=${encodeURIComponent(currentSong.FileName)}`}
						autoplay
						loop
						muted
						class="max-w-4xl max-h-96 rounded-lg shadow-2xl"
					>
						<track kind="captions" />
					</video>
				</div>

				<!-- Metadata overlay -->
				<div class="text-center text-white space-y-4">
					<h2 class="text-5xl font-bold text-green-400 mb-2">{currentSong.JPName}</h2>
					<p class="text-3xl text-gray-300 mb-4">{currentSong.ENName}</p>

					<div class="space-y-2">
						<p class="text-2xl text-blue-400">
							🎵 <strong>{currentSong.SongName}</strong>
						</p>
						<p class="text-2xl text-purple-400">
							🎤 <strong>{currentSong.Artist}</strong>
						</p>
						{#if currentSong.Vintage}
							<p class="text-xl text-gray-400">
								📅 {currentSong.Vintage}
							</p>
						{/if}
					</div>

					<div class="mt-6">
						<Badge
							variant="outline"
							class="border-yellow-500 text-yellow-400 text-xl px-4 py-2"
						>
							Trudność: {currentSong.difficulty}
						</Badge>
					</div>
				</div>
			</div>
		{/if}
	{:else}
		<!-- No song loaded -->
		<div class="text-center text-gray-500">
			<Monitor class="w-32 h-32 mx-auto mb-8 opacity-50" />
			<h3 class="text-4xl font-medium mb-4">Brak załadowanej piosenki</h3>
			<p class="text-2xl">Wybierz piosenkę z panelu administracyjnego</p>
		</div>
	{/if}

	<!-- Control hints (only visible when not in fullscreen) -->
	<div class="absolute bottom-4 right-4 text-gray-600 text-sm">
		<div>ESC - Wyjście z pełnego ekranu</div>
		<div>SPACJA - Przełącz metadane</div>
		<div>F - Pełny ekran</div>
	</div>
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

	/* Hide scrollbars */
	:global(body) {
		overflow: hidden;
	}

	/* Fullscreen styles */
	:global(:fullscreen) {
		background: black;
	}

	:global(:-webkit-full-screen) {
		background: black;
	}

	:global(:-moz-full-screen) {
		background: black;
	}
</style>
