<script>
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from 'svelte-sonner';
	import { Shuffle, Monitor, Image, Search, Folder, Info, AlertTriangle, Play, Square, Eye, EyeOff, ChevronLeft, ChevronRight, Settings, CheckCircle } from 'lucide-svelte';

	// Import custom components
	import ImagePlayer from '$lib/components/screens/ImagePlayer.svelte';
	import ScreenSearch from '$lib/components/screens/ScreenSearch.svelte';
	import ScreenDirectoryPicker from '$lib/components/screens/ScreenDirectoryPicker.svelte';
	import AnswerValidation from '$lib/components/pyrkon/AnswerValidation.svelte';

	// Import Screen File System API utilities (browser-only)
	import { screenFileSystemClient } from '$lib/utils/screenFileSystemAPI.js';

	export let data;
	$: ({ session, user, profile } = data);

	// Current screen and playback state
	let currentScreen = null;
	let currentImageSrc = '';

	// Search and filter state
	let searchTerm = '';
	let selectedYear = '';
	let searchResults = [];
	let isSearching = false;

	// Video player component reference
	let imagePlayer;

	// File System API state
	let useLocalFiles = false;
	let localDirectory = null;
	let localImageFiles = [];

	// Tab state
	let activeTab = 'files';

	// Presenter state
	let showMetadata = false;
	let loading = false;
	let metadataToggleTimeout = null;

	// Screen reveal mode
	let currentMode = 'normal';
	let modeSettings = {
		gridRows: 4,
		gridCols: 4,
		revealDelay: 100,
		partsCount: 100,
		pixelationLevel: 64
	};

	// Mode selection removed: presenter controls modes via keyboard shortcuts

	onMount(() => {
		// Load saved volume (if any)
		loadLocalState();

		// Initial search to load all screens
		searchScreens();
	});

	function loadLocalState() {
		try {
			const savedState = localStorage.getItem('screens_local_state');
			if (savedState) {
				const state = JSON.parse(savedState);
				showMetadata = state.showMetadata || false;
				currentMode = state.currentMode || 'normal';
				modeSettings = { ...modeSettings, ...(state.modeSettings || {}) };
			}
		} catch (error) {
			console.error('Failed to load local state:', error);
		}
	}

	onDestroy(() => {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
	});

	async function searchScreens() {
		isSearching = true;
		try {
			if (useLocalFiles && localImageFiles.length > 0) {
				// Search local files only
				searchResults = searchLocalFiles(searchTerm, selectedYear);
			} else {
				// No local files available
				searchResults = [];
				if (!useLocalFiles) {
					console.log('No local files selected - user needs to choose a directory first');
				} else if (localImageFiles.length === 0) {
					console.log('Local directory selected but no image files found');
				}
			}
		} catch (error) {
			console.error('Search error:', error);
			toast.error('Nie udało się wyszukać screenów');
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	function searchLocalFiles(searchTerm, year = '') {
		if (!localImageFiles.length) return [];

		let filtered = [...localImageFiles];

		console.log('Search params:', { searchTerm, year });
		console.log('Total files before filtering:', filtered.length);

		// Filter by search term
		if (searchTerm && searchTerm.trim()) {
			const term = searchTerm.toLowerCase().trim();
			const beforeCount = filtered.length;
			filtered = filtered.filter((screen) => screen.FileName?.toLowerCase().includes(term) || screen.title?.toLowerCase().includes(term) || screen.JPName?.toLowerCase().includes(term) || screen.ENName?.toLowerCase().includes(term));
			console.log(`Search term filter: ${beforeCount} -> ${filtered.length} files`);
		}

		// Filter by year
		if (year && year.trim()) {
			const beforeCount = filtered.length;
			const yearFilter = parseInt(year.trim());
			filtered = filtered.filter((screen) => {
				const vintage = screen.Vintage || screen.Year || '';
				const yearMatch = vintage.toString().match(/\b(19|20)\d{2}\b/);
				const screenYear = yearMatch ? parseInt(yearMatch[0]) : null;
				return screenYear === yearFilter;
			});
			console.log(`Year filter: ${beforeCount} -> ${filtered.length} files`);
		}

		console.log('Final filtered results:', filtered.length);
		return filtered;
	}

	async function playRandomScreen() {
		try {
			// Check if local files are available
			if (!useLocalFiles || !localImageFiles.length) {
				toast.error('Musisz najpierw wybrać lokalny katalog z plikami obrazów');
				activeTab = 'files';
				return;
			}

			// Play from all screens
			let filteredFiles = [...localImageFiles];

			if (filteredFiles.length === 0) {
				toast.error('Brak screenów w wybranym katalogu');
				return;
			}

			const randomIndex = Math.floor(Math.random() * filteredFiles.length);
			const screen = filteredFiles[randomIndex];

			loadScreen(screen);
		} catch (error) {
			console.error('Error playing random screen:', error);
			toast.error('Nie udało się załadować losowego screena');
		}
	}

	async function loadScreen(screen) {
		// Only allow local files
		if (!screen.isLocalFile) {
			toast.error('System obsługuje tylko pliki lokalne. Wybierz katalog w zakładce "Pliki".');
			activeTab = 'files';
			return;
		}

		// Step 1: First turn off metadata display to prevent leakage
		showMetadata = false;

		// Save metadata off state immediately
		const metadataOffState = {
			currentScreen: currentScreen,
			showMetadata: false
		};
		localStorage.setItem('screens_local_state', JSON.stringify(metadataOffState));

		// Dispatch metadata toggle event immediately
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('screens-metadata-toggled', {
					detail: { showMetadata: false }
				})
			);

			window.dispatchEvent(
				new StorageEvent('storage', {
					key: 'screens_local_state',
					newValue: JSON.stringify(metadataOffState),
					storageArea: localStorage
				})
			);
		}

		// Step 2: Wait 1 second before loading new screen
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Step 3: Now load the new screen
		currentScreen = screen;

		// Set image source for local file
		if (typeof window !== 'undefined') {
			try {
				currentImageSrc = await screenFileSystemClient.createFileURL(screen.FileName);
			} catch (error) {
				console.error('Error creating file URL:', error);
				toast.error('Nie udało się załadować lokalnego pliku');
				return;
			}
		} else {
			toast.error('Nie można załadować pliku - brak dostępu do File System API');
			return;
		}

		// Save final state with new screen
		const finalState = {
			currentScreen: screen,
			showMetadata: false,
			currentMode,
			modeSettings
		};
		localStorage.setItem('screens_local_state', JSON.stringify(finalState));

		// Update presenter state (for presenter view synchronization)
		await updatePresenterState({
			currentScreen: screen,
			showMetadata: false,
			showImagePlaceholder: true,
			guessingPhase: true,
			imageSrc: currentImageSrc
		});

		// Update local state and notify other tabs about metadata toggle reset
		const localState = {
			currentScreen: screen,
			showMetadata: false,
			currentMode,
			modeSettings
		};
		localStorage.setItem('screens_local_state', JSON.stringify(localState));

		// Dispatch events to notify other tabs/views
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('screens-metadata-toggled', {
					detail: { showMetadata: false }
				})
			);

			window.dispatchEvent(
				new CustomEvent('screens-screen-changed', {
					detail: { currentScreen: screen }
				})
			);

			// Also trigger a storage event manually for same-tab communication
			window.dispatchEvent(
				new StorageEvent('storage', {
					key: 'screens_local_state',
					newValue: JSON.stringify(localState),
					storageArea: localStorage
				})
			);
		}

		toast.success(`Załadowano: ${screen.title || screen.JPName || screen.FileName}`);
	}

	function handleDirectoryChanged(event) {
		const { useLocalFiles: newUseLocalFiles, directory, files } = event.detail;

		useLocalFiles = newUseLocalFiles;
		localDirectory = directory;
		localImageFiles = files || [];

		// Clear current screen if switching modes
		if (currentScreen && currentScreen.isLocalFile !== useLocalFiles) {
			currentScreen = null;
			currentImageSrc = '';
			if (imagePlayer) {
				imagePlayer.reset();
			}
		}

		// Refresh search results
		searchScreens();

		console.log(`File mode changed: ${useLocalFiles ? 'Local' : 'Server'}, Directory: ${directory}, Files: ${files?.length || 0}`);
	}

	async function updatePresenterState(updates) {
		try {
			await fetch('/api/screens/presenter-state', {
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
				currentScreen,
				showMetadata,
				currentMode,
				modeSettings
			};
			localStorage.setItem('screens_local_state', JSON.stringify(state));

			// Dispatch event to notify other tabs (presenter view, answers tab) - browser only
			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('screens-metadata-toggled', {
						detail: { showMetadata }
					})
				);

				// Also trigger a storage event manually for same-tab communication
				window.dispatchEvent(
					new StorageEvent('storage', {
						key: 'screens_local_state',
						newValue: JSON.stringify(state),
						storageArea: localStorage
					})
				);
			}
		}, 1000);
	}

	function handleScreenSelect(event) {
		loadScreen(event.detail);
		// Switch to player tab automatically
		activeTab = 'player';
	}

	function handleSearchEvent(event) {
		searchTerm = event.detail.searchTerm;
		selectedYear = event.detail.year || '';
		// Clear any pending reactive search
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = null;
		}
		// Trigger search immediately when search button is clicked
		searchScreens();
	}

	function handleClearSearch() {
		searchTerm = '';
		selectedYear = '';
		searchScreens();
	}

	// Mode changes now handled by presenter via keyboard shortcuts

	// Mode settings now handled by presenter via keyboard shortcuts

	// Reveal controls now handled by presenter via keyboard shortcuts

	function previousScreen() {
		if (!localImageFiles.length) return;

		const currentIndex = localImageFiles.findIndex((s) => s.FileName === currentScreen?.FileName);
		const previousIndex = currentIndex > 0 ? currentIndex - 1 : localImageFiles.length - 1;
		loadScreen(localImageFiles[previousIndex]);
	}

	function nextScreen() {
		if (!localImageFiles.length) return;

		const currentIndex = localImageFiles.findIndex((s) => s.FileName === currentScreen?.FileName);
		const nextIndex = currentIndex < localImageFiles.length - 1 ? currentIndex + 1 : 0;
		loadScreen(localImageFiles[nextIndex]);
	}

	// Reactive search with debouncing
	let searchTimeout;
	$: {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(searchScreens, 300);
	}
