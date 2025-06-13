<script>
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Play, Search, Loader2, Folder } from 'lucide-svelte';
	import AutocompleteInput from './AutocompleteInput.svelte';

	export let searchTerm = '';
	export let searchResults = [];
	export let isSearching = false;
	export let showPlayButton = true;
	export let useLocalFiles = false;
	export let hasLocalFiles = false;
	export let selectedDifficulty = 'all';
	export let selectedGenre = '';
	export let selectedTag = '';
	export let selectedYear = '';

	const dispatch = createEventDispatcher();

	// Difficulty options
	const difficultyOptions = [
		{ value: 'all', label: 'Wszystkie' },
		{ value: 'easy', label: 'Łatwa' },
		{ value: 'medium', label: 'Średnia' },
		{ value: 'hard', label: 'Trudna' },
		{ value: 'very hard', label: 'Bardzo trudna' }
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

	function handleSearch() {
		console.log('SongSearch handleSearch dispatching:', { searchTerm, selectedDifficulty, selectedGenre, selectedTag, selectedYear });
		dispatch('search', {
			searchTerm,
			difficulty: selectedDifficulty,
			genre: selectedGenre,
			tag: selectedTag,
			year: selectedYear
		});
	}

	function handleSongSelect(song) {
		dispatch('songSelect', song);
	}

	function handleClear() {
		searchTerm = '';
		selectedDifficulty = 'all';
		selectedGenre = '';
		selectedTag = '';
		selectedYear = '';
		dispatch('clear');
	}

	function handleDifficultyChange(difficulty) {
		selectedDifficulty = difficulty;
		handleSearch();
	}

	// Auto-search when inputs change
	let searchTimeout;
	$: {
		console.log('SongSearch reactive: searchTerm =', searchTerm, 'difficulty =', selectedDifficulty, 'genre =', selectedGenre, 'tag =', selectedTag, 'year =', selectedYear);
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(handleSearch, 300);
	}
</script>

<div class="song-search space-y-4">
	<!-- Search controls -->
	<Card class="bg-gray-900 border-gray-800">
		<CardHeader>
			<CardTitle class="text-white flex items-center gap-2">
				<Search class="w-5 h-5" />
				Wyszukiwanie piosenek
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div>
				<Label for="search" class="text-gray-200">Szukaj</Label>
				<Input
					id="search"
					bind:value={searchTerm}
					placeholder="Nazwa anime, piosenki lub artysty..."
					class="bg-gray-800 border-gray-700 text-white placeholder:text-gray-400"
					on:keydown={(e) => e.key === 'Enter' && handleSearch()}
				/>
			</div>

			<div>
				<Label class="text-gray-200">Trudność</Label>
				<div class="grid grid-cols-3 gap-2 mt-2">
					{#each difficultyOptions as option}
						<Button
							on:click={() => handleDifficultyChange(option.value)}
							variant={selectedDifficulty === option.value ? 'default' : 'outline'}
							size="sm"
							class={selectedDifficulty === option.value
								? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600'
								: 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'}
						>
							{option.label}
						</Button>
					{/each}
				</div>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div>
					<Label for="genre" class="text-gray-200">Gatunek</Label>
					<AutocompleteInput
						bind:value={selectedGenre}
						placeholder="np. Action, Comedy..."
						type="genres"
					/>
				</div>
				<div>
					<Label for="tag" class="text-gray-200">Tag</Label>
					<AutocompleteInput
						bind:value={selectedTag}
						placeholder="np. Superhero, School..."
						type="tags"
					/>
				</div>
				<div>
					<Label for="year" class="text-gray-200">Rok</Label>
					<AutocompleteInput
						bind:value={selectedYear}
						placeholder="np. 2023, 2015..."
						type="years"
					/>
				</div>
			</div>

			<div class="flex gap-2">
				<Button on:click={handleSearch} disabled={isSearching} class="bg-blue-600 hover:bg-blue-700 text-white">
					{#if isSearching}
						<Loader2 class="w-4 h-4 mr-2 animate-spin" />
					{:else}
						<Search class="w-4 h-4 mr-2" />
					{/if}
					Szukaj
				</Button>
				<Button on:click={handleClear} variant="outline" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">
					Wyczyść
				</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Search results -->
	<Card class="bg-gray-900 border-gray-800">
		<CardHeader>
			<CardTitle class="text-white">
				Wyniki ({searchResults.length})
				{#if isSearching}
					<span class="text-sm text-gray-400 ml-2">
						<Loader2 class="w-4 h-4 inline animate-spin" />
						Wyszukiwanie...
					</span>
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent>
			{#if searchResults.length > 0}
				<div class="grid gap-2 max-h-96 overflow-y-auto">
					{#each searchResults as song, index}
						<div
							class="flex items-center justify-between p-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
							on:click={() => handleSongSelect(song)}
							on:keydown={(e) => e.key === 'Enter' && handleSongSelect(song)}
							role="button"
							tabindex="0"
						>
							<div class="flex-1">
								<div class="font-medium text-white">{song.JPName}</div>
								<div class="text-sm text-gray-300">{song.ENName}</div>
								<div class="text-xs text-blue-400">{song.SongName} - {song.Artist}</div>
								<div class="flex items-center gap-2 mt-1 flex-wrap">
									{#if song.Vintage}
										<div class="text-xs text-purple-400">{translateVintage(song.Vintage)}</div>
									{/if}
									{#if song.difficulty}
										<Badge variant="outline" class="text-xs px-1 py-0 border-purple-500 text-purple-400 bg-purple-900/20">
											{getDifficultyInPolish(song.difficulty)}
										</Badge>
									{/if}
								</div>
								{#if song.Genres || song.Tags}
									<div class="flex items-center gap-1 mt-1 flex-wrap">
										{#if song.Genres}
											{#each song.Genres.split(';').slice(0, 3) as genre}
												<Badge variant="outline" class="text-xs px-1 py-0 border-green-500 text-green-400 bg-green-900/20">
													{genre.trim()}
												</Badge>
											{/each}
										{/if}
										{#if song.Tags}
											{#each song.Tags.split(';').slice(0, 2) as tag}
												<Badge variant="outline" class="text-xs px-1 py-0 border-blue-500 text-blue-400 bg-blue-900/20">
													{tag.trim()}
												</Badge>
											{/each}
										{/if}
									</div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								{#if showPlayButton}
									<Button
										on:click={(e) => {
											e.stopPropagation();
											handleSongSelect(song);
										}}
										size="sm"
										class="bg-green-600 hover:bg-green-700 text-white"
									>
										<Play class="w-3 h-3" />
									</Button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else if !isSearching}
				<div class="text-center text-gray-400 py-8">
					{#if !hasLocalFiles}
						<div class="bg-yellow-900/30 border border-yellow-800 rounded-lg p-6">
							<div class="flex flex-col items-center gap-3">
								<Folder class="w-16 h-16 text-yellow-400 opacity-50" />
								<div class="text-yellow-200">
									<p class="font-medium mb-2">Brak lokalnych plików</p>
									<p class="text-sm">Przejdź do zakładki "Pliki" i wybierz katalog z plikami wideo/audio</p>
								</div>
							</div>
						</div>
					{:else}
						<Search class="w-16 h-16 mx-auto mb-4 opacity-50" />
						<p>Brak wyników wyszukiwania</p>
						{#if searchTerm}
							<p class="text-sm mt-2">Spróbuj zmienić kryteria wyszukiwania</p>
						{/if}
					{/if}
				</div>
			{:else}
				<div class="text-center text-gray-400 py-8">
					<Loader2 class="w-16 h-16 mx-auto mb-4 animate-spin opacity-50" />
					<p>Wyszukiwanie...</p>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<style>
	.song-search :global(.overflow-y-auto::-webkit-scrollbar) {
		width: 6px;
	}

	.song-search :global(.overflow-y-auto::-webkit-scrollbar-track) {
		background: #374151;
		border-radius: 3px;
	}

	.song-search :global(.overflow-y-auto::-webkit-scrollbar-thumb) {
		background: #6b7280;
		border-radius: 3px;
	}

	.song-search :global(.overflow-y-auto::-webkit-scrollbar-thumb:hover) {
		background: #9ca3af;
	}
</style>
