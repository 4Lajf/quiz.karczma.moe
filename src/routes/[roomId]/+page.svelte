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
	let networkLatency = 0;
	let latencyMeasured = false;
	let latencyInterval = null;
	let latencyHistory = [];
	let displayLatency = 0;
	let measuringLatency = false;
	let hintRequested = false;
	let maskedAnswer = '';

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

	async function checkHintStatus() {
		if (!hasJoined || !playerName || !room?.current_round) return false;

		const { data: hintUsage } = await supabase.from('hint_usages').select('*').eq('room_id', room.id).eq('round_id', room.current_round).eq('player_name', playerName).maybeSingle();

		return !!hintUsage;
	}

	async function requestHint() {
		try {
			const response = await fetch('/api/hint', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					roomId: room.id,
					roundId: room.current_round,
					playerName: playerName
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to get hint');
			}

			maskedAnswer = result.hint;
			hintRequested = true;

			toast.info('Podpowiedź została wygenerowana');
		} catch (error) {
			console.error('Error fetching hint:', error);
			toast.error('Nie udało się pobrać podpowiedzi: ' + error.message);
		}
	}

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

		const [{ data: existingAnswer }, isHintRequested] = await Promise.all([supabase.from('answers').select('*, extra_fields').eq('room_id', room.id).eq('player_name', playerName).eq('round_id', room.current_round).maybeSingle(), checkHintStatus()]);

		// Update states
		hasSubmitted = !!existingAnswer;
		hintRequested = isHintRequested;

		if (existingAnswer) {
			// If there's an existing answer, set answer and extra fields
			answer = existingAnswer.content;
			if (existingAnswer.extra_fields) {
				songTitle = existingAnswer.extra_fields.song_title || '';
				songArtist = existingAnswer.extra_fields.song_artist || '';
				otherAnswer = existingAnswer.extra_fields.other || '';
			}
		} else {
			// If no answer exists, reset all fields except for hintRequested
			resetAnswerState();
		}

		// If hint was requested but we don't have the hint yet, fetch it again
		if (hintRequested && !maskedAnswer) {
			const response = await fetch('/api/hint', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					roomId: room.id,
					roundId: room.current_round,
					playerName: playerName
				})
			});

			if (response.ok) {
				const result = await response.json();
				maskedAnswer = result.hint;
			}
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
						toast.info('Rozpoczęła się nowa runda!');
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
					table: 'hint_usages',
					filter: `player_name=eq.${playerName}`
				},
				async () => {
					hintRequested = true;
					await checkAnswerStatus();
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
						toast.info('Twoja odpowiedź została zresetowana przez administratora');
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
						toast.info('Tryb przejęcia został wyłączony');
					}
				}
			)
			.subscribe();
	}

	async function joinGame() {
		if (!playerName.trim()) {
			toast.error('Wprowadź swoje imię');
			return;
		}
		loading = true;
		try {
			const { data: existingPlayers, error: fetchError } = await supabase.from('players').select('*').eq('room_id', room.id).ilike('name', playerName);

			if (fetchError) throw fetchError;

			if (existingPlayers?.length > 0) {
				hasJoined = true; // Set hasJoined first
				await checkAnswerStatus(); // Then check answer status
				if (hasSubmitted) {
					toast.success(`Dołączono ponownie jako ${playerName} - Odpowiedź już przesłana`);
				} else {
					toast.success(`Dołączono ponownie jako ${playerName}`);
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
						toast.error('Nazwa jest już zajęta');
						return;
					}
					throw insertError;
				}
				hasJoined = true;
				hasSubmitted = false;
				toast.success('Dołączono jako ' + playerName);
			}

			subscribeToChanges();
		} catch (error) {
			if (!error.message.includes('No rows found')) {
				toast.error('Błąd: ' + error.message);
			}
		} finally {
			loading = false;
		}
	}

	async function submitAnswer() {
		if (!answer.trim() || hasSubmitted) {
			toast.error(hasSubmitted ? 'Już przesłano' : 'Wprowadź odpowiedź');
			return;
		}

		if (answer.trim().length > 512) {
			toast.error('Odpowiedź musi mieć 512 znaków lub mniej');
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
			toast.success('Odpowiedź przesłana');
			resetAnswerState();
		} catch (error) {
			toast.error('Błąd: ' + error.message);
		} finally {
			loading = false;
		}
	}

	async function enterTakeoverMode() {
		inTakeoverMode = true;
		// Start monitoring latency
		setupLatencyMonitoring();
	}

	async function raiseHand() {
		if (handRaised) return;

		// Force a fresh latency measurement before submission
		if (!measuringLatency) {
			await measureNetworkLatency();
		}

		const clientTimestamp = Date.now();
		handRaised = true;

		try {
			const { error } = await supabase.from('hand_raises').insert({
				room_id: room.id,
				player_name: playerName,
				client_timestamp: clientTimestamp,
				measured_latency: networkLatency // Use the latest latency measurement
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
			toast.error('Nie udało się przejąć');
			handRaised = false;
		}
	}

	function exitTakeoverMode() {
		inTakeoverMode = false;
		handRaised = false;
		handRaiseResults = null;
		// Stop monitoring latency
		cleanupLatencyMonitoring();
	}

	async function loadHandRaiseResults() {
		try {
			const { data, error } = await supabase.from('hand_raises').select('*').eq('room_id', room.id).order('server_timestamp', { ascending: true });

			if (error) throw error;

			if (data && data.length > 0) {
				// Find the player's position
				const playerIndex = data.findIndex((d) => d.player_name === playerName);

				if (playerIndex >= 0) {
					const position = playerIndex + 1;

					// Calculate time differences with latency correction
					const firstTimestamp = new Date(data[0].server_timestamp).getTime();
					const firstLatency = data[0].measured_latency || 0;

					const playerTimestamp = new Date(data[playerIndex].server_timestamp).getTime();
					const playerLatency = data[playerIndex].measured_latency || 0;

					// Adjust timestamps by subtracting latency
					const adjustedFirstTime = firstTimestamp - firstLatency;
					const adjustedPlayerTime = playerTimestamp - playerLatency;

					const timeDifferenceMs = adjustedPlayerTime - adjustedFirstTime;

					handRaiseResults = {
						position,
						timeDifferenceMs,
						latency: playerLatency
					};
				}

				// Update the full leaderboard with latency-corrected times
				const firstTimestamp = new Date(data[0].server_timestamp).getTime();
				const firstLatency = data[0].measured_latency || 0;
				const adjustedFirstTime = firstTimestamp - firstLatency;

				playerPositions = data.map((d, index) => {
					const timestamp = new Date(d.server_timestamp).getTime();
					const latency = d.measured_latency || 0;
					const adjustedTime = timestamp - latency;
					const timeDifferenceMs = index === 0 ? 0 : adjustedTime - adjustedFirstTime;

					return {
						name: d.player_name,
						position: index + 1,
						timeDifferenceMs,
						latency
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

	async function measureNetworkLatency(continuous = false) {
		if (measuringLatency) return networkLatency;

		measuringLatency = true;

		try {
			const startTime = Date.now();
			// Make a lightweight ping request to the server
			const { data } = await supabase.rpc('ping');
			const endTime = Date.now();
			const currentLatency = endTime - startTime;

			// Add to history (keep last 5 measurements)
			latencyHistory.push(currentLatency);
			if (latencyHistory.length > 5) {
				latencyHistory.shift();
			}

			// Calculate average latency
			const sortedLatencies = [...latencyHistory].sort((a, b) => a - b);

			// Remove outliers (highest and lowest if we have enough samples)
			let validMeasurements = sortedLatencies;
			if (sortedLatencies.length >= 4) {
				validMeasurements = sortedLatencies.slice(1, -1);
			}

			networkLatency = Math.round(validMeasurements.reduce((sum, val) => sum + val, 0) / validMeasurements.length);

			// Update displayed latency with color indicator
			displayLatency = networkLatency;
			latencyMeasured = true;

			console.log(`Current network latency: ${networkLatency}ms`);
		} catch (error) {
			console.error('Error measuring latency:', error);
		} finally {
			measuringLatency = false;
		}

		return networkLatency;
	}

	function setupLatencyMonitoring() {
		if (latencyInterval) {
			clearInterval(latencyInterval);
		}

		// Take initial measurement
		measureNetworkLatency();

		// Then set up interval for continuous monitoring
		latencyInterval = setInterval(async () => {
			await measureNetworkLatency(true);
		}, 1000); // Check every 3 seconds
	}

	function cleanupLatencyMonitoring() {
		if (latencyInterval) {
			clearInterval(latencyInterval);
			latencyInterval = null;
		}
	}

	onDestroy(() => {
		cleanupLatencyMonitoring();
		if (channel) channel.unsubscribe();
	});

	function getLatencyColorClass(latency) {
		if (latency < 50) return 'text-green-400';
		if (latency < 150) return 'text-yellow-400';
		return 'text-red-400';
	}
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
						<Input type="text" placeholder="Twój nick" bind:value={playerName} required disabled={loading} class="border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0" />
						<Button type="submit" disabled={loading} class="w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
							{loading ? 'Dołączanie...' : 'Dołącz do pokoju'}
						</Button>
					</form>
				{:else if !hasSubmitted}
					<div class="mb-6 overflow-hidden rounded-xl border border-gray-700 bg-gray-800/60 shadow-lg">
						{#if !hintRequested && room.enabled_fields?.hint_mode}
							<div class="flex items-center justify-between p-4">
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700/50 text-xl text-blue-400">?</div>
								</div>
								<Button on:click={requestHint} class="bg-blue-600/50 text-white hover:bg-blue-600/70" size="sm">
									Pokaż podpowiedź (-{room.points_config?.hint_penalty_percent || 40}% punktów)
								</Button>
							</div>
						{:else if hintRequested}
							<div class="p-4">
								<div class="mb-2 flex items-center gap-3">
									<div class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/30 text-lg text-blue-400">
										<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<circle cx="12" cy="12" r="10"></circle>
											<line x1="12" y1="16" x2="12" y2="12"></line>
											<line x1="12" y1="8" x2="12.01" y2="8"></line>
										</svg>
									</div>
									<h3 class="font-medium text-blue-400">Podpowiedź</h3>
								</div>
								<div class="mt-2 rounded-lg bg-gray-900/60 p-3">
									{#if maskedAnswer}
										<p class="text-center font-mono text-lg tracking-tight text-white">
											<!-- Process the hint to make it more word-like -->
											{#each maskedAnswer.split(' ') as word, i}
												<span class="mb-1 mr-2 inline-block">
													{#each word.split('') as char}
														<span class={char === '_' ? 'mx-px' : char === '•' ? 'mx-px text-blue-500' : 'mx-px font-bold text-blue-400'}>
															{char}
														</span>
													{/each}
												</span>
											{/each}
										</p>
									{:else}
										<p class="text-center font-mono text-lg text-white">Ładowanie...</p>
									{/if}
								</div>
								<p class="mt-2 text-center text-xs text-gray-400">
									<span class="mx-auto inline-flex items-center rounded border border-gray-700 bg-gray-800/80 px-2 py-1 font-mono text-sm text-blue-400">
										<span class="mr-1 font-bold">•</span> = Dowolny znak specjalny
									</span>
								</p>
							</div>
						{/if}
					</div>

					<form on:submit|preventDefault={submitAnswer} class="space-y-4">
						<Autocomplete bind:value={answer} placeholder="Nazwa anime" index="animeTitles" searchKey="animeTitle" type="anime" />

						{#if room.enabled_fields?.song_title}
							<Autocomplete bind:value={songTitle} placeholder="Tytuł piosenki" index="songNames" searchKey="songName" type="songs" />
						{/if}

						{#if room.enabled_fields?.song_artist}
							<Autocomplete bind:value={songArtist} placeholder="Artysta" index="artists" searchKey="artist" type="artists" />
						{/if}

						{#if room.enabled_fields?.other}
							<Input type="text" placeholder="Inne" bind:value={otherAnswer} disabled={loading} class="border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0" />
						{/if}

						<Button type="submit" disabled={loading || hasSubmitted} class="w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
							{loading ? 'Wysyłanie...' : 'Wyślij odpowiedź'}
						</Button>
					</form>
				{:else}
					<p class="text-center text-gray-200">Odpowiedź dla tej rundy została wysłana</p>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if hasJoined && !inTakeoverMode}
			<div class="fixed right-4 top-4 z-20">
				<Button on:click={enterTakeoverMode} class="border border-gray-700 bg-gray-600 text-white hover:bg-gray-700">Tryb przejęć</Button>
			</div>
		{/if}

		<!-- Takeover Mode Overlay -->
		{#if inTakeoverMode}
			<div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900">
				{#if !handRaised}
					<div class="absolute right-4 top-4 flex items-center gap-2 rounded-lg bg-gray-800 p-3">
						<span class="text-gray-300">Twój ping:</span>
						<span class={getLatencyColorClass(displayLatency)}>
							{displayLatency}ms
							<span class="text-xs">
								{#if displayLatency < 50}
									(Doskonały)
								{:else if displayLatency < 150}
									(Dobry)
								{:else}
									(Wysoki)
								{/if}
							</span>
						</span>
					</div>

					<button on:click={raiseHand} class="flex h-full w-full items-center justify-center bg-blue-600 text-4xl font-bold text-white active:bg-blue-800"> DOTKNIJ BY PODNIEŚĆ ŁAPĘ </button>
				{:else if handRaiseResults}
					<div class="flex flex-col items-center justify-center rounded-lg bg-gray-800 p-8">
						<h2 class="mb-4 text-3xl font-bold text-white">
							Jesteś #{handRaiseResults.position}
						</h2>

						{#if handRaiseResults.position > 1}
							<p class="mb-2 text-xl text-white">
								{(handRaiseResults.timeDifferenceMs / 1000).toFixed(3)}s za pierwszym miejscem
							</p>
							<p class="mb-6 text-sm text-gray-400">
								Twój ping: <span class={getLatencyColorClass(handRaiseResults.latency)}>{handRaiseResults.latency}ms</span>
							</p>
						{:else}
							<p class="mb-2 text-xl text-green-400">Jesteś pierwszy!</p>
							<p class="mb-6 text-sm text-gray-400">
								Twój ping: <span class={getLatencyColorClass(handRaiseResults.latency)}>{handRaiseResults.latency}ms</span>
							</p>
						{/if}

						<h3 class="mb-2 text-xl font-semibold text-white">Kto był pierwszy?</h3>
						<div class="max-h-96 w-full overflow-y-auto">
							<table class="leaderboard-table w-full text-left transition-colors duration-300">
								<thead>
									<tr>
										<th class="px-4 py-2 text-gray-300">Pozycja</th>
										<th class="px-4 py-2 text-gray-300">Gracz</th>
										<th class="px-4 py-2 text-gray-300">Czas</th>
										<th class="px-4 py-2 text-gray-300">Ping</th>
									</tr>
								</thead>
								<tbody>
									{#each playerPositions as player}
										<tr class={player.name === playerName ? 'bg-blue-900/30' : ''}>
											<td class="px-4 py-2 text-gray-200">{player.position}</td>
											<td class="px-4 py-2 text-gray-200">{player.name}</td>
											<td class="px-4 py-2 text-gray-200">
												{player.position === 1 ? '-' : `+${(player.timeDifferenceMs / 1000).toFixed(3)}s`}
											</td>
											<td class="px-4 py-2">
												<span class={getLatencyColorClass(player.latency)}>
													{player.latency || 0}ms
												</span>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<Button on:click={exitTakeoverMode} class="mt-6 border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">Wyjdź</Button>
					</div>
				{:else}
					<div class="text-xl text-white">Przetwarzanie...</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
