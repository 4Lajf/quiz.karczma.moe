<script>
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { Check, X, Plus, Trash2 } from 'lucide-svelte';
	import Autocomplete from '$lib/components/player/Autocomplete.svelte';

	export let supabase;
	export let roundId;
	export let room;

	let answers = [];
	let newAnswer = '';
	let newSongTitle = '';
	let newSongArtist = '';
	let newOther = '';
	let loading = false;
	let currentRound = null;
	let channel;
	let roundsToAdd = 1;
	let addingRounds = false;

	async function loadAnswers() {
		if (!roundId) return [];

		const { data, error } = await supabase
			.from('correct_answers')
			.select('*')
			.eq('round_id', roundId)
			.order('created_at', { ascending: true });

		if (error) {
			toast.error('Nie udało się załadować odpowiedzi');
			return [];
		}

		answers = data || [];
		return data;
	}

	async function loadCurrentRound() {
		if (!roundId) return null;

		const { data, error } = await supabase
			.from('quiz_rounds')
			.select('*')
			.eq('id', roundId)
			.single();

		if (error) {
			console.error('Failed to load current round:', error);
			return null;
		}

		currentRound = data;
		return data;
	}

	async function fetchRelatedTitles(selectedTitle) {
		try {
			// Fetch the anime title data from the API
			const response = await fetch(
				`/api/search/substring?q=${encodeURIComponent(selectedTitle)}&type=anime`
			);
			if (!response.ok) throw new Error('Failed to fetch related titles');

			const data = await response.json();
			const hits = data.hits || [];

			// Look for exact match or closest match
			const matchingAnime = hits.find(
				(hit) =>
					hit.document.displayTitle.toLowerCase() === selectedTitle.toLowerCase() ||
					hit.document.romajiTitle?.toLowerCase() === selectedTitle.toLowerCase() ||
					hit.document.englishTitle?.toLowerCase() === selectedTitle.toLowerCase() ||
					(hit.document.altTitles || []).some(
						(alt) => alt.toLowerCase() === selectedTitle.toLowerCase()
					)
			);

			if (matchingAnime) {
				// Collect all related titles
				const titles = [];

				// Add English title if available and different from selected
				if (
					matchingAnime.document.englishTitle &&
					matchingAnime.document.englishTitle.toLowerCase() !== selectedTitle.toLowerCase()
				) {
					titles.push(matchingAnime.document.englishTitle);
				}

				// Add Romaji title if available and different from selected
				if (
					matchingAnime.document.romajiTitle &&
					matchingAnime.document.romajiTitle.toLowerCase() !== selectedTitle.toLowerCase()
				) {
					titles.push(matchingAnime.document.romajiTitle);
				}

				// Add alternative titles if available
				if (matchingAnime.document.altTitles) {
					for (const altTitle of matchingAnime.document.altTitles) {
						if (altTitle && altTitle.toLowerCase() !== selectedTitle.toLowerCase()) {
							titles.push(altTitle);
						}
					}
				}

				return titles;
			}

			return [];
		} catch (error) {
			console.error('Error fetching related titles:', error);
			return [];
		}
	}

	async function createNewRounds() {
		if (roundsToAdd < 1) {
			toast.error('Wprowadź prawidłową liczbę rund do dodania');
			return;
		}

		if (roundsToAdd > 20) {
			if (!confirm(`Czy na pewno chcesz dodać ${roundsToAdd} rund naraz?`)) {
				return;
			}
		}

		addingRounds = true;
		try {
			// Find the highest round number in the room
			const { data: existingRounds, error: queryError } = await supabase
				.from('quiz_rounds')
				.select('round_number')
				.eq('room_id', room.id)
				.order('round_number', { ascending: false });

			if (queryError) throw queryError;

			const highestRound = existingRounds.length > 0 ? existingRounds[0].round_number : 0;

			let lastRoundId = null;
			let addedCount = 0;

			// Insert multiple rounds in sequence
			for (let i = 1; i <= roundsToAdd; i++) {
				const nextRoundNumber = highestRound + i;

				const { data: newRound, error } = await supabase
					.from('quiz_rounds')
					.insert({
						room_id: room.id,
						round_number: nextRoundNumber
					})
					.select()
					.single();

				if (error) {
					console.error(`Failed to create round ${nextRoundNumber}:`, error);
					continue;
				}

				lastRoundId = newRound.id;
				addedCount++;
			}

			if (lastRoundId) {
				// Update the current component to use the last created round
				roundId = lastRoundId;
				await loadCurrentRound();
				await loadAnswers();

				// Update the room's current round to the last created round
				const { error: updateError } = await supabase
					.from('rooms')
					.update({ current_round: lastRoundId })
					.eq('id', room.id);

				if (updateError) {
					console.error('Failed to update room current round:', updateError);
				}
			}

			if (addedCount === 0) {
				toast.error('Nie udało się dodać rund');
			} else if (addedCount < roundsToAdd) {
				toast.warning(`Dodano ${addedCount} z ${roundsToAdd} rund`);
			} else {
				toast.success(
					`Dodano ${addedCount} now${addedCount > 1 ? 'e' : 'ą'} rund${addedCount > 1 ? 'y' : 'ę'}`
				);
			}

			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się stworzyć rund: ' + error.message);
		} finally {
			addingRounds = false;
		}
	}

	async function addAnswer() {
		if (!newAnswer.trim()) return;

		loading = true;
		try {
			// Check if round exists, if not create it
			if (!roundId) {
				// Find the highest round number in the room
				const { data: existingRounds, error: queryError } = await supabase
					.from('quiz_rounds')
					.select('round_number')
					.eq('room_id', room.id)
					.order('round_number', { ascending: false });

				if (queryError) throw queryError;

				const nextRoundNumber = existingRounds.length > 0 ? existingRounds[0].round_number + 1 : 1;

				const { data: newRound, error: roundError } = await supabase
					.from('quiz_rounds')
					.insert({
						room_id: room.id,
						round_number: nextRoundNumber
					})
					.select()
					.single();

				if (roundError) throw roundError;
				roundId = newRound.id;
				currentRound = newRound;

				// Notify the parent component that roundId has changed
				await invalidateAll();
			}

			const extraFields = {};

			if (room.enabled_fields?.song_title && newSongTitle) {
				extraFields.song_title = newSongTitle;
			}
			if (room.enabled_fields?.song_artist && newSongArtist) {
				extraFields.song_artist = newSongArtist;
			}
			if (room.enabled_fields?.other && newOther) {
				extraFields.other = newOther;
			}

			// Generate hint for this answer
			const processedAnswer = newAnswer.trim();
			const hint = await generateHint(processedAnswer);

			// Add main answer first with pre-calculated hint
			const { data, error } = await supabase
				.from('correct_answers')
				.insert({
					round_id: roundId,
					content: processedAnswer,
					extra_fields: Object.keys(extraFields).length > 0 ? extraFields : null,
					hint: hint
				})
				.select()
				.single();

			if (error) throw error;

			// Update room's current round if needed
			const { error: updateError } = await supabase
				.from('rooms')
				.update({ current_round: roundId })
				.eq('id', room.id);

			if (updateError) throw updateError;

			answers = [...answers, data];
			toast.success('Dodano odpowiedź');

			// Now fetch and add related titles
			const relatedTitles = await fetchRelatedTitles(newAnswer);
			let addedCount = 0;

			for (const title of relatedTitles) {
				// Check if this title is already in answers list
				const isDuplicate = answers.some((a) => a.content.toLowerCase() === title.toLowerCase());
				if (!isDuplicate) {
					// Generate hint for this related title
					const relatedHint = await generateHint(title.trim());

					const { data: relatedData, error: relatedError } = await supabase
						.from('correct_answers')
						.insert({
							round_id: roundId,
							content: title.trim(),
							extra_fields: Object.keys(extraFields).length > 0 ? extraFields : null,
							hint: relatedHint
						})
						.select()
						.single();

					if (relatedError) {
						console.error('Failed to add related title:', relatedError);
					} else {
						answers = [...answers, relatedData];
						addedCount++;
					}
				}
			}

			if (addedCount > 0) {
				toast.success(`Dodano ${addedCount} powiązan${addedCount > 1 ? 'e tytuły' : 'y tytuł'}`);
			}

			// Clear form inputs
			newAnswer = '';
			newSongTitle = '';
			newSongArtist = '';
			newOther = '';
		} catch (error) {
			toast.error('Failed to add answer: ' + error.message);
		} finally {
			loading = false;
		}
	}

	// Add this function to generate hints
	async function generateHint(title) {
		// Count actual characters to potentially reveal (excluding spaces)
		const nonSpaceChars = title.replace(/\s/g, '').length;

		// Calculate characters to reveal (balanced approach)
		let charsToReveal;
		if (nonSpaceChars <= 1) {
			// Special case for single-character titles
			charsToReveal = 1;
		} else if (nonSpaceChars <= 2) {
			// Special case for two-character titles
			charsToReveal = 1;
		} else {
			// Logarithmic scaling for all other lengths
			// Formula: 1.6 * ln(length + 1)
			charsToReveal = Math.ceil(1.6 * Math.log(nonSpaceChars + 1));

			// Add a safety cap to ensure we never reveal too much
			const maxRevealPercentage = 0.35; // Never reveal more than 35%
			const percentageCap = Math.floor(nonSpaceChars * maxRevealPercentage);
			charsToReveal = Math.min(charsToReveal, percentageCap);

			// Ensure we always reveal at least one character
			charsToReveal = Math.max(1, charsToReveal);
		}

		// Process the answer to create the hint
		const words = title.split(' ');
		const hintWords = [];

		// Prepare array of character positions to potentially reveal (excluding spaces)
		const allPositions = [];
		for (let i = 0; i < title.length; i++) {
			if (title[i] !== ' ') {
				allPositions.push(i);
			}
		}

		// Randomly select positions to reveal
		const positionsToReveal = [];
		while (positionsToReveal.length < charsToReveal && allPositions.length > 0) {
			const randomIndex = Math.floor(Math.random() * allPositions.length);
			positionsToReveal.push(allPositions[randomIndex]);
			allPositions.splice(randomIndex, 1);
		}

		// Process each word
		let currentPos = 0;
		for (const word of words) {
			let hintWord = '';

			for (let i = 0; i < word.length; i++) {
				const globalPos = currentPos + i;
				const char = word[i];

				if (positionsToReveal.includes(globalPos)) {
					// Reveal this character
					hintWord += char;
				} else if (/[a-zA-Z0-9]/.test(char)) {
					// Replace alphanumeric characters with underscore
					hintWord += '_';
				} else {
					// Replace special characters with a symbol
					hintWord += '•';
				}
			}

			hintWords.push(hintWord);
			currentPos += word.length + 1; // +1 for the space
		}

		// Join words with spaces for the final hint
		return hintWords.join(' ');
	}

	async function deleteAnswer(id) {
		try {
			const { error } = await supabase.from('correct_answers').delete().eq('id', id);

			if (error) throw error;

			answers = answers.filter((a) => a.id !== id);
			toast.success('Usunięto odpowiedź');
		} catch (error) {
			toast.error('Nie udało się usunąć odpowiedzi: ' + error.message);
		}
	}

	async function deleteAllAnswers() {
		if (!roundId || !answers.length) return;

		if (
			!confirm(`Czy na pewno chcesz usunąć wszystkie ${answers.length} odpowiedzi w tej rundzie?`)
		) {
			return;
		}

		try {
			const { error } = await supabase.from('correct_answers').delete().eq('round_id', roundId);

			if (error) throw error;

			answers = [];
			toast.success('Usunięto wszystkie odpowiedzi');
		} catch (error) {
			toast.error('Nie udało się usunąć odpowiedzi: ' + error.message);
		}
	}

	function setupChannel() {
		if (channel) channel.unsubscribe();

		if (!roundId) return;

		channel = supabase
			.channel(`correct-answers-${roundId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'correct_answers',
					filter: `round_id=eq.${roundId}`
				},
				() => loadAnswers()
			)
			.subscribe();
	}

	$: if (roundId) {
		loadAnswers();
		loadCurrentRound();
		setupChannel();
	}

	onMount(() => {
		if (roundId) {
			loadAnswers();
			loadCurrentRound();
			setupChannel();
		}
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="space-y-6">
	<Card.Root class="border-gray-800 bg-gray-900">
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title class="text-white">Konfiguruj odpowiedzi rund</Card.Title>
					<Card.Description class="text-gray-400">
						Dodaj lub usuń poprawne odpowiedzi dla rund<br />
						Pierwszą odpowiedź jaką dodasz będzie użyta do uzyskania podpowiedzi<br />liczba liter
						odsłonięta w zależności od długości
					</Card.Description>
				</div>

				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2">
						<Input
							type="number"
							min="1"
							max="100"
							bind:value={roundsToAdd}
							class="w-20 border-gray-700 bg-gray-800 text-gray-100 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0"
						/>
						<Button
							on:click={createNewRounds}
							disabled={addingRounds || roundsToAdd < 1}
							class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
						>
							<Plus class="mr-2 h-4 w-4" />
							{addingRounds
								? 'Dodawanie...'
								: roundsToAdd === 1
									? 'Dodaj rundę'
									: `Dodaj ${roundsToAdd} rund`}
						</Button>
					</div>

					{#if answers.length > 0}
						<Button
							variant="destructive"
							size="sm"
							on:click={deleteAllAnswers}
							class="border border-red-900 bg-gray-900 text-red-400 hover:bg-gray-800"
						>
							<Trash2 class="mr-2 h-4 w-4" />
							Usuń wszystkie odpowiedzi
						</Button>
					{/if}
				</div>
			</div>
		</Card.Header>

		<Card.Content>
			<form on:submit|preventDefault={addAnswer} class="space-y-4">
				<Autocomplete
					bind:value={newAnswer}
					placeholder="Nazwa anime"
					index="animeTitles"
					searchKey="animeTitle"
					type="anime"
					disabled={loading}
				/>

				{#if room.enabled_fields?.song_title}
					<Autocomplete
						bind:value={newSongTitle}
						placeholder="Tytuł piosenki"
						index="songNames"
						searchKey="songName"
						type="songs"
						disabled={loading}
					/>
				{/if}

				{#if room.enabled_fields?.song_artist}
					<Autocomplete
						bind:value={newSongArtist}
						placeholder="Artysta"
						index="artists"
						searchKey="artist"
						type="artists"
						disabled={loading}
					/>
				{/if}

				{#if room.enabled_fields?.other}
					<Input
						type="text"
						bind:value={newOther}
						placeholder="Inne"
						class="w-full border-gray-700 bg-gray-800 text-gray-100 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0"
					/>
				{/if}

				<Button
					type="submit"
					disabled={loading || !newAnswer.trim()}
					class="w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
				>
					<Plus class="mr-2 h-4 w-4" />
					Dodaj odpowiedź
				</Button>
			</form>

			<div class="mt-6">
				{#if answers.length === 0}
					<div class="p-6 text-center text-gray-400">Brak odpowiedzi dodanych dla tej rundy.</div>
				{:else}
					<Table.Root>
						<Table.Header>
							<Table.Row class="border-gray-800">
								<Table.Head class="text-gray-300">Nazwa anime</Table.Head>
								{#if room.enabled_fields?.song_title}
									<Table.Head class="text-gray-300">Tytuł piosenki</Table.Head>
								{/if}
								{#if room.enabled_fields?.song_artist}
									<Table.Head class="text-gray-300">Artysta</Table.Head>
								{/if}
								{#if room.enabled_fields?.other}
									<Table.Head class="text-gray-300">Inne</Table.Head>
								{/if}
								<Table.Head class="w-24 text-gray-300">Akcje</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each answers as answer}
								<Table.Row class="border-gray-800">
									<Table.Cell class="text-gray-200">{answer.content}</Table.Cell>
									{#if room.enabled_fields?.song_title}
										<Table.Cell class="text-gray-200">
											{answer.extra_fields?.song_title || '-'}
										</Table.Cell>
									{/if}
									{#if room.enabled_fields?.song_artist}
										<Table.Cell class="text-gray-200">
											{answer.extra_fields?.song_artist || '-'}
										</Table.Cell>
									{/if}
									{#if room.enabled_fields?.other}
										<Table.Cell class="text-gray-200">
											{answer.extra_fields?.other || '-'}
										</Table.Cell>
									{/if}
									<Table.Cell>
										<Button
											variant="destructive"
											size="sm"
											on:click={() => deleteAnswer(answer.id)}
											class="border border-red-900 bg-gray-900 text-red-400 hover:bg-gray-800"
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
</div>
