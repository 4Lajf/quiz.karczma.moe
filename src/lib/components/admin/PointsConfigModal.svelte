<!-- PointsConfigModal.svelte -->
<script>
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	export let open = false;
	export let roomId;
	export let pointsConfig;
	export let room;
	export let onOpenChange;
	export let supabase;

	let config = {
		main_answer: pointsConfig?.main_answer || 1,
		song_title: pointsConfig?.song_title || 0,
		song_artist: pointsConfig?.song_artist || 0,
		other: pointsConfig?.other || 0,
		other2: pointsConfig?.other2 || 0,
		other3: pointsConfig?.other3 || 0,
		hint_penalty_percent: pointsConfig?.hint_penalty_percent || 40, // Add this new field with default 40%
		incorrect_answer_penalty_percent: pointsConfig?.incorrect_answer_penalty_percent || 50, // Add penalty for incorrect answers
		tiebreaker: {
			main_answer: pointsConfig?.tiebreaker?.main_answer || 0,
			song_title: pointsConfig?.tiebreaker?.song_title || 1,
			song_artist: pointsConfig?.tiebreaker?.song_artist || 1,
			other: pointsConfig?.tiebreaker?.other || 1,
			other2: pointsConfig?.tiebreaker?.other2 || 1,
			other3: pointsConfig?.tiebreaker?.other3 || 1
		}
	};

	async function handleSave() {
		try {
			const { error } = await supabase.from('rooms').update({ points_config: config }).eq('id', roomId);

			if (error) throw error;
			onOpenChange(false);
		} catch (error) {
			console.error('Failed to update points config:', error);
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="border-gray-800 bg-gray-900">
		<Dialog.Header>
			<Dialog.Title class="text-white">Konfiguruj punkty</Dialog.Title>
		</Dialog.Header>
		<div class="grid grid-cols-2 gap-4 py-4">
			<div class="space-y-4">
				<h3 class="text-lg font-medium text-white">Główne punkty</h3>
				<div class="space-y-2">
					<Label for="main_points" class="text-gray-200">Nazwa anime</Label>
					<Input type="number" id="main_points" bind:value={config.main_answer} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
				</div>
				<div class="space-y-2">
					<Label for="title_points" class="text-gray-200">Tytuł piosenki</Label>
					<Input type="number" id="title_points" bind:value={config.song_title} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
				</div>
				<div class="space-y-2">
					<Label for="artist_points" class="text-gray-200">Artysta</Label>
					<Input type="number" id="artist_points" bind:value={config.song_artist} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
				</div>
				<div class="space-y-2">
					<Label for="other_points" class="text-gray-200">{room?.enabled_fields?.field_names?.other || "Inne"}</Label>
					<Input type="number" id="other_points" bind:value={config.other} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
				</div>

				{#if room?.enabled_fields?.other2}
					<div class="space-y-2">
						<Label for="other2_points" class="text-gray-200">{room?.enabled_fields?.field_names?.other2 || "Inne2"}</Label>
						<Input type="number" id="other2_points" bind:value={config.other2} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
					</div>
				{/if}

				{#if room?.enabled_fields?.other3}
					<div class="space-y-2">
						<Label for="other3_points" class="text-gray-200">{room?.enabled_fields?.field_names?.other3 || "Inne3"}</Label>
						<Input type="number" id="other3_points" bind:value={config.other3} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
					</div>
				{/if}
			</div>

			<div class="space-y-4">
				<h3 class="text-lg font-medium text-white">Tiebreakery</h3>
				<div class="space-y-2">
					<Label for="main_tiebreaker" class="text-gray-200">Nazwa anime</Label>
					<Input type="number" id="main_tiebreaker" bind:value={config.tiebreaker.main_answer} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
				</div>
				<div class="space-y-2">
					<Label for="title_tiebreaker" class="text-gray-200">Tytuł piosenki</Label>
					<Input type="number" id="title_tiebreaker" bind:value={config.tiebreaker.song_title} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
				</div>
				<div class="space-y-2">
					<Label for="artist_tiebreaker" class="text-gray-200">Artysta</Label>
					<Input type="number" id="artist_tiebreaker" bind:value={config.tiebreaker.song_artist} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
				</div>
				<div class="space-y-2">
					<Label for="other_tiebreaker" class="text-gray-200">{room?.enabled_fields?.field_names?.other || "Inne"}</Label>
					<Input type="number" id="other_tiebreaker" bind:value={config.tiebreaker.other} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
				</div>

				{#if room?.enabled_fields?.other2}
					<div class="space-y-2">
						<Label for="other2_tiebreaker" class="text-gray-200">{room?.enabled_fields?.field_names?.other2 || "Inne2"}</Label>
						<Input type="number" id="other2_tiebreaker" bind:value={config.tiebreaker.other2} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
					</div>
				{/if}

				{#if room?.enabled_fields?.other3}
					<div class="space-y-2">
						<Label for="other3_tiebreaker" class="text-gray-200">{room?.enabled_fields?.field_names?.other3 || "Inne3"}</Label>
						<Input type="number" id="other3_tiebreaker" bind:value={config.tiebreaker.other3} min="0" class="border-gray-700 bg-gray-800 text-gray-100" />
					</div>
				{/if}
			</div>

			<!-- Hint penalty setting -->
			<div class="col-span-2 mt-2 space-y-2 border-t border-gray-800 pt-4">
				<Label for="hint_penalty" class="text-gray-200">Kara za podpowiedź (%)</Label>
				<div class="flex items-center gap-2">
					<Input type="number" id="hint_penalty" bind:value={config.hint_penalty_percent} min="0" max="100" class="border-gray-700 bg-gray-800 text-gray-100" />
					<span class="text-gray-300">%</span>
				</div>
				<p class="text-xs text-gray-400">Procent punktów odejmowanych po użyciu podpowiedzi</p>
			</div>

			<!-- Incorrect answer penalty setting -->
			<div class="col-span-2 mt-2 space-y-2 border-t border-gray-800 pt-4">
				<Label for="incorrect_penalty" class="text-gray-200">Kara za błędne odpowiedzi (%)</Label>
				<div class="flex items-center gap-2">
					<Input type="number" id="incorrect_penalty" bind:value={config.incorrect_answer_penalty_percent} min="0" max="100" class="border-gray-700 bg-gray-800 text-gray-100" />
					<span class="text-gray-300">%</span>
				</div>
				<p class="text-xs text-gray-400">Procent punktów odejmowanych za błędne odpowiedzi</p>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" on:click={() => onOpenChange(false)} class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">Anuluj</Button>
			<Button on:click={handleSave} class="bg-blue-600 text-white hover:bg-blue-700">Zapisz zmiany</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
