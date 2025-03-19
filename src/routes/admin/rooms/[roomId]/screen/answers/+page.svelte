<script>
	//src/routes/admin/rooms/[roomId]/screen/answers/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Plus, Trash2, Upload, Image } from 'lucide-svelte';
	import Autocomplete from '$lib/components/player/Autocomplete.svelte';
	import { Input } from '$lib/components/ui/input';

	export let data;
	$: ({ supabase, room, rounds, currentRound, roundImages } = data);

	let channel;
	let confirmingDelete = false;

	// Image upload state
	let files = {};
	let uploading = {};

	// Answer editing state
	let answers = {};
	let savingAnswers = {};

	// Batch import state
	let batchTitles = '';
	let batchImportLoading = false;

	// Sort rounds by round_number
	$: sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);

	// Load existing answers for each round
	async function loadAnswers(roundId) {
		if (answers[roundId]) return;

		try {
			const { data: existingAnswers, error } = await supabase.from('correct_answers').select('*').eq('round_id', roundId);

			if (error) throw error;

			answers[roundId] = existingAnswers?.[0]?.content || '';
			answers = { ...answers }; // Trigger reactivity
		} catch (error) {
			console.error('Error loading answers:', error);
		}
	}

	// Save answer for a round
	async function saveAnswer(roundId) {
		if (!answers[roundId] || !answers[roundId].trim()) {
			toast.error('Wprowadź nazwę anime');
			return;
		}

		savingAnswers[roundId] = true;
		savingAnswers = { ...savingAnswers }; // Trigger reactivity

		try {
			// Check if answer already exists
			const { data: existingAnswers, error: fetchError } = await supabase.from('correct_answers').select('*').eq('round_id', roundId);

			if (fetchError) throw fetchError;

			if (existingAnswers && existingAnswers.length > 0) {
				// Update existing answer
				const { error: updateError } = await supabase.from('correct_answers').update({ content: answers[roundId].trim() }).eq('round_id', roundId);

				if (updateError) throw updateError;
			} else {
				// Create new answer
				const { error: insertError } = await supabase.from('correct_answers').insert({
					round_id: roundId,
					content: answers[roundId].trim()
				});

				if (insertError) throw insertError;
			}

			toast.success('Zapisano odpowiedź');
		} catch (error) {
			toast.error('Błąd: ' + error.message);
		} finally {
			savingAnswers[roundId] = false;
			savingAnswers = { ...savingAnswers }; // Trigger reactivity
		}
	}

	// Handle file selection for a round
	function handleFileSelect(roundNumber, e) {
		const selectedFile = e.target.files[0];
		if (!selectedFile) return;

		files[roundNumber] = selectedFile;
		files = { ...files }; // Trigger reactivity
	}

	// Upload image for a round
	// In the +page.svelte file, update the uploadImage function
	async function uploadImage(roundNumber) {
		if (!files[roundNumber]) return;

		uploading[roundNumber] = true;
		uploading = { ...uploading }; // Trigger reactivity

		try {
			// Get file extension
			const fileExt = files[roundNumber].name.split('.').pop();
			const fileName = `round_${roundNumber}.${fileExt}`;
			const filePath = `quiz/${room.id}/${fileName}`;

			// Upload to Supabase Storage
			const { error: uploadError } = await supabase.storage.from('screens').upload(filePath, files[roundNumber], {
				cacheControl: '3600',
				upsert: true
			});

			if (uploadError) throw uploadError;

			// Get signed URL instead of public URL
			const {
				data: { signedUrl },
				error: signedUrlError
			} = await supabase.storage.from('screens').createSignedUrl(filePath, 60 * 60); // 1 hour expiry

			if (signedUrlError) throw signedUrlError;

			// Update roundImages state
			roundImages[roundNumber] = {
				filename: fileName,
				url: signedUrl
			};

			// Clear file input
			files[roundNumber] = null;
			files = { ...files };

			toast.success('Obraz został przesłany');
			await invalidateAll();
		} catch (error) {
			toast.error('Błąd przesyłania: ' + error.message);
		} finally {
			uploading[roundNumber] = false;
			uploading = { ...uploading };
		}
	}

	// Delete image for a round
	async function deleteImage(roundNumber) {
		if (!roundImages[roundNumber]) return;

		try {
			const filePath = `quiz/${room.id}/${roundImages[roundNumber].filename}`;

			const { error } = await supabase.storage.from('screens').remove([filePath]);

			if (error) throw error;

			delete roundImages[roundNumber];
			roundImages = { ...roundImages }; // Trigger reactivity

			toast.success('Obraz został usunięty');
			await invalidateAll();
		} catch (error) {
			toast.error('Błąd usuwania: ' + error.message);
		}
	}

	async function createNewRound() {
		try {
			// Find the highest round number
			const highestRound = rounds.reduce((max, round) => (round.round_number > max ? round.round_number : max), 0);

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

			toast.success(`Utworzono rundę ${nextRoundNumber}`);
			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się utworzyć rundy: ' + error.message);
		}
	}

	async function deleteLastRound() {
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

			// Get the round with the highest number
			const sortedRounds = [...rounds].sort((a, b) => b.round_number - a.round_number);
			const lastRound = sortedRounds[0];

			// If this is the current room round, update the room first
			if (room.current_round === lastRound.id) {
				const previousRound = rounds.find((r) => r.round_number === lastRound.round_number - 1);
				if (!previousRound) throw new Error('No previous round found');

				const { error: updateError } = await supabase.from('rooms').update({ current_round: previousRound.id }).eq('id', room.id);

				if (updateError) throw updateError;
			}

			// Delete the round
			const { error } = await supabase.from('quiz_rounds').delete().eq('id', lastRound.id);

			if (error) throw error;

			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się usunąć rundy: ' + error.message);
		}
	}

	onMount(() => {
		// Load answers for the first few rounds
		sortedRounds.slice(0, 5).forEach((round) => {
			loadAnswers(round.id);
		});

		channel = supabase
			.channel(`room-screen-answers:${room.id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'correct_answers'
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
					<div class="!-mt-4 mb-2 flex items-center gap-4">
						<Card.Title class="text-white">Ustawienia pokoju: {room.name}</Card.Title>
					</div>

					<div class="!-mt-4 mb-2 flex items-center gap-2">
						<Button href="/admin" variant="outline" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">Powrót</Button>
					</div>
				</div>
			</Card.Header>
		</Card.Root>

		<!-- Display all rounds -->
		<div class="space-y-8">
			{#each sortedRounds as round (round.id)}
				<Card.Root class="border border-gray-800 bg-gray-900">
					<Card.Header>
						<Card.Title class="text-white">Runda {round.round_number}</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<!-- Left side: Image upload -->
							<div class="space-y-4">
								<h3 class="text-lg font-medium text-gray-300">Screen</h3>

								{#if roundImages[round.round_number]}
									<div class="relative overflow-hidden rounded-lg border border-gray-700">
										<img src={roundImages[round.round_number].url} alt={`Round ${round.round_number}`} class="w-full" />
										<Button on:click={() => deleteImage(round.round_number)} class="absolute right-2 top-2 bg-red-600/70 hover:bg-red-700" size="sm">
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								{:else}
									<div class="flex h-52 items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-800/50">
										<div class="text-center">
											<Image class="mx-auto h-12 w-12 text-gray-500" />
											<p class="mt-2 text-sm text-gray-400">Nie załadowano żadnego pliku</p>
										</div>
									</div>
								{/if}

								<div class="flex flex-col gap-2">
									<input type="file" id="file-{round.round_number}" accept="image/*" on:change={(e) => handleFileSelect(round.round_number, e)} class="hidden" />
									<label for="file-{round.round_number}" class="inline-flex cursor-pointer items-center justify-center rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 ring-offset-background transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
										<Upload class="mr-2 h-4 w-4" />
										Wybierz plik
									</label>

									{#if files[round.round_number]}
										<Button on:click={() => uploadImage(round.round_number)} disabled={uploading[round.round_number]} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
											{#if uploading[round.round_number]}
												<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
												Przesyłanie...
											{:else}
												Prześlij {files[round.round_number].name}
											{/if}
										</Button>
									{/if}
								</div>
							</div>

							<!-- Right side: Anime configuration -->
							<div class="space-y-4">
								<h3 class="text-lg font-medium text-gray-300">Odpowiedź</h3>
								<div>
									<div class="space-y-4">
										<Autocomplete bind:value={answers[round.id]} placeholder="Nazwa anime" index="animeTitles" searchKey="animeTitle" type="anime" />

										<Button on:click={() => saveAnswer(round.id)} disabled={savingAnswers[round.id]} class="w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
											{#if savingAnswers[round.id]}
												<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
												Zapisywanie...
											{:else}
												Zapisz odpowiedź
											{/if}
										</Button>
									</div>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>

		<!-- Add and Delete Last Round buttons -->
		<div class="mt-8 flex justify-between">
			<Button on:click={createNewRound} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
				<Plus class="mr-2 h-4 w-4" />
				Dodaj nową rundę
			</Button>

			<Button on:click={deleteLastRound} class={`border ${confirmingDelete ? 'border-red-700 bg-red-900/30' : 'border-gray-700 bg-gray-800'} text-white hover:bg-gray-700`}>
				<Trash2 class="mr-2 h-4 w-4" />
				{confirmingDelete ? 'Potwierdź usunięcie ostatniej rundy' : 'Usuń ostatnią rundę'}
			</Button>
		</div>
	</div>
</div>
