<script>
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Play, Search, Loader2 } from 'lucide-svelte';

	export let searchTerm = '';
	export let selectedDifficulty = 'all';
	export let searchResults = [];
	export let isSearching = false;
	export let showPlayButton = true;

	const dispatch = createEventDispatcher();

	// Available difficulties
	const difficulties = [
		{ value: 'all', label: 'Wszystkie' },
		{ value: 'easy', label: 'Łatwe' },
		{ value: 'medium', label: 'Średnie' },
		{ value: 'hard', label: 'Trudne' },
		{ value: 'very hard', label: 'Bardzo trudne' }
	];

	function handleSearch() {
		dispatch('search', {
			searchTerm,
			selectedDifficulty
		});
	}

	function handleSongSelect(song) {
		dispatch('songSelect', song);
	}

	function handleClear() {
		searchTerm = '';
		selectedDifficulty = 'all';
		dispatch('clear');
	}

	// Auto-search when inputs change
	let searchTimeout;
	$: {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(handleSearch, 300);
	}
</script>

<div class="song-search space-y-4">
	<!-- Search controls -->
	<Card class="bg-gray-800/50 border-gray-700">
		<CardHeader>
			<CardTitle class="text-white flex items-center gap-2">
				<Search class="w-5 h-5" />
				Wyszukiwanie piosenek
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<Label for="search" class="text-gray-200">Szukaj</Label>
					<Input
						id="search"
						bind:value={searchTerm}
						placeholder="Nazwa anime, piosenki lub artysty..."
						class="bg-gray-700 border-gray-600 text-white"
						on:keydown={(e) => e.key === 'Enter' && handleSearch()}
					/>
				</div>
				<div>
					<Label class="text-gray-200">Trudność</Label>
					<Select bind:value={selectedDifficulty}>
						<SelectTrigger class="bg-gray-700 border-gray-600 text-white">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{#each difficulties as difficulty}
								<SelectItem value={difficulty.value}>{difficulty.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div class="flex gap-2">
				<Button on:click={handleSearch} disabled={isSearching} class="bg-blue-600 hover:bg-blue-700">
					{#if isSearching}
						<Loader2 class="w-4 h-4 mr-2 animate-spin" />
					{:else}
						<Search class="w-4 h-4 mr-2" />
					{/if}
					Szukaj
				</Button>
				<Button on:click={handleClear} variant="outline" class="border-gray-600">
					Wyczyść
				</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Search results -->
	<Card class="bg-gray-800/50 border-gray-700">
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
							class="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700/70 transition-colors cursor-pointer"
							on:click={() => handleSongSelect(song)}
							on:keydown={(e) => e.key === 'Enter' && handleSongSelect(song)}
							role="button"
							tabindex="0"
						>
							<div class="flex-1">
								<div class="font-medium text-white">{song.JPName}</div>
								<div class="text-sm text-gray-300">{song.ENName}</div>
								<div class="text-xs text-blue-400">{song.SongName} - {song.Artist}</div>
								{#if song.Vintage}
									<div class="text-xs text-purple-400">{song.Vintage}</div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<Badge 
									variant="outline" 
									class="border-yellow-500 text-yellow-400 text-xs"
								>
									{song.difficulty}
								</Badge>
								{#if showPlayButton}
									<Button
										on:click={(e) => {
											e.stopPropagation();
											handleSongSelect(song);
										}}
										size="sm"
										class="bg-green-600 hover:bg-green-700"
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
					<Search class="w-16 h-16 mx-auto mb-4 opacity-50" />
					<p>Brak wyników wyszukiwania</p>
					{#if searchTerm || selectedDifficulty !== 'all'}
						<p class="text-sm mt-2">Spróbuj zmienić kryteria wyszukiwania</p>
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
	.song-search {
		/* Component styles */
	}

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
