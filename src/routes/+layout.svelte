<script>
	//src/routes/+layout.svelte
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import { Toaster, toast } from 'svelte-sonner';
	import { ModeWatcher } from 'mode-watcher';
	import '../app.css';

	export let data;

	$: ({ supabase, session, profile } = data);

	// Check if we're on the screen viewer page
	$: isScreenViewerPage = $page.url.pathname.includes('/admin/rooms/') && $page.url.pathname.includes('/screen/viewer');

	async function handleLogout() {
		const { error } = await supabase.auth.signOut();
		if (!error) {
			invalidate('supabase:auth');
		}
		goto('/', { invalidateAll: true });
	}
</script>

{#if session && !isScreenViewerPage}
	<header class="sticky top-0 z-50 w-full border-b border-gray-800 bg-gray-950">
		<div class="container flex items-center justify-between h-14">
			<div class="flex items-center gap-4"></div>
			<div class="flex items-center gap-4">
				<!-- Admin buttons are now always visible - no authentication required -->
				<Button variant="outline" href="/admin" class="text-gray-300 bg-gray-700 border-gray-700 hover:bg-gray-800 hover:text-gray-400">Admin Panel</Button>
				<Button variant="outline" href="/pyrkon" class="text-purple-100 bg-purple-700 border-purple-700 hover:bg-purple-800 hover:text-purple-200">🎵 Admin</Button>
				<Button variant="outline" on:click={handleLogout} class="text-gray-300 bg-gray-700 border-gray-700 hover:bg-gray-800 hover:text-gray-400">Wyloguj</Button>
			</div>
		</div>
	</header>
{/if}

<main class="min-h-screen transition-colors duration-200 bg-gray-950">
	<ModeWatcher defaultMode={'dark'} />
	<Toaster richColors />
	<slot />
</main>
