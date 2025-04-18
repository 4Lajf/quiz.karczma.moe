<!-- AnswerFieldsModal.svelte -->
<script>
	import { onMount } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';

	export let open = false;
	export let roomId;
	export let enabledFields;
	export let onOpenChange;
	
	let loading = false;
	let fetchingFields = false;
	let fields = {
		song_title: false,
		song_artist: false,
		anime_title: false,
		other: false,
		hint_mode: false
	};

	// Create a function to fetch the latest field data
	async function fetchFields() {
		if (!roomId || !open) return;
		
		fetchingFields = true;
		try {
			const response = await fetch(`/api/rooms/${roomId}/fields`, {
				method: 'GET'
			});

			if (!response.ok) {
				throw new Error('Failed to fetch room fields');
			}

			const result = await response.json();
			
			// Update fields with the latest data
			fields = {
				song_title: result.data?.song_title || false,
				song_artist: result.data?.song_artist || false,
				anime_title: result.data?.anime_title || false,
				other: result.data?.other || false,
				hint_mode: result.data?.hint_mode || false
			};
		} catch (error) {
			console.error('Error fetching fields:', error);
			toast.error(`Nie udało się pobrać ustawień: ${error.message}`);
			
			// Fall back to the provided enabledFields if fetch fails
			fields = {
				song_title: enabledFields?.song_title || false,
				song_artist: enabledFields?.song_artist || false,
				anime_title: enabledFields?.anime_title || false,
				other: enabledFields?.other || false,
				hint_mode: enabledFields?.hint_mode || false
			};
		} finally {
			fetchingFields = false;
		}
	}

	async function handleSave() {
		loading = true;
		try {
			const response = await fetch(`/api/rooms/${roomId}/fields`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(fields)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to update fields');
			}

			await invalidateAll();
			onOpenChange(false);
			toast.success('Zmieniono ustawienia pokoju.');
		} catch (error) {
			console.error('Failed to update fields:', error);
			toast.error(`Błąd: ${error.message}`);
		} finally {
			loading = false;
		}
	}
	
	// Watch for open state changes to fetch fields when dialog opens
	$: if (open && roomId) {
		fetchFields();
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="border-gray-800 bg-gray-900">
		<Dialog.Header>
			<Dialog.Title class="text-white">Konfigurj pola odpowiedzi</Dialog.Title>
		</Dialog.Header>
		
		{#if fetchingFields}
			<div class="flex justify-center py-8">
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-blue-500"></div>
			</div>
		{:else}
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
					disabled={loading}
				>
					Anuluj
				</Button>
				<Button
					disabled={loading || fetchingFields}
					on:click={handleSave}
					class="bg-blue-600 text-white hover:bg-blue-700"
				>
					{loading ? 'Zapisywanie...' : 'Zapisz zmiany'}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>