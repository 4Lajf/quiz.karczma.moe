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

	export function getDuration() {
		return videoElement ? videoElement.duration : 0;
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
		<div class="space-y-3 p-4 bg-gray-800 border border-gray-700 rounded-lg">
			<!-- Main controls row -->
			<div class="flex items-center gap-3">
				<!-- Play/Pause button -->
				<Button
					on:click={togglePlayPause}
					variant="outline"
					size="sm"
					class="border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600"
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
					class="border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600"
					disabled={!src}
				>
					<Square class="w-4 h-4" />
				</Button>

				<!-- Time display -->
				{#if showTime}
					<div class="text-sm text-gray-300 font-mono min-w-[100px] bg-gray-900 px-3 py-1 rounded border border-gray-600">
						{formatTime(currentTime)} / {formatTime(duration)}
					</div>
				{/if}

				<!-- Volume controls -->
				<div class="flex items-center gap-2 ml-auto">
					<Button
						on:click={toggleMute}
						variant="ghost"
						size="sm"
						class="text-gray-300 hover:text-white hover:bg-gray-700"
						disabled={!src}
					>
						{#if muted}
							<VolumeX class="w-4 h-4" />
						{:else}
							<Volume2 class="w-4 h-4" />
						{/if}
					</Button>
					<div class="volume-slider-container">
						<input
							type="range"
							min="0"
							max="1"
							step="0.1"
							value={volume}
							on:input={handleVolumeChange}
							class="volume-slider"
							disabled={!src}
							style="background: transparent !important; -webkit-appearance: none !important; appearance: none !important;"
						/>
						<div class="volume-label text-xs text-gray-400 text-center mt-1">
							{Math.round(volume * 100)}%
						</div>
					</div>
				</div>
			</div>

			<!-- Progress bar row -->
			<div class="space-y-2">
				<div class="flex items-center justify-between text-xs text-gray-400">
					<span>Postęp</span>
					<span>{duration ? Math.round((currentTime / duration) * 100) : 0}%</span>
				</div>
				<div class="progress-container">
					<input
						type="range"
						min="0"
						max={duration || 0}
						value={currentTime}
						on:input={(e) => setCurrentTime(parseFloat(e.target.value))}
						class="progress-slider w-full"
						disabled={!src || !duration}
						style="background: transparent !important; -webkit-appearance: none !important; appearance: none !important;"
					/>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Volume slider container */
	.volume-slider-container {
		width: 80px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	/* Progress container */
	.progress-container {
		position: relative;
		padding: 8px 0;
	}

	/* Base slider styles */
	input[type="range"] {
		-webkit-appearance: none !important;
		appearance: none !important;
		background: transparent !important;
		cursor: pointer;
		height: 20px;
		width: 100%;
	}

	/* Force track visibility for all states */
	input[type="range"]::-webkit-slider-track {
		-webkit-appearance: none !important;
		appearance: none !important;
	}

	/* Volume slider specific styles */
	.volume-slider {
		width: 100%;
		height: 6px;
	}

	.volume-slider::-webkit-slider-track {
		-webkit-appearance: none !important;
		appearance: none !important;
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	.volume-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		background: linear-gradient(135deg, #8b5cf6, #a855f7);
		height: 18px;
		width: 18px;
		border-radius: 50%;
		border: 2px solid #1f2937;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		transition: all 0.2s ease;
	}

	.volume-slider::-webkit-slider-thumb:hover {
		background: linear-gradient(135deg, #a855f7, #c084fc);
		transform: scale(1.1);
	}

	/* Progress slider specific styles */
	.progress-slider {
		height: 8px;
	}

	.progress-slider::-webkit-slider-track {
		-webkit-appearance: none !important;
		appearance: none !important;
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	.progress-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		background: linear-gradient(135deg, #3b82f6, #1d4ed8);
		height: 20px;
		width: 20px;
		border-radius: 50%;
		border: 2px solid #1f2937;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
		transition: all 0.2s ease;
	}

	.progress-slider::-webkit-slider-thumb:hover {
		background: linear-gradient(135deg, #1d4ed8, #1e40af);
		transform: scale(1.1);
	}

	/* Firefox styles */
	.volume-slider::-moz-range-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
	}

	.volume-slider::-moz-range-thumb {
		background: linear-gradient(135deg, #8b5cf6, #a855f7) !important;
		height: 18px !important;
		width: 18px !important;
		border-radius: 50% !important;
		border: 2px solid #1f2937 !important;
		cursor: pointer !important;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
	}

	.progress-slider::-moz-range-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
	}

	.progress-slider::-moz-range-thumb {
		background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
		height: 20px !important;
		width: 20px !important;
		border-radius: 50% !important;
		border: 2px solid #1f2937 !important;
		cursor: pointer !important;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4) !important;
	}

	/* Disabled state */
	input[type="range"]:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Keep tracks visible even when disabled */
	input[type="range"]:disabled::-webkit-slider-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	input[type="range"]:disabled::-moz-range-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		border: 1px solid #6b7280 !important;
	}

	input[type="range"]:disabled::-webkit-slider-thumb {
		background: #6b7280;
		transform: none;
	}

	input[type="range"]:disabled::-moz-range-thumb {
		background: #6b7280;
	}

	/* Specific disabled state styles for volume slider */
	.volume-slider:disabled::-webkit-slider-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	.volume-slider:disabled::-moz-range-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
	}

	/* Specific disabled state styles for progress slider */
	.progress-slider:disabled::-webkit-slider-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	.progress-slider:disabled::-moz-range-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
	}

	/* Focus styles */
	input[type="range"]:focus {
		outline: none;
	}

	input[type="range"]:focus::-webkit-slider-thumb {
		box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.3);
	}

	/* Additional fallback styles to ensure track visibility */
	.volume-slider, .progress-slider {
		background: transparent !important;
		outline: none !important;
	}

	/* Force track styles with highest specificity */
	input[type="range"].volume-slider::-webkit-slider-track,
	input[type="range"].volume-slider:enabled::-webkit-slider-track,
	input[type="range"].volume-slider:not(:disabled)::-webkit-slider-track {
		-webkit-appearance: none !important;
		appearance: none !important;
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	input[type="range"].progress-slider::-webkit-slider-track,
	input[type="range"].progress-slider:enabled::-webkit-slider-track,
	input[type="range"].progress-slider:not(:disabled)::-webkit-slider-track {
		-webkit-appearance: none !important;
		appearance: none !important;
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	/* Firefox fallback styles */
	input[type="range"].volume-slider::-moz-range-track,
	input[type="range"].volume-slider:enabled::-moz-range-track,
	input[type="range"].volume-slider:not(:disabled)::-moz-range-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
	}

	input[type="range"].progress-slider::-moz-range-track,
	input[type="range"].progress-slider:enabled::-moz-range-track,
	input[type="range"].progress-slider:not(:disabled)::-moz-range-track {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
	}

	/* Ultimate fallback - use CSS custom properties to force track visibility */
	.volume-slider {
		--track-bg: linear-gradient(to right, #4b5563 0%, #6b7280 100%);
		--track-height: 6px;
		--track-border: 1px solid #6b7280;
		--track-radius: 3px;
	}

	.progress-slider {
		--track-bg: linear-gradient(to right, #4b5563 0%, #6b7280 100%);
		--track-height: 8px;
		--track-border: 1px solid #6b7280;
		--track-radius: 4px;
	}

	/* Force track styles using CSS variables */
	.volume-slider::-webkit-slider-track {
		background: var(--track-bg) !important;
		height: var(--track-height) !important;
		border: var(--track-border) !important;
		border-radius: var(--track-radius) !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
		-webkit-appearance: none !important;
		appearance: none !important;
	}

	.progress-slider::-webkit-slider-track {
		background: var(--track-bg) !important;
		height: var(--track-height) !important;
		border: var(--track-border) !important;
		border-radius: var(--track-radius) !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
		-webkit-appearance: none !important;
		appearance: none !important;
	}

	/* Ensure tracks are visible even with Tailwind resets */
	input[type="range"].volume-slider,
	input[type="range"].progress-slider {
		background: transparent !important;
		border: none !important;
		outline: none !important;
		-webkit-appearance: none !important;
		-moz-appearance: none !important;
		appearance: none !important;
	}
</style>
