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

	let pointsConfigModalOpen = false;
	let takeoverModeActive = false;
	let handRaiseResults = [];
	let lastUpdated = '';
	let lastChangedPlayer = null;

	export let data;
	$: ({ supabase, room, players, currentAnswers, rounds, roundAnswers, currentRound } = data);

	let activeTab = 'answers';
	let selectedRoundId = currentRound?.id;
	let channel;

	$: displayedAnswers = roundAnswers[selectedRoundId] || [];
	$: isCurrentRound = selectedRoundId === room.current_round;

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

	function handleRoundChange(event) {
		selectedRoundId = event.target.value;
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
				const { error: updateError } = await supabase
					.from('rooms')
					.update({ current_round: existingRound.id })
					.eq('id', room.id);

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

				const { error: updateError } = await supabase
					.from('rooms')
					.update({ current_round: newRound.id })
					.eq('id', room.id);

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

			const { error: updateError } = await supabase
				.from('rooms')
				.update({ current_round: previousRound.id })
				.eq('id', room.id);

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

		try {
			const answer = displayedAnswers.find((a) => a.id === answerId);
			if (!answer) return;

			let updateData = {};
			if (field === 'main_answer') {
				updateData = {
					answer_status: {
						...(answer.answer_status || {}),
						main_answer: !answer.answer_status?.main_answer
					}
				};
			} else {
				updateData = {
					answer_status: {
						...(answer.answer_status || {}),
						[field]: !answer.answer_status?.[field]
					}
				};
			}

			const { error } = await supabase.from('answers').update(updateData).eq('id', answerId);

			if (error) throw error;
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
			for (const answer of displayedAnswers) {
				const player = players.find((p) => p.name === answer.player_name);
				if (!player) continue;

				let points = 0;
				let tiebreaker = 0;

				// Main answer points
				if (answer.answer_status.main_answer) {
					points += room.points_config.main_answer;
					tiebreaker += room.points_config.tiebreaker.main_answer;
				}

				// Extra fields points
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
			const { error } = await supabase
				.from('answers')
				.delete()
				.eq('room_id', room.id)
				.eq('round_id', selectedRoundId)
				.eq('player_name', playerName);

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
				const { error: clearError } = await supabase
					.from('hand_raises')
					.delete()
					.eq('room_id', room.id);

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
			const { data, error } = await supabase
				.from('hand_raises')
				.select('*')
				.eq('room_id', room.id)
				.order('server_timestamp', { ascending: true });

			if (error) throw error;

			if (data && data.length > 0) {
				const firstTimestamp = new Date(data[0].server_timestamp).getTime();

				handRaiseResults = data.map((result, index) => {
					const timestamp = new Date(result.server_timestamp).getTime();
					const timeDifferenceMs = index === 0 ? 0 : timestamp - firstTimestamp;

					return {
						name: result.player_name,
						position: index + 1,
						timestamp: result.server_timestamp,
						timeDifferenceMs
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
		const { data, error } = await supabase
			.from('rooms')
			.select('takeover_mode')
			.eq('id', room.id)
			.single();

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
							displayedAnswers = displayedAnswers.filter(
								(answer) => answer.player_name !== deletedAnswer.player_name
							);
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
						<Card.Title class="text-white">{room.name}</Card.Title>
						<div class="flex items-center gap-4">
							<select
								bind:value={selectedRoundId}
								on:change={handleRoundChange}
								class="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-200"
							>
								{#each rounds as round}
									<option value={round.id}>
										Runda {round.round_number}
										{round.id === room.current_round ? '(Current)' : ''}
									</option>
								{/each}
							</select>
							{#if !isCurrentRound}
								<span class="rounded-md bg-yellow-900/20 px-2 py-1 text-xs text-yellow-400">
									Oglądasz poprzednią rundę
								</span>
							{/if}
						</div>
					</div>
					<div class="flex gap-4">
						<Button
							on:click={() => (pointsConfigModalOpen = true)}
							class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
						>
							Konfiguruj punkty
						</Button>

						<div class="flex items-center gap-2">
							<Button
								on:click={() => handlePreviousRound()}
								disabled={!rounds?.length || currentRound?.round_number <= 1}
								class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
							>
								Poprzednia runda
							</Button>

							<select
								bind:value={selectedRoundId}
								on:change={handleRoundChange}
								class="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-200"
							>
								{#each rounds as round}
									<option value={round.id}>
										Runda {round.round_number}
										{round.id === room.current_round ? '(Current)' : ''}
									</option>
								{/each}
							</select>

							<Button
								on:click={() => handleNextRound()}
								class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
							>
								Następna runda
							</Button>

							<Button
								on:click={createNewRound}
								class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
							>
								<Plus class="h-4 w-4" />
								Nowa runda
							</Button>
						</div>

						<Button
							href="/admin"
							variant="outline"
							class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
						>
							Powrót
						</Button>
					</div>

					<PointsConfigModal
						open={pointsConfigModalOpen}
						roomId={room.id}
						pointsConfig={room.points_config}
						{supabase}
						onOpenChange={(open) => (pointsConfigModalOpen = open)}
					/>
				</div>
			</Card.Header>
			<Card.Content>
				<Tabs.Root value={activeTab} onValueChange={(v) => (activeTab = v)}>
					<Tabs.List class="mb-4">
						<Tabs.Trigger value="answers" class="text-gray-300">Round Answers</Tabs.Trigger>
						<Tabs.Trigger value="teams" class="text-gray-300">All Teams</Tabs.Trigger>
						<Tabs.Trigger value="takeover" class="text-gray-300">Takeover Mode</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content value="answers">
						{#if displayedAnswers.length === 0}
							<div class="p-4 text-center text-gray-400">No answers submitted for this round</div>
						{:else}
							<div class="mb-4">
								<Button
									on:click={awardPointsToCorrectAnswers}
									disabled={!isCurrentRound}
									class="bg-green-600/50 text-white hover:bg-green-500/50"
								>
									Dodaj punkty do dobrych odpowiedzi
								</Button>
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
										<Table.Head class="text-gray-300">Akcje</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each displayedAnswers.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) as answer}
										{@const player = players.find((p) => p.name === answer.player_name)}
										<Table.Row class="border-gray-800 hover:bg-gray-800/30">
											<Table.Cell class="font-medium text-gray-200">{answer.player_name}</Table.Cell
											>
											<Table.Cell>
												<div class="flex items-center gap-2">
													<span class="text-gray-200">{answer.content}</span>
													<button
														on:click={() =>
															toggleAnswerStatus(
																answer.id,
																'main_answer',
																answer.answer_status?.main_answer
															)}
														disabled={!isCurrentRound}
														class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800"
													>
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
														<span class="text-gray-200"
															>{answer.extra_fields?.song_title || '-'}</span
														>
														{#if answer.extra_fields?.song_title}
															<button
																on:click={() =>
																	toggleAnswerStatus(
																		answer.id,
																		'song_title',
																		answer.answer_status?.song_title
																	)}
																disabled={!isCurrentRound}
																class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800"
															>
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
														<span class="text-gray-200"
															>{answer.extra_fields?.song_artist || '-'}</span
														>
														{#if answer.extra_fields?.song_artist}
															<button
																on:click={() =>
																	toggleAnswerStatus(
																		answer.id,
																		'song_artist',
																		answer.answer_status?.song_artist
																	)}
																disabled={!isCurrentRound}
																class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800"
															>
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
															<button
																on:click={() =>
																	toggleAnswerStatus(
																		answer.id,
																		'other',
																		answer.answer_status?.other
																	)}
																disabled={!isCurrentRound}
																class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800"
															>
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

											<Table.Cell>
												<Button
													size="sm"
													variant="outline"
													disabled={!isCurrentRound}
													on:click={() => resetAnswer(answer.player_name)}
													class="border-red-900 bg-gray-800 text-red-400 hover:bg-gray-700"
												>
													Reset
												</Button>
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
									<Table.Head class="text-gray-300">Team</Table.Head>
									<Table.Head class="text-gray-300">Score</Table.Head>
									<Table.Head class="text-gray-300">Tiebreaker</Table.Head>
									<Table.Head class="text-gray-300">Status</Table.Head>
									<Table.Head class="text-gray-300">Actions</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each players as player}
									{@const hasAnswered = displayedAnswers.some((a) => a.player_name === player.name)}
									<Table.Row class="border-gray-800 hover:bg-gray-800/30">
										<Table.Cell class="font-medium text-gray-200">{player.name}</Table.Cell>
										<Table.Cell class="text-gray-200">{player.score}</Table.Cell>
										<Table.Cell class="text-gray-200">{player.tiebreaker}</Table.Cell>
										<Table.Cell>
											<span class={hasAnswered ? 'text-green-400' : 'text-gray-400'}>
												{hasAnswered ? 'Answered' : 'No answer'}
											</span>
										</Table.Cell>
										<Table.Cell>
											<Button
												size="sm"
												variant="destructive"
												on:click={() => deletePlayer(player.id)}
												class="border border-red-900 bg-gray-900 text-red-400 hover:bg-gray-800"
											>
												Usuń
											</Button>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</Tabs.Content>

					<Tabs.Content value="takeover">
						<div class="mb-6">
							<Button
								on:click={toggleTakeoverMode}
								class={takeoverModeActive
									? 'bg-red-600/50 text-white hover:bg-red-500/50'
									: 'bg-green-600/50 text-white hover:bg-green-500/50'}
							>
								{takeoverModeActive ? 'Włącz Tryb Przejęć' : 'Wyłącz Tryb Przejęć'}
							</Button>
							<Button
								on:click={clearAllHandRaises}
								class="bg-amber-600/50 text-white hover:bg-amber-500/50"
							>
								Wyczyść przejęcia
							</Button>

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
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each handRaiseResults as result}
										<Table.Row
											class={`border-gray-800 transition-colors duration-300 ${result.name === lastChangedPlayer ? 'bg-blue-900/30' : ''}`}
										>
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
												{result.position === 1
													? '-'
													: `+${(result.timeDifferenceMs / 1000).toFixed(3)}s`}
											</Table.Cell>
										</Table.Row>
									{/each}

									{#if handRaiseResults.length === 0}
										<Table.Row class="border-gray-800">
											<Table.Cell colspan="4" class="py-8 text-center text-gray-400">
												Brak przejęć
											</Table.Cell>
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
