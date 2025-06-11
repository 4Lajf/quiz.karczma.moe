<script>
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from 'svelte-sonner';
	import { Shuffle, Monitor, Music, Search, Folder } from 'lucide-svelte';

	// Import custom components
	import AudioPlayer from '$lib/components/pyrkon/AudioPlayer.svelte';
	import SongSearch from '$lib/components/pyrkon/SongSearch.svelte';
	import PresenterScreen from '$lib/components/pyrkon/PresenterScreen.svelte';
	import DirectoryPicker from '$lib/components/pyrkon/DirectoryPicker.svelte';

	// Import File System API utilities (browser-only)
	import { fileSystemClient } from '$lib/utils/fileSystemAPI.js';

	export let data;
	$: ({ session, user, profile } = data);

	// Current song and playback state
	let currentSong = null;
	let volume = 0.7;
	let isMuted = false;

	// Search and filter state
	let searchTerm = '';
	let selectedDifficulty = 'all';
	let searchResults = [];
	let isSearching = false;

	// Presenter screen state
	let showPresenterScreen = false;
	let showMetadata = false;
	let showVideoPlaceholder = true;

	// Video player component reference
	let videoPlayer;

	// File System API state
	let useLocalFiles = false;
	let localDirectory = null;
	let localVideoFiles = [];
	let currentVideoSrc = '';

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

		// Initial search to load all songs
		searchSongs();
	});

	onDestroy(() => {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
	});

	async function searchSongs() {
		isSearching = true;
		try {
			if (useLocalFiles && localVideoFiles.length > 0) {
				// Search local files
				searchResults = searchLocalFiles(searchTerm, selectedDifficulty);
			} else {
				// Search server files
				const response = await fetch('/api/pyrkon/songs', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						search: searchTerm,
						difficulty: selectedDifficulty
					})
				});

				if (!response.ok) throw new Error('Search failed');

				const data = await response.json();
				searchResults = data.songs || [];
			}
		} catch (error) {
			console.error('Search error:', error);
			toast.error('Nie udało się wyszukać piosenek');
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	function searchLocalFiles(searchTerm, difficulty) {
		if (!localVideoFiles.length) return [];

		// localVideoFiles now contains matched metadata from CSV
		let filtered = [...localVideoFiles];

		// Filter by difficulty
		if (difficulty && difficulty !== 'all') {
			filtered = filtered.filter(song =>
				song.difficulty?.toLowerCase() === difficulty.toLowerCase()
			);
		}

		// Filter by search term
		if (searchTerm && searchTerm.trim()) {
			const term = searchTerm.toLowerCase().trim();
			filtered = filtered.filter(song =>
				song.FileName?.toLowerCase().includes(term) ||
				song.JPName?.toLowerCase().includes(term) ||
				song.ENName?.toLowerCase().includes(term) ||
				song.SongName?.toLowerCase().includes(term) ||
				song.Artist?.toLowerCase().includes(term)
			);
		}

		return filtered;
	}

	async function playRandomSong() {
		try {
			let song;

			if (useLocalFiles && localVideoFiles.length > 0) {
				// Pick random local file (localVideoFiles now contains proper metadata)
				let filteredFiles = [...localVideoFiles];

				// Filter by difficulty if specified
				if (selectedDifficulty && selectedDifficulty !== 'all') {
					filteredFiles = filteredFiles.filter(song =>
						song.difficulty?.toLowerCase() === selectedDifficulty.toLowerCase()
					);
				}

				if (filteredFiles.length === 0) {
					filteredFiles = localVideoFiles; // Fallback to all files
				}

				const randomIndex = Math.floor(Math.random() * filteredFiles.length);
				song = filteredFiles[randomIndex];
			} else {
				// Get random server file
				const params = new URLSearchParams({
					random: 'true'
				});

				if (selectedDifficulty !== 'all') {
					params.append('difficulty', selectedDifficulty);
				}

				const response = await fetch(`/api/pyrkon/songs?${params}`);
				if (!response.ok) throw new Error('Failed to fetch random song');

				song = await response.json();
			}

			playSong(song);
		} catch (error) {
			console.error('Error playing random song:', error);
			toast.error('Nie udało się załadować losowej piosenki');
		}
	}

	async function playSong(song) {
		currentSong = song;
		showMetadata = false;
		showVideoPlaceholder = true;

		// Stop current playback
		if (videoPlayer) {
			videoPlayer.stop();
		}

		// Set video source based on file type
		if (song.isLocalFile && typeof window !== 'undefined') {
			try {
				currentVideoSrc = await fileSystemClient.createFileURL(song.FileName);
			} catch (error) {
				console.error('Error creating file URL:', error);
				toast.error('Nie udało się załadować lokalnego pliku');
				return;
			}
		} else {
			currentVideoSrc = `/api/pyrkon/play?file=${encodeURIComponent(song.FileName)}`;
		}

		// Update presenter state
		await updatePresenterState({
			currentSong: song,
			showMetadata: false,
			showVideoPlaceholder: true,
			guessingPhase: true,
			videoSrc: currentVideoSrc
		});

		toast.success(`Załadowano: ${song.JPName}`);
	}

	function handleVolumeChange(event) {
		volume = event.detail;
		localStorage.setItem('pyrkon-admin-volume', volume.toString());
	}

	function handleMuteChange(event) {
		isMuted = event.detail;
		localStorage.setItem('pyrkon-admin-muted', isMuted.toString());
	}

	async function handlePresenterScreenToggle(event) {
		showPresenterScreen = event.detail;
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

	async function handleMetadataToggle(event) {
		showMetadata = event.detail;
		showVideoPlaceholder = !showMetadata;

		// Update presenter state
		await updatePresenterState({
			showMetadata,
			showVideoPlaceholder
		});
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

	function handleSongSelect(event) {
		playSong(event.detail);
	}

	function handleSearchEvent(event) {
		searchTerm = event.detail.searchTerm;
		selectedDifficulty = event.detail.selectedDifficulty;
	}

	function handleClearSearch() {
		searchTerm = '';
		selectedDifficulty = 'all';
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

<div class="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
	<div class="container mx-auto px-4 py-8">
		<div class="text-center mb-8">
			<h1 class="text-4xl font-bold text-white mb-2">🎵 Pyrkon Admin Panel 🎵</h1>
			<p class="text-blue-200">Zarządzaj quizem muzycznym</p>
		</div>

		<div class="max-w-6xl mx-auto">
			<Tabs value="files" class="w-full">
				<TabsList class="grid w-full grid-cols-4 bg-gray-800/50">
					<TabsTrigger value="files" class="data-[state=active]:bg-purple-600">
						<Folder class="w-4 h-4 mr-2" />
						Pliki
					</TabsTrigger>
					<TabsTrigger value="player" class="data-[state=active]:bg-purple-600">
						<Music class="w-4 h-4 mr-2" />
						Odtwarzacz
					</TabsTrigger>
					<TabsTrigger value="search" class="data-[state=active]:bg-purple-600">
						<Search class="w-4 h-4 mr-2" />
						Wyszukiwanie
					</TabsTrigger>
					<TabsTrigger value="presenter" class="data-[state=active]:bg-purple-600">
						<Monitor class="w-4 h-4 mr-2" />
						Prezenter
					</TabsTrigger>
				</TabsList>

				<TabsContent value="files" class="space-y-6">
					<DirectoryPicker
						bind:useLocalFiles
						bind:currentDirectory={localDirectory}
						on:directoryChanged={handleDirectoryChanged}
					/>
				</TabsContent>

				<TabsContent value="player" class="space-y-6">
					<!-- Current song player -->
					<Card class="bg-gray-800/50 border-gray-700">
						<CardHeader>
							<CardTitle class="text-white flex items-center gap-2">
								<Music class="w-5 h-5" />
								Aktualnie odtwarzane
							</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							{#if currentSong}
								<div class="text-center space-y-2">
									<h3 class="text-xl font-bold text-white">{currentSong.JPName}</h3>
									<p class="text-gray-300">{currentSong.ENName}</p>
									<p class="text-blue-400">🎵 {currentSong.SongName}</p>
									<p class="text-purple-400">🎤 {currentSong.Artist}</p>
									<Badge variant="outline" class="border-yellow-500 text-yellow-400">
										{currentSong.difficulty}
									</Badge>
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
								/>
							{:else}
								<div class="text-center text-gray-400 py-8">
									<Music class="w-16 h-16 mx-auto mb-4 opacity-50" />
									<p>Brak załadowanej piosenki</p>
								</div>
							{/if}

							<!-- Quick actions -->
							<div class="flex gap-2 justify-center flex-wrap">
								<Button on:click={playRandomSong} class="bg-purple-600 hover:bg-purple-700">
									<Shuffle class="w-4 h-4 mr-2" />
									Losowa piosenka
								</Button>
								<Button
									on:click={() => window.open('/admin/pyrkon/presenter', '_blank', 'fullscreen=yes')}
									class="bg-blue-600 hover:bg-blue-700"
								>
									<Monitor class="w-4 h-4 mr-2" />
									Otwórz prezenter
								</Button>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="search" class="space-y-6">
					<SongSearch
						bind:searchTerm
						bind:selectedDifficulty
						bind:searchResults
						bind:isSearching
						on:search={handleSearchEvent}
						on:songSelect={handleSongSelect}
						on:clear={handleClearSearch}
					/>
				</TabsContent>

				<TabsContent value="presenter" class="space-y-6">
					<PresenterScreen
						{currentSong}
						bind:showScreen={showPresenterScreen}
						bind:showMetadata
						bind:showVideoPlaceholder
						on:screenToggle={handlePresenterScreenToggle}
						on:metadataToggle={handleMetadataToggle}
					/>
				</TabsContent>
			</Tabs>
		</div>
	</div>
</div>
