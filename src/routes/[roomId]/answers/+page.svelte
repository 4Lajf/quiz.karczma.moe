<script>
	import { onMount, onDestroy } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';

	export let data;
	$: ({ supabase, room, rounds } = data);

	let currentRound = null;
	let previousRound = null;
	let correctAnswers = [];
	let animeData = null;
	let loading = true;
	let channel;

	// Find the previous round based on round numbers
	function getPreviousRound() {
		if (!room || !rounds || rounds.length === 0) return null;

		// Get the current round
		currentRound = rounds.find((r) => r.id === room.current_round);
		if (!currentRound) return null;

		// Find the previous round based on round number
		const prevRoundNumber = currentRound.round_number - 1;
		if (prevRoundNumber < 1) return null;

		return rounds.find((r) => r.round_number === prevRoundNumber);
	}

	// Load anime data from AniList API
	async function fetchAnimeData(title) {
		try {
			const query = `
				query ($search: String) {
					Media(search: $search, type: ANIME) {
						id
						title {
							romaji
							english
							native
						}
						coverImage {
							large
						}
						description
						genres
						seasonYear
						format
						episodes
					}
				}
			`;

			const response = await fetch('https://graphql.anilist.co', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({
					query: query,
					variables: { search: title }
				})
			});

			const result = await response.json();
			return result.data?.Media || null;
		} catch (error) {
			console.error('Error fetching anime data:', error);
			return null;
		}
	}

	// Load correct answers for the previous round
	async function loadPreviousRoundData() {
		loading = true;
		try {
			previousRound = getPreviousRound();
			if (!previousRound) {
				loading = false;
				return;
			}

			const { data: answers, error } = await supabase.from('correct_answers').select('*').eq('round_id', previousRound.id);

			if (error) throw error;

			correctAnswers = answers || [];

			// If we have answers, fetch anime data for the first one
			if (correctAnswers.length > 0) {
				animeData = await fetchAnimeData(correctAnswers[0].content);
			}
		} catch (error) {
			console.error('Error loading previous round data:', error);
			toast.error('Nie udało się załadować danych poprzedniej rundy');
		} finally {
			loading = false;
		}
	}

	// Setup realtime subscriptions
	function setupRealtime() {
		if (channel) channel.unsubscribe();

		channel = supabase
			.channel(`previous-round:${room.id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				async () => {
					await invalidateAll();
					loadPreviousRoundData();
				}
			)
			.subscribe();
	}

	// Get all unique alternative titles
	function getAlternativeTitles() {
		if (!correctAnswers || correctAnswers.length === 0) return [];

		const knownTitles = new Set();
		const titles = [];

		// Add main title to known titles set
		const mainTitle = getMainTitle();
		knownTitles.add(mainTitle.toLowerCase());

		// Add romaji title if different from main
		if (animeData?.title?.romaji && !knownTitles.has(animeData.title.romaji.toLowerCase())) {
			titles.push({
				title: animeData.title.romaji,
				type: 'Romaji'
			});
			knownTitles.add(animeData.title.romaji.toLowerCase());
		}

		// Add English title if different
		if (animeData?.title?.english && !knownTitles.has(animeData.title.english.toLowerCase())) {
			titles.push({
				title: animeData.title.english,
				type: 'English'
			});
			knownTitles.add(animeData.title.english.toLowerCase());
		}

		// Add all alternative titles from correct answers
		for (const answer of correctAnswers) {
			if (!knownTitles.has(answer.content.toLowerCase())) {
				titles.push({
					title: answer.content,
					type: null
				});
				knownTitles.add(answer.content.toLowerCase());
			}
		}

		return titles;
	}

	// Get the main title to display
	function getMainTitle() {
		if (animeData?.title?.english) return animeData.title.english;
		if (animeData?.title?.romaji) return animeData.title.romaji;
		return correctAnswers[0]?.content || 'Nieznany tytuł';
	}

	onMount(() => {
		loadPreviousRoundData();
		setupRealtime();
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900">
	<div class="container mx-auto px-6 py-12">
		<!-- Main Card -->
		<Card.Root class="border-gray-800/50 bg-gray-900/80 shadow-2xl backdrop-blur">
			<!-- Header with Round Number -->
			<Card.Header class="border-b border-gray-800/50 p-8">
				<Card.Title class="text-center text-6xl font-bold text-white">
					{#if previousRound}
						Runda {previousRound.round_number}
					{:else}
						Brak poprzedniej rundy
					{/if}
				</Card.Title>
			</Card.Header>

			<!-- Content Section -->
			<Card.Content class="p-0">
				{#if loading}
					<!-- Loading State -->
					<div class="flex items-center justify-center p-24">
						<div class="h-24 w-24 animate-spin rounded-full border-8 border-gray-700 border-t-blue-500"></div>
					</div>
				{:else if !previousRound}
					<!-- No Previous Round State -->
					<div class="rounded-lg p-16 text-center">
						<p class="text-3xl text-gray-300">Nie ma jeszcze poprzedniej rundy.</p>
					</div>
				{:else if correctAnswers.length === 0}
					<!-- No Answers State -->
					<div class="rounded-lg p-16 text-center">
						<p class="text-3xl text-gray-300">Brak odpowiedzi dla poprzedniej rundy.</p>
					</div>
				{:else}
					<!-- Content When Data Available -->
					<div class="overflow-hidden rounded-b-lg">
						<div class="grid grid-cols-1 gap-0 lg:grid-cols-3">
							<!-- Anime Image Column -->
							<div class="bg-gray-800/40 lg:col-span-1">
								{#if animeData?.coverImage?.large}
									<div class="flex h-full items-center justify-center p-4 lg:p-0">
										<img src={animeData.coverImage.large} alt={getMainTitle()} class="h-auto w-full max-w-lg object-cover shadow-xl lg:h-[600px]" />
									</div>
								{:else}
									<div class="flex h-[300px] w-full items-center justify-center bg-gray-800/20 lg:h-[600px]">
										<span class="text-2xl text-gray-400">Brak obrazka</span>
									</div>
								{/if}
							</div>

							<!-- Anime Details Column -->
							<div class="bg-gradient-to-br from-gray-800/70 to-gray-900/70 p-8 lg:col-span-2 lg:p-12">
								<!-- Main Title -->
								<h2 class="mb-8 text-5xl font-bold tracking-tight text-white">
									{getMainTitle()}
								</h2>

								<!-- Alternative Titles Section -->
								{#if getAlternativeTitles().length > 0}
									<div class="mb-10 space-y-6">
										<h3 class="text-3xl font-medium text-cyan-200">Alternatywne tytuły:</h3>
										<ul class="space-y-5 pl-6">
											{#each getAlternativeTitles() as title}
												<li class="flex items-baseline gap-3 text-3xl text-gray-300">
													<span class="text-cyan-400">•</span>
													{#if title.type}
														<span class="mr-2 text-gray-400">{title.type}:</span>
													{/if}
													<span>{title.title}</span>
												</li>
											{/each}
										</ul>
									</div>
								{/if}

								<!-- Additional Information -->
								<div class="mt-10 space-y-8">
									{#if animeData?.seasonYear}
										<p class="text-3xl text-gray-200">
											<span class="mr-3 font-medium text-gray-400">Rok:</span>
											{animeData.seasonYear}
										</p>
									{/if}

									<!-- Song Information -->
									{#if correctAnswers[0].extra_fields?.song_title || correctAnswers[0].extra_fields?.song_artist}
										<div class="rounded-xl border border-cyan-800/30 bg-cyan-900/20 p-6 backdrop-blur-sm">
											{#if correctAnswers[0].extra_fields?.song_title}
												<p class="mb-5 text-4xl font-medium text-cyan-300">
													<span class="mr-3 opacity-90">Piosenka:</span>
													{correctAnswers[0].extra_fields.song_title}
												</p>
											{/if}

											{#if correctAnswers[0].extra_fields?.song_artist}
												<p class="text-3xl text-cyan-300">
													<span class="mr-3 opacity-90">Artysta:</span>
													{correctAnswers[0].extra_fields.song_artist}
												</p>
											{/if}
										</div>
									{/if}

									<!-- Other Information -->
									{#if correctAnswers[0].extra_fields?.other}
										<div class="rounded-xl bg-gray-800/30 p-6">
											<p class="text-2xl text-gray-300">
												<span class="mr-3 font-medium text-gray-400">Dodatkowe informacje:</span>
												{correctAnswers[0].extra_fields.other}
											</p>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
