<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { BarChart3, TrendingUp, Users, Music, Trophy, ArrowLeft, Trash2, Edit, UserX, Settings } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';

	let statistics = [];
	let leaderboard = [];
	let loading = false;
	let selectedDifficulty = null;
	let showAdminOptions = false;
	let editingUser = null;
	let editPoints = 0;

	const difficulties = [
		{ value: null, label: 'Wszystkie', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
		{ value: 'easy', label: 'Łatwe', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
		{ value: 'medium', label: 'Średnie', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
		{ value: 'hard', label: 'Trudne', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
		{ value: 'very hard', label: 'Bardzo trudne', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
	];

	onMount(() => {
		loadStatistics();
		loadLeaderboard();
	});

	async function loadStatistics() {
		loading = true;
		try {
			const params = new URLSearchParams({ type: 'statistics' });
			if (selectedDifficulty) {
				params.append('difficulty', selectedDifficulty);
			}

			const response = await fetch(`/api/pyrkon/leaderboard?${params}`);
			if (response.ok) {
				statistics = await response.json();
			}
		} catch (error) {
			console.error('Failed to load statistics:', error);
		} finally {
			loading = false;
		}
	}

	async function loadLeaderboard() {
		try {
			const params = new URLSearchParams({ type: 'leaderboard', limit: '20' });
			if (selectedDifficulty) {
				params.append('difficulty', selectedDifficulty);
			}

			const response = await fetch(`/api/pyrkon/leaderboard?${params}`);
			if (response.ok) {
				leaderboard = await response.json();
			}
		} catch (error) {
			console.error('Failed to load leaderboard:', error);
		}
	}

	function selectDifficulty(difficulty) {
		selectedDifficulty = difficulty;
		loadStatistics();
		loadLeaderboard();
	}

	function getDifficultyColor(difficulty) {
		const diff = difficulties.find(d => d.value === difficulty);
		return diff ? diff.color : 'bg-gray-500/20 text-gray-400 border-gray-500/30';
	}

	function getPositionIcon(index) {
		switch (index) {
			case 0: return '🥇';
			case 1: return '🥈';
			case 2: return '🥉';
			default: return `${index + 1}.`;
		}
	}

	function goBack() {
		goto('/pyrkon');
	}

	async function deleteSongData(songFilename) {
		if (!confirm(`Czy na pewno chcesz usunąć wszystkie dane dla piosenki "${songFilename}"?`)) {
			return;
		}

		loading = true;
		try {
			const response = await fetch('/api/pyrkon/admin/delete-song', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ songFilename })
			});

			if (response.ok) {
				toast.success('Dane piosenki zostały usunięte');
				await loadStatistics();
			} else {
				const error = await response.json();
				toast.error(error.message || 'Nie udało się usunąć danych piosenki');
			}
		} catch (error) {
			console.error('Delete song error:', error);
			toast.error('Nie udało się usunąć danych piosenki');
		} finally {
			loading = false;
		}
	}

	async function clearUserData(username, difficulty) {
		if (!confirm(`Czy na pewno chcesz usunąć wszystkie dane użytkownika "${username}" dla trudności "${difficulty}"?`)) {
			return;
		}

		loading = true;
		try {
			const response = await fetch('/api/pyrkon/admin/clear-user', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, difficulty })
			});

			if (response.ok) {
				toast.success('Dane użytkownika zostały usunięte');
				await loadLeaderboard();
			} else {
				const error = await response.json();
				toast.error(error.message || 'Nie udało się usunąć danych użytkownika');
			}
		} catch (error) {
			console.error('Clear user error:', error);
			toast.error('Nie udało się usunąć danych użytkownika');
		} finally {
			loading = false;
		}
	}

	async function updateUserPoints(username, difficulty, newPoints) {
		loading = true;
		try {
			const response = await fetch('/api/pyrkon/admin/update-points', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, difficulty, points: newPoints })
			});

			if (response.ok) {
				toast.success('Punkty użytkownika zostały zaktualizowane');
				editingUser = null;
				await loadLeaderboard();
			} else {
				const error = await response.json();
				toast.error(error.message || 'Nie udało się zaktualizować punktów');
			}
		} catch (error) {
			console.error('Update points error:', error);
			toast.error('Nie udało się zaktualizować punktów');
		} finally {
			loading = false;
		}
	}

	function startEditingUser(user) {
		editingUser = user;
		editPoints = user.total_points;
	}

	function cancelEditing() {
		editingUser = null;
		editPoints = 0;
	}
