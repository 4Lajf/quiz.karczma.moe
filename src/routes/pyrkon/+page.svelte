<script>
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from 'svelte-sonner';
	import { Shuffle, Monitor, Music, Search, Folder, Info, AlertTriangle, Play, Square, Volume2, CheckCircle, Eye, EyeOff } from 'lucide-svelte';

	// Import custom components
	import AudioPlayer from '$lib/components/pyrkon/AudioPlayer.svelte';
	import SongSearch from '$lib/components/pyrkon/SongSearch.svelte';
	import DirectoryPicker from '$lib/components/pyrkon/DirectoryPicker.svelte';
	import AnswerValidation from '$lib/components/pyrkon/AnswerValidation.svelte';

	// Import File System API utilities (browser-only)
	import { fileSystemClient } from '$lib/utils/fileSystemAPI.js';

	export let data;
	$: ({ session, user, profile } = data);

	// Current song and playback state
	let currentSong = null;
	let volume = 0.7;
	let isMuted = false;
	let currentPlaybackTime = 0;
	let isPlaying = false;
	let playbackSyncInterval;

	// Search and filter state
	let searchTerm = '';
	let selectedDifficulty = 'all';
	let selectedGenre = '';
	let selectedTag = '';
	let selectedYear = '';
	let searchResults = [];
	let isSearching = false;

	// Video player component reference
	let videoPlayer;

	// File System API state
	let useLocalFiles = false;
	let localDirectory = null;
	let localVideoFiles = [];
	let currentVideoSrc = '';

	// Tab state
	let activeTab = 'files';

	// Presenter state
	let showMetadata = false;
	let loading = false;
	let metadataToggleTimeout = null;

	// Difficulty options for player tab
	const difficultyOptions = [
		{ value: 'easy', label: 'Łatwa', color: 'green' },
		{ value: 'medium', label: 'Średnia', color: 'yellow' },
		{ value: 'hard', label: 'Trudna', color: 'orange' },
		{ value: 'very hard', label: 'Bardzo trudna', color: 'red' }
	];

	// Difficulty mapping
	function getDifficultyInPolish(englishDifficulty) {
		const difficultyMap = {
			'easy': 'Łatwa',
			'medium': 'Średnia',
			'hard': 'Trudna',
			'very hard': 'Bardzo trudna'
		};
		return difficultyMap[englishDifficulty?.toLowerCase()] || englishDifficulty;
	}

	// Season/Year translation
	function translateVintage(vintage) {
		if (!vintage) return vintage;

		const seasonMap = {
			'spring': 'Wiosna',
			'summer': 'Lato',
			'fall': 'Jesień',
			'autumn': 'Jesień',
			'winter': 'Zima'
		};

		// Handle formats like "Summer 2023", "Fall 2022", etc.
		return vintage.replace(/\b(spring|summer|fall|autumn|winter)\b/gi, (match) => {
			return seasonMap[match.toLowerCase()] || match;
		});
	}

	onMount(() => {
		// Load saved volume
		const savedVolume = localStorage.getItem('pyrkon-admin-volume');
		if (savedVolume) {
			volume = parseFloat(savedVolume);
		}

		// Load saved mute state
		const savedMuted = localStorage.getItem('pyrkon-admin-muted');
		if (savedMuted) {
			isMuted = savedMuted === 'true';
		}

		// Load local state
		loadLocalState();

		// Initial search to load all songs
		searchSongs();
	});

	function loadLocalState() {
		try {
			const savedState = localStorage.getItem('pyrkon_local_state');
			if (savedState) {
				const state = JSON.parse(savedState);
				showMetadata = state.showMetadata || false;
				// Note: currentSong is managed separately in the Odtwarzacz tab
			}
		} catch (error) {
			console.error('Failed to load local state:', error);
		}
	}

	onDestroy(() => {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		if (playbackSyncInterval) {
			clearInterval(playbackSyncInterval);
		}
	});

	async function searchSongs() {
		isSearching = true;
		try {
			if (useLocalFiles && localVideoFiles.length > 0) {
				// Search local files only
				searchResults = searchLocalFiles(searchTerm, selectedDifficulty, selectedGenre, selectedTag, selectedYear);
			} else {
				// No local files available
				searchResults = [];
				if (!useLocalFiles) {
					console.log('No local files selected - user needs to choose a directory first');
				} else if (localVideoFiles.length === 0) {
					console.log('Local directory selected but no video files found');
				}
			}
		} catch (error) {
			console.error('Search error:', error);
			toast.error('Nie udało się wyszukać piosenek');
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	function searchLocalFiles(searchTerm, difficulty = 'all', genre = '', tag = '', year = '') {
		if (!localVideoFiles.length) return [];

		// localVideoFiles now contains matched metadata from CSV
		let filtered = [...localVideoFiles];

		console.log('Search params:', { searchTerm, difficulty, genre, tag, year });
		console.log('Total files before filtering:', filtered.length);

		// Filter by difficulty
		if (difficulty && difficulty !== 'all') {
			const beforeCount = filtered.length;
			filtered = filtered.filter((song) => song.difficulty?.toLowerCase() === difficulty.toLowerCase());
			console.log(`Difficulty filter: ${beforeCount} -> ${filtered.length} files`);
		}

		// Filter by search term
		if (searchTerm && searchTerm.trim()) {
			const term = searchTerm.toLowerCase().trim();
			const beforeCount = filtered.length;
			filtered = filtered.filter((song) => song.FileName?.toLowerCase().includes(term) || song.JPName?.toLowerCase().includes(term) || song.ENName?.toLowerCase().includes(term) || song.SongName?.toLowerCase().includes(term) || song.Artist?.toLowerCase().includes(term));
			console.log(`Search term filter: ${beforeCount} -> ${filtered.length} files`);
		}

		// Filter by genre
		if (genre && genre.trim()) {
			const beforeCount = filtered.length;
			const genreFilter = genre.toLowerCase().trim();
			filtered = filtered.filter((song) => {
				const genres = song.Genres || '';
				return genres.toLowerCase().includes(genreFilter);
			});
			console.log(`Genre filter: ${beforeCount} -> ${filtered.length} files`);
		}

		// Filter by tag
		if (tag && tag.trim()) {
			const beforeCount = filtered.length;
			const tagFilter = tag.toLowerCase().trim();
			filtered = filtered.filter((song) => {
				const tags = song.Tags || '';
				return tags.toLowerCase().includes(tagFilter);
			});
			console.log(`Tag filter: ${beforeCount} -> ${filtered.length} files`);
		}

		// Filter by year
		if (year && year.trim()) {
			const beforeCount = filtered.length;
			const yearFilter = parseInt(year.trim());
			filtered = filtered.filter((song) => {
				const vintage = song.Vintage || '';
				const yearMatch = vintage.match(/\b(19|20)\d{2}\b/);
				const songYear = yearMatch ? parseInt(yearMatch[0]) : null;
				return songYear === yearFilter;
			});
			console.log(`Year filter: ${beforeCount} -> ${filtered.length} files`);
		}

		console.log('Final filtered results:', filtered.length);
		return filtered;
	}

	async function playRandomSong() {
		try {
			// Check if local files are available
			if (!useLocalFiles || !localVideoFiles.length) {
				toast.error('Musisz najpierw wybrać lokalny katalog z plikami w zakładce "Pliki"');
				activeTab = 'files';
				return;
			}

			// Play from all songs (no difficulty filter)
			let filteredFiles = [...localVideoFiles];

			if (filteredFiles.length === 0) {
				toast.error('Brak piosenek w wybranym katalogu');
				return;
			}

			const randomIndex = Math.floor(Math.random() * filteredFiles.length);
			const song = filteredFiles[randomIndex];

			playSong(song);
		} catch (error) {
			console.error('Error playing random song:', error);
			toast.error('Nie udało się załadować losowej piosenki');
		}
	}

	async function playRandomSongByDifficulty(difficulty) {
		try {
			// Check if local files are available
			if (!useLocalFiles || !localVideoFiles.length) {
				toast.error('Musisz najpierw wybrać lokalny katalog z plikami w zakładce "Pliki"');
				activeTab = 'files';
				return;
			}

			// Apply difficulty filter
			let filteredFiles = localVideoFiles.filter((song) => song.difficulty?.toLowerCase() === difficulty.toLowerCase());

			if (filteredFiles.length === 0) {
				toast.error(`Brak piosenek o trudności "${getDifficultyInPolish(difficulty)}" w wybranym katalogu`);
				return;
			}

			const randomIndex = Math.floor(Math.random() * filteredFiles.length);
			const song = filteredFiles[randomIndex];

			playSong(song);
		} catch (error) {
			console.error('Error playing random song by difficulty:', error);
			toast.error('Nie udało się załadować losowej piosenki');
		}
	}

	async function playFromStart() {
		if (currentSong && videoPlayer) {
			// Random point in the first 15 seconds
			const randomStartTime = Math.random() * 15;
			videoPlayer.setCurrentTime(randomStartTime);
			videoPlayer.play();
			await updatePresenterState({
				currentTime: randomStartTime,
				isPlaying: true
			});
			const minutes = Math.floor(randomStartTime / 60);
			const seconds = Math.floor(randomStartTime % 60);
			toast.success(`Odtwarzanie od początku: ${minutes}:${seconds.toString().padStart(2, '0')}`);
		} else {
			toast.error('Najpierw załaduj piosenkę');
		}
	}

	async function playFromMiddle() {
		if (currentSong && videoPlayer && videoPlayer.getDuration() > 0) {
			const duration = videoPlayer.getDuration();
			const middlePoint = duration / 2;
			// Random point within 20 seconds around the middle (±10 seconds)
			const randomOffset = (Math.random() - 0.5) * 20; // -10 to +10 seconds
			const middleTime = Math.max(0, Math.min(duration, middlePoint + randomOffset));
			videoPlayer.setCurrentTime(middleTime);
			videoPlayer.play();
			await updatePresenterState({
				currentTime: middleTime,
				isPlaying: true
			});
			const minutes = Math.floor(middleTime / 60);
			const seconds = Math.floor(middleTime % 60);
			toast.success(`Odtwarzanie od środka: ${minutes}:${seconds.toString().padStart(2, '0')}`);
		} else {
			toast.error('Najpierw załaduj piosenkę lub poczekaj na załadowanie');
		}
	}

	async function playFromNearEnd() {
		if (currentSong && videoPlayer && videoPlayer.getDuration() > 0) {
			const duration = videoPlayer.getDuration();
			// Random point in the last 30 seconds of the song
			const endZoneStart = Math.max(0, duration - 30);
			const nearEndTime = endZoneStart + (Math.random() * Math.min(30, duration));
			videoPlayer.setCurrentTime(nearEndTime);
			videoPlayer.play();
			await updatePresenterState({
				currentTime: nearEndTime,
				isPlaying: true
			});
			const minutes = Math.floor(nearEndTime / 60);
			const seconds = Math.floor(nearEndTime % 60);
			toast.success(`Odtwarzanie od końca: ${minutes}:${seconds.toString().padStart(2, '0')}`);
		} else {
			toast.error('Najpierw załaduj piosenkę lub poczekaj na załadowanie');
		}
	}

	async function playFromRandomPoint() {
		if (currentSong && videoPlayer && videoPlayer.getDuration() > 0) {
			const duration = videoPlayer.getDuration();
			// Random point between 5 seconds and 15 seconds before the end
			const startBound = 5;
			const endBound = Math.max(startBound + 10, duration - 15);
			const randomTime = startBound + (Math.random() * (endBound - startBound));
			videoPlayer.setCurrentTime(randomTime);
			videoPlayer.play();
			await updatePresenterState({
				currentTime: randomTime,
				isPlaying: true
			});
			const minutes = Math.floor(randomTime / 60);
			const seconds = Math.floor(randomTime % 60);
			toast.success(`Odtwarzanie od losowej pozycji: ${minutes}:${seconds.toString().padStart(2, '0')}`);
		} else {
			toast.error('Najpierw załaduj piosenkę lub poczekaj na załadowanie');
		}
	}

	async function playSong(song) {
		// Only allow local files
		if (!song.isLocalFile) {
			toast.error('System obsługuje tylko pliki lokalne. Wybierz katalog w zakładce "Pliki".');
			activeTab = 'files';
			return;
		}

		// Step 1: First turn off metadata display to prevent leakage
		showMetadata = false;

		// Save metadata off state immediately
		const metadataOffState = {
			currentSong: currentSong, // Keep current song temporarily
			showMetadata: false
		};
		localStorage.setItem('pyrkon_local_state', JSON.stringify(metadataOffState));

		// Dispatch metadata toggle event immediately
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('pyrkon-metadata-toggled', {
				detail: { showMetadata: false }
			}));

			window.dispatchEvent(new StorageEvent('storage', {
				key: 'pyrkon_local_state',
				newValue: JSON.stringify(metadataOffState),
				storageArea: localStorage
			}));
		}

		// Step 2: Wait 1 second before loading new song
		await new Promise(resolve => setTimeout(resolve, 1000));

		// Step 3: Now load the new song
		currentSong = song;

		// Stop current playback
		if (videoPlayer) {
			videoPlayer.stop();
		}

		// Set video source for local file
		if (typeof window !== 'undefined') {
			try {
				currentVideoSrc = await fileSystemClient.createFileURL(song.FileName);
			} catch (error) {
				console.error('Error creating file URL:', error);
				toast.error('Nie udało się załadować lokalnego pliku');
				return;
			}
		} else {
			toast.error('Nie można załadować pliku - brak dostępu do File System API');
			return;
		}

		// Save final state with new song
		const finalState = {
			currentSong: song,
			showMetadata: false // Keep metadata off
		};
		localStorage.setItem('pyrkon_local_state', JSON.stringify(finalState));

		// Initialize playback state
		const playbackState = {
			currentTime: 0,
			isPlaying: false,
			videoSrc: currentVideoSrc,
			timestamp: Date.now()
		};
		localStorage.setItem('pyrkon_playback_state', JSON.stringify(playbackState));

		// Dispatch event for local state management (for Odpowiedzi tab) - browser only
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('pyrkon-song-loaded', {
				detail: { song }
			}));

			// Also trigger storage events for cross-tab communication
			window.dispatchEvent(new StorageEvent('storage', {
				key: 'pyrkon_local_state',
				newValue: JSON.stringify(state),
				storageArea: localStorage
			}));

			window.dispatchEvent(new StorageEvent('storage', {
				key: 'pyrkon_playback_state',
				newValue: JSON.stringify(playbackState),
				storageArea: localStorage
			}));
		}

		// Update presenter state (for presenter view synchronization)
		await updatePresenterState({
			currentSong: song,
			showMetadata: false,
			showVideoPlaceholder: true,
			guessingPhase: true,
			videoSrc: currentVideoSrc,
			currentTime: 0,
			isPlaying: false
		});

		// Update local state and notify other tabs about metadata toggle reset
		const localState = {
			currentSong: song,
			showMetadata: false
		};
		localStorage.setItem('pyrkon_local_state', JSON.stringify(localState));

		// Dispatch events to notify other tabs/views
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('pyrkon-metadata-toggled', {
				detail: { showMetadata: false }
			}));

			window.dispatchEvent(new CustomEvent('pyrkon-song-changed', {
				detail: { currentSong: song }
			}));

			// Also trigger a storage event manually for same-tab communication
			window.dispatchEvent(new StorageEvent('storage', {
				key: 'pyrkon_local_state',
				newValue: JSON.stringify(localState),
				storageArea: localStorage
			}));
		}

		toast.success(`Załadowano: ${song.JPName || song.FileName}`);
	}

	function handleVolumeChange(event) {
		volume = event.detail;
		localStorage.setItem('pyrkon-admin-volume', volume.toString());
	}

	function handleMuteChange(event) {
		isMuted = event.detail;
		localStorage.setItem('pyrkon-admin-muted', isMuted.toString());
	}

	function handleTimeUpdate(event) {
		currentPlaybackTime = event.detail.currentTime;

		// Update playback state for presenter sync (but only if playing)
		if (isPlaying && typeof window !== 'undefined') {
			const playbackState = {
				currentTime: currentPlaybackTime,
				isPlaying: true,
				videoSrc: currentVideoSrc,
				timestamp: Date.now()
			};
			localStorage.setItem('pyrkon_playback_state', JSON.stringify(playbackState));
		}
	}

	function handlePlay() {
		isPlaying = true;
		startPlaybackSync();
	}

	function handlePause() {
		isPlaying = false;
		stopPlaybackSync();
	}

	function handleEnded() {
		isPlaying = false;
		currentPlaybackTime = 0;
		stopPlaybackSync();
	}

	function startPlaybackSync() {
		// Send periodic updates for video synchronization while playing
		if (playbackSyncInterval) clearInterval(playbackSyncInterval);

		playbackSyncInterval = setInterval(() => {
			if (currentSong && isPlaying) {
				// Update local state with playback info for presenter sync
				const playbackState = {
					currentTime: currentPlaybackTime,
					isPlaying: true,
					videoSrc: currentVideoSrc,
					timestamp: Date.now()
				};

				// Store playback state separately from song/metadata state
				if (typeof window !== 'undefined') {
					localStorage.setItem('pyrkon_playback_state', JSON.stringify(playbackState));

					// Dispatch storage event for cross-tab sync
					window.dispatchEvent(new StorageEvent('storage', {
						key: 'pyrkon_playback_state',
						newValue: JSON.stringify(playbackState),
						storageArea: localStorage
					}));
				}
			}
		}, 1000); // Update every second
	}

	function stopPlaybackSync() {
		if (playbackSyncInterval) {
			clearInterval(playbackSyncInterval);
			playbackSyncInterval = null;
		}

		// Update playback state to stopped
		if (typeof window !== 'undefined') {
			const playbackState = {
				currentTime: currentPlaybackTime,
				isPlaying: false,
				videoSrc: currentVideoSrc,
				timestamp: Date.now()
			};
			localStorage.setItem('pyrkon_playback_state', JSON.stringify(playbackState));

			// Dispatch storage event for cross-tab sync
			window.dispatchEvent(new StorageEvent('storage', {
				key: 'pyrkon_playback_state',
				newValue: JSON.stringify(playbackState),
				storageArea: localStorage
			}));
		}
	}

	function handleDirectoryChanged(event) {
		const { useLocalFiles: newUseLocalFiles, directory, files } = event.detail;

		useLocalFiles = newUseLocalFiles;
		localDirectory = directory;
		localVideoFiles = files || [];



		// Clear current song if switching modes
		if (currentSong && currentSong.isLocalFile !== useLocalFiles) {
			currentSong = null;
			currentVideoSrc = '';
			if (videoPlayer) {
				videoPlayer.stop();
			}
		}

		// Refresh search results
		searchSongs();

		console.log(`File mode changed: ${useLocalFiles ? 'Local' : 'Server'}, Directory: ${directory}, Files: ${files?.length || 0}`);
	}

	async function updatePresenterState(updates) {
		try {
			await fetch('/api/pyrkon/presenter-state', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			});
		} catch (error) {
			console.error('Failed to update presenter state:', error);
		}
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

			// Save to local state
			const state = {
				currentSong,
				showMetadata
			};
			localStorage.setItem('pyrkon_local_state', JSON.stringify(state));

			// Dispatch event to notify other tabs (presenter view, answers tab) - browser only
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('pyrkon-metadata-toggled', {
					detail: { showMetadata }
				}));

				// Also trigger a storage event manually for same-tab communication
				// This helps ensure the presenter view updates immediately
				window.dispatchEvent(new StorageEvent('storage', {
					key: 'pyrkon_local_state',
					newValue: JSON.stringify(state),
					storageArea: localStorage
				}));
			}
		}, 1000);
	}

	function handleSongSelect(event) {
		playSong(event.detail);
		// Switch to player tab automatically
		activeTab = 'player';
	}

	function handleSearchEvent(event) {
		searchTerm = event.detail.searchTerm;
		selectedDifficulty = event.detail.difficulty || 'all';
		selectedGenre = event.detail.genre || '';
		selectedTag = event.detail.tag || '';
		selectedYear = event.detail.year || '';
		// Clear any pending reactive search
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = null;
		}
		// Trigger search immediately when search button is clicked
		searchSongs();
	}

	function handleClearSearch() {
		searchTerm = '';
		selectedDifficulty = 'all';
		selectedGenre = '';
		selectedTag = '';
		selectedYear = '';
		searchSongs();
	}

	// Reactive search with debouncing
	let searchTimeout;
	$: {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(searchSongs, 300);
	}
