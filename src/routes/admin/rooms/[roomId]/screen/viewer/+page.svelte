<script>
	//src/routes/admin/rooms/[roomId]/screen/viewer/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import NormalnaScreenowka from './NormalnaScreenowka.svelte';
	import ZakrywanaScreenowka from './ZakrywanaScreenowka.svelte';
	import RozbitaScreenowka from './RozbitaScreenowka.svelte';
	import SiatkaScreenowka from './SiatkaScreenowka.svelte';
	import PixelatedScreenowka from './PixelatedScreenowka.svelte';

	export let data;
	$: ({ supabase, room, rounds, currentRound, screenImage } = data);

	let channel;

	onMount(() => {
		channel = supabase
			.channel(`screen-display:${room.id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				async () => await invalidateAll()
			)
			.subscribe();
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});

	// Default screen mode if not specified in room settings
	$: screenMode = room.screen_mode || 'normalna';
</script>

<div class="h-screen w-screen overflow-hidden bg-black">
	{#if screenMode === 'normalna'}
		<NormalnaScreenowka {screenImage} />
	{:else if screenMode === 'zakrywana'}
		<ZakrywanaScreenowka {screenImage} {room} {currentRound} {supabase} />
	{:else if screenMode === 'rozbita'}
		<RozbitaScreenowka {screenImage} {room} {currentRound} {supabase} />
	{:else if screenMode === 'siatka'}
		<SiatkaScreenowka {screenImage} {room} {currentRound} {supabase} />
	{:else if screenMode === 'pixelowana'}
		<PixelatedScreenowka {screenImage} {room} {currentRound} {supabase} />
	{:else}
		<!-- Fallback to normal mode if unknown mode -->
		<NormalnaScreenowka {screenImage} />
	{/if}
</div>
