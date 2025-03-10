<!-- AnswerFieldsModal.svelte -->
<script>
	import * as Dialog from '$lib/components/ui/dialog';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	export let open = false;
	export let roomId;
	export let enabledFields;
	export let onOpenChange;
	export let supabase;

	let fields = {
		song_title: enabledFields?.song_title || false,
		song_artist: enabledFields?.song_artist || false,
		anime_title: enabledFields?.anime_title || false,
		other: enabledFields?.other || false,
		hint_mode: enabledFields?.hint_mode || false
	};

	async function handleSave() {
		try {
			const { error } = await supabase
				.from('rooms')
				.update({ enabled_fields: fields })
				.eq('id', roomId);

			if (error) throw error;
			onOpenChange(false);
		} catch (error) {
			console.error('Failed to update fields:', error);
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="border-gray-800 bg-gray-900">
		<Dialog.Header>
			<Dialog.Title class="text-white">Konfigurj pola odpowiedzi</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4 py-4">
			<div class="flex items-center space-x-2">
				<Checkbox
					id="song_title"
					bind:checked={fields.song_title}
					class="border-gray-600 data-[state=checked]:bg-blue-600"
				/>
				<Label for="song_title" class="text-gray-200">Tytuł piosenki</Label>
			</div>
			<div class="flex items-center space-x-2">
				<Checkbox
					id="song_artist"
					bind:checked={fields.song_artist}
					class="border-gray-600 data-[state=checked]:bg-blue-600"
				/>
				<Label for="song_artist" class="text-gray-200">Artysta</Label>
			</div>
			<div class="flex items-center space-x-2">
				<Checkbox
					id="anime_title"
					bind:checked={fields.anime_title}
					class="border-gray-600 data-[state=checked]:bg-blue-600"
				/>
				<Label for="anime_title" class="text-gray-200">Tytuł anime</Label>
			</div>
			<div class="flex items-center space-x-2">
				<Checkbox
					id="other"
					bind:checked={fields.other}
					class="border-gray-600 data-[state=checked]:bg-blue-600"
				/>
				<Label for="other" class="text-gray-200">Inne</Label>
			</div>
			<div class="flex items-center space-x-2">
				<Checkbox
				  id="hint_mode"
				  bind:checked={fields.hint_mode}
				  class="border-gray-600 data-[state=checked]:bg-blue-600"
				/>
				<Label for="hint_mode" class="text-gray-200">Tryb podpowiedzi</Label>
			  </div>
		</div>
		<Dialog.Footer>
			<Button
				variant="outline"
				on:click={() => onOpenChange(false)}
				class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
			>
				Anuluj
			</Button>
			<Button on:click={handleSave} class="bg-blue-600 text-white hover:bg-blue-700">
				Zapisz zmiany
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