</script>

<svelte:head>
	<title>Screens - Admin</title>
</svelte:head>

<div class="min-h-screen bg-gray-950">
	<div class="container mx-auto px-4 py-8">
		<div class="mb-8 text-center">
			<h1 class="mb-2 text-4xl font-bold text-white">🖼️ Screenówka 🖼️</h1>
			<p class="text-gray-400">Zarządzaj quizem screenów</p>
		</div>

		<div class="mx-auto max-w-6xl">
			<Tabs bind:value={activeTab} class="w-full">
				<TabsList class="grid w-full grid-cols-4 border border-gray-800 bg-gray-900">
					<TabsTrigger value="files" class="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
						<Folder class="mr-2 h-4 w-4" />
						Pliki
					</TabsTrigger>
					<TabsTrigger value="player" class="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
						<Image class="mr-2 h-4 w-4" />
						Odtwarzacz
					</TabsTrigger>
					<TabsTrigger value="answers" class="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
						<CheckCircle class="mr-2 h-4 w-4" />
						Odpowiedzi
					</TabsTrigger>
					<TabsTrigger value="search" class="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
						<Search class="mr-2 h-4 w-4" />
						Wyszukiwanie
					</TabsTrigger>
				</TabsList>

				<TabsContent value="files" class="space-y-6">
					<!-- Instructions card -->
					<Card class="border-blue-800 bg-blue-900/20">
						<CardHeader>
							<CardTitle class="flex items-center gap-2 text-blue-300">
								<Info class="h-5 w-5" />
								Instrukcje
							</CardTitle>
						</CardHeader>
						<CardContent class="space-y-3">
							<div class="text-sm text-blue-200">
								<p class="mb-2">Aby móc wyświetlać screeny, musisz:</p>
								<ol class="list-inside list-decimal space-y-1 text-blue-100">
									<li>Wybierać lokalny katalog z plikami obrazów</li>
									<li>Przejść do zakładki "Odtwarzacz" lub "Wyszukiwanie"</li>
								</ol>
							</div>
						</CardContent>
					</Card>

					<ScreenDirectoryPicker bind:useLocalFiles bind:currentDirectory={localDirectory} on:directoryChanged={handleDirectoryChanged} />
				</TabsContent>

				<TabsContent value="player" class="space-y-6">
					<!-- Current screen player -->
					<Card class="border-gray-800 bg-gray-900">
						<CardHeader>
							<CardTitle class="flex items-center gap-2 text-white">
								<Image class="h-5 w-5" />
								Aktualnie wyświetlany screen
							</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							{#if currentScreen}
								<div class="space-y-4">
									<!-- Title section -->
									<div class="space-y-2 text-center">
										<h3 class="text-3xl font-bold text-green-400">{currentScreen.title || currentScreen.JPName}</h3>
										<p class="text-xl text-gray-300">{currentScreen.ENName}</p>
									</div>

									<!-- Metadata grid -->
									<div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
										<div class="rounded-lg border border-blue-800 bg-blue-900/20 p-3">
											<div class="flex items-center space-x-2">
												<span class="text-lg">🖼️</span>
												<div>
													<p class="text-xs uppercase tracking-wide text-blue-300">Screen</p>
													<p class="font-medium text-white">{currentScreen.FileName}</p>
												</div>
											</div>
										</div>

										{#if currentScreen.title}
											<div class="rounded-lg border border-purple-800 bg-purple-900/20 p-3">
												<div class="flex items-center space-x-2">
													<span class="text-lg">📝</span>
													<div>
														<p class="text-xs uppercase tracking-wide text-purple-300">Tytuł</p>
														<p class="font-medium text-white">{currentScreen.title}</p>
													</div>
												</div>
											</div>
										{/if}

										{#if currentScreen.Vintage || currentScreen.Year}
											<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
												<div class="flex items-center space-x-2">
													<span class="text-lg">📅</span>
													<div>
														<p class="text-xs uppercase tracking-wide text-gray-400">Rok</p>
														<p class="font-medium text-white">{currentScreen.Vintage || currentScreen.Year}</p>
													</div>
												</div>
											</div>
										{/if}
									</div>
								</div>

								<!-- Image Player Component (operator preview only) -->
								<ImagePlayer bind:this={imagePlayer} src={currentImageSrc} mode={currentMode} {modeSettings} operatorMode={true} />
							{:else}
								<!-- Placeholder when no screen is loaded -->
								<div class="space-y-4">
									<!-- Title section placeholder -->
									<div class="space-y-2 text-center">
										<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
											<Image class="mx-auto mb-4 h-16 w-16 text-gray-500 opacity-30" />
											<h3 class="mb-2 text-xl font-medium text-gray-400">Brak załadowanego screena</h3>
											<p class="text-sm text-gray-500">Wybierz screen z wyszukiwania lub użyj losowego wyboru</p>
										</div>
									</div>

									<!-- Metadata grid placeholder -->
									<div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
										<div class="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
											<div class="flex items-center space-x-2">
												<span class="text-lg opacity-30">🖼️</span>
												<div>
													<p class="text-xs uppercase tracking-wide text-gray-500">Screen</p>
													<p class="font-medium text-gray-600">-</p>
												</div>
											</div>
										</div>

										<div class="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
											<div class="flex items-center space-x-2">
												<span class="text-lg opacity-30">📝</span>
												<div>
													<p class="text-xs uppercase tracking-wide text-gray-500">Tytuł</p>
													<p class="font-medium text-gray-600">-</p>
												</div>
											</div>
										</div>

										<div class="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
											<div class="flex items-center space-x-2">
												<span class="text-lg opacity-30">📅</span>
												<div>
													<p class="text-xs uppercase tracking-wide text-gray-500">Rok</p>
													<p class="font-medium text-gray-600">-</p>
												</div>
											</div>
										</div>
									</div>

									<!-- Image Player placeholder -->
									<div class="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
										<div class="space-y-3 text-center">
											<Image class="mx-auto h-16 w-16 text-gray-500 opacity-30" />
											<p class="text-gray-500">Brak załadowanego screena</p>
										</div>
									</div>
								</div>
							{/if}

							<!-- Quick actions -->
							<div class="space-y-4">
								<!-- Mode selection removed: presenter controls modes via keyboard -->

								<!-- Screen controls -->
								<div class="space-y-3">
									<p class="text-sm text-gray-400">Sterowanie odtwarzaniem:</p>

									<!-- Navigation buttons -->
									<div class="flex gap-2">
										<Button size="sm" class="flex-1 border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600" on:click={previousScreen}>
											<ChevronLeft class="mr-2 h-4 w-4" />
											Poprzedni
										</Button>
										<Button size="sm" class="flex-1 border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600" on:click={nextScreen}>
											Następny
											<ChevronRight class="ml-2 h-4 w-4" />
										</Button>
									</div>

									<!-- Random screen button -->
									<Button on:click={() => playRandomScreen()} class="w-full border border-gray-600 bg-gray-700 text-sm text-gray-300 hover:bg-gray-600">
										<Shuffle class="mr-2 h-4 w-4" />
										Losowy screen
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
					<ScreenSearch bind:searchTerm bind:selectedYear bind:searchResults bind:isSearching {useLocalFiles} hasLocalFiles={localImageFiles.length > 0} on:search={handleSearchEvent} on:screenSelect={handleScreenSelect} on:clear={handleClearSearch} />
				</TabsContent>
			</Tabs>
		</div>
	</div>
</div>
