<script>
	//src/routes/admin/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { invalidate, invalidateAll } from '$app/navigation';
	import AnswerFieldsModal from '$lib/components/admin/AnswerFieldsModal.svelte';

	export let data;
	let modalOpen = false;
	let newRoomName = '';
	let loading = false;
	let channel;

	$: ({ supabase, user, profile, rooms } = data);

	async function handleCreateRoom(event) {
		event.preventDefault();
		loading = true;
		try {
			const { data: room, error: roomError } = await supabase
				.from('rooms')
				.insert({
					name: newRoomName,
					created_by: user.id
				})
				.select('id')
				.single();

			if (roomError) throw roomError;

			const { data: round, error: roundError } = await supabase
				.from('quiz_rounds')
				.insert({
					room_id: room.id,
					round_number: 1
				})
				.select('id')
				.single();

			if (roundError) throw roundError;

			const { error: updateError } = await supabase
				.from('rooms')
				.update({ current_round: round.id })
				.eq('id', room.id);

			if (updateError) throw updateError;

			newRoomName = '';
			toast.success('Pomyślnie utworzono pokój');
		} catch (error) {
			toast.error('Nie udało się utworzyć pokoju: ' + error.message);
		} finally {
			loading = false;
		}
	}

	async function toggleAdditionalAnswers(roomId, currentValue) {
		if (profile.role !== 'admin') return;

		const { error } = await supabase
			.from('rooms')
			.update({ additional_answers_enabled: !currentValue })
			.eq('id', roomId);

		if (error) {
			toast.error('Nie udało się zaktualizować ustawienia');
		} else {
			toast.success('Zaktualizowano ustawienie');
		}
	}

	async function deleteRoom(roomId) {
		if (profile.role !== 'admin') return;

		const { error } = await supabase.from('rooms').delete().eq('id', roomId);

		if (error) {
			toast.error('Nie udało się usunąć pokoju');
		} else {
			toast.success('Usunięto pokój');
		}
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
				<p class="text-sm text-gray-400">Admin Dashboard</p>
			</div>
		</div>
	</div>

	<Card.Root class="border-gray-800 bg-gray-900">
		<Card.Header>
			<Card.Title class="text-white">Pokoje</Card.Title>
		</Card.Header>
		<Card.Content>
			<form on:submit={handleCreateRoom} class="mb-6 flex gap-4">
				<Input
					name="roomName"
					bind:value={newRoomName}
					placeholder="Nazwa pokoju"
					required
					class="border-gray-700 bg-gray-800 text-gray-100 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0"
				/>
				<Button
					type="submit"
					class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
					disabled={loading}
				>
					{loading ? 'Tworzenie...' : 'Stwórz Pokój'}
				</Button>
			</form>

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
							<Table.Cell class="text-gray-200">{room.name}</Table.Cell>
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
								<Button
									variant="outline"
									size="sm"
									class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
									on:click={() => (modalOpen = true)}
								>
									Konfiguruj pola odpowiedzi
								</Button>
								<Button
									variant="outline"
									size="sm"
									class="ml-2 border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
									href="/admin/rooms/{room.id}/answers"
								>
									Konfiguruj odpowiedzi rund
								</Button>
								<AnswerFieldsModal
									open={modalOpen}
									roomId={room.id}
									enabledFields={room.enabled_fields}
									{supabase}
									onOpenChange={(open) => (modalOpen = open)}
								/>
							</Table.Cell>
							<Table.Cell>
								<div class="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
										href="/admin/rooms/{room.id}"
									>
										Wejdź
									</Button>
									<Button
										variant="destructive"
										size="sm"
										class="border border-red-900 bg-gray-900 text-red-400 hover:bg-gray-800"
										on:click={() => deleteRoom(room.id)}
									>
										Usuń
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>

<style>
	*:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 2px hsl(var(--background)),
			0 0 0 4px hsl(var(--ring));
	}
</style>