</script>

<svelte:head>
	<title>Pyrkon Admin - Quiz Karczma</title>
</svelte:head>

<div class="min-h-screen bg-gray-950">
	<div class="container px-4 py-8 mx-auto">
		<div class="mb-8 text-center">
			<h1 class="mb-2 text-4xl font-bold text-white">🎵 Muzyczkoinator 🎵</h1>
			<p class="text-gray-400">Zarządzaj quizem muzycznym</p>
		</div>

		<div class="max-w-6xl mx-auto">
			<Tabs bind:value={activeTab} class="w-full">
				<TabsList class="grid w-full grid-cols-4 bg-gray-900 border border-gray-800">
					<TabsTrigger value="files" class="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
						<Folder class="w-4 h-4 mr-2" />
						Pliki
					</TabsTrigger>
					<TabsTrigger value="player" class="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
						<Music class="w-4 h-4 mr-2" />
						Odtwarzacz
					</TabsTrigger>
					<TabsTrigger value="answers" class="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
						<CheckCircle class="w-4 h-4 mr-2" />
						Odpowiedzi
					</TabsTrigger>
					<TabsTrigger value="search" class="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
						<Search class="w-4 h-4 mr-2" />
						Wyszukiwanie
					</TabsTrigger>
				</TabsList>

				<TabsContent value="files" class="space-y-6">
					<!-- Instructions card -->
					<Card class="border-blue-800 bg-blue-900/20">
						<CardHeader>
							<CardTitle class="flex items-center gap-2 text-blue-300">
								<Info class="w-5 h-5" />
								Instrukcje
							</CardTitle>
						</CardHeader>
						<CardContent class="space-y-3">
							<div class="text-sm text-blue-200">
								<p class="mb-2">Aby móc odtwarzać piosenki, musisz:</p>
								<ol class="space-y-1 text-blue-100 list-decimal list-inside">
									<li>Wybrać lokalny katalog z plikami wideo/audio</li>
									<li>Przejść do zakładki "Odtwarzacz" lub "Wyszukiwanie"</li>
								</ol>
							</div>
						</CardContent>
					</Card>

					<DirectoryPicker bind:useLocalFiles bind:currentDirectory={localDirectory} on:directoryChanged={handleDirectoryChanged} />
				</TabsContent>

				<TabsContent value="player" class="space-y-6">
					<!-- Current song player -->
					<Card class="bg-gray-900 border-gray-800">
						<CardHeader>
							<CardTitle class="flex items-center gap-2 text-white">
								<Music class="w-5 h-5" />
								Aktualnie odtwarzane
							</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							{#if currentSong}
								<div class="space-y-4">
									<!-- Title section -->
									<div class="space-y-2 text-center">
										<h3 class="text-3xl font-bold text-green-400">{currentSong.JPName}</h3>
										<p class="text-xl text-gray-300">{currentSong.ENName}</p>
									</div>

									<!-- Metadata grid -->
									<div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
										<div class="p-3 border border-blue-800 rounded-lg bg-blue-900/20">
											<div class="flex items-center space-x-2">
												<span class="text-lg">🎵</span>
												<div>
													<p class="text-xs tracking-wide text-blue-300 uppercase">Piosenka</p>
													<p class="font-medium text-white">{currentSong.SongName}</p>
												</div>
											</div>
										</div>

										<div class="p-3 border border-purple-800 rounded-lg bg-purple-900/20">
											<div class="flex items-center space-x-2">
												<span class="text-lg">🎤</span>
												<div>
													<p class="text-xs tracking-wide text-purple-300 uppercase">Wykonawca</p>
													<p class="font-medium text-white">{currentSong.Artist}</p>
												</div>
											</div>
										</div>

										{#if currentSong.difficulty}
											{#if currentSong.difficulty?.toLowerCase() === 'easy'}
												<div class="p-3 border border-green-800 rounded-lg bg-green-900/20">
													<div class="flex items-center space-x-2">
														<span class="text-lg">⭐</span>
														<div>
															<p class="text-xs tracking-wide text-green-300 uppercase">Trudność</p>
															<p class="font-medium text-white">{getDifficultyInPolish(currentSong.difficulty)}</p>
														</div>
													</div>
												</div>
											{:else if currentSong.difficulty?.toLowerCase() === 'medium'}
												<div class="p-3 border border-yellow-800 rounded-lg bg-yellow-900/20">
													<div class="flex items-center space-x-2">
														<span class="text-lg">⭐</span>
														<div>
															<p class="text-xs tracking-wide text-yellow-300 uppercase">Trudność</p>
															<p class="font-medium text-white">{getDifficultyInPolish(currentSong.difficulty)}</p>
														</div>
													</div>
												</div>
											{:else if currentSong.difficulty?.toLowerCase() === 'hard'}
												<div class="p-3 border border-orange-800 rounded-lg bg-orange-900/20">
													<div class="flex items-center space-x-2">
														<span class="text-lg">⭐</span>
														<div>
															<p class="text-xs tracking-wide text-orange-300 uppercase">Trudność</p>
															<p class="font-medium text-white">{getDifficultyInPolish(currentSong.difficulty)}</p>
														</div>
													</div>
												</div>
											{:else}
												<div class="p-3 border border-red-800 rounded-lg bg-red-900/20">
													<div class="flex items-center space-x-2">
														<span class="text-lg">⭐</span>
														<div>
															<p class="text-xs tracking-wide text-red-300 uppercase">Trudność</p>
															<p class="font-medium text-white">{getDifficultyInPolish(currentSong.difficulty)}</p>
														</div>
													</div>
												</div>
											{/if}
										{/if}

										{#if currentSong.Vintage}
											<div class="p-3 border border-gray-700 rounded-lg bg-gray-800/50">
												<div class="flex items-center space-x-2">
													<span class="text-lg">📅</span>
													<div>
														<p class="text-xs tracking-wide text-gray-400 uppercase">Rok</p>
														<p class="font-medium text-white">{translateVintage(currentSong.Vintage)}</p>
													</div>
												</div>
											</div>
										{/if}
									</div>
								</div>

								<!-- Video Player Component (audio only) -->
								<AudioPlayer
									bind:this={videoPlayer}
									src={currentVideoSrc}
									bind:volume
									bind:muted={isMuted}
									showVideo={false}
									on:volumeChange={handleVolumeChange}
									on:muteChange={handleMuteChange}
									on:timeUpdate={handleTimeUpdate}
									on:play={handlePlay}
									on:pause={handlePause}
									on:ended={handleEnded}
								/>
							{:else}
								<!-- Placeholder when no song is loaded -->
								<div class="space-y-4">
									<!-- Title section placeholder -->
									<div class="space-y-2 text-center">
										<div class="p-6 border border-gray-700 rounded-lg bg-gray-800/50">
											<Music class="w-16 h-16 mx-auto mb-4 text-gray-500 opacity-30" />
											<h3 class="mb-2 text-xl font-medium text-gray-400">Brak załadowanej piosenki</h3>
											<p class="text-sm text-gray-500">Wybierz piosenkę z wyszukiwania lub użyj losowego wyboru</p>
										</div>
									</div>

									<!-- Metadata grid placeholder -->
									<div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
										<div class="p-3 border border-gray-700 rounded-lg bg-gray-800/30">
											<div class="flex items-center space-x-2">
												<span class="text-lg opacity-30">🎵</span>
												<div>
													<p class="text-xs tracking-wide text-gray-500 uppercase">Piosenka</p>
													<p class="font-medium text-gray-600">-</p>
												</div>
											</div>
										</div>

										<div class="p-3 border border-gray-700 rounded-lg bg-gray-800/30">
											<div class="flex items-center space-x-2">
												<span class="text-lg opacity-30">🎤</span>
												<div>
													<p class="text-xs tracking-wide text-gray-500 uppercase">Wykonawca</p>
													<p class="font-medium text-gray-600">-</p>
												</div>
											</div>
										</div>

										<div class="p-3 border border-gray-700 rounded-lg bg-gray-800/30">
											<div class="flex items-center space-x-2">
												<span class="text-lg opacity-30">⭐</span>
												<div>
													<p class="text-xs tracking-wide text-gray-500 uppercase">Trudność</p>
													<p class="font-medium text-gray-600">-</p>
												</div>
											</div>
										</div>

										<div class="p-3 border border-gray-700 rounded-lg bg-gray-800/30">
											<div class="flex items-center space-x-2">
												<span class="text-lg opacity-30">📅</span>
												<div>
													<p class="text-xs tracking-wide text-gray-500 uppercase">Rok</p>
													<p class="font-medium text-gray-600">-</p>
												</div>
											</div>
										</div>
									</div>

									<!-- Audio Player placeholder -->
									<div class="p-4 border border-gray-700 rounded-lg bg-gray-800/30">
										<div class="space-y-3">
											<!-- Main controls row -->
											<div class="flex items-center gap-3">
												<Button variant="outline" size="sm" class="text-gray-500 bg-gray-700 border-gray-600" disabled>
													<Play class="w-4 h-4" />
												</Button>
												<Button variant="outline" size="sm" class="text-gray-500 bg-gray-700 border-gray-600" disabled>
													<Square class="w-4 h-4" />
												</Button>
												<div class="text-sm text-gray-500 font-mono min-w-[100px] bg-gray-900 px-3 py-1 rounded border border-gray-600">
													0:00 / 0:00
												</div>
												<div class="flex items-center gap-2 ml-auto">
													<Button variant="ghost" size="sm" class="text-gray-500" disabled>
														<Volume2 class="w-4 h-4" />
													</Button>
													<div class="volume-slider-container">
														<input type="range" min="0" max="1" step="0.1" value="0.7" class="opacity-50 volume-slider" disabled />
														<div class="mt-1 text-xs text-center text-gray-500 volume-label">70%</div>
													</div>
												</div>
											</div>
											<!-- Progress bar row -->
											<div class="space-y-2">
												<div class="flex items-center justify-between text-xs text-gray-500">
													<span>Postęp</span>
													<span>0%</span>
												</div>
												<div class="progress-container">
													<input type="range" min="0" max="0" value="0" class="w-full opacity-50 progress-slider" disabled />
												</div>
											</div>
										</div>
									</div>
								</div>
							{/if}

							<!-- Quick actions -->
							<div class="space-y-4">
								<!-- Difficulty selection buttons -->
								<div class="space-y-3">
									<div class="flex items-center justify-between">
										<p class="text-sm text-gray-400">Losowa piosenka według trudności:</p>
										<div class="flex gap-2">
											{#if currentSong}
												<Button
													size="sm"
													class={showMetadata ? 'bg-green-600 hover:bg-green-700 text-white/90' : 'bg-blue-600 hover:bg-blue-700 text-white/80'}
													disabled={loading}
													on:click={toggleMetadata}
												>
													{#if showMetadata}
														<EyeOff class="w-3 h-3 mr-2" />
														Ukryj metadane
													{:else}
														<Eye class="w-3 h-3 mr-2" />
														Odsłoń metadane
													{/if}
												</Button>
											{/if}
											<Button on:click={() => window.open('/admin/pyrkon/presenter', '_blank', 'fullscreen=yes')} size="sm" class="text-gray-300 bg-gray-700 border border-gray-600 hover:bg-gray-600">
												<Monitor class="w-3 h-3 mr-2" />
												Prezenter
											</Button>
										</div>
									</div>
									<div class="grid grid-cols-2 gap-2">
										<Button
											on:click={() => playRandomSongByDifficulty('easy')}
											size="sm"
											class="text-sm text-green-400 bg-gray-700 border border-green-800 hover:bg-gray-600"
										>
											<Shuffle class="w-3 h-3 mr-2" />
											Łatwa
										</Button>
										<Button
											on:click={() => playRandomSongByDifficulty('medium')}
											size="sm"
											class="text-sm text-yellow-400 bg-gray-700 border border-yellow-800 hover:bg-gray-600"
										>
											<Shuffle class="w-3 h-3 mr-2" />
											Średnia
										</Button>
										<Button
											on:click={() => playRandomSongByDifficulty('hard')}
											size="sm"
											class="text-sm text-orange-400 bg-gray-700 border border-orange-800 hover:bg-gray-600"
										>
											<Shuffle class="w-3 h-3 mr-2" />
											Trudna
										</Button>
										<Button
											on:click={() => playRandomSongByDifficulty('very hard')}
											size="sm"
											class="text-sm text-red-400 bg-gray-700 border border-red-800 hover:bg-gray-600"
										>
											<Shuffle class="w-3 h-3 mr-2" />
											Bardzo trudna
										</Button>
									</div>
								</div>

								<!-- Playback position controls -->
								{#if currentSong}
									<div class="space-y-3">
										<p class="text-sm text-center text-gray-400">Pozycja odtwarzania:</p>
										<div class="grid grid-cols-2 gap-2">
											<Button on:click={playFromStart} class="text-sm text-green-400 bg-gray-700 border border-green-800 hover:bg-gray-600">
												<Play class="w-3 h-3 mr-2" />
												Początek (0-15s)
											</Button>
											<Button on:click={playFromMiddle} class="text-sm text-yellow-400 bg-gray-700 border border-yellow-800 hover:bg-gray-600">
												<Play class="w-3 h-3 mr-2" />
												Środek (±10s)
											</Button>
											<Button on:click={playFromNearEnd} class="text-sm text-orange-400 bg-gray-700 border border-orange-800 hover:bg-gray-600">
												<Play class="w-3 h-3 mr-2" />
												Koniec (30s)
											</Button>
											<Button on:click={playFromRandomPoint} class="text-sm text-red-400 bg-gray-700 border border-red-800 hover:bg-gray-600">
												<Shuffle class="w-3 h-3 mr-2" />
												Całkowicie losowo
											</Button>
										</div>
									</div>
								{/if}

								<!-- Random song button (any difficulty) -->
								<div class="space-y-3">
									<Button on:click={() => playRandomSong()} class="w-full text-sm text-gray-300 bg-gray-700 border border-gray-600 hover:bg-gray-600">
										<Shuffle class="w-4 h-4 mr-2" />
										Losowa piosenka (wszystkie)
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="answers" class="space-y-6">
					<AnswerValidation />
				</TabsContent>

				<TabsContent value="search" class="space-y-6">
					<SongSearch bind:searchTerm bind:selectedDifficulty bind:selectedGenre bind:selectedTag bind:selectedYear bind:searchResults bind:isSearching {useLocalFiles} hasLocalFiles={localVideoFiles.length > 0} on:search={handleSearchEvent} on:songSelect={handleSongSelect} on:clear={handleClearSearch} />
				</TabsContent>
			</Tabs>
		</div>
	</div>
</div>

<style>
	/* Ensure range input tracks are visible - override any conflicting styles */
	:global(.volume-slider::-webkit-slider-track),
	:global(input[type="range"].volume-slider::-webkit-slider-track),
	:global(input.volume-slider::-webkit-slider-track) {
		-webkit-appearance: none !important;
		appearance: none !important;
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	:global(.progress-slider::-webkit-slider-track),
	:global(input[type="range"].progress-slider::-webkit-slider-track),
	:global(input.progress-slider::-webkit-slider-track) {
		-webkit-appearance: none !important;
		appearance: none !important;
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	:global(.volume-slider::-moz-range-track) {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
	}

	:global(.progress-slider::-moz-range-track) {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
	}

	/* Ensure the base range input has proper styling */
	:global(input[type="range"].volume-slider),
	:global(input[type="range"].progress-slider) {
		-webkit-appearance: none !important;
		appearance: none !important;
		background: transparent !important;
		cursor: pointer !important;
	}

	/* Ensure disabled sliders still show visible tracks */
	:global(.volume-slider:disabled::-webkit-slider-track) {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	:global(.progress-slider:disabled::-webkit-slider-track) {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3) !important;
	}

	:global(.volume-slider:disabled::-moz-range-track) {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 6px !important;
		border-radius: 3px !important;
		border: 1px solid #6b7280 !important;
	}

	:global(.progress-slider:disabled::-moz-range-track) {
		background: linear-gradient(to right, #4b5563 0%, #6b7280 100%) !important;
		height: 8px !important;
		border-radius: 4px !important;
		border: 1px solid #6b7280 !important;
	}
</style>
