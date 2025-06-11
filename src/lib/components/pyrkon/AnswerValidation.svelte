<script>
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { Check, X, Users, Music, Award, Plus, Trash2, UserPlus, Info, AlertTriangle, Eye, EyeOff, Monitor } from 'lucide-svelte';
	import { invalidateLeaderboardCache } from '$lib/utils/leaderboardCache.js';

	let loading = false;
	let participants = [];
	let newParticipant = { name: '', difficulty: 'easy' };
	let currentSong = null;
	let presenterState = null;
	let refreshInterval = null;
	let showMetadata = false;

	onMount(() => {
		loadParticipants();
		loadCurrentSong();
		// Refresh current song every 5 seconds
		refreshInterval = setInterval(loadCurrentSong, 5000);
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	async function loadParticipants() {
		try {
			const stored = localStorage.getItem('pyrkon_participants');
			if (stored) {
				participants = JSON.parse(stored);
			}

			// Load saved difficulty setting
			const savedDifficulty = localStorage.getItem('pyrkon_default_difficulty');
			if (savedDifficulty) {
				newParticipant.difficulty = savedDifficulty;
			}
		} catch (error) {
			console.error('Failed to load participants:', error);
		}
	}

	function saveParticipants() {
		try {
			localStorage.setItem('pyrkon_participants', JSON.stringify(participants));
		} catch (error) {
			console.error('Failed to save participants:', error);
		}
	}

	function saveDifficultySetting() {
		try {
			localStorage.setItem('pyrkon_default_difficulty', newParticipant.difficulty);
		} catch (error) {
			console.error('Failed to save difficulty setting:', error);
		}
	}

	async function loadCurrentSong() {
		try {
			const response = await fetch('/api/pyrkon/presenter-state');
			if (response.ok) {
				presenterState = await response.json();
				currentSong = presenterState.currentSong;
				showMetadata = presenterState.showMetadata;
			}
		} catch (error) {
			console.error('Failed to load current song:', error);
		}
	}

	function addParticipant() {
		if (!newParticipant.name.trim()) {
			toast.error('Nazwa uczestnika jest wymagana');
			return;
		}

		// Check if participant with same name AND difficulty already exists
		if (participants.some(p => p.name.toLowerCase() === newParticipant.name.toLowerCase() && p.difficulty === newParticipant.difficulty)) {
			toast.error('Uczestnik o tej nazwie już istnieje w tej kategorii trudności');
			return;
		}

		participants = [...participants, {
			id: `${Date.now()}-${newParticipant.difficulty}`, // Include difficulty in ID for uniqueness
			name: newParticipant.name.trim(),
			difficulty: newParticipant.difficulty
		}];

		// Keep the selected difficulty when resetting the form
		const savedDifficulty = newParticipant.difficulty;
		newParticipant = { name: '', difficulty: savedDifficulty };
		saveParticipants();
		toast.success('Uczestnik został dodany');
	}

	function removeParticipant(id) {
		participants = participants.filter(p => p.id !== id);
		saveParticipants();
		toast.success('Uczestnik został usunięty');
	}

	async function grantPoints(participantId, isCorrect) {
		if (!currentSong) {
			toast.error('Brak aktualnie odtwarzanej piosenki');
			return;
		}

		const participant = participants.find(p => p.id === participantId);
		if (!participant) {
			toast.error('Nie znaleziono uczestnika');
			return;
		}

		loading = true;
		try {
			const response = await fetch('/api/pyrkon/grant-points', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					participantName: participant.name,
					participantDifficulty: participant.difficulty,
					songData: currentSong,
					isCorrect
				})
			});

			if (response.ok) {
				toast.success(`${isCorrect ? 'Punkt przyznany' : 'Niepoprawna odpowiedź zapisana'} dla ${participant.name}`);

				// Invalidate leaderboard cache since data has changed
				invalidateLeaderboardCache();
			} else {
				const error = await response.json();
				toast.error(error.message || 'Nie udało się przyznać punktów');
			}
		} catch (error) {
			console.error('Grant points error:', error);
			toast.error('Nie udało się przyznać punktów');
		} finally {
			loading = false;
		}
	}

	function getDifficultyColor(difficulty) {
		switch (difficulty?.toLowerCase()) {
			case 'easy': return 'bg-green-500/20 text-green-400 border-green-500/30';
			case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
			case 'hard': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
			case 'very hard': return 'bg-red-500/20 text-red-400 border-red-500/30';
			default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
		}
	}

	function getDifficultyText(difficulty) {
		switch (difficulty?.toLowerCase()) {
			case 'easy': return 'Łatwe';
			case 'medium': return 'Średnie';
			case 'hard': return 'Trudne';
			case 'very hard': return 'Bardzo trudne';
			default: return difficulty || 'Nieznane';
		}
	}

	function translateVintage(vintage) {
		const vintageMap = {
			'2020s': '2020-2029',
			'2010s': '2010-2019',
			'2000s': '2000-2009',
			'90s': '1990-1999',
			'80s': '1980-1989',
			'70s': '1970-1979',
			'60s': '1960-1969'
		};
		return vintageMap[vintage] || vintage;
	}

	async function toggleMetadata() {
		try {
			loading = true;
			const response = await fetch('/api/pyrkon/presenter-toggle', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'toggleMetadata' })
			});

			if (response.ok) {
				const result = await response.json();
				showMetadata = result.state.showMetadata;
				toast.success(showMetadata ? 'Metadane zostały odsłonięte na prezenterze' : 'Metadane zostały ukryte na prezenterze');
			} else {
				toast.error('Nie udało się przełączyć metadanych');
			}
		} catch (error) {
			console.error('Failed to toggle metadata:', error);
			toast.error('Nie udało się przełączyć metadanych');
		} finally {
			loading = false;
		}
	}


