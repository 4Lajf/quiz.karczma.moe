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
	import { Check, X, Circle } from 'lucide-svelte';
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
	let pointsAddedForRounds = {};
	let isAddingPoints = false;
	let minusPointsAddedForRounds = {};
	let isAddingMinusPoints = false;

	$: if (selectedRoundId && selectedRoundId !== room.current_round) {
		// Reset points added tracking when switching to a different round
		isAddingPoints = false;
	}

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

	// Helper function to update answer snapshots for a player in the current round
	async function updateAnswerSnapshots(playerId, score, tiebreaker) {
		if (!isCurrentRound) return; // Only update snapshots for current round

		try {
			// Find the player's name
			const player = players.find(p => p.id === playerId);
			if (!player) return;

			// Find the player's answer in the current round
			const { data: answers, error: answersError } = await supabase
				.from('answers')
				.select('id')
				.eq('room_id', room.id)
				.eq('round_id', selectedRoundId)
				.eq('player_name', player.name);

			if (answersError) throw answersError;
			if (!answers || answers.length === 0) return; // No answers to update

			// Update each answer's snapshot values
			for (const answer of answers) {
				const updateData = {};

				if (score !== undefined) updateData.score_snapshot = score;
				if (tiebreaker !== undefined) updateData.tiebreaker_snapshot = tiebreaker;

				if (Object.keys(updateData).length > 0) {
					const { error: updateError } = await supabase
						.from('answers')
						.update(updateData)
						.eq('id', answer.id);

					if (updateError) throw updateError;
				}
			}
		} catch (error) {
			console.error('Failed to update answer snapshots:', error);
		}
	}

	async function saveEditedValue() {
		if (!editingPlayer || editValue === null) return;

		try {
			const { error } = await supabase
				.from('players')
				.update({ [editType]: editValue })
				.eq('id', editingPlayer);

			if (error) throw error;

			// Update answer snapshots
			if (editType === 'score') {
				await updateAnswerSnapshots(editingPlayer, editValue, undefined);
			} else if (editType === 'tiebreaker') {
				await updateAnswerSnapshots(editingPlayer, undefined, editValue);
			}

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

	async function awardPointsToPlayer(playerId) {
		if (!isCurrentRound) {
			toast.error('Nie można przyznawać punktów w poprzednich rundach');
			return;
		}

		const player = players.find((p) => p.id === playerId);
		if (!player) {
			toast.error('Nie znaleziono gracza');
			return;
		}

		// Get the base points to award
		let pointsToAdd = 0;

		// Check if we have saved points from ZakrywanaScreenowka for this round
		if (room.type === 'screen') {
			const { data: screenPointsData, error: screenPointsError } = await supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', selectedRoundId).maybeSingle();

			if (!screenPointsError && screenPointsData) {
				pointsToAdd = screenPointsData.points_value;
			} else {
				pointsToAdd = room.points_config.main_answer; // Fall back to default
			}
		} else {
			pointsToAdd = room.points_config.main_answer;
		}

		try {
			// Get current player score
			const { data: currentPlayer, error: playerError } = await supabase.from('players').select('score').eq('id', playerId).single();

			if (playerError) throw playerError;

			// Calculate new score
			const newScore = currentPlayer.score + pointsToAdd;

			// Update the player score
			const { error } = await supabase
				.from('players')
				.update({ score: newScore })
				.eq('id', playerId);

			if (error) throw error;

			// Update answer snapshots with the new score
			await updateAnswerSnapshots(playerId, newScore, undefined);

			toast.success(`Dodano ${pointsToAdd} punktów dla ${player.name}`);
			await invalidateAll();
		} catch (error) {
			toast.error(`Nie udało się przyznać punktów: ${error.message}`);
		}
	}

	async function awardNegativePointsToPlayer(playerId) {
		if (!isCurrentRound) {
			toast.error('Nie można przyznawać punktów ujemnych w poprzednich rundach');
			return;
		}

		const player = players.find((p) => p.id === playerId);
		if (!player) {
			toast.error('Nie znaleziono gracza');
			return;
		}

		// Get the base points to deduct
		let pointsToDeduct = 0;

		// Check if we have saved points from ZakrywanaScreenowka for this round
		if (room.type === 'screen') {
			const { data: screenPointsData, error: screenPointsError } = await supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', selectedRoundId).maybeSingle();

			if (!screenPointsError && screenPointsData) {
				pointsToDeduct = screenPointsData.points_value / 2; // Half the points for negative
			} else {
				pointsToDeduct = room.points_config.main_answer / 2; // Fall back to default
			}
		} else {
			pointsToDeduct = room.points_config.main_answer / 2;
		}

		try {
			// Get current player score
			const { data: currentPlayer, error: playerError } = await supabase.from('players').select('score').eq('id', playerId).single();

			if (playerError) throw playerError;

			// Calculate new score
			const newScore = currentPlayer.score - pointsToDeduct;

			// Update the player score
			const { error } = await supabase
				.from('players')
				.update({ score: newScore })
				.eq('id', playerId);

			if (error) throw error;

			// Update answer snapshots with the new score
			await updateAnswerSnapshots(playerId, newScore, undefined);

			toast.success(`Odjęto ${pointsToDeduct} punktów dla ${player.name}`);
			await invalidateAll();
		} catch (error) {
			toast.error(`Nie udało się odjąć punktów: ${error.message}`);
		}
	}

	async function addTiebreakerToPlayer(playerId) {
		if (!isCurrentRound) {
			toast.error('Nie można przyznawać punktów tiebreaker w poprzednich rundach');
			return;
		}

		const player = players.find((p) => p.id === playerId);
		if (!player) {
			toast.error('Nie znaleziono gracza');
			return;
		}

		// Get tiebreaker point to add
		const tiebreakerToAdd = room.points_config.tiebreaker.main_answer || 1;

		try {
			// Get current player tiebreaker
			const { data: currentPlayer, error: playerError } = await supabase.from('players').select('tiebreaker').eq('id', playerId).single();

			if (playerError) throw playerError;

			// Calculate new tiebreaker
			const newTiebreaker = currentPlayer.tiebreaker + tiebreakerToAdd;

			// Update the player tiebreaker
			const { error } = await supabase
				.from('players')
				.update({ tiebreaker: newTiebreaker })
				.eq('id', playerId);

			if (error) throw error;

			// Update answer snapshots with the new tiebreaker
			await updateAnswerSnapshots(playerId, undefined, newTiebreaker);

			toast.success(`Dodano ${tiebreakerToAdd} punktów tiebreaker dla ${player.name}`);
			await invalidateAll();
		} catch (error) {
			toast.error(`Nie udało się przyznać punktów tiebreaker: ${error.message}`);
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
			clearAllHandRaises(false);
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
		clearAllHandRaises(false);
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

		// Get the current answer
		const currentAnswer = displayedAnswers.find((a) => a.id === answerId);
		if (!currentAnswer) return;

		// Determine the next status in the cycle: null (neutral) -> false -> true -> null
		let nextStatus;
		// Use strict equality to check for true and false, and treat everything else as neutral
		if (currentStatus === true) {
			// If current is true (correct), next is null (neutral)
			nextStatus = null;
		} else if (currentStatus === false) {
			// If current is false (incorrect), next is true (correct)
			nextStatus = true;
		} else {
			// If current is null/undefined/anything else (neutral), next is false (incorrect)
			nextStatus = false;
		}

		// Create a local copy of the current displayed answers with the new status
		const optimisticAnswers = displayedAnswers.map((answer) => {
			if (answer.id === answerId) {
				// Create a new answer_status object with the updated field
				const newAnswerStatus = { ...(answer.answer_status || {}) };

				// Set the field value (null for neutral, true/false for others)
				newAnswerStatus[field] = nextStatus;

				return {
					...answer,
					answer_status: newAnswerStatus
				};
			}
			return answer;
		});

		// Optimistically update the displayed answers
		displayedAnswers = optimisticAnswers;

		try {
			// Prepare the update data
			const newAnswerStatus = { ...(currentAnswer.answer_status || {}) };

			// Set the field value (null for neutral, true/false for others)
			newAnswerStatus[field] = nextStatus;

			const updateData = {
				answer_status: newAnswerStatus
			};

			// Update in the database
			const { error } = await supabase.from('answers').update(updateData).eq('id', answerId);
			if (error) {
				// If update fails, revert to original state
				displayedAnswers = displayedAnswers.map((answer) => {
					if (answer.id === answerId) {
						const revertedStatus = { ...(answer.answer_status || {}) };

						// Always set the field back to its original value
						revertedStatus[field] = currentStatus;

						return { ...answer, answer_status: revertedStatus };
					}
					return answer;
				});
				throw error;
			}

			// Force a refresh of the data to ensure we have the latest state from the server
			await invalidateAll();

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

		// Check if points were already added for this round
		if (pointsAddedForRounds[selectedRoundId]) {
			// Confirm with the user before adding points again
			if (!confirm('Punkty zostały już dodane dla tej rundy. Czy na pewno chcesz dodać je ponownie?')) {
				return;
			}
		}

		// Set loading state
		isAddingPoints = true;

		try {
			// Fetch hint usages for this round
			const { data: hintUsages, error: hintError } = await supabase.from('hint_usages').select('player_name').eq('round_id', selectedRoundId);

			if (hintError) throw hintError;

			// Create a set of player names that used hints for easy lookup
			const hintUsedByPlayer = new Set(hintUsages?.map((h) => h.player_name) || []);

			// Get hint penalty percentage from room settings (default to 40% if not set)
			const hintPenaltyPercent = room.points_config.hint_penalty_percent || 40;

			// Check if we have saved points from ZakrywanaScreenowka for this round
			let screenPoints = null;
			if (room.type === 'screen') {
				const { data: screenPointsData, error: screenPointsError } = await supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', selectedRoundId).maybeSingle();

				if (!screenPointsError && screenPointsData) {
					screenPoints = screenPointsData.points_value;
				}
			}

			for (const answer of displayedAnswers) {
				const player = players.find((p) => p.name === answer.player_name);
				if (!player) continue;

				let points = 0;
				let tiebreaker = 0;

				// Main answer points with hint deduction if applicable
				// Only award points for main_answer if anime_title is not disabled
				if (room.enabled_fields?.anime_title !== false && answer.answer_status.main_answer) {
					// If we have screen points and this is a screen type room, use those instead of default
					let mainPoints =
						screenPoints !== null && room.type === 'screen'
							? screenPoints // Use screen points if available
							: room.points_config.main_answer; // Otherwise use default point config

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

					// Calculate new values
					const newScore = player.score + points;
					const newTiebreaker = player.tiebreaker + tiebreaker;

					const { error } = await supabase
						.from('players')
						.update({
							score: newScore,
							tiebreaker: newTiebreaker
						})
						.eq('id', player.id);

					if (error) throw error;

					// Update answer snapshots
					await updateAnswerSnapshots(player.id, newScore, newTiebreaker);
				}
			}

			// Mark that points have been added for this round
			pointsAddedForRounds[selectedRoundId] = true;

			// Force a refresh of the data to ensure we have the latest state from the server
			await invalidateAll();

			toast.success('Punkty przyznane pomyślnie');
		} catch (error) {
			toast.error(`Nie udało się przyznać punktów: ${error.message}`);
		} finally {
			// Reset loading state after a delay to prevent immediate re-clicks
			setTimeout(() => {
				isAddingPoints = false;
			}, 1000);
		}
	}

	async function awardNegativePointsToIncorrectAnswers() {
		if (!isCurrentRound) {
			toast.error('Nie można przyznawać punktów ujemnych w poprzednich rundach');
			return;
		}

		// Check if negative points were already added for this round
		if (minusPointsAddedForRounds[selectedRoundId]) {
			// Confirm with the user before adding negative points again
			if (!confirm('Punkty ujemne zostały już dodane dla tej rundy. Czy na pewno chcesz dodać je ponownie?')) {
				return;
			}
		}

		// Set loading state
		isAddingMinusPoints = true;

		try {
			// Fetch hint usages for this round
			const { data: hintUsages, error: hintError } = await supabase.from('hint_usages').select('player_name').eq('round_id', selectedRoundId);

			if (hintError) throw hintError;

			// Create a set of player names that used hints for easy lookup
			const hintUsedByPlayer = new Set(hintUsages?.map((h) => h.player_name) || []);

			// Check if we have saved points from ZakrywanaScreenowka for this round
			let screenPoints = null;
			if (room.type === 'screen') {
				const { data: screenPointsData, error: screenPointsError } = await supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', selectedRoundId).maybeSingle();

				if (!screenPointsError && screenPointsData) {
					screenPoints = screenPointsData.points_value;
				}
			}

			for (const answer of displayedAnswers) {
				const player = players.find((p) => p.name === answer.player_name);
				if (!player) continue;

				let points = 0;

				// Only apply negative points to incorrect answers (false), not to neutral (null) or correct (true) answers
				// And only if anime_title is not disabled
				if (room.enabled_fields?.anime_title !== false && answer.answer_status.main_answer === false) {
					// If we have screen points and this is a screen type room, use those instead of default
					let basePoints =
						screenPoints !== null && room.type === 'screen'
							? screenPoints // Use screen points if available
							: room.points_config.main_answer; // Otherwise use default point config

					// Calculate half value and make it negative
					points -= basePoints / 2;
				}

				// Extra fields negative points - only for incorrect fields (false), not for neutral (null) or correct (true)
				if (answer.extra_fields?.song_title && answer.answer_status.song_title === false) {
					points -= room.points_config.song_title / 2;
				}
				if (answer.extra_fields?.song_artist && answer.answer_status.song_artist === false) {
					points -= room.points_config.song_artist / 2;
				}
				if (answer.extra_fields?.other && answer.answer_status.other === false) {
					points -= room.points_config.other / 2;
				}

				if (points !== 0) {
					// Round final points to 2 decimal places
					points = Math.ceil(points * 100) / 100;

					// Calculate new score (points are already negative here)
					const newScore = player.score + points;

					const { error } = await supabase
						.from('players')
						.update({
							score: newScore
						})
						.eq('id', player.id);

					if (error) throw error;

					// Update answer snapshots
					await updateAnswerSnapshots(player.id, newScore, undefined);
				}
			}

			// Mark that negative points have been added for this round
			minusPointsAddedForRounds[selectedRoundId] = true;

			toast.success('Punkty ujemne za błędne odpowiedzi przyznane pomyślnie');
		} catch (error) {
			toast.error(`Nie udało się przyznać punktów ujemnych: ${error.message}`);
		} finally {
			// Reset loading state after a delay to prevent immediate re-clicks
			setTimeout(() => {
				isAddingMinusPoints = false;
			}, 1000);
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
			// Calculate new value
			const newValue = player[field] + amount;

			const { error } = await supabase
				.from('players')
				.update({ [field]: newValue })
				.eq('id', playerId);

			if (error) throw error;

			// Update answer snapshots
			if (field === 'score') {
				await updateAnswerSnapshots(playerId, newValue, undefined);
			} else if (field === 'tiebreaker') {
				await updateAnswerSnapshots(playerId, undefined, newValue);
			}

			toast.success(`${field === 'score' ? 'Score' : 'Tiebreaker'} updated`);
		} catch (error) {
			toast.error(`Aktualizacja nie powiodła się: ${error.message}`);
		}
	}

	async function deletePlayer(playerId) {
		try {
			const { error } = await supabase.from('players').delete().eq('id', playerId);
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
	async function clearAllHandRaises(notify = true) {
		try {
			const { error } = await supabase.from('hand_raises').delete().eq('room_id', room.id);

			if (error) throw error;

			handRaiseResults = [];
			if (notify) {
				toast.success('Wszystkie podniesienia rąk wyczyszczone');
			}
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
							{#if room.enabled_fields?.anime_title !== false}
								<div class="whitespace-pre-line text-sm font-medium text-gray-300">
									{currentCorrectAnswers.map((answer) => answer.content).join('\n')}
								</div>
							{/if}

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
								<Button on:click={awardPointsToCorrectAnswers} disabled={!isCurrentRound || isAddingPoints} class="mr-2 bg-green-600/50 text-white hover:bg-green-500/50">
									{#if isAddingPoints && !isAddingMinusPoints}
										Przyznawanie punktów...
									{:else if pointsAddedForRounds[selectedRoundId]}
										Dodaj punkty ponownie
									{:else}
										Dodaj punkty do dobrych odpowiedzi
									{/if}
								</Button>

								<Button on:click={awardNegativePointsToIncorrectAnswers} disabled={!isCurrentRound || isAddingPoints || isAddingMinusPoints} class="bg-red-600/50 text-white hover:bg-red-500/50">
									{#if isAddingMinusPoints}
										Przyznawanie punktów ujemnych...
									{:else if minusPointsAddedForRounds[selectedRoundId]}
										Odejmij punkty za błędy ponownie
									{:else}
										Odejmij punkty za błędne odpowiedzi (50%)
									{/if}
								</Button>
							</div>
							<Table.Root>
								<Table.Header>
									<Table.Row class="border-gray-800">
										<Table.Head class="text-gray-300">Drużyna</Table.Head>
										{#if room.enabled_fields?.anime_title !== false}
											<Table.Head class="text-gray-300">Nazwa anime</Table.Head>
										{/if}
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
											{#if room.enabled_fields?.anime_title !== false}
												<Table.Cell>
													<div class="flex items-center gap-2">
														<span class="text-gray-200">{answer.content}</span>
														<button on:click={() => toggleAnswerStatus(answer.id, 'main_answer', answer.answer_status?.main_answer)} disabled={!isCurrentRound} class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800">
															{#if answer.answer_status?.main_answer === true}
																<Check class="h-6 w-6 text-green-500" />
															{:else if answer.answer_status?.main_answer === false}
																<X class="h-6 w-6 text-red-500" />
															{:else}
																<Circle class="h-6 w-6 text-gray-500" />
															{/if}
														</button>
													</div>
												</Table.Cell>
											{/if}

											{#if room.enabled_fields?.song_title}
												<Table.Cell>
													<div class="flex items-center gap-2">
														<span class="text-gray-200">{answer.extra_fields?.song_title || '-'}</span>
														{#if answer.extra_fields?.song_title}
															<button on:click={() => toggleAnswerStatus(answer.id, 'song_title', answer.answer_status?.song_title)} disabled={!isCurrentRound} class="flex h-10 w-10 items-center justify-center rounded-full p-2 transition-colors hover:bg-gray-800">
																{#if answer.answer_status?.song_title === true}
																	<Check class="h-6 w-6 text-green-500" />
																{:else if answer.answer_status?.song_title === false}
																	<X class="h-6 w-6 text-red-500" />
																{:else}
																	<Circle class="h-6 w-6 text-gray-500" />
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
																{#if answer.answer_status?.song_artist === true}
																	<Check class="h-6 w-6 text-green-500" />
																{:else if answer.answer_status?.song_artist === false}
																	<X class="h-6 w-6 text-red-500" />
																{:else}
																	<Circle class="h-6 w-6 text-gray-500" />
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
																{#if answer.answer_status?.other === true}
																	<Check class="h-6 w-6 text-green-500" />
																{:else if answer.answer_status?.other === false}
																	<X class="h-6 w-6 text-red-500" />
																{:else}
																	<Circle class="h-6 w-6 text-gray-500" />
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
												<span class="text-center text-gray-200">
													{isCurrentRound ? (player?.score || 0) : (answer.score_snapshot !== undefined ? answer.score_snapshot : (player?.score || 0))}
												</span>
											</Table.Cell>

											<Table.Cell>
												<span class="text-center text-gray-200">
													{isCurrentRound ? (player?.tiebreaker || 0) : (answer.tiebreaker_snapshot !== undefined ? answer.tiebreaker_snapshot : (player?.tiebreaker || 0))}
												</span>
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
									<Table.Head class="text-gray-300">Akcje punktowe</Table.Head>
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
												{hasAnswered ? 'Odpowiedział' : 'Brak odpowiedzi'}
											</span>
										</Table.Cell>

										<!-- New cell for point action buttons -->
										<Table.Cell>
											<div class="flex gap-1">
												<Button size="sm" disabled={!isCurrentRound} on:click={() => awardPointsToPlayer(player.id)} class="bg-green-600/50 text-white hover:bg-green-500/50">+P</Button>
												<Button size="sm" disabled={!isCurrentRound} on:click={() => awardNegativePointsToPlayer(player.id)} class="bg-red-600/50 text-white hover:bg-red-500/50">-P</Button>
												<Button size="sm" disabled={!isCurrentRound} on:click={() => addTiebreakerToPlayer(player.id)} class="bg-blue-600/50 text-white hover:bg-blue-500/50">+T</Button>
											</div>
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
