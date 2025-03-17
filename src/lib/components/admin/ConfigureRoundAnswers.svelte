<script>
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { Check, X, Plus, Trash2, Edit, Save, ChevronUp, ChevronDown } from 'lucide-svelte';
	import Autocomplete from '$lib/components/player/Autocomplete.svelte';

	export let supabase;
	export let room;
	export let roundId;

	let answers = [];
	let newAnswer = {
		answer: '',
		songTitle: '',
		songArtist: '',
		other: ''
	};

	// Add match status tracking for visual feedback
	let matchStatus = {
		answer: null, // null = not checked, 'exact', 'partial', or 'none'
		songTitle: null,
		songArtist: null,
		other: null
	};

	let editMode = false;
	let editingId = null;
	let loading = false;
	let channel;
	let formHidden = false;
	let checkingMatch = false;

	// Helper function to get row background color based on match status
	function getRowBackgroundClass(matchStatus) {
		if (matchStatus === 'match') return 'bg-green-500/20';
		if (matchStatus === 'partial-match') return 'bg-yellow-500/20';
		if (matchStatus === 'no-match') return 'bg-red-500/20';
		return '';
	}

	// Fetch a hint from the API
	async function getHintFromAPI(title) {
		try {
			const response = await fetch('/api/generate-hint', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content: title,
					roundId: roundId
				})
			});

			if (!response.ok) {
				throw new Error('Failed to generate hint from API');
			}

			const data = await response.json();
			return data.hint;
		} catch (error) {
			console.error('Error generating hint:', error);
			// Return null so we can continue even if hint generation fails
			return null;
		}
	}

	// Load answers for the round
	async function loadAnswers() {
		try {
			const { data, error } = await supabase.from('correct_answers').select('*').eq('round_id', roundId).order('created_at', { ascending: true });

			if (error) throw error;
			answers = data || [];

			// Set formHidden to true if there are answers
			if (data && data.length > 0) {
				formHidden = true;
			}

			return data;
		} catch (error) {
			console.error(`Failed to load answers for round ${roundId}:`, error);
			return [];
		}
	}
	// Function to check title match against API results
	async function checkTitleMatch(inputTitle) {
		if (!inputTitle || inputTitle.trim().length < 2) {
			matchStatus.answer = null;
			return null;
		}

		checkingMatch = true;
		try {
			const response = await fetch(`/api/search/substring?q=${encodeURIComponent(inputTitle)}&type=anime`);
			if (!response.ok) throw new Error('Failed to fetch title matches');

			const data = await response.json();
			const hits = data.hits || [];

			// Find the best match
			const exactMatch = hits.find((hit) => hit.document.displayTitle.toLowerCase() === inputTitle.toLowerCase() || hit.document.romajiTitle?.toLowerCase() === inputTitle.toLowerCase() || hit.document.englishTitle?.toLowerCase() === inputTitle.toLowerCase() || (hit.document.altTitles || []).some((alt) => alt.toLowerCase() === inputTitle.toLowerCase()));

			if (exactMatch) {
				matchStatus.answer = 'exact';
				return 'exact';
			}

			// Check for partial matches
			const partialMatch = hits.find((hit) => hit.document.displayTitle.toLowerCase().includes(inputTitle.toLowerCase()) || (hit.document.romajiTitle && hit.document.romajiTitle.toLowerCase().includes(inputTitle.toLowerCase())) || (hit.document.englishTitle && hit.document.englishTitle.toLowerCase().includes(inputTitle.toLowerCase())) || (hit.document.altTitles || []).some((alt) => alt.toLowerCase().includes(inputTitle.toLowerCase())));

			if (partialMatch) {
				matchStatus.answer = 'partial';
				return 'partial';
			}

			matchStatus.answer = 'none';
			return 'none';
		} catch (error) {
			console.error('Error checking title match:', error);
			matchStatus.answer = 'none';
			return 'none';
		} finally {
			checkingMatch = false;
		}
	}

	// Function to check song title match
	async function checkSongMatch(songTitle) {
		if (!songTitle || songTitle.trim().length < 2) {
			matchStatus.songTitle = null;
			return null;
		}

		checkingMatch = true;
		try {
			const response = await fetch(`/api/search/substring?q=${encodeURIComponent(songTitle)}&type=songs`);
			if (!response.ok) throw new Error('Failed to fetch song matches');

			const data = await response.json();
			const hits = data.hits || [];

			const exactMatch = hits.find((hit) => hit.document.songName?.toLowerCase() === songTitle.toLowerCase());

			if (exactMatch) {
				matchStatus.songTitle = 'exact';
				return 'exact';
			}

			const partialMatch = hits.find((hit) => hit.document.songName?.toLowerCase().includes(songTitle.toLowerCase()));

			if (partialMatch) {
				matchStatus.songTitle = 'partial';
				return 'partial';
			}

			matchStatus.songTitle = 'none';
			return 'none';
		} catch (error) {
			console.error('Error checking song match:', error);
			matchStatus.songTitle = 'none';
			return 'none';
		} finally {
			checkingMatch = false;
		}
	}

	// Function to check artist match
	async function checkArtistMatch(artist) {
		if (!artist || artist.trim().length < 2) {
			matchStatus.songArtist = null;
			return null;
		}

		checkingMatch = true;
		try {
			const response = await fetch(`/api/search/substring?q=${encodeURIComponent(artist)}&type=artists`);
			if (!response.ok) throw new Error('Failed to fetch artist matches');

			const data = await response.json();
			const hits = data.hits || [];

			const exactMatch = hits.find((hit) => hit.document.artist?.toLowerCase() === artist.toLowerCase());

			if (exactMatch) {
				matchStatus.songArtist = 'exact';
				return 'exact';
			}

			const partialMatch = hits.find((hit) => hit.document.artist?.toLowerCase().includes(artist.toLowerCase()));

			if (partialMatch) {
				matchStatus.songArtist = 'partial';
				return 'partial';
			}

			matchStatus.songArtist = 'none';
			return 'none';
		} catch (error) {
			console.error('Error checking artist match:', error);
			matchStatus.songArtist = 'none';
			return 'none';
		} finally {
			checkingMatch = false;
		}
	}

	// Check all matches synchronously before submission
	async function checkAllMatches() {
		// Clear any pending timeouts
		clearTimeout(titleCheckTimeout);
		clearTimeout(songCheckTimeout);
		clearTimeout(artistCheckTimeout);

		// Check title match
		if (newAnswer.answer.trim().length > 2) {
			matchStatus.answer = await checkTitleMatch(newAnswer.answer);
		}

		// Check song match if needed
		if (room.enabled_fields?.song_title && newAnswer.songTitle.trim().length > 2) {
			matchStatus.songTitle = await checkSongMatch(newAnswer.songTitle);
		}

		// Check artist match if needed
		if (room.enabled_fields?.song_artist && newAnswer.songArtist.trim().length > 2) {
			matchStatus.songArtist = await checkArtistMatch(newAnswer.songArtist);
		}
	}

	// Update input handlers to check matches (debounced)
	let titleCheckTimeout;
	async function handleTitleInput() {
		clearTimeout(titleCheckTimeout);
		titleCheckTimeout = setTimeout(async () => {
			if (newAnswer.answer.trim().length > 2) {
				await checkTitleMatch(newAnswer.answer);
			} else {
				matchStatus.answer = null;
			}
		}, 500);
	}

	let songCheckTimeout;
	async function handleSongTitleInput() {
		clearTimeout(songCheckTimeout);
		songCheckTimeout = setTimeout(async () => {
			if (newAnswer.songTitle.trim().length > 2) {
				await checkSongMatch(newAnswer.songTitle);
			} else {
				matchStatus.songTitle = null;
			}
		}, 500);
	}

	let artistCheckTimeout;
	async function handleArtistInput() {
		clearTimeout(artistCheckTimeout);
		artistCheckTimeout = setTimeout(async () => {
			if (newAnswer.songArtist.trim().length > 2) {
				await checkArtistMatch(newAnswer.songArtist);
			} else {
				matchStatus.songArtist = null;
			}
		}, 500);
	}

	// Fetch related anime titles
	async function fetchRelatedTitles(selectedTitle) {
		try {
			const response = await fetch(`/api/search/substring?q=${encodeURIComponent(selectedTitle)}&type=anime`);
			if (!response.ok) throw new Error('Failed to fetch related titles');

			const data = await response.json();
			const hits = data.hits || [];

			const matchingAnime = hits.find((hit) => hit.document.displayTitle.toLowerCase() === selectedTitle.toLowerCase() || hit.document.romajiTitle?.toLowerCase() === selectedTitle.toLowerCase() || hit.document.englishTitle?.toLowerCase() === selectedTitle.toLowerCase() || (hit.document.altTitles || []).some((alt) => alt.toLowerCase() === selectedTitle.toLowerCase()));

			if (matchingAnime) {
				const titles = [];

				if (matchingAnime.document.englishTitle && matchingAnime.document.englishTitle.toLowerCase() !== selectedTitle.toLowerCase()) {
					titles.push(matchingAnime.document.englishTitle);
				}

				if (matchingAnime.document.romajiTitle && matchingAnime.document.romajiTitle.toLowerCase() !== selectedTitle.toLowerCase()) {
					titles.push(matchingAnime.document.romajiTitle);
				}

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

	// Add an answer to the round
	async function addAnswer() {
		if (!newAnswer.answer.trim()) return;

		loading = true;
		try {
			if (editMode) {
				await updateAnswer();
				return;
			}

			// Check matches one more time before submission
			await checkAllMatches();

			// Determine overall match status
			let overallStatus;
			if (matchStatus.answer === 'exact' && (!room.enabled_fields?.song_title || !newAnswer.songTitle || matchStatus.songTitle === 'exact') && (!room.enabled_fields?.song_artist || !newAnswer.songArtist || matchStatus.songArtist === 'exact')) {
				overallStatus = 'match';
			} else if (matchStatus.answer === 'exact' || (room.enabled_fields?.song_title && newAnswer.songTitle && matchStatus.songTitle === 'exact') || (room.enabled_fields?.song_artist && newAnswer.songArtist && matchStatus.songArtist === 'exact')) {
				overallStatus = 'partial-match';
			} else {
				overallStatus = 'no-match';
			}

			// Log match status for statistics
			const matchStats = {
				anime: matchStatus.answer,
				song: matchStatus.songTitle,
				artist: matchStatus.songArtist,
				overall: overallStatus
			};
			console.log('Match statistics:', matchStats);

			const extraFields = {
				match_status: overallStatus
			};

			if (room.enabled_fields?.song_title && newAnswer.songTitle) {
				extraFields.song_title = newAnswer.songTitle;
			}
			if (room.enabled_fields?.song_artist && newAnswer.songArtist) {
				extraFields.song_artist = newAnswer.songArtist;
			}
			if (room.enabled_fields?.other && newAnswer.other) {
				extraFields.other = newAnswer.other;
			}

			// Process the answer
			const processedAnswer = newAnswer.answer.trim();

			// Call the API to generate hint
			await getHintFromAPI(processedAnswer);

			// Add main answer
			const { data, error } = await supabase
				.from('correct_answers')
				.insert({
					round_id: roundId,
					content: processedAnswer,
					extra_fields: extraFields
					// We don't need to set the hint field as the API will handle this
				})
				.select()
				.single();

			if (error) throw error;

			// Update the answers list
			answers = [...answers, data];

			// Customize toast message based on match status
			let toastMsg = 'Dodano odpowiedź';
			toast.success(toastMsg);

			// Auto-hide the form after adding an answer
			formHidden = true;

			// Now fetch and add related titles
			const relatedTitles = await fetchRelatedTitles(newAnswer.answer);
			let addedCount = 0;

			for (const title of relatedTitles) {
				// Check if this title is already in answers list
				const isDuplicate = answers.some((a) => a.content.toLowerCase() === title.toLowerCase());

				if (!isDuplicate) {
					// Call API to generate hint for this related title
					await getHintFromAPI(title);

					const { data: relatedData, error: relatedError } = await supabase
						.from('correct_answers')
						.insert({
							round_id: roundId,
							content: title.trim(),
							extra_fields: extraFields
							// We don't need to set the hint field as the API will handle this
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

			// Clear form inputs and match statuses
			newAnswer = {
				answer: '',
				songTitle: '',
				songArtist: '',
				other: ''
			};
			matchStatus = {
				answer: null,
				songTitle: null,
				songArtist: null,
				other: null
			};
		} catch (error) {
			toast.error('Nie udało się dodać odpowiedzi: ' + error.message);
		} finally {
			loading = false;
		}
	}

	// Update an existing answer
	async function updateAnswer() {
		if (!newAnswer.answer.trim() || !editingId) {
			toast.error('Tytuł anime jest wymagany');
			return;
		}

		loading = true;
		try {
			// Check matches one more time before submission
			await checkAllMatches();

			// Determine overall match status
			let overallStatus;
			if (matchStatus.answer === 'exact' && (!room.enabled_fields?.song_title || !newAnswer.songTitle || matchStatus.songTitle === 'exact') && (!room.enabled_fields?.song_artist || !newAnswer.songArtist || matchStatus.songArtist === 'exact')) {
				overallStatus = 'match';
			} else if (matchStatus.answer === 'exact' || (room.enabled_fields?.song_title && newAnswer.songTitle && matchStatus.songTitle === 'exact') || (room.enabled_fields?.song_artist && newAnswer.songArtist && matchStatus.songArtist === 'exact')) {
				overallStatus = 'partial-match';
			} else {
				overallStatus = 'no-match';
			}

			const extraFields = {
				match_status: overallStatus
			};

			if (room.enabled_fields?.song_title && newAnswer.songTitle) {
				extraFields.song_title = newAnswer.songTitle;
			}
			if (room.enabled_fields?.song_artist && newAnswer.songArtist) {
				extraFields.song_artist = newAnswer.songArtist;
			}
			if (room.enabled_fields?.other && newAnswer.other) {
				extraFields.other = newAnswer.other;
			}

			// Process the answer
			const processedAnswer = newAnswer.answer.trim();

			// Call API to generate new hint
			await getHintFromAPI(processedAnswer);

			const { data, error } = await supabase
				.from('correct_answers')
				.update({
					content: processedAnswer,
					extra_fields: extraFields
					// We don't need to set the hint field as the API will handle this
				})
				.eq('id', editingId)
				.select()
				.single();

			if (error) throw error;

			// Update the answer in the local array
			answers = answers.map((a) => (a.id === editingId ? data : a));

			// Customize toast message based on match status
			let toastMsg = 'Zaktualizowano odpowiedź';
			toast.success(toastMsg);

			// Clear form inputs and exit edit mode
			cancelEditing();
		} catch (error) {
			toast.error('Nie udało się zaktualizować odpowiedzi: ' + error.message);
		} finally {
			loading = false;
		}
	}

	// Start editing an answer
	function startEditing(answer) {
		editMode = true;
		editingId = answer.id;
		formHidden = false; // Show the form when editing

		newAnswer = {
			answer: answer.content,
			songTitle: answer.extra_fields?.song_title || '',
			songArtist: answer.extra_fields?.song_artist || '',
			other: answer.extra_fields?.other || ''
		};

		// Reset match statuses when starting edit mode
		matchStatus = {
			answer: null,
			songTitle: null,
			songArtist: null,
			other: null
		};

		// Check matches after setting the values
		setTimeout(() => {
			checkAllMatches();
		}, 100);
	}

	// Cancel editing an answer
	function cancelEditing() {
		editMode = false;
		editingId = null;

		newAnswer = {
			answer: '',
			songTitle: '',
			songArtist: '',
			other: ''
		};

		// Reset match statuses
		matchStatus = {
			answer: null,
			songTitle: null,
			songArtist: null,
			other: null
		};
	}

	// Delete an answer
	async function deleteAnswer(answerId) {
		try {
			const { error } = await supabase.from('correct_answers').delete().eq('id', answerId);

			if (error) throw error;

			answers = answers.filter((a) => a.id !== answerId);
			toast.success('Usunięto odpowiedź');
		} catch (error) {
			toast.error('Nie udało się usunąć odpowiedzi: ' + error.message);
		}
	}

	// Toggle form visibility
	function toggleFormVisibility() {
		formHidden = !formHidden;
	}

	// Set up realtime subscription
	function setupChannel() {
		if (channel) channel.unsubscribe();

		channel = supabase
			.channel(`round-answers-${roundId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'correct_answers',
					filter: `round_id=eq.${roundId}`
				},
				() => {
					loadAnswers();
				}
			)
			.subscribe();
	}

	onMount(() => {
		loadAnswers();
		setupChannel();
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="space-y-6">
	<Card.Root class="border-gray-800 bg-gray-900">
		<Card.Content>
			<div class="space-y-8">
				<div class="rounded-lg border border-gray-800 p-4">
					<!-- Toggle form visibility button -->
					<Button on:click={toggleFormVisibility} variant="outline" class="mb-4 border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
						{#if formHidden}
							<ChevronDown class="mr-2 h-4 w-4" />
							Pokaż formularz
						{:else}
							<ChevronUp class="mr-2 h-4 w-4" />
							Ukryj formularz
						{/if}
					</Button>

					{#if !formHidden}
						<form on:submit|preventDefault={addAnswer} class="mb-6 space-y-4">
							<div class="relative">
								{#if editMode}
									<div class="absolute left-2 top-2 rounded-full bg-blue-500 px-2 py-1 text-xs text-white">Tryb edycji</div>
								{/if}
								<div class="relative">
									<Autocomplete bind:value={newAnswer.answer} placeholder="Nazwa anime" index="animeTitles" searchKey="animeTitle" type="anime" disabled={loading} on:input={handleTitleInput} />
								</div>
							</div>

							{#if room.enabled_fields?.song_title}
								<div class="relative">
									<Autocomplete bind:value={newAnswer.songTitle} placeholder="Tytuł piosenki" index="songNames" searchKey="songName" type="songs" disabled={loading} on:input={handleSongTitleInput} />
								</div>
							{/if}

							{#if room.enabled_fields?.song_artist}
								<div class="relative">
									<Autocomplete bind:value={newAnswer.songArtist} placeholder="Artysta" index="artists" searchKey="artist" type="artists" disabled={loading} on:input={handleArtistInput} />
								</div>
							{/if}

							{#if room.enabled_fields?.other}
								<Input type="text" bind:value={newAnswer.other} placeholder="Inne" class="w-full border-gray-700 bg-gray-800 text-gray-100 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0" />
							{/if}

							<div class="flex gap-2">
								<Button type="submit" disabled={loading || !newAnswer.answer?.trim()} class="flex-1 border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
									{#if editMode}
										<Save class="mr-2 h-4 w-4" />
										Zapisz zmiany
									{:else}
										<Plus class="mr-2 h-4 w-4" />
										Dodaj odpowiedź
									{/if}
								</Button>

								{#if editMode}
									<Button type="button" on:click={cancelEditing} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
										<X class="mr-2 h-4 w-4" />
										Anuluj
									</Button>
								{/if}
							</div>
						</form>
					{/if}

					<!-- Answers table -->
					{#if !answers || answers.length === 0}
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
									<Table.Head class="w-28 text-gray-300">Akcje</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each answers as answer}
									<Table.Row class={`border-gray-800 ${getRowBackgroundClass(answer.extra_fields?.match_status)}`}>
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
											<div class="flex gap-2">
												<Button size="sm" on:click={() => startEditing(answer)} class="border border-blue-800 bg-gray-900 text-blue-400 hover:bg-gray-800" disabled={editMode}>
													<Edit class="h-4 w-4" />
												</Button>
												<Button variant="destructive" size="sm" on:click={() => deleteAnswer(answer.id)} class="border border-red-900 bg-gray-900 text-red-400 hover:bg-gray-800">
													<Trash2 class="h-4 w-4" />
												</Button>
											</div>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
