<script>
	//src/routes/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { invalidate, invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	export let data;
	$: ({ supabase, session, rooms = [], profile } = data);

	let channel;

	onMount(() => {
		// Subscribe to all room-related changes
		channel = supabase
			.channel('public-rooms')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'rooms'
				},
				async (payload) => {
					console.log('Room change detected:', payload);
					// Invalidate all data to ensure everything is refreshed
					await invalidateAll();
				}
			)
			.subscribe();

		// Set up depends
		return () => {
			invalidate('rooms');
		};
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="min-h-screen bg-gray-950">
	<div class="mx-auto max-w-7xl px-4 py-12">
		<div class="mb-8 flex items-center justify-between">
			<h1 class="text-3xl font-bold text-white">Lista Pokoi</h1>
			{#if !session}
				<Button href="/login" class="bg-blue-600 text-white hover:bg-blue-700">Zaloguj się</Button>
			{/if}
		</div>
		<div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
			{#each rooms as room}
				<Card.Root class="border-gray-800/50 bg-gray-900/50 transition-colors hover:bg-gray-900">
					<div class="p-4">
						<h3 class="mb-3 text-lg font-semibold tracking-tight text-gray-100">{room.name}</h3>
						<Button
							variant="default"
							href="/{room.id}"
							class="h-7 w-full bg-blue-600/70 text-xs text-white hover:bg-blue-700"
						>
							Dołącz
						</Button>
					</div>
				</Card.Root>
			{/each}
			{#if !rooms.length}
				<p class="col-span-full text-center text-gray-400">Brak dostępnych pokoi</p>
			{/if}
		</div>
	</div>
</div>
