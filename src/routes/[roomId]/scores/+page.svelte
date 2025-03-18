<script>
	import { onMount, onDestroy } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';

	export let data;
	$: ({ supabase, room } = data);

	let players = [];
	let loading = true;
	let channel;

	// Responsive layout handling
	let isMobile = false;

	onMount(() => {
		// Check initial screen size
		checkScreenSize();
		// Add listener for screen size changes
		window.addEventListener('resize', checkScreenSize);

		loadScoreboard();
		setupRealtime();
	});

	onDestroy(() => {
		window.removeEventListener('resize', checkScreenSize);
		if (channel) channel.unsubscribe();
	});

	function checkScreenSize() {
		isMobile = window.innerWidth < 768;
	}

	// Load players and their scores
	async function loadScoreboard() {
		loading = true;
		try {
			const { data: playerData, error } = await supabase.from('players').select('*').eq('room_id', room.id).order('score', { ascending: false }).order('tiebreaker', { ascending: false });

			if (error) throw error;

			players = playerData || [];
		} catch (error) {
			console.error('Error loading scoreboard data:', error);
			toast.error('Nie udało się załadować danych tabeli wyników');
		} finally {
			loading = false;
		}
	}

	// Setup realtime subscriptions
	function setupRealtime() {
		if (channel) channel.unsubscribe();

		channel = supabase
			.channel(`scoreboard:${room.id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'players',
					filter: `room_id=eq.${room.id}`
				},
				async () => {
					await loadScoreboard();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				async () => {
					await invalidateAll();
				}
			)
			.subscribe();
	}

	// Determine medal color based on position
	function getMedalClass(index) {
		if (index === 0) return 'text-yellow-400';
		if (index === 1) return 'text-gray-300';
		if (index === 2) return 'text-amber-600';
		return 'text-cyan-400';
	}

	// Generate trophy or position icon
	function getPositionIcon(index) {
		// Medal emoji for top 3
		if (index === 0) return '🥇';
		if (index === 1) return '🥈';
		if (index === 2) return '🥉';
		return `${index + 1}.`;
	}

	// Split players array into two columns for desktop view
	function getPlayersColumns() {
		if (players.length === 0) return [[], []];

		const midpoint = Math.ceil(players.length / 2);
		return [players.slice(0, midpoint), players.slice(midpoint)];
	}
</script>

<div class="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900">
	<div class="container mx-auto px-3 py-4 md:px-6 md:py-8">
		<!-- Main Card -->
		<Card.Root class="border-gray-800/50 bg-gray-900/80 shadow-2xl backdrop-blur">
			<!-- Header with Title -->
			<Card.Header class="border-b border-gray-800/50 p-4 md:p-6">
				<Card.Title class="text-center text-3xl font-bold text-white md:text-5xl">Tabela wyników</Card.Title>
				<p class="mt-1 text-center text-xl text-gray-400 md:mt-2 md:text-2xl">
					{room.name}
				</p>
			</Card.Header>

			<!-- Content Section -->
			<Card.Content class="p-0">
				{#if loading}
					<!-- Loading State -->
					<div class="flex items-center justify-center p-12 md:p-24">
						<div class="h-16 w-16 animate-spin rounded-full border-8 border-gray-700 border-t-blue-500 md:h-24 md:w-24"></div>
					</div>
				{:else if players.length === 0}
					<!-- No Players State -->
					<div class="rounded-lg p-8 text-center md:p-12">
						<p class="text-xl text-gray-300 md:text-3xl">Brak graczy do wyświetlenia.</p>
					</div>
				{:else}
					<!-- Scoreboard Tables -->
					<div class="overflow-hidden rounded-b-lg">
						<!-- Mobile View (Single Column) -->
						{#if isMobile}
							<div class="p-4">
								<table class="w-full">
									<thead>
										<tr class="border-b border-gray-700/50 text-left">
											<th class="pb-3 pl-2 text-lg font-semibold text-cyan-200">#</th>
											<th class="pb-3 pl-3 text-lg font-semibold text-cyan-200">Gracz</th>
											<th class="pb-3 pr-2 text-right text-lg font-semibold text-cyan-200">Punkty</th>
										</tr>
									</thead>
									<tbody>
										{#each players as player, index}
											<tr class="border-b border-gray-800/30 text-left">
												<td class="py-2 pl-2">
													<span class={`text-xl font-bold ${getMedalClass(index)}`}>
														{getPositionIcon(index)}
													</span>
												</td>
												<td class="py-2 pl-3 text-lg text-white">{player.name}</td>
												<td class="py-2 pr-2 text-right text-lg font-bold text-cyan-300">{player.score}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<!-- Desktop View (Two Columns) -->
							<div class="grid grid-cols-2 gap-0 divide-x divide-gray-800/30 p-6">
								{#each getPlayersColumns() as columnPlayers, colIndex}
									<div class={colIndex === 1 ? 'pl-6' : 'pr-6'}>
										<table class="w-full">
											<thead>
												<tr class="border-b border-gray-700/50 text-left">
													<th class="pb-4 pl-2 text-xl font-semibold text-cyan-200 md:text-2xl">#</th>
													<th class="pb-4 pl-4 text-xl font-semibold text-cyan-200 md:text-2xl">Gracz</th>
													<th class="pb-4 pr-2 text-right text-xl font-semibold text-cyan-200 md:text-2xl">Punkty</th>
												</tr>
											</thead>
											<tbody>
												{#each columnPlayers as player, index}
													{@const actualIndex = colIndex === 0 ? index : index + getPlayersColumns()[0].length}
													<tr class="border-b border-gray-800/30 text-left transition-colors hover:bg-gray-800/10">
														<td class="py-3 pl-2">
															<span class={`text-2xl font-bold ${getMedalClass(actualIndex)} md:text-3xl`}>
																{getPositionIcon(actualIndex)}
															</span>
														</td>
														<td class="py-3 pl-4 text-xl text-white md:text-2xl">{player.name}</td>
														<td class="py-3 pr-2 text-right text-xl font-bold text-cyan-300 md:text-2xl">{player.score}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
