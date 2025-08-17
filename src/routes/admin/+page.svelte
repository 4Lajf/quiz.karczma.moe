<script>
	//src/routes/admin/+page.svelte
	import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '$lib/components/ui/dialog';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';
	import { onMount, onDestroy } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { invalidate, invalidateAll } from '$app/navigation';
	import AnswerFieldsModal from '$lib/components/admin/AnswerFieldsModal.svelte';
	import { Plus } from 'lucide-svelte';
	import { canModifyRoom } from '$lib/client/roomSecurity.js';

	export let data;
	let inputFieldsModal = false;
	let selectedRoomId = null; // Track which room's modal is open
	let newRoomName = '';
	let loading = false;
	let channel;

	let showCreateRoomDialog = false;
	let newRoomType = 'screen'; // Default to screen type
	let creatingRoom = false;

	let showScreenModeDialog = false;
	let selectedScreenRoomId = null;
	let screenMode = 'normalna'; // Default screen mode

	// Delete confirmation dialog state
	let showDeleteConfirmDialog = false;
	let roomToDelete = null;
	let deleteConfirmationText = '';
	let deletingRoom = false;
	let savingScreenMode = false;

	$: ({ supabase, user, profile, rooms } = data);

	function openScreenModeModal(roomId) {
		selectedScreenRoomId = roomId;
		const room = rooms.find((r) => r.id === roomId);
		screenMode = room?.screen_mode || 'normalna';
		showScreenModeDialog = true;
	}

	async function saveScreenMode() {
		if (!selectedScreenRoomId) return;

		savingScreenMode = true;

		try {
			// Validate room ownership
			const room = rooms.find((r) => r.id === selectedScreenRoomId);
			canModifyRoom(room, user, profile);

			const { error } = await supabase
				.from('rooms')
				.update({
					screen_mode: screenMode
				})
				.eq('id', selectedScreenRoomId);

			if (error) throw error;

			toast.success('Zaktualizowano tryb screenówki');
			await invalidateAll();
			showScreenModeDialog = false;
		} catch (error) {
			toast.error('Nie udało się zaktualizować trybu screenówki: ' + error.message);
		} finally {
			savingScreenMode = false;
		}
	}

	// Open the modal for a specific room
	function openInputFieldsModal(roomId) {
		selectedRoomId = roomId;
		inputFieldsModal = true;
	}

	// Handle modal close and reset selected room
	function handleModalChange(isOpen) {
		inputFieldsModal = isOpen;
		if (!isOpen) {
			selectedRoomId = null;
		}
	}

	function openCreateRoomDialog() {
		newRoomName = '';
		newRoomType = 'screen';
		showCreateRoomDialog = true;
	}

	async function createRoom() {
		if (!newRoomName.trim()) {
			toast.error('Wprowadź nazwę pokoju');
			return;
		}

		creatingRoom = true;

		try {
			// Create the room with type
			const { data: room, error: roomError } = await supabase
				.from('rooms')
				.insert({
					name: newRoomName.trim(),
					created_by: user.id,
					type: newRoomType
				})
				.select('id')
				.single();

			if (roomError) throw roomError;

			// Create initial round
			const { data: round, error: roundError } = await supabase
				.from('quiz_rounds')
				.insert({
					room_id: room.id,
					round_number: 1
				})
				.select('id')
				.single();

			if (roundError) throw roundError;

			// Update room with initial round
			const { error: updateError } = await supabase.from('rooms').update({ current_round: round.id }).eq('id', room.id);

			if (updateError) throw updateError;

			showCreateRoomDialog = false;
			newRoomName = '';
			toast.success('Utworzono nowy pokój');
			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się utworzyć pokoju: ' + error.message);
		} finally {
			creatingRoom = false;
		}
	}

	async function toggleAdditionalAnswers(roomId, currentValue) {
		try {
			// Validate room ownership
			const room = rooms.find((r) => r.id === roomId);
			canModifyRoom(room, user, profile);

			const { error } = await supabase.from('rooms').update({ additional_answers_enabled: !currentValue }).eq('id', roomId);

			if (error) {
				toast.error('Nie udało się zaktualizować ustawienia');
			} else {
				toast.success('Zaktualizowano ustawienie');
			}
		} catch (validationError) {
			toast.error('Nie masz uprawnień do modyfikacji tego pokoju');
		}
	}

	function showDeleteConfirmation(room) {
		roomToDelete = room;
		deleteConfirmationText = '';
		showDeleteConfirmDialog = true;
	}

	async function confirmDeleteRoom() {
		if (deleteConfirmationText !== 'DELETE') {
			toast.error('Wpisz "DELETE" aby potwierdzić usunięcie');
			return;
		}

		if (!roomToDelete) return;

		deletingRoom = true;
		try {
			// Validate room ownership
			canModifyRoom(roomToDelete, user, profile);

			const { error } = await supabase.from('rooms').delete().eq('id', roomToDelete.id);

			if (error) {
				toast.error('Nie udało się usunąć pokoju');
			} else {
				toast.success(`Usunięto pokój "${roomToDelete.name}"`);
				showDeleteConfirmDialog = false;
				roomToDelete = null;
				deleteConfirmationText = '';
				await invalidateAll();
			}
		} catch (validationError) {
			toast.error('Nie masz uprawnień do usunięcia tego pokoju');
		} finally {
			deletingRoom = false;
		}
	}

	function cancelDeleteRoom() {
		showDeleteConfirmDialog = false;
		roomToDelete = null;
		deleteConfirmationText = '';
	}

	onMount(() => {
		// Subscribe to room changes
		channel = supabase
			.channel('admin-rooms')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'rooms'
				},
				async (payload) => {
					console.log('Admin room change detected:', payload);
					await invalidateAll();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'quiz_rounds'
				},
				async () => {
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

	// Find the currently selected room
	$: selectedRoom = rooms.find((room) => room.id === selectedRoomId);
</script>

<div class="container mx-auto min-h-screen bg-gray-950 p-6">
	<div class="mb-8 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Avatar.Root class="border border-gray-800">
				<Avatar.Fallback class="bg-gray-800 text-gray-200">
					{profile.username?.[0]?.toUpperCase()}
				</Avatar.Fallback>
			</Avatar.Root>
			<div>
				<h2 class="text-xl font-bold text-white">{profile.username}</h2>
				<p class="text-sm text-gray-400">
					{profile?.role === 'admin' ? 'Admin Dashboard' : 'My Rooms Dashboard'}
				</p>
			</div>
		</div>
	</div>

	<Card.Root class="border-gray-800 bg-gray-900">
		<Card.Header>
			<Card.Title class="text-white">
				{profile?.role === 'admin' ? 'Wszystkie pokoje' : 'Moje pokoje'}
			</Card.Title>
			{#if profile?.role !== 'admin'}
				<p class="mt-2 text-sm text-gray-400">Tutaj możesz zarządzać pokojami, które utworzyłeś/aś. Możesz tworzyć nowe pokoje i konfigurować te istniejące.</p>
			{/if}
		</Card.Header>
		<Card.Content>
			<Button on:click={openCreateRoomDialog} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
				<Plus class="mr-2 h-4 w-4" />
				Utwórz nowy pokój
			</Button>

			{#if rooms.length === 0}
				<div class="flex flex-col items-center justify-center px-4 py-12 text-center">
					<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
						<Plus class="h-8 w-8 text-gray-400" />
					</div>
					<h3 class="mb-2 text-lg font-semibold text-white">Nie masz jeszcze żadnych pokoi</h3>
					<Button on:click={openCreateRoomDialog} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
						<Plus class="mr-2 h-4 w-4" />
						Utwórz pierwszy pokój
					</Button>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row class="border-gray-800 hover:bg-gray-900">
							<Table.Head class="text-gray-300">Nazwa</Table.Head>
							<Table.Head class="text-gray-300">Stworzone przez</Table.Head>
							<Table.Head class="text-gray-300">Ustawienia</Table.Head>
							<Table.Head class="text-gray-300">Akcje</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each rooms as room}
							<Table.Row class="border-gray-800 hover:bg-gray-900">
								<Table.Cell class="text-gray-200">
									{room.name}
									<span class="ml-2 rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
										{room.type === 'screen' ? 'Screen' : 'Song'}
									</span>
								</Table.Cell>
								<Table.Cell class="flex items-center gap-2">
									<Avatar.Root class="h-6 w-6 border border-gray-800">
										<Avatar.Image src={room.profiles.avatar_url} alt={room.profiles.username} />
										<Avatar.Fallback class="bg-gray-800 text-gray-200">
											{room.profiles.username?.[0]?.toUpperCase()}
										</Avatar.Fallback>
									</Avatar.Root>
									<span class="text-gray-200">{room.profiles.username}</span>
								</Table.Cell>
								<Table.Cell>
									{#if room.type === 'screen'}
										<Button variant="outline" size="sm" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" on:click={() => openScreenModeModal(room.id)}>Konfiguruj tryb screenówki</Button>
									{:else}
										<Button variant="outline" size="sm" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" on:click={() => openInputFieldsModal(room.id)}>Konfiguruj pola odpowiedzi</Button>
									{/if}

									{#if room.type === 'screen'}
										<Button variant="outline" size="sm" class="ml-2 border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" href="/admin/rooms/{room.id}/screen/answers">Konfiguruj odpowiedzi rund</Button>
									{:else}
										<Button variant="outline" size="sm" class="ml-2 border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" href="/admin/rooms/{room.id}/answers">Konfiguruj odpowiedzi rund</Button>
									{/if}
								</Table.Cell>
								<Table.Cell>
									<div class="flex gap-2">
										<Button variant="outline" size="sm" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" href="/admin/rooms/{room.id}">Wejdź</Button>

										{#if room.type === 'screen'}
											<Button variant="outline" size="sm" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" href="/admin/rooms/{room.id}/screen/viewer" target="_blank">Otwórz</Button>
										{/if}

										<Button variant="destructive" size="sm" class="border border-red-900 bg-gray-900 text-red-400 hover:bg-gray-800" on:click={() => showDeleteConfirmation(room)}>Usuń</Button>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<Dialog bind:open={showCreateRoomDialog}>
	<DialogContent class="border-gray-800 bg-gray-900 text-gray-100">
		<DialogHeader>
			<DialogTitle>Utwórz nowy pokój</DialogTitle>
			<DialogDescription>Wybierz typ pokoju i podaj jego nazwę.</DialogDescription>
		</DialogHeader>

		<div class="space-y-4 py-4">
			<div class="space-y-2">
				<Label for="room-name">Nazwa pokoju</Label>
				<input id="room-name" bind:value={newRoomName} class="w-full rounded-md border border-gray-700 bg-gray-800 p-2 text-gray-100 focus-visible:ring-1 focus-visible:ring-gray-600" placeholder="Wpisz nazwę pokoju" />
			</div>

			<div class="space-y-2">
				<Label>Typ pokoju</Label>
				<RadioGroup bind:value={newRoomType} class="flex flex-col gap-2">
					<div class="flex items-center space-x-2">
						<RadioGroupItem value="song" id="song" />
						<Label for="song" class="cursor-pointer">Muzyczne i wszystkie inne konkursy</Label>
					</div>
					<div class="flex items-center space-x-2">
						<RadioGroupItem value="screen" id="screen" />
						<Label for="screen" class="cursor-pointer">Screenówka</Label>
					</div>
				</RadioGroup>
			</div>
		</div>

		<DialogFooter>
			<Button on:click={() => (showCreateRoomDialog = false)} variant="outline" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">Anuluj</Button>
			<Button on:click={createRoom} disabled={creatingRoom || !newRoomName.trim()} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
				{#if creatingRoom}
					<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
					Tworzenie...
				{:else}
					Utwórz pokój
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<Dialog bind:open={showScreenModeDialog}>
	<DialogContent class="border-gray-800 bg-gray-900 text-gray-100">
		<DialogHeader>
			<DialogTitle>Konfiguracja trybu screenówki</DialogTitle>
			<DialogDescription>Wybierz tryb wyświetlania screenówki.</DialogDescription>
		</DialogHeader>

		<div class="space-y-4 py-4">
			<RadioGroup bind:value={screenMode} class="flex flex-col gap-2">
				<div class="flex items-center space-x-2">
					<RadioGroupItem value="normalna" id="normal-screen" />
					<Label for="normal-screen" class="cursor-pointer">Normalna screenówka</Label>
				</div>
				<div class="flex items-center space-x-2">
					<RadioGroupItem value="zakrywana" id="covered-screen" />
					<Label for="covered-screen" class="cursor-pointer">Zakrywana screenówka</Label>
				</div>
				<div class="flex items-center space-x-2">
					<RadioGroupItem value="rozbita" id="split-screen" />
					<Label for="split-screen" class="cursor-pointer">Rozbita screenówka</Label>
				</div>

				<div class="flex items-center space-x-2">
					<RadioGroupItem value="siatka" id="gird-screen" />
					<Label for="grid-screen" class="cursor-pointer">Na bazie siatki (4x4, 8x8 itp.)</Label>
				</div>

				<div class="flex items-center space-x-2">
					<RadioGroupItem value="pixelowana" id="pixelated-screen" />
					<Label for="pixelated-screen" class="cursor-pointer">Pixelowana (od mocno do mniej pixelowana)</Label>
				</div>
			</RadioGroup>
		</div>

		<DialogFooter>
			<Button on:click={() => (showScreenModeDialog = false)} variant="outline" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" disabled={savingScreenMode}>Anuluj</Button>
			<Button on:click={saveScreenMode} disabled={savingScreenMode} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
				{#if savingScreenMode}
					<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
					Zapisywanie...
				{:else}
					Zapisz
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Render a single modal that's shared across all rooms, but with the correct roomId -->
{#if inputFieldsModal && selectedRoomId && selectedRoom}
	<AnswerFieldsModal open={inputFieldsModal} roomId={selectedRoomId} enabledFields={selectedRoom.enabled_fields} onOpenChange={handleModalChange} />
{/if}

<!-- Delete confirmation dialog -->
<Dialog bind:open={showDeleteConfirmDialog}>
	<DialogContent class="border-gray-800 bg-gray-900 text-gray-100">
		<DialogHeader>
			<DialogTitle class="text-red-400">Usuń pokój</DialogTitle>
			<DialogDescription class="text-gray-300">
				{#if roomToDelete}
					Czy na pewno chcesz usunąć pokój "<strong>{roomToDelete.name}</strong>"?
					<br /><br />
					Ta akcja jest nieodwracalna i usunie wszystkie dane związane z tym pokojem.
					<br /><br />
					Aby potwierdzić, wpisz <strong>DELETE</strong> w polu poniżej:
				{/if}
			</DialogDescription>
		</DialogHeader>
		<div class="py-4">
			<Input bind:value={deleteConfirmationText} placeholder="Wpisz DELETE aby potwierdzić" class="border-gray-700 bg-gray-800 text-gray-100" disabled={deletingRoom} />
		</div>
		<DialogFooter>
			<Button variant="outline" on:click={cancelDeleteRoom} disabled={deletingRoom} class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">Anuluj</Button>
			<Button variant="destructive" on:click={confirmDeleteRoom} disabled={deletingRoom || deleteConfirmationText !== 'DELETE'} class="border border-red-900 bg-red-900 text-white hover:bg-red-800">
				{#if deletingRoom}
					Usuwanie...
				{:else}
					Usuń pokój
				{/if}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<style>
	*:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 2px hsl(var(--background)),
			0 0 0 4px hsl(var(--ring));
	}
</style>
