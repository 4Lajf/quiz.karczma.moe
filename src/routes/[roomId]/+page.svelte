<script>
	//src/routes/[roomId]/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import Autocomplete from '$lib/components/player/Autocomplete.svelte';

	let inTakeoverMode = false;
	let handRaised = false;
	let handRaiseResults = null;
	let playerPositions = [];

	// Replacement rules for easier text matching
	const ANIME_REGEX_REPLACE_RULES = [
		{ input: 'ou', replace: '(ou|ō|o)' },
		{ input: 'oo', replace: '(oo|ō|o)' },
		{ input: 'oh', replace: '(oh|ō|o)' },
		{ input: 'wo', replace: '(wo|o)' },
		{ input: 'o', replace: '([oōóòöôøΦο]|ou|oo|oh|wo)' },
		{ input: 'uu', replace: '(uu|u|ū)' },
		{ input: 'u', replace: '([uūûúùüǖ]|uu)' },
		{ input: 'aa', replace: '(aa|a)' },
		{ input: 'a', replace: '([aä@âàáạåæā∀]|aa)' },
		{ input: 'c', replace: '[cč]' },
		{ input: 'e', replace: '[eéêёëèæē]' },
		{ input: "'", replace: "['']" },
		{ input: 'n', replace: '[nñ]' },
		{ input: '2', replace: '[2²]' },
		{ input: '*', replace: '[＊*]' },
		{ input: 'i', replace: '([iíί]|ii)' },
		{ input: '3', replace: '[3³]' },
		{ input: 'x', replace: '[x×]' },
		{ input: 'b', replace: '[bßβ]' },
		{ input: 'r', replace: '[rЯ]' },
		{ input: 's', replace: '[sς]' },
		{ input: 'l', replace: '[l˥]' }
	];

	// Function to apply regex replacement rules
	function applyRegexRules(input) {
		if (!input) return input;

		let processedInput = input.toLowerCase();

		// Apply each replacement rule
		ANIME_REGEX_REPLACE_RULES.forEach((rule) => {
			// Create a case-insensitive regex for the input
			const regex = new RegExp(rule.input, 'gi');
			processedInput = processedInput.replace(regex, rule.replace);
		});

		return processedInput;
	}

	export let data;
	let playerName = '';
	let answer = '';
	let songTitle = '';
	let songArtist = '';
	let otherAnswer = '';
	let channel;
	let hasJoined = false;
	let loading = false;
	let hasSubmitted = false;

	$: ({ supabase, room } = data);
	$: if (hasJoined && channel) {
		subscribeToChanges();
	}

	function resetAnswerState() {
		hasSubmitted = false;
		answer = '';
		songTitle = '';
		songArtist = '';
		otherAnswer = '';
		// Force Svelte to recognize the state change
		hasSubmitted = hasSubmitted;
		answer = answer;
	}

	async function checkAnswerStatus() {
		if (!hasJoined || !playerName || !room?.current_round) return;

		const { data: existingAnswer } = await supabase
			.from('answers')
			.select('*, extra_fields')
			.eq('room_id', room.id)
			.eq('player_name', playerName)
			.eq('round_id', room.current_round)
			.maybeSingle();

		// Update hasSubmitted based on whether an answer exists
		hasSubmitted = !!existingAnswer;

		if (existingAnswer) {
			// If there's an existing answer, set answer and extra fields
			answer = existingAnswer.content;
			if (existingAnswer.extra_fields) {
				songTitle = existingAnswer.extra_fields.song_title || '';
				songArtist = existingAnswer.extra_fields.song_artist || '';
				otherAnswer = existingAnswer.extra_fields.other || '';
			}
		} else {
			// If no answer exists, reset all fields
			resetAnswerState();
		}
	}

	function subscribeToChanges() {
		if (channel) channel.unsubscribe();

		channel = supabase
			.channel(`room:${room.id}:${playerName}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				async (payload) => {
					console.log('Room change detected:', payload);
					if (payload.new.current_round !== payload.old?.current_round) {
						toast.info('New round has begun!');
						resetAnswerState();
						await invalidateAll();
					}
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'answers'
				},
				async (payload) => {
					console.log('Answer change detected:', payload);
					await checkAnswerStatus();
					if (!hasSubmitted && payload.eventType === 'DELETE') {
						toast.info('Your answer was reset by the admin');
					}
					await invalidateAll();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'hand_raises',
					filter: `room_id=eq.${room.id}`
				},
				async (payload) => {
					console.log('Hand raise change detected:', payload);
					try {
						// Always update the leaderboard when any hand raise changes
						await loadHandRaiseResults();

						// Add visual indication of update
						const leaderboardElement = document.querySelector('.leaderboard-table');
						if (leaderboardElement) {
							leaderboardElement.classList.add('bg-blue-900/30');
							setTimeout(() => {
								leaderboardElement.classList.remove('bg-blue-900/30');
							}, 300);
						}

						// Force Svelte to update by creating new references
						handRaiseResults = { ...handRaiseResults };
						playerPositions = [...playerPositions];
					} catch (error) {
						console.error('Error updating hand raise data:', error);
					}
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				(payload) => {
					if (payload.new.takeover_mode === false && inTakeoverMode) {
						// Admin disabled takeover mode
						inTakeoverMode = false;
						handRaised = false;
						handRaiseResults = null;
						toast.info('Takeover mode has been disabled');
					}
				}
			)
			.subscribe();
	}

	async function joinGame() {
		if (!playerName.trim()) {
			toast.error('Please enter your name');
			return;
		}
		loading = true;
		try {
			const { data: existingPlayers, error: fetchError } = await supabase
				.from('players')
				.select('*')
				.eq('room_id', room.id)
				.ilike('name', playerName);

			if (fetchError) throw fetchError;

			if (existingPlayers?.length > 0) {
				hasJoined = true; // Set hasJoined first
				await checkAnswerStatus(); // Then check answer status
				if (hasSubmitted) {
					toast.success(`Rejoined as ${playerName} - Answer already submitted`);
				} else {
					toast.success(`Rejoined as ${playerName}`);
				}
			} else {
				const { error: insertError } = await supabase.from('players').insert({
					room_id: room.id,
					name: playerName,
					score: 0,
					tiebreaker: 0
				});

				if (insertError) {
					if (insertError.code === '23505') {
						toast.error('Name already taken');
						return;
					}
					throw insertError;
				}
				hasJoined = true;
				hasSubmitted = false;
				toast.success('Joined as ' + playerName);
			}

			subscribeToChanges();
		} catch (error) {
			if (!error.message.includes('No rows found')) {
				toast.error('Error: ' + error.message);
			}
		} finally {
			loading = false;
		}
	}

	async function submitAnswer() {
		if (!answer.trim() || hasSubmitted) {
			toast.error(hasSubmitted ? 'Already submitted' : 'Enter an answer');
			return;
		}

		if (answer.trim().length > 256) {
			toast.error('Answer must be 256 characters or less');
			return;
		}

		loading = true;
		try {
			const extraFields = {};

			// Apply regex rules to input fields
			const processedAnswer = answer.trim();

			if (room.enabled_fields?.song_title && songTitle) {
				extraFields.song_title = songTitle;
			}
			if (room.enabled_fields?.song_artist && songArtist) {
				extraFields.song_artist = songArtist;
			}
			if (room.enabled_fields?.other && otherAnswer) {
				extraFields.other = otherAnswer;
			}

			const { error } = await supabase.from('answers').insert({
				room_id: room.id,
				round_id: room.current_round,
				player_name: playerName,
				content: processedAnswer,
				extra_fields: Object.keys(extraFields).length > 0 ? extraFields : null,
				answer_status: {
					main_answer: false,
					song_title: false,
					song_artist: false,
					other: false
				}
			});

			if (error) throw error;

			hasSubmitted = true;
			toast.success('Answer submitted');
			resetAnswerState();
		} catch (error) {
			toast.error('Error: ' + error.message);
		} finally {
			loading = false;
		}
	}

	function enterTakeoverMode() {
		inTakeoverMode = true;
	}

	async function raiseHand() {
		if (handRaised) return;

		const clientTimestamp = Date.now();
		handRaised = true;

		try {
			const { error } = await supabase.from('hand_raises').insert({
				room_id: room.id,
				player_name: playerName,
				client_timestamp: clientTimestamp
			});

			if (error) {
				if (error.code === '23505') {
					// Already raised hand
					await loadHandRaiseResults();
				} else {
					throw error;
				}
			} else {
				// Add this to load results after successful insert
				await loadHandRaiseResults();
			}
		} catch (error) {
			console.error('Failed to raise hand:', error);
			toast.error('Failed to record hand raise');
			handRaised = false;
		}
	}

	function exitTakeoverMode() {
		inTakeoverMode = false;
		handRaised = false;
		handRaiseResults = null;
	}

	async function loadHandRaiseResults() {
		try {
			const { data, error } = await supabase
				.from('hand_raises')
				.select('*')
				.eq('room_id', room.id)
				.order('server_timestamp', { ascending: true });

			if (error) throw error;

			if (data && data.length > 0) {
				// Find the player's position
				const playerIndex = data.findIndex((d) => d.player_name === playerName);

				if (playerIndex >= 0) {
					const position = playerIndex + 1;

					// Calculate time differences
					const firstTimestamp = new Date(data[0].server_timestamp).getTime();
					const playerTimestamp = new Date(data[playerIndex].server_timestamp).getTime();
					const timeDifferenceMs = playerTimestamp - firstTimestamp;

					handRaiseResults = {
						position,
						timeDifferenceMs
					};
				}

				// Always update the full leaderboard
				const firstTimestamp = new Date(data[0].server_timestamp).getTime();
				playerPositions = data.map((d, index) => {
					const timestamp = new Date(d.server_timestamp).getTime();
					const timeDifferenceMs = index === 0 ? 0 : timestamp - firstTimestamp;

					return {
						name: d.player_name,
						position: index + 1,
						timeDifferenceMs
					};
				});
			} else {
				playerPositions = [];
				if (handRaised) {
					handRaiseResults = null;
				}
			}
		} catch (error) {
			console.error('Failed to load hand raise results:', error);
		}
	}

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="min-h-screen bg-gray-950">
	<div class="container mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
		<Card.Root class="w-full border-gray-800 bg-gray-900 shadow-xl">
			<Card.Header>
				<Card.Title class="text-white">
					{room.name}
					{hasJoined ? `- ${playerName}` : '- Dołącz do pokoju'}
				</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if !hasJoined}
					<form on:submit|preventDefault={joinGame} class="space-y-4">
						<Input
							type="text"
							placeholder="Twój nick"
							bind:value={playerName}
							required
							disabled={loading}
							class="border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0"
						/>
						<Button
							type="submit"
							disabled={loading}
							class="w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
						>
							{loading ? 'Dołączanie...' : 'Dołącz do pokoju'}
						</Button>
					</form>
				{:else if !hasSubmitted}
					<form on:submit|preventDefault={submitAnswer} class="space-y-4">
						<Autocomplete
							bind:value={answer}
							placeholder="Nazwa anime"
							index="animeTitles"
							searchKey="animeTitle"
							type="anime"
						/>

						{#if room.enabled_fields?.song_title}
							<Autocomplete
								bind:value={songTitle}
								placeholder="Tytuł piosenki"
								index="songNames"
								searchKey="songName"
								type="songs"
							/>
						{/if}

						{#if room.enabled_fields?.song_artist}
							<Autocomplete
								bind:value={songArtist}
								placeholder="Artysta"
								index="artists"
								searchKey="artist"
								type="artists"
							/>
						{/if}

						{#if room.enabled_fields?.other}
							<Input
								type="text"
								placeholder="Inne"
								bind:value={otherAnswer}
								disabled={loading}
								class="border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0"
							/>
						{/if}

						<Button
							type="submit"
							disabled={loading || hasSubmitted}
							class="w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
						>
							{loading ? 'Submitting...' : 'Submit Answer'}
						</Button>
					</form>
				{:else}
					<p class="text-center text-gray-200">Answer submitted for this round</p>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if hasJoined && !inTakeoverMode}
			<div class="fixed right-4 top-4 z-20">
				<Button
					on:click={enterTakeoverMode}
					class="border border-gray-700 bg-gray-600 text-white hover:bg-gray-700"
				>
					Tryb przejęć
				</Button>
			</div>
		{/if}

		<!-- Takeover Mode Overlay -->
		{#if inTakeoverMode}
			<div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900">
				{#if !handRaised}
					<button
						on:click={raiseHand}
						class="flex h-full w-full items-center justify-center bg-blue-600 text-4xl font-bold text-white active:bg-blue-800"
					>
						DOTKNIJ BY PODNIEŚĆ ŁAPĘ
					</button>
				{:else if handRaiseResults}
					<div class="flex flex-col items-center justify-center rounded-lg bg-gray-800 p-8">
						<h2 class="mb-4 text-3xl font-bold text-white">
							Jesteś #{handRaiseResults.position}
						</h2>

						{#if handRaiseResults.position > 1}
							<p class="mb-6 text-xl text-white">
								{(handRaiseResults.timeDifferenceMs / 1000).toFixed(3)}s za pierwszym miejscem
							</p>
						{:else}
							<p class="mb-6 text-xl text-green-400">Jesteś pierwszy!</p>
						{/if}

						<h3 class="mb-2 text-xl font-semibold text-white">Kto był pierwszy?</h3>
						<div class="max-h-96 w-full overflow-y-auto">
							<table class="leaderboard-table w-full text-left transition-colors duration-300">
								<thead>
									<tr>
										<th class="px-4 py-2 text-gray-300">Pozycja</th>
										<th class="px-4 py-2 text-gray-300">Gracz</th>
										<th class="px-4 py-2 text-gray-300">Czas</th>
									</tr>
								</thead>
								<tbody>
									{#each playerPositions as player}
										<tr class={player.name === playerName ? 'bg-blue-900/30' : ''}>
											<td class="px-4 py-2 text-gray-200">{player.position}</td>
											<td class="px-4 py-2 text-gray-200">{player.name}</td>
											<td class="px-4 py-2 text-gray-200">
												{player.position === 1
													? '-'
													: `+${(player.timeDifferenceMs / 1000).toFixed(3)}s`}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<Button
							on:click={exitTakeoverMode}
							class="mt-6 border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
						>
							Wyjdź
						</Button>
					</div>
				{:else}
					<div class="text-xl text-white">Przetwarzanie...</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
