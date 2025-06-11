<script>
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Monitor, Eye, EyeOff, Music } from 'lucide-svelte';

	export let currentSong = null;
	export let showScreen = false;
	export let showMetadata = false;
	export let showVideoPlaceholder = true;
	export let guessingPhase = true;
	export let timeLeft = 0;

	const dispatch = createEventDispatcher();

	function toggleScreen() {
		showScreen = !showScreen;
		dispatch('screenToggle', showScreen);
	}

	function toggleMetadata() {
		showMetadata = !showMetadata;
		showVideoPlaceholder = !showMetadata;
		dispatch('metadataToggle', showMetadata);
	}

	function formatTime(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<div class="presenter-screen space-y-4">
	<!-- Controls -->
	<Card class="bg-gray-800/50 border-gray-700">
		<CardHeader>
			<CardTitle class="text-white flex items-center gap-2">
				<Monitor class="w-5 h-5" />
				Ekran prezentera
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="flex gap-2 flex-wrap">
				<Button
					on:click={toggleScreen}
					class={showScreen ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
				>
					<Monitor class="w-4 h-4 mr-2" />
					{showScreen ? 'Ukryj ekran' : 'Pokaż ekran'}
				</Button>
				
				{#if showScreen && currentSong}
					<Button
						on:click={toggleMetadata}
						class={showMetadata ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'}
					>
						{#if showMetadata}
							<EyeOff class="w-4 h-4 mr-2" />
							Ukryj metadane
						{:else}
							<Eye class="w-4 h-4 mr-2" />
							Pokaż metadane
						{/if}
					</Button>
				{/if}
			</div>

			<!-- Status indicators -->
			{#if showScreen}
				<div class="flex gap-2 text-sm">
					<Badge variant="outline" class="border-green-500 text-green-400">
						Ekran aktywny
					</Badge>
					{#if currentSong}
						<Badge variant="outline" class="border-blue-500 text-blue-400">
							{showMetadata ? 'Metadane widoczne' : 'Faza zgadywania'}
						</Badge>
						{#if guessingPhase && timeLeft > 0}
							<Badge variant="outline" class="border-yellow-500 text-yellow-400">
								Czas: {formatTime(timeLeft)}
							</Badge>
						{/if}
					{/if}
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Screen display -->
	{#if showScreen}
		<Card class="bg-black border-2 border-gray-600">
			<CardContent class="p-8">
				<div class="min-h-64 flex items-center justify-center">
					{#if currentSong}
						{#if showVideoPlaceholder && !showMetadata}
							<!-- Guessing phase placeholder -->
							<div class="text-center text-white">
								<div class="text-8xl mb-6 animate-pulse">🎵</div>
								<h2 class="text-3xl font-bold mb-4">Odgadnij anime!</h2>
								{#if guessingPhase && timeLeft > 0}
									<div class="text-xl text-yellow-400 font-mono">
										⏰ {formatTime(timeLeft)}
									</div>
								{/if}
							</div>
						{:else if showMetadata}
							<!-- Answer reveal -->
							<div class="text-center text-white space-y-4 max-w-2xl">
								<div class="text-6xl mb-6">🎌</div>
								<h2 class="text-4xl font-bold text-green-400 mb-2">{currentSong.JPName}</h2>
								<p class="text-2xl text-gray-300 mb-4">{currentSong.ENName}</p>
								
								<div class="space-y-2">
									<p class="text-xl text-blue-400">
										🎵 <strong>{currentSong.SongName}</strong>
									</p>
									<p class="text-xl text-purple-400">
										🎤 <strong>{currentSong.Artist}</strong>
									</p>
									{#if currentSong.Vintage}
										<p class="text-lg text-gray-400">
											📅 {currentSong.Vintage}
										</p>
									{/if}
								</div>

								<div class="mt-6">
									<Badge 
										variant="outline" 
										class="border-yellow-500 text-yellow-400 text-lg px-4 py-2"
									>
										Trudność: {currentSong.difficulty}
									</Badge>
								</div>
							</div>
						{/if}
					{:else}
						<!-- No song loaded -->
						<div class="text-center text-gray-500">
							<Monitor class="w-24 h-24 mx-auto mb-6 opacity-50" />
							<h3 class="text-2xl font-medium mb-2">Brak załadowanej piosenki</h3>
							<p class="text-lg">Wybierz piosenkę z panelu wyszukiwania</p>
						</div>
					{/if}
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Song info panel (always visible for admin) -->
	{#if currentSong}
		<Card class="bg-gray-800/50 border-gray-700">
			<CardHeader>
				<CardTitle class="text-white flex items-center gap-2">
					<Music class="w-5 h-5" />
					Informacje o piosence
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
					<div>
						<div class="text-gray-400">Tytuł japoński:</div>
						<div class="text-white font-medium">{currentSong.JPName}</div>
					</div>
					<div>
						<div class="text-gray-400">Tytuł angielski:</div>
						<div class="text-white font-medium">{currentSong.ENName}</div>
					</div>
					<div>
						<div class="text-gray-400">Piosenka:</div>
						<div class="text-blue-400 font-medium">{currentSong.SongName}</div>
					</div>
					<div>
						<div class="text-gray-400">Artysta:</div>
						<div class="text-purple-400 font-medium">{currentSong.Artist}</div>
					</div>
					<div>
						<div class="text-gray-400">Trudność:</div>
						<Badge variant="outline" class="border-yellow-500 text-yellow-400">
							{currentSong.difficulty}
						</Badge>
					</div>
					{#if currentSong.Vintage}
						<div>
							<div class="text-gray-400">Rok:</div>
							<div class="text-gray-300 font-medium">{currentSong.Vintage}</div>
						</div>
					{/if}
					<div>
						<div class="text-gray-400">Plik:</div>
						<div class="text-gray-300 font-mono text-xs">{currentSong.FileName}</div>
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}
</div>

<style>
	.presenter-screen {
		/* Custom animations */
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