</script>

<div class="space-y-6">
	<!-- Instructions card -->
	<Card class="border-blue-800 bg-blue-900/20">
		<CardHeader>
			<CardTitle class="flex items-center gap-2 text-blue-300">
				<Info class="h-5 w-5" />
				Ważne instrukcje
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-3">
			<div class="text-sm text-blue-200">
				<p class="mb-3 font-medium">Aby statystyki były poprawne:</p>
				<ol class="list-inside list-decimal space-y-2 text-blue-100">
					<li>Dodaj uczestników z odpowiednimi poziomami trudności</li>
					<li>Dla każdej piosenki kliknij <strong>"Poprawne"</strong> dla uczestników, którzy odpowiedzieli poprawnie</li>
					<li><strong class="text-yellow-300">WAŻNE:</strong> Kliknij <strong>"Niepoprawne"</strong> dla uczestników, którzy odpowiedzieli źle lub wcale</li>
					<li>Bez kliknięcia "Niepoprawne" statystyki będą nieprawidłowe!</li>
				</ol>
			</div>
			<div class="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 mt-3">
				<div class="flex items-start gap-2">
					<AlertTriangle class="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
					<div class="text-sm text-yellow-200">
						<strong>Pamiętaj:</strong> Każdy uczestnik musi otrzymać ocenę (poprawną lub niepoprawną) dla każdej piosenki, aby statystyki były kompletne.
					</div>
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Current Song & Point Granting -->
	<Card class="bg-gray-800/50 border-gray-700">
		<CardHeader>
			<CardTitle class="text-white flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Music class="w-5 h-5" />
					Aktualnie odtwarzana piosenka
				</div>
				{#if currentSong}
					<div class="flex items-center gap-3">
						<!-- Status indicator -->
						<div class="flex items-center gap-2 text-sm">
							<Monitor class="w-4 h-4 text-gray-400" />
							<span class="text-gray-400">Prezenter:</span>
							<Badge class={showMetadata ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}>
								{showMetadata ? 'Metadane widoczne' : 'Ranking widoczny'}
							</Badge>
						</div>
						<!-- Toggle button -->
						<Button
							size="sm"
							class={showMetadata ? 'bg-green-600 hover:bg-green-700 text-white/90' : 'bg-blue-600 hover:bg-blue-700 text-white/80'}
							disabled={loading}
							on:click={toggleMetadata}
						>
							{#if showMetadata}
								<EyeOff class="w-4 h-4 mr-2" />
								Ukryj metadane
							{:else}
								<Eye class="w-4 h-4 mr-2" />
								Odsłoń metadane
							{/if}
						</Button>
					</div>
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent>
			{#if currentSong}
				<div class="space-y-4">
					<!-- Title section -->
					<div class="space-y-2 text-center">
						<h3 class="text-3xl font-bold text-green-400">{currentSong.JPName || 'Nieznane anime'}</h3>
						{#if currentSong.ENName && currentSong.ENName !== currentSong.JPName}
							<p class="text-xl text-gray-300">{currentSong.ENName}</p>
						{/if}
					</div>

					<!-- Metadata grid -->
					<div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
						<div class="rounded-lg border border-blue-800 bg-blue-900/20 p-3">
							<div class="flex items-center space-x-2">
								<span class="text-lg">🎵</span>
								<div>
									<p class="text-xs uppercase tracking-wide text-blue-300">Piosenka</p>
									<p class="font-medium text-white">{currentSong.SongName || 'Nieznany tytuł'}</p>
								</div>
							</div>
						</div>

						<div class="rounded-lg border border-purple-800 bg-purple-900/20 p-3">
							<div class="flex items-center space-x-2">
								<span class="text-lg">🎤</span>
								<div>
									<p class="text-xs uppercase tracking-wide text-purple-300">Wykonawca</p>
									<p class="font-medium text-white">{currentSong.Artist || 'Nieznany artysta'}</p>
								</div>
							</div>
						</div>

						{#if currentSong.difficulty}
							{#if currentSong.difficulty?.toLowerCase() === 'easy'}
								<div class="rounded-lg border border-green-800 bg-green-900/20 p-3">
									<div class="flex items-center space-x-2">
										<span class="text-lg">⭐</span>
										<div>
											<p class="text-xs uppercase tracking-wide text-green-300">Trudność</p>
											<p class="font-medium text-white">{getDifficultyText(currentSong.difficulty)}</p>
										</div>
									</div>
								</div>
							{:else if currentSong.difficulty?.toLowerCase() === 'medium'}
								<div class="rounded-lg border border-yellow-800 bg-yellow-900/20 p-3">
									<div class="flex items-center space-x-2">
										<span class="text-lg">⭐</span>
										<div>
											<p class="text-xs uppercase tracking-wide text-yellow-300">Trudność</p>
											<p class="font-medium text-white">{getDifficultyText(currentSong.difficulty)}</p>
										</div>
									</div>
								</div>
							{:else if currentSong.difficulty?.toLowerCase() === 'hard'}
								<div class="rounded-lg border border-orange-800 bg-orange-900/20 p-3">
									<div class="flex items-center space-x-2">
										<span class="text-lg">⭐</span>
										<div>
											<p class="text-xs uppercase tracking-wide text-orange-300">Trudność</p>
											<p class="font-medium text-white">{getDifficultyText(currentSong.difficulty)}</p>
										</div>
									</div>
								</div>
							{:else}
								<div class="rounded-lg border border-red-800 bg-red-900/20 p-3">
									<div class="flex items-center space-x-2">
										<span class="text-lg">⭐</span>
										<div>
											<p class="text-xs uppercase tracking-wide text-red-300">Trudność</p>
											<p class="font-medium text-white">{getDifficultyText(currentSong.difficulty)}</p>
										</div>
									</div>
								</div>
							{/if}
						{/if}

						{#if currentSong.Vintage}
							<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
								<div class="flex items-center space-x-2">
									<span class="text-lg">📅</span>
									<div>
										<p class="text-xs uppercase tracking-wide text-gray-400">Rok</p>
										<p class="font-medium text-white">{translateVintage(currentSong.Vintage)}</p>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				{#if participants.length > 0}
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<h4 class="text-white font-medium">Przyznaj punkty uczestnikom:</h4>
							<div class="text-xs text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded border border-yellow-700">
								💡 Oceń wszystkich uczestników!
							</div>
						</div>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
							{#each participants as participant}
								<div class="bg-gray-900/50 rounded-lg p-3">
									<div class="flex items-center justify-between mb-3">
										<div>
											<div class="text-white font-medium">{participant.name}</div>
											<Badge class={getDifficultyColor(participant.difficulty)} size="sm">
												{getDifficultyText(participant.difficulty)}
											</Badge>
										</div>
									</div>
									<div class="flex gap-2">
										<Button
											size="sm"
											class="bg-green-600 hover:bg-green-700 text-white flex-1"
											disabled={loading}
											on:click={() => grantPoints(participant.id, true)}
										>
											<Check class="w-4 h-4 mr-2" />
											Poprawne (1 pkt)
										</Button>
										<Button
											size="sm"
											variant="outline"
											class="border-red-600 text-red-400 hover:bg-red-600/20 flex-1"
											disabled={loading}
											on:click={() => grantPoints(participant.id, false)}
										>
											<X class="w-4 h-4 mr-2" />
											Niepoprawne
										</Button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<div class="text-center py-4 text-gray-400">
						<Users class="w-8 h-8 mx-auto mb-2 opacity-50" />
						<p>Dodaj uczestników, aby móc przyznawać punkty</p>
					</div>
				{/if}
			{:else}
				<div class="text-center py-8 text-gray-400">
					<Music class="w-12 h-12 mx-auto mb-4 opacity-50" />
					<p>Brak aktualnie odtwarzanej piosenki</p>
					<p class="text-sm mt-2">Wybierz piosenkę z zakładki "Odtwarzacz"</p>
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Participants Management -->
	<Card class="bg-gray-800/50 border-gray-700">
		<CardHeader>
			<CardTitle class="text-white flex items-center gap-2">
				<Users class="w-5 h-5" />
				Zarządzanie uczestnikami ({participants.length})
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Add new participant -->
			<div class="flex gap-2 items-end">
				<div class="flex-1">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="block text-sm font-medium text-gray-300 mb-1">Nazwa uczestnika</label>
					<Input
						bind:value={newParticipant.name}
						placeholder="Wprowadź nazwę uczestnika"
						class="bg-gray-800 border-gray-600 text-white"
						on:keydown={(e) => e.key === 'Enter' && addParticipant()}
					/>
				</div>
				<div class="w-40">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="block text-sm font-medium text-gray-300 mb-1">Trudność</label>
					<select
						bind:value={newParticipant.difficulty}
						on:change={saveDifficultySetting}
						class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white"
					>
						<option value="easy">Łatwe</option>
						<option value="medium">Średnie</option>
						<option value="hard">Trudne</option>
						<option value="very hard">Bardzo trudne</option>
					</select>
				</div>
				<Button
					class="bg-green-600 hover:bg-green-700 text-white"
					disabled={!newParticipant.name.trim()}
					on:click={addParticipant}
				>
					<UserPlus class="w-4 h-4 mr-2" />
					Dodaj
				</Button>
			</div>

			<!-- Participants list -->
			{#if participants.length > 0}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each participants as participant}
						<div class="bg-gray-900/50 rounded-lg p-3 flex items-center justify-between">
							<div>
								<div class="text-white font-medium">{participant.name}</div>
								<Badge class={getDifficultyColor(participant.difficulty)} size="sm">
									{getDifficultyText(participant.difficulty)}
								</Badge>
							</div>
							<Button
								size="sm"
								variant="outline"
								class="border-red-600 text-red-400 hover:bg-red-600/20"
								on:click={() => removeParticipant(participant.id)}
							>
								<Trash2 class="w-4 h-4" />
							</Button>
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-center py-4 text-gray-400">
					<Users class="w-8 h-8 mx-auto mb-2 opacity-50" />
					<p>Brak uczestników. Dodaj pierwszego uczestnika powyżej.</p>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
