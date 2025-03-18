<script>
	//src/routes/admin/rooms/[roomId]/answers/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import ConfigureRoundAnswers from '$lib/components/admin/ConfigureRoundAnswers.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { Plus, Trash2, Search } from 'lucide-svelte';
	import Autocomplete from '$lib/components/player/Autocomplete.svelte';

	export let data;
	$: ({ supabase, room, rounds, currentRound } = data);

	let channel;
	let confirmingDelete = false;

	// Batch import state
	let batchTitles = '';
	let batchSongs = '';
	let batchArtists = '';
	let batchImportLoading = false;

	// Sort rounds by round_number
	$: sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);

	// AnisongDB search state
	let animeSearchQuery = '';
	let searchResults = [];
	let isSearching = false;
	let searchError = null;

	// Function to search AnisongDB
	async function searchAnisongDB() {
		if (!animeSearchQuery.trim()) {
			toast.error('Wprowadź tytuł anime do wyszukania');
			return;
		}

		isSearching = true;
		searchError = null;
		searchResults = [];

		try {
			const response = await fetch('https://anisongdb.com/api/search_request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					anime_search_filter: {
						search: animeSearchQuery,
						partial_match: true
					},
					and_logic: false,
					ignore_duplicate: true,
					opening_filter: true,
					ending_filter: true,
					insert_filter: false,
					normal_broadcast: true,
					dub: true,
					rebroadcast: true,
					standard: true,
					instrumental: true,
					chanting: true,
					character: true
				})
			});

			if (!response.ok) {
				throw new Error(`API responded with status: ${response.status}`);
			}

			const data = await response.json();

			// Create a map to deduplicate entries by animeName + songName + artist
			const uniqueEntries = new Map();

			// Process results
			data.forEach((result) => {
				const key = `${result.animeJPName || result.animeENName}|${result.songName}|${result.songArtist}`;

				// Only add if this combination doesn't already exist
				if (!uniqueEntries.has(key)) {
					uniqueEntries.set(key, {
						animeENName: result.animeENName,
						animeJPName: result.animeJPName,
						songName: result.songName,
						songArtist: result.songArtist,
						songType: result.songType
					});
				}
			});

			searchResults = Array.from(uniqueEntries.values());

			if (searchResults.length === 0) {
				toast.info('Nie znaleziono wyników dla podanego zapytania');
			}
		} catch (error) {
			console.error('Error searching AnisongDB:', error);
			searchError = error.message;
			toast.error(`Błąd wyszukiwania: ${error.message}`);
		} finally {
			isSearching = false;
		}
	}

	// Function to add a result to the batch import
	function addToBatchImport(result) {
		const animeName = result.animeJPName || result.animeENName;
		const songName = result.songName || '';
		const songArtist = result.songArtist || '';

		// Append to batch fields
		if (batchTitles) batchTitles += '\n';
		batchTitles += animeName;

		if (room.enabled_fields?.song_title) {
			if (batchSongs) batchSongs += '\n';
			batchSongs += songName;
		}

		if (room.enabled_fields?.song_artist) {
			if (batchArtists) batchArtists += '\n';
			batchArtists += songArtist;
		}

		toast.success(`Dodano "${animeName}" do listy importu`);
	}

	// Function to check title match against API results
	async function checkTitleMatch(inputTitle) {
		if (!inputTitle || inputTitle.trim().length < 2) {
			return null;
		}

		try {
			const response = await fetch(`/api/search/substring?q=${encodeURIComponent(inputTitle)}&type=anime`);
			if (!response.ok) throw new Error('Failed to fetch title matches');

			const data = await response.json();
			const hits = data.hits || [];

			// Find exact match
			const exactMatch = hits.find((hit) => hit.document.displayTitle.toLowerCase() === inputTitle.toLowerCase() || hit.document.romajiTitle?.toLowerCase() === inputTitle.toLowerCase() || hit.document.englishTitle?.toLowerCase() === inputTitle.toLowerCase() || (hit.document.altTitles || []).some((alt) => alt.toLowerCase() === inputTitle.toLowerCase()));

			if (exactMatch) {
				return 'exact';
			}

			return 'none';
		} catch (error) {
			console.error('Error checking title match:', error);
			return 'none';
		}
	}

	// Function to check song title match
	async function checkSongMatch(songTitle) {
		if (!songTitle || songTitle.trim().length < 2) {
			return null;
		}

		try {
			const response = await fetch(`/api/search/substring?q=${encodeURIComponent(songTitle)}&type=songs`);
			if (!response.ok) throw new Error('Failed to fetch song matches');

			const data = await response.json();
			const hits = data.hits || [];

			const exactMatch = hits.find((hit) => hit.document.songName?.toLowerCase() === songTitle.toLowerCase());

			if (exactMatch) {
				return 'exact';
			}

			return 'none';
		} catch (error) {
			console.error('Error checking song match:', error);
			return 'none';
		}
	}

	// Function to check artist match
	async function checkArtistMatch(artist) {
		if (!artist || artist.trim().length < 2) {
			return null;
		}

		try {
			const response = await fetch(`/api/search/substring?q=${encodeURIComponent(artist)}&type=artists`);
			if (!response.ok) throw new Error('Failed to fetch artist matches');

			const data = await response.json();
			const hits = data.hits || [];

			const exactMatch = hits.find((hit) => hit.document.artist?.toLowerCase() === artist.toLowerCase());

			if (exactMatch) {
				return 'exact';
			}

			return 'none';
		} catch (error) {
			console.error('Error checking artist match:', error);
			return 'none';
		}
	}

	// Fetch a hint from the API
	async function getHintFromAPI(title, roundId) {
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
			// Return null so the import can continue even if hint generation fails
			return null;
		}
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

	// Execute batch import - each line creates a new round
	async function executeBatchImport() {
		if (!batchTitles.trim()) {
			toast.error('Wprowadź co najmniej jeden tytuł anime');
			return;
		}

		batchImportLoading = true;

		try {
			const titles = batchTitles.split('\n').filter((line) => line.trim());
			const songs = batchSongs.split('\n').filter((line) => line.trim());
			const artists = batchArtists.split('\n').filter((line) => line.trim());

			// Get the highest round number
			const highestRound = rounds.reduce((max, round) => (round.round_number > max ? round.round_number : max), 0);

			let nextRoundNumber = highestRound + 1;
			let createdRounds = 0;

			for (let i = 0; i < titles.length; i++) {
				const title = titles[i].trim();
				if (!title) continue;

				const song = i < songs.length ? songs[i].trim() : '';
				const artist = i < artists.length ? artists[i].trim() : '';

				// Create a new round for this entry
				const { data: newRound, error: roundError } = await supabase
					.from('quiz_rounds')
					.insert({
						room_id: room.id,
						round_number: nextRoundNumber + i
					})
					.select()
					.single();

				if (roundError) {
					console.error('Error creating round:', roundError);
					continue;
				}

				createdRounds++;

				// Check match status for each field
				const titleMatch = await checkTitleMatch(title);
				const songMatch = room.enabled_fields?.song_title && song ? await checkSongMatch(song) : null;
				const artistMatch = room.enabled_fields?.song_artist && artist ? await checkArtistMatch(artist) : null;

				// Determine overall match status
				let matchStatus;
				if (titleMatch === 'exact' && (!room.enabled_fields?.song_title || !song || songMatch === 'exact') && (!room.enabled_fields?.song_artist || !artist || artistMatch === 'exact')) {
					matchStatus = 'match';
				} else if (titleMatch === 'exact' || (room.enabled_fields?.song_title && song && songMatch === 'exact') || (room.enabled_fields?.song_artist && artist && artistMatch === 'exact')) {
					matchStatus = 'partial-match';
				} else {
					matchStatus = 'no-match';
				}

				// Prepare extra fields
				const extraFields = {
					match_status: matchStatus // Store match status in extra_fields
				};

				if (room.enabled_fields?.song_title && song) {
					extraFields.song_title = song;
				}
				if (room.enabled_fields?.song_artist && artist) {
					extraFields.song_artist = artist;
				}

				// Get hint from API
				let hint = await getHintFromAPI(title, newRound.id);

				// Add the main answer
				const { error: answerError } = await supabase.from('correct_answers').insert({
					round_id: newRound.id,
					content: title,
					extra_fields: extraFields,
					hint: hint
				});

				if (answerError) {
					console.error('Error adding answer:', answerError);
					continue;
				}

				// Add related titles
				const relatedTitles = await fetchRelatedTitles(title);
				for (const relatedTitle of relatedTitles) {
					if (relatedTitle.toLowerCase() !== title.toLowerCase()) {
						// Get hint from API for related title
						let hint = await getHintFromAPI(relatedTitle, newRound.id);

						await supabase.from('correct_answers').insert({
							round_id: newRound.id,
							content: relatedTitle.trim(),
							extra_fields: extraFields, // Use same match status for related titles
							hint: hint
						});
					}
				}
			}

			// Clear inputs
			batchTitles = '';
			batchSongs = '';
			batchArtists = '';

			// Refresh data
			await invalidateAll();

			toast.success(`Zaimportowano i utworzono ${createdRounds} rund`);
		} catch (error) {
			toast.error('Błąd importu wsadowego: ' + error.message);
		} finally {
			batchImportLoading = false;
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

			// toast.success(`Usunięto rundę ${lastRound.round_number}`);
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

		<!-- AnisongDB Search Section -->
		<Card.Root class="mb-6 border border-gray-800 bg-gray-900">
			<Card.Header>
				<Card.Title class="text-white">Wyszukiwanie w AnisongDB</Card.Title>
				<Card.Description class="text-gray-400">Wyszukaj anime, piosenki i artystów bezpośrednio w bazie AnisongDB</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="space-y-4">
					<div class="flex items-end gap-4">
						<div class="flex-1">
							<Autocomplete bind:value={animeSearchQuery} placeholder="Wpisz tytuł anime" index="animeTitles" searchKey="animeTitle" type="anime" />
						</div>
						<Button on:click={searchAnisongDB} disabled={isSearching || !animeSearchQuery.trim()} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
							{#if isSearching}
								<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
								Szukanie...
							{:else}
								<Search class="mr-2 h-4 w-4" />
								Szukaj
							{/if}
						</Button>
					</div>

					{#if searchError}
						<div class="rounded-md bg-red-900/30 p-4 text-red-300">
							<p>{searchError}</p>
						</div>
					{/if}

					{#if searchResults.length > 0}
						<div class="mt-4 rounded-md border border-gray-700 bg-gray-800/30">
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead>
										<tr class="border-b border-gray-700 bg-gray-800/50">
											<th class="p-3 text-left text-sm font-medium text-gray-300">Anime</th>
											<th class="p-3 text-left text-sm font-medium text-gray-300">Piosenka</th>
											<th class="p-3 text-left text-sm font-medium text-gray-300">Artysta</th>
											<th class="p-3 text-left text-sm font-medium text-gray-300">Typ</th>
											<th class="p-3 text-left text-sm font-medium text-gray-300">Akcje</th>
										</tr>
									</thead>
									<tbody>
										{#each searchResults as result, i}
											<tr class={i % 2 === 0 ? 'bg-gray-800/10' : 'bg-gray-800/30'}>
												<td class="p-3 text-gray-200">
													<div>
														{#if result.animeJPName}
															<div class="font-medium text-white">{result.animeJPName}</div>
														{/if}
														{#if result.animeENName && result.animeENName !== result.animeJPName}
															<div class="text-sm text-gray-400">{result.animeENName}</div>
														{/if}
													</div>
												</td>
												<td class="p-3 text-gray-200">{result.songName || '-'}</td>
												<td class="p-3 text-gray-200">{result.songArtist || '-'}</td>
												<td class="p-3 text-gray-200">
													{#if result.songType}
														<span class="rounded-full bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-300">
															{result.songType}
														</span>
													{:else}
														-
													{/if}
												</td>
												<td class="p-3">
													<Button on:click={() => addToBatchImport(result)} size="sm" class="border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700">
														<Plus class="mr-2 h-3 w-3" />
														Dodaj
													</Button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Batch import section - always visible -->
		<Card.Root class="mb-6 border border-gray-800 bg-gray-900">
			<Card.Header>
				<Card.Title class="text-white">Masowy import odpowiedzi - Każda linia = Nowa runda</Card.Title>
				<Card.Description class="text-gray-400">
					Każda linia utworzy nową rundę z podanym tytułem anime i odpowiadającymi danymi<br />
					Dane anime brane są ze strony anisongdb.com<br /><br />
					Zielony rząd = Dane wprowadzone niżej zgadzają się dokładnie z danymi w bazie<br />
					Żółty rząd = Wymaga sprawdzenia, przynajmniej jedno pole nie zgadza się dokładnie z danymi w bazie (choć mogło się dobrze zaimportować)<br />
					Czerwony rząd = Wymaga sprawdzenia, wszystkie pola nie zgadzają się dokładnie z danymi w bazie (choć mogły się dobrze zaimportować)<br />
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="space-y-4">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div>
							<!-- svelte-ignore a11y_label_has_associated_control -->
							<label class="mb-2 block text-sm text-gray-400"> Tytuły anime (jeden na linię = jedna runda) </label>
							<textarea bind:value={batchTitles} class="h-40 w-full rounded-md border border-gray-700 bg-gray-800 p-2 text-gray-100 focus-visible:ring-1 focus-visible:ring-gray-600"></textarea>
						</div>

						{#if room.enabled_fields?.song_title}
							<div>
								<!-- svelte-ignore a11y_label_has_associated_control -->
								<label class="mb-2 block text-sm text-gray-400"> Tytuły piosenek (jeden na linię) </label>
								<textarea bind:value={batchSongs} class="h-40 w-full rounded-md border border-gray-700 bg-gray-800 p-2 text-gray-100 focus-visible:ring-1 focus-visible:ring-gray-600"></textarea>
							</div>
						{/if}

						{#if room.enabled_fields?.song_artist}
							<div>
								<!-- svelte-ignore a11y_label_has_associated_control -->
								<label class="mb-2 block text-sm text-gray-400"> Artyści (jeden na linię) </label>
								<textarea bind:value={batchArtists} class="h-40 w-full rounded-md border border-gray-700 bg-gray-800 p-2 text-gray-100 focus-visible:ring-1 focus-visible:ring-gray-600"></textarea>
							</div>
						{/if}
					</div>

					<Button on:click={executeBatchImport} disabled={batchImportLoading || !batchTitles.trim()} class="mt-4 w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
						{#if batchImportLoading}
							<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
							Importowanie i tworzenie rund...
						{:else}
							<Plus class="mr-2 h-4 w-4" />
							Importuj i utwórz rundy
						{/if}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Display all rounds vertically -->
		<div class="space-y-8">
			{#each sortedRounds as round (round.id)}
				<div class="mb-4">
					<h2 class="mb-2 text-xl font-bold text-white">Runda {round.round_number}</h2>
					<ConfigureRoundAnswers {supabase} roomId={room.id} roundId={round.id} {room} />
				</div>
			{/each}
		</div>

		<!-- Add and Delete Last Round buttons at the bottom -->
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
