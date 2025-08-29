<script>
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Play, Search, Loader2, Folder, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import AutocompleteInput from '../pyrkon/AutocompleteInput.svelte';

	export let searchTerm = '';
	export let searchResults = [];
	export let isSearching = false;
	export let showPlayButton = true;
	export let useLocalFiles = false;
	export let hasLocalFiles = false;
	export let selectedYear = '';

	const dispatch = createEventDispatcher();

	// Season/Year translation
	function translateVintage(vintage) {
		if (!vintage) return vintage;

		const seasonMap = {
			spring: 'Wiosna',
			summer: 'Lato',
			fall: 'Jesień',
			autumn: 'Jesień',
			winter: 'Zima'
		};

		// Handle formats like "Summer 2023", "Fall 2022", etc.
		return vintage.replace(/\b(spring|summer|fall|autumn|winter)\b/gi, (match) => {
			return seasonMap[match.toLowerCase()] || match;
		});
	}

	function handleSearch() {
		console.log('ScreenSearch handleSearch dispatching:', { searchTerm, selectedYear });
		dispatch('search', {
			searchTerm,
			year: selectedYear
		});
	}

	function handleScreenSelect(screen) {
		dispatch('screenSelect', screen);
	}

	function handleClear() {
		searchTerm = '';
		selectedYear = '';
		dispatch('clear');
	}

	function handleYearChange(year) {
		selectedYear = year;
		handleSearch();
	}

	// Auto-search when inputs change
	let searchTimeout;
	$: {
		console.log('ScreenSearch reactive: searchTerm =', searchTerm, 'year =', selectedYear);
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(handleSearch, 300);
	}
</script>

<div class="screen-search space-y-4">
	<!-- Search Controls -->
	<Card class="border-gray-800 bg-gray-900">
		<CardHeader>
			<CardTitle class="flex items-center gap-2 text-white">
				<Search class="h-5 w-5" />
				Wyszukiwanie screenów
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Search input -->
			<div class="space-y-2">
				<Label for="search-term" class="text-gray-300">Wyszukaj screen:</Label>
				<Input id="search-term" bind:value={searchTerm} placeholder="Wpisz tytuł, nazwę anime lub rok..." class="border-gray-700 bg-gray-800 text-white placeholder-gray-400" />
			</div>

			<!-- Year filter -->
			<div class="space-y-2">
				<Label for="year-filter" class="text-gray-300">Filtruj po roku:</Label>
				<Input id="year-filter" bind:value={selectedYear} placeholder="np. 2023, 2024" class="border-gray-700 bg-gray-800 text-white placeholder-gray-400" />
			</div>

			<!-- Search/Clear buttons -->
			<div class="flex gap-2">
				<Button on:click={handleSearch} disabled={isSearching} class="flex-1 bg-purple-600 text-white hover:bg-purple-700">
					{#if isSearching}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Szukam...
					{:else}
						<Search class="mr-2 h-4 w-4" />
						Szukaj
					{/if}
				</Button>
				<Button on:click={handleClear} variant="outline" class="border-gray-600 text-gray-300 hover:bg-gray-700">Wyczyść</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Search Results -->
	{#if searchResults.length > 0}
		<Card class="border-gray-800 bg-gray-900">
			<CardHeader>
				<CardTitle class="flex items-center gap-2 text-white">
					<Folder class="h-5 w-5" />
					Znalezione screeny ({searchResults.length})
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="max-h-96 space-y-2 overflow-y-auto">
					{#each searchResults as screen, index}
						<div class="hover:bg-gray-750 flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 p-3 transition-colors">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-3">
									<div class="flex-shrink-0">
										{#if showPlayButton}
											<Button size="sm" on:click={() => handleScreenSelect(screen)} class="bg-green-600 text-white hover:bg-green-700">
												<Play class="h-3 w-3" />
											</Button>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<div class="mb-1 flex items-center gap-2">
											<h4 class="truncate font-medium text-white">{screen.title || screen.JPName || screen.FileName}</h4>
											{#if screen.rank}
												<Badge variant="outline" class="border-purple-500 text-xs text-purple-400">
													#{screen.rank}
												</Badge>
											{/if}
										</div>
										{#if screen.ENName && screen.ENName !== screen.title}
											<p class="truncate text-sm text-gray-400">{screen.ENName}</p>
										{/if}
										<div class="mt-1 flex items-center gap-4">
											{#if screen.Vintage || screen.Year}
												<span class="text-xs text-gray-500">{translateVintage(screen.Vintage || screen.Year)}</span>
											{/if}
											{#if screen.season}
												<span class="text-xs capitalize text-gray-500">{screen.season}</span>
											{/if}
											<span class="font-mono text-xs text-gray-600">{screen.FileName}</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	{:else if !isSearching && (searchTerm || selectedYear)}
		<Card class="border-gray-800 bg-gray-900">
			<CardContent class="py-8 text-center">
				<Search class="mx-auto mb-4 h-12 w-12 text-gray-500" />
				<h3 class="mb-2 text-lg font-medium text-gray-400">Brak wyników</h3>
				<p class="text-gray-500">Spróbuj zmienić kryteria wyszukiwania</p>
			</CardContent>
		</Card>
	{:else if hasLocalFiles}
		<Card class="border-gray-800 bg-gray-900">
			<CardContent class="py-8 text-center">
				<Folder class="mx-auto mb-4 h-12 w-12 text-gray-500" />
				<h3 class="mb-2 text-lg font-medium text-gray-400">Gotowy do wyszukiwania</h3>
				<p class="text-gray-500">Wpisz tytuł screena lub rok aby rozpocząć wyszukiwanie</p>
			</CardContent>
		</Card>
	{/if}
</div>

<style>
	/* Custom styles for screen search */
	.screen-search {
		width: 100%;
	}

	.screen-search .hover\:bg-gray-750:hover {
		background-color: rgb(55 65 81 / 0.75);
	}
</style>
