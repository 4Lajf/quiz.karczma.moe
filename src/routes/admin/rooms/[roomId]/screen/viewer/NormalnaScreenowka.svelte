<script>
	// src/routes/admin/rooms/[roomId]/screen/viewer/components/NormalnaScreenowka.svelte
	export let screenImage;
</script>

{#if screenImage}
	<img src={screenImage.url} alt="Screen" class="h-full w-full object-contain" />
{:else}
	<div class="flex h-full w-full items-center justify-center">
		<p class="text-xl text-gray-400">Brak obrazu dla aktualnej rundy</p>
	</div>
{/if}