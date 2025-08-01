<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import LeaderboardDisplay from '$lib/components/pyrkon/LeaderboardDisplay.svelte';

	export let data;
	$: ({ session, user, profile } = data);
</script>

<svelte:head>
	<title>Leaderboard</title>
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
		<div class="absolute bg-purple-500 rounded-full -top-40 -right-40 w-80 h-80 mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
		<div class="absolute bg-blue-500 rounded-full -bottom-40 -left-40 w-80 h-80 mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
		<div class="absolute transform -translate-x-1/2 -translate-y-1/2 bg-green-500 rounded-full top-1/2 left-1/2 w-80 h-80 mix-blend-multiply filter blur-xl opacity-10 animate-pulse animation-delay-4000"></div>
	</div>

	<!-- Leaderboard display -->
	<div class="relative z-10 w-full h-full">
		<LeaderboardDisplay showAllDifficulties={true} limit={999} autoRefresh={true} />
	</div>
</div>

<style>
	.animation-delay-2000 {
		animation-delay: 2s;
	}
	.animation-delay-4000 {
		animation-delay: 4s;
	}
</style>
