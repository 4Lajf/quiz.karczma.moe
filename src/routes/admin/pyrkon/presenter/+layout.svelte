<script>
	import { Toaster } from '$lib/components/ui/sonner';
	import { onMount } from 'svelte';

	// Reset any inherited styles and hide header
	onMount(() => {
		if (typeof document !== 'undefined') {
			// Hide any existing header/nav elements
			const header = document.querySelector('header');
			const nav = document.querySelector('nav');
			if (header) header.style.display = 'none';
			if (nav) nav.style.display = 'none';

			// Set body styles
			document.body.style.margin = '0';
			document.body.style.padding = '0';
			document.body.style.overflow = 'hidden';
			document.body.style.background = 'black';
			document.documentElement.style.background = 'black';
		}
	});
</script>

<svelte:head>
	<title>Pyrkon Presenter</title>
	<style>
		body {
			margin: 0 !important;
			padding: 0 !important;
			overflow: hidden !important;
			background: black !important;
		}
		html {
			background: black !important;
		}
		header, nav {
			display: none !important;
		}
	</style>
</svelte:head>

<!-- Full screen presenter content -->
<div class="presenter-container">
	<slot />
</div>

<Toaster />

<style>
	.presenter-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: black;
		z-index: 9999;
	}

	:global(body) {
		margin: 0 !important;
		padding: 0 !important;
		overflow: hidden !important;
		background: black !important;
	}

	:global(html) {
		background: black !important;
	}

	:global(header), :global(nav) {
		display: none !important;
	}
</style>
