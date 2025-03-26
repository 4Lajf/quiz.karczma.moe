<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	// Event dispatcher for communicating with parent
	const dispatch = createEventDispatcher();

	// Props
	export let options = [];
	$: activeOptions = options.filter((option) => option.enabled !== false);

	// Local state
	let canvas;
	let ctx;
	let centerX;
	let centerY;
	let radius;
	let isSpinning = false;
	let selectedOption = null;
	let startAngle = 0;

	// Create tweened value for animation
	const rotation = tweened(0, {
		duration: 5000,
		easing: cubicOut
	});

	// Initialize wheel
	onMount(() => {
		if (!canvas) return;

		ctx = canvas.getContext('2d');
		centerX = canvas.width / 2;
		centerY = canvas.height / 2;
		radius = Math.min(centerX, centerY) - 10;

		drawWheel(0);
	});

	// Draw the wheel
	function drawWheel(rotationValue) {
		if (!ctx) return;

		// Clear canvas
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Calculate angle per segment
		const anglePerSegment = (2 * Math.PI) / activeOptions.length; // Use activeOptions

		// Draw segments
		activeOptions.forEach((option, index) => {
			// Use activeOptions
			const angle = index * anglePerSegment;

			// Draw segment
			ctx.beginPath();
			ctx.moveTo(centerX, centerY);
			ctx.arc(centerX, centerY, radius, angle + rotationValue, angle + anglePerSegment + rotationValue);
			ctx.closePath();

			// Fill with color
			ctx.fillStyle = option.color;
			ctx.fill();

			// Add stroke
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#ffffff';
			ctx.stroke();

			// Add text
			const textAngle = angle + anglePerSegment / 2 + rotationValue;

			// Define text size and spacing
			const fontSize = 26;
			ctx.font = `bold ${fontSize}px sans-serif`;

			// Calculate the available space for text (from outer edge toward center)
			const outerTextRadius = radius * 0.85; // Start text near the outer edge
			const innerTextRadius = radius * 0.25; // End text near the center
			const textLength = option.label.length;
			const charSpacing = Math.min((outerTextRadius - innerTextRadius) / textLength, fontSize * 1.2);

			ctx.fillStyle = 'white';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 3;

			// Draw each character along the radial line from outer to inner
			for (let i = 0; i < textLength; i++) {
				const char = option.label[i];

				// Calculate position for this character
				// Start from outer edge and move inward with each character
				const charRadius = outerTextRadius - i * charSpacing;
				const charX = centerX + charRadius * Math.cos(textAngle);
				const charY = centerY + charRadius * Math.sin(textAngle);

				ctx.save();
				ctx.translate(charX, charY);

				// Rotate to align with the radial line
				// Add 90 degrees (π/2) to make characters face outward along the radius
				ctx.rotate(textAngle + Math.PI / 2);

				// Draw character with outline for better visibility
				ctx.strokeText(char, 0, 0);
				ctx.fillText(char, 0, 0);

				ctx.restore();
			}
		});

		// Draw center circle
		ctx.beginPath();
		ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
		ctx.fillStyle = '#1a1a1a';
		ctx.fill();
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.stroke();

		// Draw pointer
		ctx.beginPath();
		ctx.moveTo(centerX, centerY - radius + 20); // This was the base middle point, now the tip
		ctx.lineTo(centerX - 15, centerY - radius - 10); // Left corner moves up
		ctx.lineTo(centerX + 15, centerY - radius - 10); // Right corner moves up
		ctx.closePath();
		ctx.fillStyle = '#ff3e3e';
		ctx.fill();
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.stroke();
	}

	// Spin the wheel
	async function spinWheel() {
		if (isSpinning) return;

		isSpinning = true;
		selectedOption = null;

		// Randomize number of rotations (between 2 and 4 full rotations)
		const rotations = 2 + Math.random() * 2;

		// Randomize the final position to determine the winner
		const finalAngle = Math.random() * (2 * Math.PI);

		// Set the start angle to the current position
		startAngle = $rotation;

		// Calculate the total rotation needed
		const targetRotation = startAngle + rotations * 2 * Math.PI + finalAngle;

		// Start the animation
		rotation.set(targetRotation);

		// Update the drawing during animation
		const unsub = rotation.subscribe((value) => {
			drawWheel(value);
		});

		// Wait for animation to complete
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Determine the winner
		const anglePerSegment = (2 * Math.PI) / activeOptions.length; // Use activeOptions instead of options
		const normalizedAngle = targetRotation % (2 * Math.PI);
		const winningIndex = Math.floor((2 * Math.PI - normalizedAngle) / anglePerSegment) % activeOptions.length;

		selectedOption = activeOptions[winningIndex]; // Use activeOptions to select the winner
		isSpinning = false;

		// Clean up subscription
		unsub();
	}

	// Handle selection
	function selectOption() {
		if (selectedOption) {
			dispatch('selection', selectedOption);
		}
	}

	// Close the wheel
	function close() {
		dispatch('close');
	}

	// Update the drawing when rotation changes
	$: if (ctx) drawWheel($rotation);
</script>

<div class="wheel-container">
	<div class="wheel-header">
		<h2>Wybierz tryb za pomocą koła fortuny</h2>
		<button class="close-button" on:click={close}>✕</button>
	</div>

	<div class="wheel-wrapper">
		<canvas bind:this={canvas} width="700" height="700"></canvas>
	</div>

	<div class="wheel-controls">
		{#if selectedOption}
			<div class="button-group">
				<button class="spin-button" on:click={spinWheel} disabled={isSpinning}>
					{isSpinning ? 'Kręcenie...' : 'Kręć ponownie'}
				</button>
			</div>
		{:else}
			<button class="spin-button" on:click={spinWheel} disabled={isSpinning}>
				{isSpinning ? 'Kręcenie...' : 'Zakręć kołem'}
			</button>
		{/if}
	</div>
</div>

<style>
	.wheel-container {
		background-color: #1a1a1a;
		border-radius: 16px;
		overflow: hidden;
		width: 750px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
		border: 2px solid #333;
	}

	.wheel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		background-color: #2a2a2a;
		border-bottom: 1px solid #333;
	}

	.wheel-header h2 {
		color: white;
		margin: 0;
		font-size: 18px;
	}

	.close-button {
		background: none;
		border: none;
		color: white;
		font-size: 20px;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
	}

	.close-button:hover {
		background-color: rgba(255, 255, 255, 0.1);
	}

	.wheel-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 20px;
	}

	.wheel-controls {
		padding: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		border-top: 1px solid #333;
	}

	.button-group {
		display: flex;
		gap: 8px;
		width: 100%;
	}

	.spin-button {
		background-color: #4c1d95;
		color: white;
		flex: 1;
        width: 100%;
        padding-bottom: 6px;
        padding-top: 6px;
	}

	.spin-button:hover:not(:disabled) {
		background-color: #6d28d9;
	}

	.spin-button:disabled {
		background-color: #4c1d95;
		opacity: 0.7;
		cursor: not-allowed;
	}
</style>
