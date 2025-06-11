<script>
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Play, Pause, Square, Volume2, VolumeX } from 'lucide-svelte';

	export let src = '';
	export let volume = 0.7;
	export let muted = false;
	export let autoplay = false;
	export let showControls = true;
	export let showTime = true;
	export let showVideo = false; // Option to show video or just audio controls

	let videoElement;
	let isPlaying = false;
	let isPaused = false;
	let currentTime = 0;
	let duration = 0;

	const dispatch = createEventDispatcher();

	export function play() {
		if (videoElement) {
			videoElement.play();
		}
	}

	export function pause() {
		if (videoElement) {
			videoElement.pause();
		}
	}

	export function stop() {
		if (videoElement) {
			videoElement.pause();
			videoElement.currentTime = 0;
		}
	}

	export function setCurrentTime(time) {
		if (videoElement) {
			videoElement.currentTime = time;
		}
	}

	function togglePlayPause() {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	}

	function toggleMute() {
		muted = !muted;
		dispatch('muteChange', muted);
	}

	function handleVolumeChange(event) {
		volume = parseFloat(event.target.value);
		dispatch('volumeChange', volume);
	}

	function formatTime(seconds) {
		if (!isFinite(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Update video element properties when props change
	$: if (videoElement) {
		videoElement.volume = volume;
		videoElement.muted = muted;
	}

	// Dispatch events
	function handlePlay() {
		isPlaying = true;
		isPaused = false;
		dispatch('play');
	}

	function handlePause() {
		isPlaying = false;
		isPaused = true;
		dispatch('pause');
	}

	function handleEnded() {
		isPlaying = false;
		isPaused = false;
		dispatch('ended');
	}

	function handleTimeUpdate() {
		dispatch('timeUpdate', { currentTime, duration });
	}

	function handleLoadedMetadata() {
		dispatch('loadedMetadata', { duration });
	}
</script>

<div class="video-player">
	<!-- Video element (hidden if showVideo is false) -->
	<video
		bind:this={videoElement}
		{src}
		bind:currentTime
		bind:duration
		{autoplay}
		style={showVideo ? '' : 'display: none;'}
		on:play={handlePlay}
		on:pause={handlePause}
		on:ended={handleEnded}
		on:timeupdate={handleTimeUpdate}
		on:loadedmetadata={handleLoadedMetadata}
	>
		<track kind="captions" />
	</video>

	{#if showControls}
		<div class="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
			<!-- Play/Pause button -->
			<Button
				on:click={togglePlayPause}
				variant="outline"
				size="sm"
				class="border-gray-600"
				disabled={!src}
			>
				{#if isPlaying}
					<Pause class="w-4 h-4" />
				{:else}
					<Play class="w-4 h-4" />
				{/if}
			</Button>

			<!-- Stop button -->
			<Button
				on:click={stop}
				variant="outline"
				size="sm"
				class="border-gray-600"
				disabled={!src}
			>
				<Square class="w-4 h-4" />
			</Button>

			<!-- Volume controls -->
			<div class="flex items-center gap-2">
				<Button
					on:click={toggleMute}
					variant="ghost"
					size="sm"
					disabled={!src}
				>
					{#if muted}
						<VolumeX class="w-4 h-4" />
					{:else}
						<Volume2 class="w-4 h-4" />
					{/if}
				</Button>
				<input
					type="range"
					min="0"
					max="1"
					step="0.1"
					value={volume}
					on:input={handleVolumeChange}
					class="w-20"
					disabled={!src}
				/>
			</div>

			<!-- Time display -->
			{#if showTime}
				<div class="text-sm text-gray-400 font-mono min-w-[80px]">
					{formatTime(currentTime)} / {formatTime(duration)}
				</div>
			{/if}

			<!-- Progress bar -->
			<div class="flex-1 mx-2">
				<input
					type="range"
					min="0"
					max={duration || 0}
					value={currentTime}
					on:input={(e) => setCurrentTime(parseFloat(e.target.value))}
					class="w-full"
					disabled={!src || !duration}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Custom range slider styles */
	input[type="range"] {
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	input[type="range"]::-webkit-slider-track {
		background: #374151;
		height: 4px;
		border-radius: 2px;
	}

	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		background: #8b5cf6;
		height: 16px;
		width: 16px;
		border-radius: 50%;
		border: 2px solid #1f2937;
	}

	input[type="range"]::-moz-range-track {
		background: #374151;
		height: 4px;
		border-radius: 2px;
		border: none;
	}

	input[type="range"]::-moz-range-thumb {
		background: #8b5cf6;
		height: 16px;
		width: 16px;
		border-radius: 50%;
		border: 2px solid #1f2937;
		cursor: pointer;
	}

	input[type="range"]:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
