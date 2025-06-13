<script>
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { Check, X, Users, Music, Award, Plus, Trash2, UserPlus, Info, AlertTriangle, Eye, EyeOff, Monitor } from 'lucide-svelte';
	import { invalidateLeaderboardCache } from '$lib/utils/leaderboardCache.js';
	import AutocompleteInput from './AutocompleteInput.svelte';

	let loading = false;
	let participants = [];
	let newParticipant = { name: '' };
	let currentSong = null;
	let showMetadata = false;
	let metadataToggleTimeout = null;

	// Local state management - separate from global presenter state
	onMount(() => {
		loadParticipants();
		loadLocalState();

		// Listen for custom events from the Odtwarzacz tab (browser only)
		if (typeof window !== 'undefined') {
			window.addEventListener('pyrkon-song-loaded', handleSongLoaded);
			window.addEventListener('pyrkon-metadata-toggled', handleMetadataToggled);
			window.addEventListener('storage', handleStorageChange);
		}
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('pyrkon-song-loaded', handleSongLoaded);
			window.removeEventListener('pyrkon-metadata-toggled', handleMetadataToggled);
			window.removeEventListener('storage', handleStorageChange);
		}
	});

	function handleSongLoaded(event) {
		currentSong = event.detail.song;
		saveLocalState();
	}

	function handleMetadataToggled(event) {
		showMetadata = event.detail.showMetadata;
		saveLocalState();
	}

	function handleStorageChange(event) {
		// Handle localStorage changes from other tabs
		if (event.key === 'pyrkon_local_state') {
			loadLocalState();
		}
	}

	function loadLocalState() {
		try {
			const savedState = localStorage.getItem('pyrkon_local_state');
			if (savedState) {
				const state = JSON.parse(savedState);
				currentSong = state.currentSong || null;
				showMetadata = state.showMetadata || false;
			}
		} catch (error) {
			console.error('Failed to load local state:', error);
		}
	}

	function saveLocalState() {
		try {
			const state = {
				currentSong,
				showMetadata
			};
			localStorage.setItem('pyrkon_local_state', JSON.stringify(state));
		} catch (error) {
			console.error('Failed to save local state:', error);
		}
	}

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

	function addParticipant() {
		if (!newParticipant.name.trim()) {
			toast.error('Nazwa uczestnika jest wymagana');
			return;
		}

		// Check if participant with same name already exists
		if (participants.some(p => p.name.toLowerCase() === newParticipant.name.toLowerCase())) {
			toast.error('Uczestnik o tej nazwie już istnieje');
			return;
		}

		participants = [...participants, {
			id: `${Date.now()}`, // Simple timestamp ID
			name: newParticipant.name.trim()
		}];

		newParticipant = { name: '' };
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

		// Use the song's difficulty instead of participant's difficulty
		const songDifficulty = currentSong.difficulty || 'easy';

		loading = true;
		try {
			const response = await fetch('/api/pyrkon/grant-points', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					participantName: participant.name,
					participantDifficulty: songDifficulty, // Use song's difficulty
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

	function toggleMetadata() {
		// Clear any existing timeout
		if (metadataToggleTimeout) {
			clearTimeout(metadataToggleTimeout);
		}

		// Set a 2-second delay before toggling
		metadataToggleTimeout = setTimeout(() => {
			// Toggle local metadata state only
			showMetadata = !showMetadata;
			saveLocalState();

			// Dispatch event to notify presenter view (if open in another tab) - browser only
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('pyrkon-metadata-toggled', {
					detail: { showMetadata }
				}));

				// Also trigger a storage event for cross-tab communication
				const state = { currentSong, showMetadata };
				window.dispatchEvent(new StorageEvent('storage', {
					key: 'pyrkon_local_state',
					newValue: JSON.stringify(state),
					storageArea: localStorage
				}));
			}

			toast.success(showMetadata ? 'Metadane zostały odsłonięte lokalnie (po 2s opóźnieniu)' : 'Metadane zostały ukryte lokalnie (po 2s opóźnieniu)');
		}, 2000);

		toast.info('Zmiana metadanych nastąpi za 2 sekundy...');
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
											{#if currentSong?.difficulty}
												<Badge class={getDifficultyColor(currentSong.difficulty)} size="sm">
													{getDifficultyText(currentSong.difficulty)} (z piosenki)
												</Badge>
											{/if}
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
					<AutocompleteInput
						bind:value={newParticipant.name}
						placeholder="Wprowadź nazwę uczestnika lub wybierz z listy"
						type="players"
						className="border-gray-600"
					/>
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
			<div class="text-sm text-gray-400 mt-2">
				💡 Trudność jest teraz określana przez aktualnie odtwarzaną piosenką. Uczestnicy mogą zdobywać punkty w różnych kategoriach trudności.
			</div>

			<!-- Participants list -->
			{#if participants.length > 0}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each participants as participant}
						<div class="bg-gray-900/50 rounded-lg p-3 flex items-center justify-between">
							<div>
								<div class="text-white font-medium">{participant.name}</div>
								<div class="text-xs text-gray-400">Może zdobywać punkty w każdej trudności</div>
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
