<script>
	//src/routes/admin/rooms/[roomId]/answers/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import ConfigureRoundAnswers from '$lib/components/admin/ConfigureRoundAnswers.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Plus, Trash2 } from 'lucide-svelte';

	export let data;
	$: ({ supabase, room, rounds, currentRound } = data);

	let selectedRoundId = currentRound?.id;
	let channel;
	let confirmingDelete = false;

	function handleRoundChange(event) {
		selectedRoundId = event.target.value;
	}

	async function createNewRound() {
		try {
			// Find the highest round number
			const highestRound = rounds.reduce(
				(max, round) => (round.round_number > max ? round.round_number : max),
				0
			);

			const nextRoundNumber = highestRound + 1;

			const { data: newRound, error } = await supabase
				.from('quiz_rounds')
				.insert({
					room_id: room.id,
					round_number: nextRoundNumber
				})
				.select()
				.single();

			if (error) throw error;

			selectedRoundId = newRound.id;
			toast.success(`Utworzono rundę ${nextRoundNumber}`);
			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się utworzyć rundy: ' + error.message);
		}
	}

	async function deleteCurrentRound() {
		if (!selectedRoundId) return;

		try {
			// Don't allow deleting if this is the only round
			if (rounds.length <= 1) {
				toast.error('Nie można usunąć jedynej rundy');
				return;
			}

			if (!confirmingDelete) {
				confirmingDelete = true;
				setTimeout(() => {
					confirmingDelete = false;
				}, 3000);
				return;
			}

			confirmingDelete = false;

			// Get the current round data
			const currentRound = rounds.find((r) => r.id === selectedRoundId);
			if (!currentRound) throw new Error('Round not found');

			// Find a round to switch to
			let switchToRound;
			if (currentRound.round_number > 1) {
				// Prefer previous round
				switchToRound = rounds.find((r) => r.round_number === currentRound.round_number - 1);
			} else {
				// Otherwise take the next round
				switchToRound = rounds.find((r) => r.round_number > currentRound.round_number);
			}

			if (!switchToRound) throw new Error('No alternative round found');

			// If this is the current room round, update the room first
			if (room.current_round === selectedRoundId) {
				const { error: updateError } = await supabase
					.from('rooms')
					.update({ current_round: switchToRound.id })
					.eq('id', room.id);

				if (updateError) throw updateError;
			}

			// Delete the round
			const { error } = await supabase.from('quiz_rounds').delete().eq('id', selectedRoundId);

			if (error) throw error;

			selectedRoundId = switchToRound.id;
			toast.success(`Usunięto rundę ${currentRound.round_number}`);
			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się usunąć rundy: ' + error.message);
		}
	}

	onMount(() => {
		channel = supabase
			.channel(`room-answers:${room.id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'correct_answers',
					filter: `round_id=eq.${selectedRoundId}`
				},
				() => invalidate('answers')
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'quiz_rounds',
					filter: `room_id=eq.${room.id}`
				},
				async () => await invalidateAll()
			)
			.subscribe();
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="min-h-screen bg-gray-950">
	<div class="container mx-auto p-6">
		<Card.Root class="mb-6 border-gray-800 bg-gray-900">
			<Card.Header>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-4">
						<Card.Title class="text-white">{room.name}</Card.Title>
						<select
							bind:value={selectedRoundId}
							on:change={handleRoundChange}
							class="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-200"
						>
							{#each rounds as round}
								<option value={round.id}>
									Round {round.round_number}
									{round.id === room.current_round ? '(Current)' : ''}
								</option>
							{/each}
						</select>
					</div>

					<div class="flex items-center gap-2">
						<Button
							on:click={createNewRound}
							class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
						>
							<Plus class="mr-2 h-4 w-4" />
							New Round
						</Button>

						<Button
							on:click={deleteCurrentRound}
							class={`border ${confirmingDelete ? 'border-red-700 bg-red-900/30' : 'border-gray-700 bg-gray-800'} text-white hover:bg-gray-700`}
						>
							<Trash2 class="mr-2 h-4 w-4" />
							{confirmingDelete ? 'Confirm Delete' : 'Delete Round'}
						</Button>

						<Button
							href="/admin/rooms/{room.id}"
							variant="outline"
							class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
						>
							Back to Room
						</Button>
					</div>
				</div>
			</Card.Header>
		</Card.Root>

		<ConfigureRoundAnswers {supabase} roomId={room.id} roundId={selectedRoundId} {room} />
	</div>
</div>
