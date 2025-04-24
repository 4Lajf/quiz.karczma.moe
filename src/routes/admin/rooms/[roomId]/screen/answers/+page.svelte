<script>
	//src/routes/admin/rooms/[roomId]/screen/answers/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Plus, Trash2, Upload, Image, Check, X } from 'lucide-svelte';
	import Autocomplete from '$lib/components/player/Autocomplete.svelte';
	import { Input } from '$lib/components/ui/input';
	import { resizeImage } from '$lib/utils/imageResizer';

	export let data;
	$: ({ supabase, room, rounds, currentRound, roundImages, playerAnswers } = data);

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

	// Function to award points based on potential_points
	async function awardPotentialPoints(answerId, playerName, potentialPoints) {
		try {
			// Get current player score
			const { data: playerData, error: playerError } = await supabase
				.from('players')
				.select('score')
				.eq('room_id', room.id)
				.eq('name', playerName)
				.single();

			if (playerError) throw playerError;

			// Calculate new score
			const newScore = playerData.score + potentialPoints;

			// Update player score
			const { error: updateError } = await supabase
				.from('players')
				.update({ score: newScore })
				.eq('room_id', room.id)
				.eq('name', playerName);

			if (updateError) throw updateError;

			// Clear potential_points from the answer
			const { error: answerError } = await supabase
				.from('answers')
				.update({ potential_points: null })
				.eq('id', answerId);

			if (answerError) throw answerError;

			toast.success(`Dodano ${potentialPoints} punktów dla ${playerName}`);
			await invalidateAll();
		} catch (error) {
			toast.error(`Nie udało się przyznać punktów: ${error.message}`);
		}
	}

	// Function to deduct points based on potential_points
	async function deductPotentialPoints(answerId, playerName, potentialPoints) {
		try {
			// Get current player score
			const { data: playerData, error: playerError } = await supabase
				.from('players')
				.select('score')
				.eq('room_id', room.id)
				.eq('name', playerName)
				.single();

			if (playerError) throw playerError;

			// Calculate new score
			const newScore = playerData.score - potentialPoints;

			// Update player score
			const { error: updateError } = await supabase
				.from('players')
				.update({ score: newScore })
				.eq('room_id', room.id)
				.eq('name', playerName);

			if (updateError) throw updateError;

			// Clear potential_points from the answer
			const { error: answerError } = await supabase
				.from('answers')
				.update({ potential_points: null })
				.eq('id', answerId);

			if (answerError) throw answerError;

			toast.success(`Odjęto ${potentialPoints} punktów dla ${playerName}`);
			await invalidateAll();
		} catch (error) {
			toast.error(`Nie udało się odjąć punktów: ${error.message}`);
		}
	}

	// Function to clear potential points without awarding or deducting
	async function clearPotentialPoints(answerId) {
		try {
			// Clear potential_points from the answer
			const { error: answerError } = await supabase
				.from('answers')
				.update({ potential_points: null })
				.eq('id', answerId);

			if (answerError) throw answerError;

			toast.success('Potencjalne punkty wyczyszczone');
			await invalidateAll();
		} catch (error) {
			toast.error(`Nie udało się wyczyścić punktów: ${error.message}`);
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
	// Updated to use Pixeldrain instead of Supabase storage
	async function uploadImage(roundNumber) {
		if (!files[roundNumber]) return;

		uploading[roundNumber] = true;
		uploading = { ...uploading }; // Trigger reactivity

		try {
			let file = files[roundNumber];

			// Check file size - Vercel has a 4.5MB limit for serverless functions
			const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5MB
			if (file.size > MAX_SIZE) {
				console.log(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the limit. Resizing...`);

				try {
					// Resize the image
					file = await resizeImage(file, {
						maxWidth: 1200,
						maxHeight: 1200,
						quality: 0.8,
						format: 'jpeg'
					});

					console.log(`Image resized successfully. New size: ${(file.size / 1024).toFixed(2)}KB`);

					// Check if the resized image is still too large
					if (file.size > MAX_SIZE) {
						// Try again with lower quality
						file = await resizeImage(file, {
							maxWidth: 800,
							maxHeight: 800,
							quality: 0.6,
							format: 'jpeg'
						});

						console.log(`Image resized again. New size: ${(file.size / 1024).toFixed(2)}KB`);

						if (file.size > MAX_SIZE) {
							throw new Error(`File is still too large after resizing. Please use an image editor to reduce the size.`);
						}
					}
				} catch (resizeError) {
					console.error('Error resizing image:', resizeError);
					throw new Error(`Failed to resize image: ${resizeError.message}`);
				}
			}

			// Create form data for the upload
			const formData = new FormData();
			formData.append('file', file);

			console.log(`Uploading file ${file.name} to Pixeldrain (size: ${(file.size / 1024).toFixed(2)}KB)...`);

			// Upload to Pixeldrain via our API endpoint
			const response = await fetch('/api/upload-to-pixeldrain', {
				method: 'POST',
				body: formData
			});

			// Parse the response JSON
			const responseData = await response.json();

			if (!response.ok) {
				throw new Error(responseData.error || 'Upload failed');
			}

			const url = responseData.url;
			console.log(`File uploaded successfully. URL: ${url}`);

			// Get file extension and create a filename
			const fileExt = file.name.split('.').pop();
			const fileName = `round_${roundNumber}.${fileExt}`;

			// Find the correct answer for this round
			const roundId = rounds.find(r => r.round_number === roundNumber)?.id;
			if (!roundId) {
				throw new Error(`Round with number ${roundNumber} not found`);
			}

			const { data: existingAnswers, error: fetchError } = await supabase
				.from('correct_answers')
				.select('*')
				.eq('round_id', roundId);

			if (fetchError) throw fetchError;

			if (existingAnswers && existingAnswers.length > 0) {
				// Update existing answer with the image URL
				console.log(`Updating existing answer (ID: ${existingAnswers[0].id}) with image URL`);
				const { error: updateError } = await supabase
					.from('correct_answers')
					.update({ image: url })
					.eq('id', existingAnswers[0].id);

				if (updateError) throw updateError;
			} else {
				// Create new answer with the image URL
				console.log(`Creating new answer for round ${roundId} with image URL`);
				const { error: insertError } = await supabase
					.from('correct_answers')
					.insert({
						round_id: roundId,
						content: '',
						image: url
					});

				if (insertError) throw insertError;
			}

			// Update roundImages state
			roundImages[roundNumber] = {
				filename: fileName,
				url: url
			};

			// Clear file input
			files[roundNumber] = null;
			files = { ...files };

			toast.success('Obraz został przesłany');
			await invalidateAll();
		} catch (error) {
			console.error('Error uploading image:', error);
			toast.error('Błąd przesyłania: ' + error.message);
		} finally {
			uploading[roundNumber] = false;
			uploading = { ...uploading };
		}
	}

	// Delete image for a round
	// Updated to clear the image URL from the database instead of deleting from Supabase storage
	async function deleteImage(roundNumber) {
		if (!roundImages[roundNumber]) return;

		try {
			// Find the correct answer for this round
			const { data: existingAnswers, error: fetchError } = await supabase
				.from('correct_answers')
				.select('*')
				.eq('round_id', rounds.find(r => r.round_number === roundNumber).id);

			if (fetchError) throw fetchError;

			if (existingAnswers && existingAnswers.length > 0) {
				// Update existing answer to clear the image URL
				const { error: updateError } = await supabase
					.from('correct_answers')
					.update({ image: null })
					.eq('id', existingAnswers[0].id);

				if (updateError) throw updateError;
			}

			// Update UI state
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
	<div class="container p-6 mx-auto">
		<Card.Root class="mb-6 bg-gray-900 border-gray-800">
			<Card.Header>
				<div class="flex items-center justify-between">
					<div class="!-mt-4 mb-2 flex items-center gap-4">
						<Card.Title class="text-white">Ustawienia pokoju: {room.name}</Card.Title>
					</div>

					<div class="!-mt-4 mb-2 flex items-center gap-2">
						<Button href="/admin" variant="outline" class="text-gray-300 bg-gray-800 border-gray-700 hover:bg-gray-700">Powrót</Button>
					</div>
				</div>
			</Card.Header>
		</Card.Root>

		<!-- Display all rounds -->
		<div class="space-y-8">
			{#each sortedRounds as round (round.id)}
				<Card.Root class="bg-gray-900 border border-gray-800">
					<Card.Header>
						<Card.Title class="text-white">Runda {round.round_number}</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<!-- Left side: Image upload -->
							<div class="space-y-4">
								<h3 class="text-lg font-medium text-gray-300">Screen</h3>

								{#if roundImages[round.round_number]}
									<div class="relative overflow-hidden border border-gray-700 rounded-lg">
										<img src={roundImages[round.round_number].url} alt={`Round ${round.round_number}`} class="w-full" />
										<Button on:click={() => deleteImage(round.round_number)} class="absolute right-2 top-2 bg-red-600/70 hover:bg-red-700" size="sm">
											<Trash2 class="w-4 h-4" />
										</Button>
									</div>
								{:else}
									<div class="flex items-center justify-center border border-gray-700 border-dashed rounded-lg h-52 bg-gray-800/50">
										<div class="text-center">
											<Image class="w-12 h-12 mx-auto text-gray-500" />
											<p class="mt-2 text-sm text-gray-400">Nie załadowano żadnego pliku</p>
										</div>
									</div>
								{/if}

								<div class="flex flex-col gap-2">
									<input type="file" id="file-{round.round_number}" accept="image/*" on:change={(e) => handleFileSelect(round.round_number, e)} class="hidden" />
									<label for="file-{round.round_number}" class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-200 transition-colors bg-gray-800 rounded-md cursor-pointer ring-offset-background hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
										<Upload class="w-4 h-4 mr-2" />
										Wybierz plik
									</label>

									{#if files[round.round_number]}
										<Button on:click={() => uploadImage(round.round_number)} disabled={uploading[round.round_number]} class="text-white bg-gray-800 border border-gray-700 hover:bg-gray-700">
											{#if uploading[round.round_number]}
												<div class="w-4 h-4 mr-2 border-2 border-gray-400 rounded-full animate-spin border-t-transparent"></div>
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

										<Button on:click={() => saveAnswer(round.id)} disabled={savingAnswers[round.id]} class="w-full text-white bg-gray-800 border border-gray-700 hover:bg-gray-700">
											{#if savingAnswers[round.id]}
												<div class="w-4 h-4 mr-2 border-2 border-gray-400 rounded-full animate-spin border-t-transparent"></div>
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

		<!-- Player Answers Section -->
		{#if playerAnswers && playerAnswers.length > 0}
			<Card.Root class="mt-8 bg-gray-900 border-gray-800">
				<Card.Header>
					<Card.Title class="text-white">Odpowiedzi graczy</Card.Title>
				</Card.Header>
				<Card.Content>
					<Table.Root>
						<Table.Header>
							<Table.Row class="border-gray-800">
								<Table.Head class="text-gray-300">Gracz</Table.Head>
								<Table.Head class="text-gray-300">Odpowiedź</Table.Head>
								<Table.Head class="text-gray-300">Czas</Table.Head>
								<Table.Head class="text-gray-300">Potencjalne punkty</Table.Head>
								<Table.Head class="text-gray-300">Akcje</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each playerAnswers as answer}
								<Table.Row class="border-gray-800 hover:bg-gray-800/30">
									<Table.Cell class="font-medium text-gray-200">{answer.player_name}</Table.Cell>
									<Table.Cell class="text-gray-200">
										{#if answer.content}
											{answer.content}
										{:else}
											<span class="italic text-gray-400">Zgadywanie</span>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-gray-200">
										{new Date(answer.created_at).toLocaleTimeString()}
									</Table.Cell>
									<Table.Cell>
										{#if answer.potential_points}
											<span class="px-2 py-1 rounded-md bg-amber-900/30 text-amber-400">{answer.potential_points} pkt</span>
										{:else}
											<span class="text-gray-400">-</span>
										{/if}
									</Table.Cell>
									<Table.Cell>
										{#if answer.potential_points}
											<div class="flex gap-2">
												<Button size="sm" on:click={() => awardPotentialPoints(answer.id, answer.player_name, answer.potential_points)} class="text-white bg-green-600/50 hover:bg-green-500/50">
													<Check class="w-3 h-3 mr-1" />
													Przyznaj
												</Button>
												<Button size="sm" on:click={() => deductPotentialPoints(answer.id, answer.player_name, answer.potential_points)} class="text-white bg-red-600/50 hover:bg-red-500/50">
													<X class="w-3 h-3 mr-1" />
													Odejmij
												</Button>
												<Button size="sm" on:click={() => clearPotentialPoints(answer.id)} class="text-white bg-gray-600/50 hover:bg-gray-500/50">
													Pomiń
												</Button>
											</div>
										{:else}
											<span class="text-gray-400">-</span>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
			</Card.Root>
		{/if}

		<!-- Add and Delete Last Round buttons -->
		<div class="flex justify-between mt-8">
			<Button on:click={createNewRound} class="text-white bg-gray-800 border border-gray-700 hover:bg-gray-700">
				<Plus class="w-4 h-4 mr-2" />
				Dodaj nową rundę
			</Button>

			<Button on:click={deleteLastRound} class={`border ${confirmingDelete ? 'border-red-700 bg-red-900/30' : 'border-gray-700 bg-gray-800'} text-white hover:bg-gray-700`}>
				<Trash2 class="w-4 h-4 mr-2" />
				{confirmingDelete ? 'Potwierdź usunięcie ostatniej rundy' : 'Usuń ostatnią rundę'}
			</Button>
		</div>
	</div>
</div>
