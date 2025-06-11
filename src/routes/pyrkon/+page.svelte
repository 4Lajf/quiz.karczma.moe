<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import { Play, Pause, SkipForward, Volume2, VolumeX, Users, Clock } from 'lucide-svelte';

	export let data;
	$: ({ session, profile } = data);

	// Game state
	let currentSong = null;
	let isPlaying = false;
	let isPaused = false;
	let currentTime = 0;
	let duration = 0;
	let volume = 0.7;
	let isMuted = false;
	let gameStarted = false;
	let showAnswer = false;
	let playerName = '';
	let answer = '';
	let hasSubmitted = false;
	let loading = false;

	// Video element
	let videoElement;

	// Timer for guessing phase
	let guessingTime = 30; // 30 seconds to guess
	let timeLeft = guessingTime;
	let timer = null;

	// Player management
	let players = [];
	let currentPlayerIndex = 0;

	onMount(() => {
		// Set player name from profile if logged in
		if (profile?.username) {
			playerName = profile.username;
		}

		// Load saved volume
		const savedVolume = localStorage.getItem('pyrkon-volume');
		if (savedVolume) {
			volume = parseFloat(savedVolume);
		}

		// Load saved mute state
		const savedMuted = localStorage.getItem('pyrkon-muted');
		if (savedMuted) {
			isMuted = savedMuted === 'true';
		}
	});

	onDestroy(() => {
		if (timer) {
			clearInterval(timer);
		}
		if (videoElement) {
			videoElement.pause();
		}
	});

	function startGame() {
		if (!playerName.trim()) {
			toast.error('Wprowadź swoją nazwę gracza');
			return;
		}
		gameStarted = true;
		loadRandomSong();
	}

	async function loadRandomSong() {
		try {
			const response = await fetch('/api/pyrkon/songs?random=true');
			if (!response.ok) throw new Error('Failed to fetch song');
			
			const song = await response.json();
			currentSong = song;
			showAnswer = false;
			hasSubmitted = false;
			answer = '';
			timeLeft = guessingTime;
			
			// Start the guessing timer
			startGuessingTimer();
			
			toast.info(`Nowa piosenka! Masz ${guessingTime} sekund na odpowiedź`);
		} catch (error) {
			console.error('Error loading song:', error);
			toast.error('Nie udało się załadować piosenki');
		}
	}

	function startGuessingTimer() {
		if (timer) clearInterval(timer);
		
		timer = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) {
				clearInterval(timer);
				timer = null;
				revealAnswer();
			}
		}, 1000);
	}

	function revealAnswer() {
		showAnswer = true;
		if (videoElement) {
			videoElement.pause();
		}
		isPlaying = false;
		isPaused = false;
	}

	function submitAnswer() {
		if (!answer.trim()) {
			toast.error('Wprowadź odpowiedź');
			return;
		}
		
		hasSubmitted = true;
		loading = true;
		
		// Simulate answer submission
		setTimeout(() => {
			loading = false;
			toast.success('Odpowiedź została wysłana!');
		}, 500);
	}

	function nextSong() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		loadRandomSong();
	}

	function togglePlayPause() {
		if (!currentSong) return;

		if (isPlaying) {
			videoElement?.pause();
			isPlaying = false;
			isPaused = true;
		} else {
			if (videoElement) {
				videoElement.play();
				isPlaying = true;
				isPaused = false;
			}
		}
	}

	function toggleMute() {
		isMuted = !isMuted;
		if (videoElement) {
			videoElement.muted = isMuted;
		}
		localStorage.setItem('pyrkon-muted', isMuted.toString());
	}

	function updateVolume() {
		if (videoElement) {
			videoElement.volume = volume;
		}
		localStorage.setItem('pyrkon-volume', volume.toString());
	}

	$: if (videoElement) {
		videoElement.volume = volume;
		videoElement.muted = isMuted;
	}

	function formatTime(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<svelte:head>
	<title>Pyrkon Quiz - Quiz Karczma</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
	<div class="container mx-auto px-4 py-8">
		<div class="text-center mb-8">
			<h1 class="text-4xl font-bold text-white mb-2">🎵 Pyrkon Quiz 🎵</h1>
			<p class="text-blue-200">Zgadnij anime po muzyce!</p>
		</div>

		{#if !gameStarted}
			<!-- Player setup -->
			<Card class="max-w-md mx-auto bg-gray-800/50 border-gray-700">
				<CardHeader>
					<CardTitle class="text-white text-center">Rozpocznij grę</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div>
						<Label for="playerName" class="text-gray-200">Nazwa gracza</Label>
						<Input
							id="playerName"
							bind:value={playerName}
							placeholder="Wprowadź swoją nazwę"
							class="bg-gray-700 border-gray-600 text-white"
						/>
					</div>
					<Button on:click={startGame} class="w-full bg-purple-600 hover:bg-purple-700">
						Rozpocznij grę
					</Button>
				</CardContent>
			</Card>
		{:else}
			<!-- Game interface -->
			<div class="max-w-4xl mx-auto space-y-6">
				<!-- Current song info -->
				{#if currentSong}
					<Card class="bg-gray-800/50 border-gray-700">
						<CardHeader>
							<div class="flex justify-between items-center">
								<CardTitle class="text-white">
									{showAnswer ? 'Odpowiedź' : 'Zgadnij anime'}
								</CardTitle>
								<div class="flex items-center gap-2">
									<Clock class="w-4 h-4 text-blue-400" />
									<span class="text-blue-400 font-mono">
										{showAnswer ? '0:00' : formatTime(timeLeft)}
									</span>
								</div>
							</div>
						</CardHeader>
						<CardContent class="space-y-4">
							{#if showAnswer}
								<!-- Show answer -->
								<div class="text-center space-y-2">
									<h3 class="text-2xl font-bold text-green-400">{currentSong.JPName}</h3>
									<p class="text-lg text-gray-300">{currentSong.ENName}</p>
									<p class="text-blue-400">🎵 {currentSong.SongName}</p>
									<p class="text-purple-400">🎤 {currentSong.Artist}</p>
									<Badge variant="outline" class="border-yellow-500 text-yellow-400">
										Trudność: {currentSong.difficulty}
									</Badge>
								</div>
								
								<div class="text-center">
									<Button on:click={nextSong} class="bg-green-600 hover:bg-green-700">
										<SkipForward class="w-4 h-4 mr-2" />
										Następna piosenka
									</Button>
								</div>
							{:else}
								<!-- Guessing phase -->
								<div class="text-center space-y-4">
									<div class="text-6xl">🎵</div>
									<p class="text-gray-300">Słuchaj i zgadnij anime!</p>
									
									{#if !hasSubmitted}
										<div class="space-y-3">
											<Input
												bind:value={answer}
												placeholder="Nazwa anime..."
												class="bg-gray-700 border-gray-600 text-white text-center text-lg"
												on:keydown={(e) => e.key === 'Enter' && submitAnswer()}
											/>
											<Button 
												on:click={submitAnswer} 
												disabled={loading || !answer.trim()}
												class="bg-blue-600 hover:bg-blue-700"
											>
												{loading ? 'Wysyłanie...' : 'Wyślij odpowiedź'}
											</Button>
										</div>
									{:else}
										<div class="text-green-400">
											✅ Odpowiedź wysłana: <strong>{answer}</strong>
										</div>
									{/if}
								</div>
							{/if}

							<!-- Audio controls -->
							{#if currentSong && !showAnswer}
								<div class="flex items-center justify-center gap-4 p-4 bg-gray-700/50 rounded-lg">
									<Button
										on:click={togglePlayPause}
										variant="outline"
										size="sm"
										class="border-gray-600"
									>
										{#if isPlaying}
											<Pause class="w-4 h-4" />
										{:else}
											<Play class="w-4 h-4" />
										{/if}
									</Button>

									<div class="flex items-center gap-2">
										<Button
											on:click={toggleMute}
											variant="ghost"
											size="sm"
										>
											{#if isMuted}
												<VolumeX class="w-4 h-4" />
											{:else}
												<Volume2 class="w-4 h-4" />
											{/if}
										</Button>
										<input
											type="range"
											min="0"
											max="1"
											step="0.1"
											bind:value={volume}
											on:input={updateVolume}
											class="w-20"
										/>
									</div>
								</div>
							{/if}
						</CardContent>
					</Card>

					<!-- Hidden video element (audio only) -->
					{#if currentSong}
						<video
							bind:this={videoElement}
							src="/api/pyrkon/play?file={encodeURIComponent(currentSong.FileName)}"
							bind:currentTime
							bind:duration
							style="display: none;"
							on:loadedmetadata={() => {
								if (videoElement && !showAnswer) {
									videoElement.play();
									isPlaying = true;
								}
							}}
							on:ended={() => {
								isPlaying = false;
								isPaused = false;
							}}
						>
							<track kind="captions" />
						</video>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>
