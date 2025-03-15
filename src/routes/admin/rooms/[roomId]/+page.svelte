<script>
	//src/routes/admin/rooms/[roomId]/+page.svelte
	import { enhance } from '$app/forms';
	import { invalidateAll, invalidate } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Check, X } from 'lucide-svelte';
	import PointsConfigModal from '$lib/components/admin/PointsConfigModal.svelte';
	import { Plus } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';

	let pointsConfigModalOpen = false;
	let takeoverModeActive = false;
	let handRaiseResults = [];
	let lastUpdated = '';
	let lastChangedPlayer = null;
	let currentCorrectAnswers = [];
	let editingPlayer = null;
	let editValue = 0;
	let editType = null; // 'score' or 'tiebreaker'

	function startEditing(player, type) {
		editingPlayer = player.id;
		editValue = player[type];
		editType = type;
	}

	function cancelEditing() {
		editingPlayer = null;
		editValue = 0;
		editType = null;
	}

	async function saveEditedValue() {
		if (!editingPlayer || editValue === null) return;

		try {
			const { error } = await supabase
				.from('players')
				.update({ [editType]: editValue })
				.eq('id', editingPlayer);

			if (error) throw error;
			toast.success(`${editType === 'score' ? 'Wynik' : 'Tiebreaker'} zaktualizowany`);
			cancelEditing();
			await invalidateAll();
		} catch (error) {
			toast.error(`Aktualizacja nie powiodła się: ${error.message}`);
		}
	}

	async function loadCorrectAnswers(roundId) {
		try {
			const { data, error } = await supabase.from('correct_answers').select('*').eq('round_id', roundId).order('created_at', { ascending: true });

			if (error) throw error;
			currentCorrectAnswers = data || [];
		} catch (error) {
			console.error('Failed to load correct answers:', error);
			toast.error('Nie udało się załadować prawidłowych odpowiedzi');
		}
	}

	export let data;
	$: ({ supabase, room, players, currentAnswers, rounds, roundAnswers, currentRound, hintUsageMap } = data);

	let activeTab = 'answers';
	let selectedRoundId = currentRound?.id;
	let channel;

	$: displayedAnswers = roundAnswers[selectedRoundId] || [];
	$: isCurrentRound = selectedRoundId === room.current_round;

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

			selectedRoundId = newRound.id;
			toast.success(`Utworzono rundę ${nextRoundNumber}`);
			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się utworzyć rundy: ' + error.message);
		}
	}

	function handleRoundChange(event) {
		selectedRoundId = event.target.value;
		loadCorrectAnswers(selectedRoundId);
	}

	async function handleNextRound() {
		try {
			// Get current round number
			const currentRound = rounds.find((r) => r.id === selectedRoundId);
			if (!currentRound) throw new Error('Current round not found');

			const nextRoundNumber = currentRound.round_number + 1;

			// Check if next round already exists
			const existingRound = rounds.find((r) => r.round_number === nextRoundNumber);

			if (existingRound) {
				// Just switch to existing round
				const { error: updateError } = await supabase.from('rooms').update({ current_round: existingRound.id }).eq('id', room.id);

				if (updateError) throw new Error('Failed to update room');
				selectedRoundId = existingRound.id;
				toast.success(`Przesunięto do rundy ${nextRoundNumber}`);
			} else {
				// Create new round
				const { data: newRound, error: insertError } = await supabase
					.from('quiz_rounds')
					.insert({
						room_id: room.id,
						round_number: nextRoundNumber
					})
					.select()
					.single();

				if (insertError) throw new Error('Failed to create round');

				const { error: updateError } = await supabase.from('rooms').update({ current_round: newRound.id }).eq('id', room.id);

				if (updateError) throw new Error('Failed to update room');
				selectedRoundId = newRound.id;
				toast.success(`Utworzono i przesunięto do rundy ${nextRoundNumber}`);
			}
		} catch (error) {
			toast.error(error.message);
		}
	}

	async function handlePreviousRound() {
		try {
			const currentRoundNumber = rounds.find((r) => r.id === selectedRoundId)?.round_number;
			if (!currentRoundNumber || currentRoundNumber <= 1) return;

			const previousRound = rounds.find((r) => r.round_number === currentRoundNumber - 1);
			if (!previousRound) return;

			const { error: updateError } = await supabase.from('rooms').update({ current_round: previousRound.id }).eq('id', room.id);

			if (updateError) throw new Error('Failed to update room');

			selectedRoundId = previousRound.id;
			toast.success(`Przesunięto do rundy ${previousRound.round_number}`);
		} catch (error) {
			toast.error(error.message);
		}
	}

	async function toggleAnswerStatus(answerId, field, currentStatus) {
		if (!isCurrentRound) {
			toast.error('Nie można modyfikować odpowiedzi w poprzednich rundach');
			return;
		}

		// Create a local copy of the current displayed answers
		const optimisticAnswers = displayedAnswers.map((answer) => {
			if (answer.id === answerId) {
				return {
					...answer,
					answer_status: {
						...(answer.answer_status || {}),
						[field]: field === 'main_answer' ? !answer.answer_status?.main_answer : !answer.answer_status?.[field]
					}
				};
			}
			return answer;
		});

		// Optimistically update the displayed answers
		displayedAnswers = optimisticAnswers;

		try {
			let updateData = {};
			if (field === 'main_answer') {
				updateData = {
					answer_status: {
						...(displayedAnswers.find((a) => a.id === answerId).answer_status || {}),
						main_answer: !currentStatus
					}
				};
			} else {
				updateData = {
					answer_status: {
						...(displayedAnswers.find((a) => a.id === answerId).answer_status || {}),
						[field]: !currentStatus
					}
				};
			}

			const { error } = await supabase.from('answers').update(updateData).eq('id', answerId);

			if (error) {
				// If update fails, revert to original state
				displayedAnswers = displayedAnswers.map((answer) => (answer.id === answerId ? { ...answer, answer_status: { ...answer.answer_status, [field]: currentStatus } } : answer));
				throw error;
			}

			toast.success('Zaktualizowano status odpowiedzi');
		} catch (error) {
			toast.error(`Aktualizacja nie powiodła się: ${error.message}`);
		}
	}

	async function awardPointsToCorrectAnswers() {
		if (!isCurrentRound) {
			toast.error('Nie można przyznawać punktów w poprzednich rundach');
			return;
		}

		try {
			// Fetch hint usages for this round
			const { data: hintUsages, error: hintError } = await supabase.from('hint_usages').select('player_name').eq('round_id', selectedRoundId);

			if (hintError) throw hintError;

			// Create a set of player names that used hints for easy lookup
			const hintUsedByPlayer = new Set(hintUsages?.map((h) => h.player_name) || []);

			// Get hint penalty percentage from room settings (default to 40% if not set)
			const hintPenaltyPercent = room.points_config.hint_penalty_percent || 40;

			for (const answer of displayedAnswers) {
				const player = players.find((p) => p.name === answer.player_name);
				if (!player) continue;

				let points = 0;
				let tiebreaker = 0;

				// Main answer points with hint deduction if applicable
				if (answer.answer_status.main_answer) {
					let mainPoints = room.points_config.main_answer;

					// Apply hint penalty if hint was used
					if (hintUsedByPlayer.has(answer.player_name)) {
						// Calculate as float for precision, then round to 2 decimal places
						mainPoints = mainPoints * (1 - hintPenaltyPercent / 100);
						mainPoints = Math.ceil(mainPoints * 100) / 100; // Round up to 2 decimal places
					}

					points += mainPoints;
					// Tiebreaker is not affected by hint usage
					tiebreaker += room.points_config.tiebreaker.main_answer;
				}

				// Extra fields points (not affected by hint usage)
				if (answer.answer_status.song_title) {
					points += room.points_config.song_title;
					tiebreaker += room.points_config.tiebreaker.song_title;
				}
				if (answer.answer_status.song_artist) {
					points += room.points_config.song_artist;
					tiebreaker += room.points_config.tiebreaker.song_artist;
				}
				if (answer.answer_status.other) {
					points += room.points_config.other;
					tiebreaker += room.points_config.tiebreaker.other;
				}

				if (points > 0 || tiebreaker > 0) {
					// Round final points to 2 decimal places
					points = Math.ceil(points * 100) / 100;

					const { error } = await supabase
						.from('players')
						.update({
							score: player.score + points,
							tiebreaker: player.tiebreaker + tiebreaker
						})
						.eq('id', player.id);

					if (error) throw error;
				}
			}
			toast.success('Punkty przyznane pomyślnie');
		} catch (error) {
			toast.error(`Nie udało się przyznać punktów: ${error.message}`);
		}
	}

	async function adjustScore(playerId, field, amount) {
		if (!isCurrentRound) {
			toast.error('Nie można modyfikować wyników w poprzednich rundach');
			return;
		}

		const player = players.find((p) => p.id === playerId);
		if (!player || player[field] + amount < 0) {
			toast.error(player ? 'Wynik nie może być ujemny' : 'Nie znaleziono gracza');
			return;
		}

		try {
			const { error } = await supabase
				.from('players')
				.update({ [field]: player[field] + amount })
				.eq('id', playerId);

			if (error) throw error;
			toast.success(`${field === 'score' ? 'Score' : 'Tiebreaker'} updated`);
		} catch (error) {
			toast.error(`Aktualizacja nie powiodła się: ${error.message}`);
		}
	}

	async function deletePlayer(playerId) {
		try {
			const { error } = await supabase.from('players').delete().eq('id', playerId);
			console.log(playerId);
			if (error) throw error;
			toast.success('Gracz usunięty z gry');
		} catch (error) {
			toast.error('Nie udało się usunąć gracza: ' + error.message);
		}
	}

	async function resetAnswer(playerName) {
		if (!isCurrentRound) {
			toast.error('Nie można resetować odpowiedzi w poprzednich rundach');
			return;
		}

		try {
			const { error } = await supabase.from('answers').delete().eq('room_id', room.id).eq('round_id', selectedRoundId).eq('player_name', playerName);

			if (error) throw error;

			displayedAnswers = displayedAnswers.filter((answer) => answer.player_name !== playerName);
			toast.success('Odpowiedź zresetowana');
		} catch (error) {
			toast.error(error.message);
		}
	}

	async function toggleTakeoverMode() {
		try {
			if (takeoverModeActive) {
				// Deactivate takeover mode
				const { error } = await supabase
					.from('rooms')
					.update({
						takeover_mode: false,
						takeover_start_time: null
					})
					.eq('id', room.id);

				if (error) throw error;

				// Clear hand raises
				const { error: clearError } = await supabase.from('hand_raises').delete().eq('room_id', room.id);

				if (clearError) throw clearError;

				takeoverModeActive = false;
				handRaiseResults = [];
				toast.success('Tryb przejęcia dezaktywowany');
			} else {
				// Activate takeover mode
				const { error } = await supabase
					.from('rooms')
					.update({
						takeover_mode: true,
						takeover_start_time: new Date().toISOString()
					})
					.eq('id', room.id);

				if (error) throw error;

				takeoverModeActive = true;
				toast.success('Tryb przejęcia aktywowany');
			}
		} catch (error) {
			toast.error('Nie udało się przełączyć trybu przejęcia: ' + error.message);
		}
	}

	async function loadHandRaiseResults() {
		try {
			const { data, error } = await supabase.from('hand_raises').select('*').eq('room_id', room.id).order('server_timestamp', { ascending: true });

			if (error) throw error;

			if (data && data.length > 0) {
				const firstTimestamp = new Date(data[0].server_timestamp).getTime();
				const firstLatency = data[0].measured_latency || 0;
				const adjustedFirstTime = firstTimestamp - firstLatency;

				handRaiseResults = data.map((result, index) => {
					const timestamp = new Date(result.server_timestamp).getTime();
					const latency = result.measured_latency || 0;
					const adjustedTime = timestamp - latency;
					const timeDifferenceMs = index === 0 ? 0 : adjustedTime - adjustedFirstTime;

					return {
						name: result.player_name,
						position: index + 1,
						timestamp: result.server_timestamp,
						timeDifferenceMs,
						latency
					};
				});
			} else {
				handRaiseResults = [];
			}
		} catch (error) {
			console.error('Failed to load hand raise results:', error);
			toast.error('Nie udało się zaktualizować wyników podniesienia ręki');
		}
	}

	// Add this to the admin-side script
	async function clearAllHandRaises() {
		try {
			const { error } = await supabase.from('hand_raises').delete().eq('room_id', room.id);

			if (error) throw error;

			handRaiseResults = [];
			toast.success('Wszystkie podniesienia rąk wyczyszczone');
		} catch (error) {
			toast.error('Nie udało się wyczyścić podniesień rąk: ' + error.message);
		}
	}

	onMount(async () => {
		// Check current takeover mode status first
		const { data, error } = await supabase.from('rooms').select('takeover_mode').eq('id', room.id).single();

		if (!error && data) {
			takeoverModeActive = !!data.takeover_mode;

			if (takeoverModeActive) {
				// Load existing hand raise results
				await loadHandRaiseResults();
			}
		}

		// Set up all subscriptions together before calling subscribe()
		channel = supabase
			.channel(`room-management:${room.id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'answers',
					filter: `room_id=eq.${room.id}`
				},
				async (payload) => {
					console.log('Answer change detected:', payload);
					if (payload.eventType === 'DELETE') {
						const deletedAnswer = payload.old;
						if (deletedAnswer.round_id === selectedRoundId) {
							displayedAnswers = displayedAnswers.filter((answer) => answer.player_name !== deletedAnswer.player_name);
						}
					}
					await invalidateAll();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'players',
					filter: `room_id=eq.${room.id}`
				},
				async () => await invalidateAll()
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
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				async (payload) => {
					if (payload.new.current_round !== payload.old?.current_round) {
						selectedRoundId = payload.new.current_round;
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
						// Show update indicator
						const takeoverTab = document.querySelector('[data-value="takeover"]');
						if (takeoverTab) {
							const indicator = document.createElement('span');
							indicator.className = 'inline-block ml-2 w-2 h-2 rounded-full bg-blue-500';
							takeoverTab.appendChild(indicator);
							setTimeout(() => indicator.remove(), 2000);
						}

						// Immediately reload the data
						await loadHandRaiseResults();

						// Add a timestamp to show when the data was last updated
						const now = new Date();
						const timestamp = now.toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit'
						});

						// Add this data to the handRaiseResults object
						handRaiseResults = [...handRaiseResults];
						lastUpdated = timestamp;

						// Highlight the row that changed
						if (payload.eventType === 'INSERT') {
							const newPlayerName = payload.new.player_name;
							lastChangedPlayer = newPlayerName;
							setTimeout(() => {
								lastChangedPlayer = null;
							}, 3000);
						}
					} catch (error) {
						console.error('Failed to load hand raise results:', error);
						toast.error('Nie udało się zaktualizować wyników podniesienia ręki');
					}
				}
			)
			.subscribe();

		return () => {
			invalidate('room');
		};
	});

	$: if (selectedRoundId) {
		loadCorrectAnswers(selectedRoundId);
	}

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="min-h-screen bg-gray-950">
	<div class="container mx-auto p-6">
		<Card.Root class="border-gray-800 bg-gray-900">
			<Card.Header>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-4">
						<Card.Title class="text-white">Pokój: {room.name}</Card.Title>
						<div class="flex items-center gap-4">
							<select bind:value={selectedRoundId} on:change={handleRoundChange} class="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-200">
								{#each rounds as round}
									<option value={round.id}>
										Runda {round.round_number}
										{round.id === room.current_round ? '(Obecna)' : ''}
									</option>
								{/each}
							</select>
							{#if !isCurrentRound}
								<span class="rounded-md bg-yellow-900/20 px-2 py-1 text-xs text-yellow-400"> Przeglądasz poprzednią rundę </span>
							{/if}
						</div>
					</div>
					<div class="flex gap-4">
						<Button on:click={() => (pointsConfigModalOpen = true)} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">Konfiguruj punkty</Button>

						<div class="flex items-center gap-2">
							<Button on:click={() => handlePreviousRound()} disabled={!rounds?.length || currentRound?.round_number <= 1} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">Poprzednia runda</Button>

							<Button on:click={() => handleNextRound()} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">Następna runda</Button>
						</div>

						<Button href="/admin" variant="outline" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">Powrót</Button>
					</div>

					<PointsConfigModal open={pointsConfigModalOpen} roomId={room.id} pointsConfig={room.points_config} {supabase} onOpenChange={(open) => (pointsConfigModalOpen = open)} />
				</div>
			</Card.Header>

			<div class="mb-6 rounded-lg border border-gray-800 bg-gray-800/30 p-4">
				<div class="flex items-center gap-2">
					<h3 class="font-medium text-white">Prawidłowe odpowiedzi:</h3>

					{#if currentCorrectAnswers.length === 0}
						<p class="text-gray-400">Brak prawidłowych odpowiedzi dla tej rundy</p>
					{:else}
						<div class="flex-1 rounded-md bg-gray-800/50 p-3">
							<div class="whitespace-pre-line text-sm font-medium text-gray-300">
								{currentCorrectAnswers.map((answer) => answer.content).join('\n')}
							</div>

							{#if currentCorrectAnswers[0]?.extra_fields}
								<div class="mt-3 flex gap-4 border-t border-gray-700 pt-2 text-sm">
									{#if currentCorrectAnswers[0].extra_fields.song_title}
										<div class="text-gray-300">
											<span class="text-gray-400">Piosenka:</span>
											{currentCorrectAnswers[0].extra_fields.song_title}
										</div>
									{/if}
									{#if currentCorrectAnswers[0].extra_fields.song_artist}
										<div class="text-gray-300">
											<span class="text-gray-400">Artysta:</span>
											{currentCorrectAnswers[0].extra_fields.song_artist}
										</div>
									{/if}
									{#if currentCorrectAnswers[0].extra_fields.other}
										<div class="text-gray-300">
											<span class="text-gray-400">Inne:</span>
											{currentCorrectAnswers[0].extra_fields.other}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<Card.Content>
				<Tabs.Root value={activeTab} onValueChange={(v) => (activeTab = v)}>
					<Tabs.List class="mb-4">
						<Tabs.Trigger value="answers" class="text-gray-300">Odpowiedzi</Tabs.Trigger>
						<Tabs.Trigger value="teams" class="text-gray-300">Drużyny</Tabs.Trigger>
						<Tabs.Trigger value="takeover" class="text-gray-300">Przejęcia</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content value="answers">
						{#if displayedAnswers.length === 0}
							<div class="p-4 text-center text-gray-400">Brak odpowiedzi w tej rundzie</div>
						{:else}
							<div class="mb-4">
								<Button on:click={awardPointsToCorrectAnswers} disabled={!isCurrentRound} class="bg-green-600/50 text-white hover:bg-green-500/50">Dodaj punkty do dobrych odpowiedzi</Button>
							</div>
							<Table.Root>
								<Table.Header>
									<Table.Row class="border-gray-800">
										<Table.Head class="text-gray-300">Drużyna</Table.Head>
										<Table.Head class="text-gray-300">Nazwa anime</Table.Head>
										{#if room.enabled_fields?.song_title}
											<Table.Head class="text-gray-300">Nazwa piosenki</Table.Head>
										{/if}
										{#if room.enabled_fields?.song_artist}
											<Table.Head class="text-gray-300">Artysta</Table.Head>
										{/if}
										{#if room.enabled_fields?.other}
											<Table.Head class="text-gray-300">Inne</Table.Head>
										{/if}
										<Table.Head class="text-gray-300">Czas</Table.Head>
										<Table.Head class="text-gray-300">Wynik</Table.Head>
										<Table.Head class="text-center text-gray-300">Tiebreaker</Table.Head>
										<Table.Head class="text-center text-gray-300">Podpowiedź</Table.Head>
										<Table.Head class="text-gray-300">Akcje</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each displayedAnswers.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) as answer}
										{@const player = players.find((p) => p.name === answer.player_name)}
										<Table.Row class="border-gray-800 hover:bg-gray-800/30">
											<Table.Cell class="font-medium text-gray-200">{answer.player_name}</Table.Cell>
											<Table.Cell>
												<div class="flex items-center gap-2">
													<span class="text-gray-200">{answer.content}</span>
													<button on:click={() => toggleAnswerStatus(answer.id, 'main_answer', answer.answer_status?.main_answer)} disabled={!isCurrentRound} class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800">
														{#if answer.answer_status?.main_answer}
															<Check class="h-6 w-6 text-green-500" />
														{:else}
															<X class="h-6 w-6 text-red-500" />
														{/if}
													</button>
												</div>
											</Table.Cell>

											{#if room.enabled_fields?.song_title}
												<Table.Cell>
													<div class="flex items-center gap-2">
														<span class="text-gray-200">{answer.extra_fields?.song_title || '-'}</span>
														{#if answer.extra_fields?.song_title}
															<button on:click={() => toggleAnswerStatus(answer.id, 'song_title', answer.answer_status?.song_title)} disabled={!isCurrentRound} class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800">
																{#if answer.answer_status?.song_title}
																	<Check class="h-6 w-6 text-green-500" />
																{:else}
																	<X class="h-6 w-6 text-red-500" />
																{/if}
															</button>
														{/if}
													</div>
												</Table.Cell>
											{/if}

											{#if room.enabled_fields?.song_artist}
												<Table.Cell>
													<div class="flex items-center gap-2">
														<span class="text-gray-200">{answer.extra_fields?.song_artist || '-'}</span>
														{#if answer.extra_fields?.song_artist}
															<button on:click={() => toggleAnswerStatus(answer.id, 'song_artist', answer.answer_status?.song_artist)} disabled={!isCurrentRound} class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800">
																{#if answer.answer_status?.song_artist}
																	<Check class="h-6 w-6 text-green-500" />
																{:else}
																	<X class="h-6 w-6 text-red-500" />
																{/if}
															</button>
														{/if}
													</div>
												</Table.Cell>
											{/if}

											{#if room.enabled_fields?.other}
												<Table.Cell>
													<div class="flex items-center gap-2">
														<span class="text-gray-200">{answer.extra_fields?.other || '-'}</span>
														{#if answer.extra_fields?.other}
															<button on:click={() => toggleAnswerStatus(answer.id, 'other', answer.answer_status?.other)} disabled={!isCurrentRound} class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800">
																{#if answer.answer_status?.other}
																	<Check class="h-6 w-6 text-green-500" />
																{:else}
																	<X class="h-6 w-6 text-red-500" />
																{/if}
															</button>
														{/if}
													</div>
												</Table.Cell>
											{/if}

											<Table.Cell class="text-gray-200">
												{new Date(answer.created_at).toLocaleTimeString()}
											</Table.Cell>

											<Table.Cell>
												<span class="text-center text-gray-200">{player?.score || 0}</span>
											</Table.Cell>

											<Table.Cell>
												<span class="text-center text-gray-200">{player?.tiebreaker || 0}</span>
											</Table.Cell>

											<Table.Cell class="text-center">
												{#if hintUsageMap[`${answer.player_name}-${answer.round_id}`]}
													<span class="rounded-md bg-yellow-900/30 px-2 py-1 text-xs text-yellow-400"> Użyta </span>
												{:else}
													<span class="text-gray-400">-</span>
												{/if}
											</Table.Cell>

											<Table.Cell>
												<Button size="sm" variant="outline" disabled={!isCurrentRound} on:click={() => resetAnswer(answer.player_name)} class="border-red-900 bg-gray-800 text-red-400 hover:bg-gray-700">Reset</Button>
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						{/if}
					</Tabs.Content>

					<Tabs.Content value="teams">
						<Table.Root>
							<Table.Header>
								<Table.Row class="border-gray-800">
									<Table.Head class="text-gray-300">Drużyna</Table.Head>
									<Table.Head class="text-gray-300">Wynik</Table.Head>
									<Table.Head class="text-gray-300">Tiebreaker</Table.Head>
									<Table.Head class="text-gray-300">Status</Table.Head>
									<Table.Head class="text-gray-300">Akcje</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each players as player}
									{@const hasAnswered = displayedAnswers.some((a) => a.player_name === player.name)}
									<Table.Row class="border-gray-800 hover:bg-gray-800/30">
										<Table.Cell class="font-medium text-gray-200">{player.name}</Table.Cell>

										<!-- Score cell with editing capability -->
										<Table.Cell class="text-gray-200">
											{#if editingPlayer === player.id && editType === 'score'}
												<div class="flex items-center gap-2">
													<Input type="number" bind:value={editValue} class="w-24 border-gray-700 bg-gray-800 text-gray-100" />
													<button class="text-green-400 hover:text-green-300" on:click={saveEditedValue}>
														<Check class="h-4 w-4" />
													</button>
													<button class="text-red-400 hover:text-red-300" on:click={cancelEditing}>
														<X class="h-4 w-4" />
													</button>
												</div>
											{:else}
												<div class="flex items-center gap-1">
													{player.score}
													<!-- svelte-ignore a11y_consider_explicit_label -->
													<button class="ml-2 text-gray-400 hover:text-gray-300" on:click={() => startEditing(player, 'score')}>
														<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
															<path d="M12 20h9"></path>
															<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
														</svg>
													</button>
												</div>
											{/if}
										</Table.Cell>

										<!-- Tiebreaker cell with editing capability -->
										<Table.Cell class="text-gray-200">
											{#if editingPlayer === player.id && editType === 'tiebreaker'}
												<div class="flex items-center gap-2">
													<Input type="number" bind:value={editValue} class="w-24 border-gray-700 bg-gray-800 text-gray-100" />
													<button class="text-green-400 hover:text-green-300" on:click={saveEditedValue}>
														<Check class="h-4 w-4" />
													</button>
													<button class="text-red-400 hover:text-red-300" on:click={cancelEditing}>
														<X class="h-4 w-4" />
													</button>
												</div>
											{:else}
												<div class="flex items-center gap-1">
													{player.tiebreaker}
													<!-- svelte-ignore a11y_consider_explicit_label -->
													<button class="ml-2 text-gray-400 hover:text-gray-300" on:click={() => startEditing(player, 'tiebreaker')}>
														<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
															<path d="M12 20h9"></path>
															<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
														</svg>
													</button>
												</div>
											{/if}
										</Table.Cell>

										<Table.Cell>
											<span class={hasAnswered ? 'text-green-400' : 'text-gray-400'}>
												{hasAnswered ? 'Answered' : 'No answer'}
											</span>
										</Table.Cell>

										<Table.Cell>
											<Button size="sm" variant="destructive" on:click={() => deletePlayer(player.id)} class="border border-red-900 bg-gray-900 text-red-400 hover:bg-gray-800">Usuń</Button>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</Tabs.Content>

					<Tabs.Content value="takeover">
						<div class="mb-6">
							<Button on:click={toggleTakeoverMode} class={takeoverModeActive ? 'bg-red-600/50 text-white hover:bg-red-500/50' : 'bg-green-600/50 text-white hover:bg-green-500/50'}>
								{takeoverModeActive ? 'Wyłącz Tryb Przejęć ' : 'Włącz Tryb Przejęć'}
							</Button>
							<Button on:click={clearAllHandRaises} class="bg-amber-600/50 text-white hover:bg-amber-500/50">Wyczyść przejęcia</Button>

							{#if lastUpdated}
								<span class="ml-4 text-sm text-gray-400">Ostatnia aktualizacja: {lastUpdated}</span>
							{/if}
						</div>

						{#if takeoverModeActive || handRaiseResults.length > 0}
							<Table.Root>
								<Table.Header>
									<Table.Row class="border-gray-800">
										<Table.Head class="text-gray-300">Pozycja</Table.Head>
										<Table.Head class="text-gray-300">Gracz</Table.Head>
										<Table.Head class="text-gray-300">Czas</Table.Head>
										<Table.Head class="text-gray-300">Różnica</Table.Head>
										<Table.Head class="text-gray-300">Ping</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each handRaiseResults as result}
										<Table.Row class={`border-gray-800 transition-colors duration-300 ${result.name === lastChangedPlayer ? 'bg-blue-900/30' : ''}`}>
											<Table.Cell class="text-gray-200">{result.position}</Table.Cell>
											<Table.Cell class="text-gray-200">{result.name}</Table.Cell>
											<Table.Cell class="text-gray-200">
												{new Date(result.timestamp).toLocaleTimeString([], {
													hour: '2-digit',
													minute: '2-digit',
													second: '2-digit',
													fractionalSecondDigits: 3
												})}
											</Table.Cell>
											<Table.Cell class="text-gray-200">
												{result.position === 1 ? '-' : `+${(result.timeDifferenceMs / 1000).toFixed(3)}s`}
											</Table.Cell>
											<Table.Cell class="text-gray-200">
												{result.latency || 0}ms
											</Table.Cell>
										</Table.Row>
									{/each}

									{#if handRaiseResults.length === 0}
										<Table.Row class="border-gray-800">
											<Table.Cell colspan="5" class="py-8 text-center text-gray-400">Brak przejęć</Table.Cell>
										</Table.Row>
									{/if}
								</Table.Body>
							</Table.Root>
						{/if}
					</Tabs.Content>
				</Tabs.Root>
			</Card.Content>
		</Card.Root>
	</div>
</div>

<style>
	*:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 2px hsl(var(--background)),
			0 0 0 4px hsl(var(--ring));
	}
</style>