</script>

<svelte:head>
	<title>Statystyki</title>
</svelte:head>

<div class="min-h-screen bg-gray-950">
	<div class="container px-4 py-8 mx-auto">
		<!-- Header -->
		<div class="mb-8 text-center">
			<div class="flex items-center justify-center gap-4 mb-4">
				<Button
					variant="outline"
					class="text-gray-300 border-gray-600 hover:bg-gray-800"
					on:click={goBack}
				>
					<ArrowLeft class="w-4 h-4 mr-2" />
					Powrót do panelu
				</Button>
				<Button
					variant="outline"
					class={showAdminOptions
						? "border-red-600 text-red-400 hover:bg-red-600/20"
						: "border-orange-600 text-orange-400 hover:bg-orange-600/20"}
					on:click={() => showAdminOptions = !showAdminOptions}
				>
					<Settings class="w-4 h-4 mr-2" />
					{showAdminOptions ? 'Ukryj opcje admin' : 'Opcje administratora'}
				</Button>
			</div>
			<h1 class="mb-2 text-4xl font-bold text-white">📊 Statystyki Quiz 📊</h1>
			<p class="text-gray-400">Szczegółowe statystyki gry i rankingu</p>
		</div>

		<div class="max-w-6xl mx-auto">
			<!-- Difficulty Filter -->
			<Card class="mb-6 bg-gray-900 border-gray-800">
				<CardHeader>
					<CardTitle class="text-white">Filtruj według trudności</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="flex flex-wrap gap-2">
						{#each difficulties as difficulty}
							<Button
								variant={selectedDifficulty === difficulty.value ? 'default' : 'outline'}
								class={selectedDifficulty === difficulty.value
									? 'bg-purple-600 hover:bg-purple-700'
									: 'border-gray-600 text-gray-300 hover:bg-gray-800'}
								on:click={() => selectDifficulty(difficulty.value)}
							>
								{difficulty.label}
							</Button>
						{/each}
					</div>
				</CardContent>
			</Card>

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Leaderboard -->
				<Card class="bg-gray-900 border-gray-800">
					<CardHeader>
						<CardTitle class="flex items-center gap-2 text-white">
							<Trophy class="w-5 h-5" />
							Ranking graczy
							{#if selectedDifficulty}
								<Badge class={getDifficultyColor(selectedDifficulty)}>
									{difficulties.find(d => d.value === selectedDifficulty)?.label}
								</Badge>
							{/if}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{#if loading}
							<div class="py-8 text-center">
								<div class="w-8 h-8 mx-auto mb-4 border-4 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
								<p class="text-gray-400">Ładowanie...</p>
							</div>
						{:else if leaderboard.length === 0}
							<div class="py-8 text-center text-gray-400">
								<Users class="w-12 h-12 mx-auto mb-4 opacity-50" />
								<p>Brak danych w rankingu</p>
							</div>
						{:else}
							<div class="space-y-2">
								{#each leaderboard as player, index}
									<div class="flex items-center justify-between p-3 border border-gray-700 rounded-lg bg-gray-800/50">
										<div class="flex items-center flex-1 gap-3">
											<span class="w-8 text-lg font-bold text-cyan-400">
												{getPositionIcon(index)}
											</span>
											<div class="flex-1">
												<div class="font-medium text-white">{player.username}</div>
												<div class="text-sm text-gray-400">
													{player.total_correct}/{player.total_guesses} poprawnych ({player.accuracy_percentage}%)
												</div>
											</div>
										</div>

										{#if editingUser && editingUser.username === player.username && editingUser.difficulty === player.difficulty}
											<div class="flex items-center gap-2">
												<input
													type="number"
													bind:value={editPoints}
													class="w-20 px-2 py-1 text-sm text-white bg-gray-700 border border-gray-600 rounded"
													min="0"
												/>
												<Button
													size="sm"
													class="text-white bg-green-600 hover:bg-green-700"
													on:click={() => updateUserPoints(player.username, player.difficulty, editPoints)}
													disabled={loading}
												>
													Zapisz
												</Button>
												<Button
													size="sm"
													variant="outline"
													class="text-gray-300 border-gray-600 hover:bg-gray-800"
													on:click={cancelEditing}
												>
													Anuluj
												</Button>
											</div>
										{:else}
											<div class="flex items-center gap-2">
												<div class="text-right">
													<div class="text-lg font-bold text-cyan-300">{player.total_points}</div>
													<div class="text-sm text-gray-400">punktów</div>
												</div>
												{#if showAdminOptions}
													<div class="flex flex-col gap-1">
														<Button
															size="sm"
															variant="outline"
															class="text-blue-400 border-blue-600 hover:bg-blue-600/20"
															on:click={() => startEditingUser(player)}
														>
															<Edit class="w-3 h-3" />
														</Button>
														<Button
															size="sm"
															variant="outline"
															class="text-red-400 border-red-600 hover:bg-red-600/20"
															on:click={() => clearUserData(player.username, player.difficulty)}
															disabled={loading}
														>
															<UserX class="w-3 h-3" />
														</Button>
													</div>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>

				<!-- Song Statistics -->
				<Card class="bg-gray-900 border-gray-800">
					<CardHeader>
						<CardTitle class="flex items-center gap-2 text-white">
							<Music class="w-5 h-5" />
							Statystyki piosenek
							{#if selectedDifficulty}
								<Badge class={getDifficultyColor(selectedDifficulty)}>
									{difficulties.find(d => d.value === selectedDifficulty)?.label}
								</Badge>
							{/if}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{#if loading}
							<div class="py-8 text-center">
								<div class="w-8 h-8 mx-auto mb-4 border-4 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
								<p class="text-gray-400">Ładowanie...</p>
							</div>
						{:else if statistics.length === 0}
							<div class="py-8 text-center text-gray-400">
								<Music class="w-12 h-12 mx-auto mb-4 opacity-50" />
								<p>Brak statystyk piosenek</p>
							</div>
						{:else}
							<div class="space-y-3 overflow-y-auto max-h-96">
								{#each statistics as song}
									<div class="p-3 border border-gray-700 rounded-lg bg-gray-800/50">
										<div class="flex items-start justify-between mb-2">
											<div class="flex-1">
												<div class="font-medium text-white">{song.anime_title}</div>
												<div class="text-sm text-gray-300">{song.song_title}</div>
												<div class="text-xs text-gray-400">{song.artist}</div>
											</div>
											<div class="flex items-center gap-2">
												<Badge class={getDifficultyColor(song.difficulty)} size="sm">
													{difficulties.find(d => d.value === song.difficulty)?.label || song.difficulty}
												</Badge>
												{#if showAdminOptions}
													<Button
														size="sm"
														variant="outline"
														class="text-red-400 border-red-600 hover:bg-red-600/20"
														on:click={() => deleteSongData(song.song_filename)}
														disabled={loading}
													>
														<Trash2 class="w-3 h-3" />
													</Button>
												{/if}
											</div>
										</div>
										<div class="flex items-center justify-between text-sm">
											<div class="flex items-center gap-4">
												<span class="text-green-400">✓ {song.correct_guesses}</span>
												<span class="text-red-400">✗ {song.incorrect_guesses}</span>
												<span class="text-gray-400">Σ {song.total_guesses}</span>
											</div>
											<div class="font-medium text-cyan-400">
												{song.success_rate}% sukces
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</div>
		</div>
	</div>
</div>
