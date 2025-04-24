<script>
	//src/routes/[roomId]/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import Autocomplete from '$lib/components/player/Autocomplete.svelte';
	import { nanoid } from 'nanoid';

	let inTakeoverMode = false;
	let handRaised = false;
	let handRaiseResults = null;
	let playerPositions = [];
	let networkLatency = 0;
	let latencyMeasured = false;
	let latencyInterval = null;
	let latencyHistory = [];
	let displayLatency = 0;
	let measuringLatency = false;
	let hintRequested = false;
	let maskedAnswer = '';
	let checkingHandRaiseStatus = false;

	// Quick guess state
	let isQuickGuessActive = false;
	let countdownValue = 10;
	let countdownInterval = null;
	let currentPointsValue = 0;

	let teamCode = '';
	let teamCodeRequired = false;
	let teamCodeInputValue = '';
	let teamCodeCorrect = true;

	const FOUR_LETTER_WORDS = [
		'able',
		'ache',
		'acid',
		'acts',
		'adds',
		'ages',
		'also',
		'area',
		'army',
		'away',
		'baby',
		'back',
		'ball',
		'band',
		'bank',
		'base',
		'bath',
		'bear',
		'beat',
		'been',
		'bell',
		'belt',
		'best',
		'bike',
		'bird',
		'blue',
		'boat',
		'body',
		'book',
		'born',
		'both',
		'bowl',
		'busy',
		'cake',
		'call',
		'calm',
		'came',
		'camp',
		'card',
		'care',
		'cars',
		'case',
		'cash',
		'city',
		'club',
		'coal',
		'coat',
		'code',
		'cold',
		'come',
		'cook',
		'cool',
		'cope',
		'copy',
		'core',
		'cost',
		'cute',
		'dame',
		'dark',
		'data',
		'date',
		'dawn',
		'days',
		'dead',
		'deal',
		'dean',
		'dear',
		'debt',
		'deep',
		'desk',
		'dice',
		'diet',
		'dish',
		'does',
		'done',
		'door',
		'down',
		'draw',
		'drop',
		'drug',
		'dust',
		'duty',
		'each',
		'earn',
		'ease',
		'east',
		'easy',
		'edge',
		'eggs',
		'else',
		'ends',
		'euro',
		'even',
		'ever',
		'exam',
		'exit',
		'face',
		'fact',
		'fail',
		'fair',
		'fall',
		'farm',
		'fast',
		'fate',
		'fear',
		'fees',
		'file',
		'film',
		'find',
		'fine',
		'fire',
		'firm',
		'fish',
		'five',
		'flag',
		'flat',
		'flow',
		'food',
		'foot',
		'ford',
		'form',
		'fort',
		'four',
		'free',
		'from',
		'fuel',
		'full',
		'fund',
		'gain',
		'game',
		'gate',
		'gave',
		'gear',
		'gift',
		'girl',
		'give',
		'glad',
		'goal',
		'goes',
		'gold',
		'golf',
		'gone',
		'good',
		'grew',
		'grow',
		'gulf',
		'hair',
		'half',
		'hall',
		'hand',
		'hang',
		'hard',
		'harm',
		'hate',
		'have',
		'head',
		'hear',
		'heat',
		'held',
		'help',
		'here',
		'hide',
		'high',
		'hill',
		'hire',
		'hold',
		'hole',
		'holy',
		'home',
		'hope',
		'host',
		'hour',
		'huge',
		'hurt',
		'idea',
		'inch',
		'info',
		'into',
		'iron',
		'item',
		'jobs',
		'john',
		'join',
		'jump',
		'jury',
		'just',
		'keen',
		'keep',
		'kent',
		'kept',
		'keys',
		'kill',
		'kind',
		'king',
		'knew',
		'know',
		'lack',
		'lady',
		'lake',
		'land',
		'lane',
		'last',
		'late',
		'lead',
		'left',
		'legs',
		'less',
		'life',
		'lift',
		'like',
		'line',
		'link',
		'list',
		'live',
		'load',
		'loan',
		'lock',
		'logo',
		'long',
		'look',
		'lord',
		'lose',
		'loss',
		'lost',
		'lots',
		'love',
		'luck',
		'made',
		'mail',
		'main',
		'make',
		'male',
		'many',
		'mark',
		'mass',
		'math',
		'meal',
		'mean',
		'meat',
		'meet',
		'menu',
		'mere',
		'mile',
		'milk',
		'mind',
		'mine',
		'miss',
		'mode',
		'mood',
		'moon',
		'more',
		'most',
		'move',
		'much',
		'must',
		'name',
		'navy',
		'near',
		'neck',
		'need',
		'news',
		'next',
		'nice',
		'nine',
		'none',
		'norm',
		'nose',
		'note',
		'okay',
		'once',
		'only',
		'onto',
		'open',
		'oral',
		'over',
		'pace',
		'pack',
		'page',
		'paid',
		'pain',
		'pair',
		'palm',
		'park',
		'part',
		'pass',
		'past',
		'path',
		'peak',
		'pick',
		'pink',
		'plan',
		'play',
		'plot',
		'plus',
		'poll',
		'pool',
		'poor',
		'port',
		'post',
		'pull',
		'pure',
		'push',
		'race',
		'rail',
		'rain',
		'rank',
		'rare',
		'rate',
		'read',
		'real',
		'rear',
		'rely',
		'rent',
		'rest',
		'rice',
		'rich',
		'ride',
		'ring',
		'rise',
		'risk',
		'road',
		'rock',
		'role',
		'roll',
		'roof',
		'room',
		'root',
		'rose',
		'rule',
		'rush',
		'ruth',
		'safe',
		'said',
		'sake',
		'sale',
		'salt',
		'same',
		'sand',
		'save',
		'seat',
		'seed',
		'seek',
		'seem',
		'seen',
		'self',
		'sell',
		'send',
		'sent',
		'sept',
		'ship',
		'shop',
		'shot',
		'show',
		'shut',
		'sick',
		'side',
		'sign',
		'site',
		'size',
		'skin',
		'slip',
		'slow',
		'snow',
		'soft',
		'soil',
		'sold',
		'sole',
		'some',
		'song',
		'soon',
		'sort',
		'soul',
		'soup',
		'spot',
		'star',
		'stay',
		'step',
		'stop',
		'such',
		'suit',
		'sure',
		'take',
		'tale',
		'talk',
		'tall',
		'tank',
		'tape',
		'task',
		'team',
		'tech',
		'tell',
		'tend',
		'term',
		'test',
		'text',
		'than',
		'that',
		'them',
		'then',
		'they',
		'thin',
		'this',
		'thus',
		'time',
		'tiny',
		'told',
		'toll',
		'tone',
		'tony',
		'took',
		'tool',
		'tour',
		'town',
		'tree',
		'trip',
		'true',
		'tune',
		'turn',
		'twin',
		'type',
		'unit',
		'upon',
		'used',
		'user',
		'vary',
		'vast',
		'very',
		'vice',
		'view',
		'vote',
		'wage',
		'wait',
		'wake',
		'walk',
		'wall',
		'want',
		'ward',
		'warm',
		'wash',
		'wave',
		'ways',
		'weak',
		'wear',
		'week',
		'well',
		'went',
		'were',
		'west',
		'what',
		'when',
		'whom',
		'wide',
		'wife',
		'wild',
		'will',
		'wind',
		'wine',
		'wing',
		'wire',
		'wise',
		'wish',
		'with',
		'wood',
		'word',
		'work',
		'yard',
		'yeah',
		'year',
		'your',
		'zero',
		'zone',
		'zoom'
	];

	onMount(() => {
		// Check localStorage for saved team code
		const savedTeamCode = localStorage.getItem(`teamCode_${room.id}_${playerName}`);
		if (savedTeamCode) {
			teamCode = savedTeamCode;
		}
	});

	// Replace the generateTeamCode function
	function generateTeamCode() {
		// Get two random words from the list and combine them
		const word = FOUR_LETTER_WORDS[Math.floor(Math.random() * FOUR_LETTER_WORDS.length)];
		return word.toUpperCase();
	}

	// Replacement rules for easier text matching
	const ANIME_REGEX_REPLACE_RULES = [
		{ input: 'ou', replace: '(ou|ō|o)' },
		{ input: 'oo', replace: '(oo|ō|o)' },
		{ input: 'oh', replace: '(oh|ō|o)' },
		{ input: 'wo', replace: '(wo|o)' },
		{ input: 'o', replace: '([oōóòöôøΦο]|ou|oo|oh|wo)' },
		{ input: 'uu', replace: '(uu|u|ū)' },
		{ input: 'u', replace: '([uūûúùüǖ]|uu)' },
		{ input: 'aa', replace: '(aa|a)' },
		{ input: 'a', replace: '([aä@âàáạåæā∀]|aa)' },
		{ input: 'c', replace: '[cč]' },
		{ input: 'e', replace: '[eéêёëèæē]' },
		{ input: "'", replace: "['']" },
		{ input: 'n', replace: '[nñ]' },
		{ input: '2', replace: '[2²]' },
		{ input: '*', replace: '[＊*]' },
		{ input: 'i', replace: '([iíί]|ii)' },
		{ input: '3', replace: '[3³]' },
		{ input: 'x', replace: '[x×]' },
		{ input: 'b', replace: '[bßβ]' },
		{ input: 'r', replace: '[rЯ]' },
		{ input: 's', replace: '[sς]' },
		{ input: 'l', replace: '[l˥]' }
	];

	function closeLeaderboardView() {
		handRaiseResults = null;
		handRaised = false;
	}

	function showLeaderboard() {
		// Set handRaised to true to show the leaderboard
		handRaised = true;
		// If we don't have results yet, load them
		if (!handRaiseResults) {
			loadHandRaiseResults();
		}
		console.log(handRaiseResults);
	}

	async function checkHintStatus() {
		if (!hasJoined || !playerName || !room?.current_round) return false;

		const { data: hintUsage } = await supabase.from('hint_usages').select('*').eq('room_id', room.id).eq('round_id', room.current_round).eq('player_name', playerName).maybeSingle();

		return !!hintUsage;
	}

	async function requestHint() {
		try {
			const response = await fetch('/api/hint', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					roomId: room.id,
					roundId: room.current_round,
					playerName: playerName
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to get hint');
			}

			maskedAnswer = result.hint;
			hintRequested = true;

			toast.info('Podpowiedź została wygenerowana');
		} catch (error) {
			console.error('Error fetching hint:', error);
			toast.error('Nie udało się pobrać podpowiedzi: ' + error.message);
		}
	}

	// Function to apply regex replacement rules
	function applyRegexRules(input) {
		if (!input) return input;

		let processedInput = input.toLowerCase();

		// Apply each replacement rule
		ANIME_REGEX_REPLACE_RULES.forEach((rule) => {
			// Create a case-insensitive regex for the input
			const regex = new RegExp(rule.input, 'gi');
			processedInput = processedInput.replace(regex, rule.replace);
		});

		return processedInput;
	}

	export let data;
	let playerName = '';
	let answer = '';
	let songTitle = '';
	let songArtist = '';
	let otherAnswer = '';
	let channel;
	let hasJoined = false;
	let loading = false;
	let hasSubmitted = false;

	$: ({ supabase, room } = data);
	$: if (hasJoined && channel) {
		subscribeToChanges();
	}

	function resetAnswerState() {
		hasSubmitted = false;
		answer = '';
		songTitle = '';
		songArtist = '';
		otherAnswer = '';
		// Force Svelte to recognize the state change
		// hasSubmitted = hasSubmitted;
		answer = answer;
	}

	function resetAnswerStateWithHint() {
		hasSubmitted = false;
		answer = '';
		songTitle = '';
		songArtist = '';
		otherAnswer = '';
		hintRequested = false; // Reset hint requested state
		maskedAnswer = ''; // Clear the masked answer
		// Force Svelte to recognize the state change
		// hasSubmitted = hasSubmitted;
		answer = answer;
	}

	async function checkAnswerStatus() {
		if (!hasJoined || !playerName || !room?.current_round) return;

		const [{ data: existingAnswer }, isHintRequested, { data: pointsData }] = await Promise.all([
			supabase.from('answers').select('*, extra_fields, created_at').eq('room_id', room.id).eq('player_name', playerName).eq('round_id', room.current_round).maybeSingle(),
			checkHintStatus(),
			supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', room.current_round).maybeSingle()
		]);

		// Update states
		// hasSubmitted = !!existingAnswer;
		hintRequested = isHintRequested;

		// Update current points value
		if (pointsData) {
			currentPointsValue = pointsData.points_value;
		}

		if (existingAnswer) {
			// If there's an existing answer, set answer and extra fields
			answer = existingAnswer.content || '';
			if (existingAnswer.extra_fields) {
				songTitle = existingAnswer.extra_fields.song_title || '';
				songArtist = existingAnswer.extra_fields.song_artist || '';
				otherAnswer = existingAnswer.extra_fields.other || '';
			}
		} else {
			// If no answer exists, reset all fields except for hintRequested
			resetAnswerState();
		}

		// If hint was requested but we don't have the hint yet, fetch it again
		if (hintRequested && !maskedAnswer) {
			const response = await fetch('/api/hint', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					roomId: room.id,
					roundId: room.current_round,
					playerName: playerName
				})
			});

			if (response.ok) {
				const result = await response.json();
				maskedAnswer = result.hint;
			}
		}
	}

	function subscribeToChanges() {
		if (channel) channel.unsubscribe();

		channel = supabase
			.channel(`room:${room.id}:${playerName}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				async (payload) => {
					console.log('Room change detected:', payload);
					if (payload.new.current_round !== payload.old?.current_round) {
						toast.info('Rozpoczęła się nowa runda!');
						resetAnswerStateWithHint();
						// Fetch current points value for the new round if it's a screen room
						if (room.type === 'screen') {
							try {
								const { data: pointsData } = await supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', payload.new.current_round).maybeSingle();
								console.log(payload.new.current_round);
								if (pointsData) {
									currentPointsValue = pointsData.points_value;
								} else {
									// Reset to default if no points data found
									currentPointsValue = 0;
								}
							} catch (error) {
								console.error('Error fetching points value for new round:', error);
							}
						}

						await invalidateAll();
					}
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'screen_game_points',
					filter: `room_id=eq.${room.id}`
				},
				async (payload) => {
					console.log('Points change detected:', payload);
					// Only update if it's for the current round
					if (payload.new.round_id === room.current_round) {
						currentPointsValue = payload.new.points_value;
						console.log('Updated current points value:', currentPointsValue);
					}
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'hint_usages',
					filter: `player_name=eq.${playerName}`
				},
				async () => {
					hintRequested = true;
					await checkAnswerStatus();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'answers'
				},
				async (payload) => {
					console.log('Answer change detected:', payload);
					await checkAnswerStatus();
					if (!hasSubmitted && payload.eventType === 'DELETE') {
						toast.info('Twoja odpowiedź została zresetowana przez administratora');
					}
					await invalidateAll();
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'hand_raises',
					filter: `room_id=eq.${room.id}`
				},
				async (payload) => {
					console.log('Hand raise change detected:', payload);
					try {
						// Always update the leaderboard when any hand raise changes
						await loadHandRaiseResults();

						// Add visual indication of update
						const leaderboardElement = document.querySelector('.leaderboard-table');
						if (leaderboardElement) {
							leaderboardElement.classList.add('bg-blue-900/30');
							setTimeout(() => {
								leaderboardElement.classList.remove('bg-blue-900/30');
							}, 300);
						}

						// Force Svelte to update by creating new references
						handRaiseResults = { ...handRaiseResults };
						playerPositions = [...playerPositions];
					} catch (error) {
						console.error('Error updating hand raise data:', error);
					}
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				(payload) => {
					if (payload.new.takeover_mode === false && inTakeoverMode) {
						// Admin disabled takeover mode
						inTakeoverMode = false;
						handRaised = false;
						handRaiseResults = null;
						toast.info('Tryb przejęcia został wyłączony');
					}
				}
			)
			.subscribe();
	}

	async function joinGame() {
		if (!playerName.trim()) {
			toast.error('Wprowadź swój nick');
			return;
		}

		loading = true;
		try {
			// First, normalize the player name for consistency (e.g., lowercase)
			const normalizedPlayerName = playerName.trim().toLowerCase();

			// Check if team exists using case-insensitive search
			const { data: existingPlayers, error: fetchError } = await supabase.from('players').select('*').eq('room_id', room.id).ilike('name', normalizedPlayerName);

			if (fetchError) throw fetchError;

			if (existingPlayers?.length > 0) {
				// Get the exact team name from the database to ensure consistency
				const exactTeamName = existingPlayers[0].name;

				// Team exists already - check if we need team code
				const savedTeamCode = localStorage.getItem(`teamCode_${room.id}_${exactTeamName}`);

				if (savedTeamCode) {
					// Verify code against database
					const { data: teamData, error: teamError } = await supabase.from('players').select('team_code').eq('room_id', room.id).eq('name', exactTeamName).single();

					if (teamError) throw teamError;

					if (teamData.team_code === savedTeamCode) {
						// Code matches, allow join
						playerName = exactTeamName; // Use the exact name from the database
						hasJoined = true;
						await checkAnswerStatus();

						if (hasSubmitted) {
							toast.success(`Dołączono ponownie jako ${playerName} - Odpowiedź już przesłana`);
						} else {
							toast.success(`Dołączono ponownie jako ${playerName}`);
						}

						teamCode = savedTeamCode;
						subscribeToChanges();
					} else {
						// Code doesn't match what's in the database
						localStorage.removeItem(`teamCode_${room.id}_${exactTeamName}`);
						playerName = exactTeamName; // Use the exact name from the database
						teamCodeRequired = true;
						teamCodeCorrect = false;
					}
				} else {
					// No saved code, we need to prompt
					playerName = exactTeamName; // Use the exact name from the database
					teamCodeRequired = true;
				}
			} else {
				// New team, generate a code
				const newTeamCode = generateTeamCode();
				teamCode = newTeamCode;

				// Insert player with code
				const { error: insertError } = await supabase.from('players').insert({
					room_id: room.id,
					name: playerName.trim(), // Use the original case the user entered
					score: 0,
					tiebreaker: 0,
					team_code: newTeamCode
				});

				if (insertError) throw insertError;

				// Save to localStorage
				localStorage.setItem(`teamCode_${room.id}_${playerName.trim()}`, newTeamCode);

				hasJoined = true;
				hasSubmitted = false;
				toast.success('Dołączono jako ' + playerName);

				// Fetch current points value for the current round
				if (room.type === 'screen') {
					try {
						const { data: pointsData } = await supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', room.current_round).maybeSingle();

						if (pointsData) {
							currentPointsValue = pointsData.points_value;
						}
					} catch (error) {
						console.error('Error fetching points value:', error);
					}
				}

				subscribeToChanges();
			}
		} catch (error) {
			if (!error.message.includes('No rows found')) {
				toast.error('Błąd: ' + error.message);
			}
		} finally {
			loading = false;
		}
	}

	async function verifyTeamCode() {
		if (!teamCodeInputValue.trim()) {
			toast.error('Wprowadź kod zespołu');
			return;
		}

		loading = true;
		try {
			const { data: teamData, error: teamError } = await supabase
				.from('players')
				.select('team_code')
				.eq('room_id', room.id)
				.eq('name', playerName) // This should now be the exact name from the database
				.single();

			if (teamError) throw teamError;

			// Format the input code to uppercase for comparison
			const formattedInput = teamCodeInputValue.trim().toUpperCase();

			if (teamData.team_code === formattedInput) {
				// Code is correct
				teamCode = formattedInput;
				localStorage.setItem(`teamCode_${room.id}_${playerName}`, teamCode);

				teamCodeRequired = false;
				hasJoined = true;

				await checkAnswerStatus();

				if (hasSubmitted) {
					toast.success(`Dołączono ponownie jako ${playerName} - Odpowiedź już przesłana`);
				} else {
					toast.success(`Dołączono ponownie jako ${playerName}`);
				}

				// Fetch current points value for the current round
				if (room.type === 'screen') {
					try {
						const { data: pointsData } = await supabase.from('screen_game_points').select('points_value').eq('room_id', room.id).eq('round_id', room.current_round).maybeSingle();

						if (pointsData) {
							currentPointsValue = pointsData.points_value;
						}
					} catch (error) {
						console.error('Error fetching points value:', error);
					}
				}

				subscribeToChanges();
			} else {
				// Incorrect code
				teamCodeCorrect = false;
				toast.error('Niepoprawny kod zespołu');
			}
		} catch (error) {
			toast.error('Błąd: ' + error.message);
		} finally {
			loading = false;
		}
	}

	async function submitAnswer() {
		// Check if user already submitted an answer
		if (hasSubmitted) {
			toast.error('Odpowiedź dla tej rundy została już wysłana');
			return;
		}

		// Validate input fields
		// Only validate anime title if it's enabled or not explicitly disabled
		if (room.enabled_fields?.anime_title !== false && !answer.trim()) {
			toast.error('Wprowadź odpowiedź');
			return;
		}

		// If anime title is disabled but we have no other fields filled, prevent submission
		if (room.enabled_fields?.anime_title === false && (!room.enabled_fields?.song_title || !songTitle) && (!room.enabled_fields?.song_artist || !songArtist) && (!room.enabled_fields?.other || !otherAnswer)) {
			toast.error('Wprowadź przynajmniej jedną odpowiedź');
			return;
		}

		if (answer.trim() && answer.trim().length > 512) {
			toast.error('Odpowiedź musi mieć 512 znaków lub mniej');
			return;
		}

		// Check if an answer already exists for this round
		const { data: existingAnswer } = await supabase
			.from('answers')
			.select('*, created_at')
			.eq('room_id', room.id)
			.eq('round_id', room.current_round)
			.eq('player_name', playerName)
			.maybeSingle();

		// If an answer exists, it means the user has already submitted or is in quick guess mode
		if (existingAnswer) {
			toast.error('Odpowiedź dla tej rundy została już wysłana');
			hasSubmitted = true;
			return;
		}

		loading = true;
		try {
			// Fetch a fresh state of the points_value from screen_game_points
			try {
				const { data: screenPointsData, error: screenPointsError } = await supabase
					.from('screen_game_points')
					.select('points_value')
					.eq('room_id', room.id)
					.eq('round_id', room.current_round)
					.maybeSingle();

				if (!screenPointsError && screenPointsData && screenPointsData.points_value !== null) {
					// Update the current points value with the fresh data
					currentPointsValue = screenPointsData.points_value;
				}
			} catch (error) {
				console.error('Error fetching fresh points value:', error);
				// Continue with the current value if there's an error
			}

			const extraFields = {};

			// Apply regex rules to input fields
			const processedAnswer = answer ? answer.trim() : '';

			if (room.enabled_fields?.song_title && songTitle) {
				extraFields.song_title = songTitle;
			}
			if (room.enabled_fields?.song_artist && songArtist) {
				extraFields.song_artist = songArtist;
			}
			if (room.enabled_fields?.other && otherAnswer) {
				extraFields.other = otherAnswer;
			}

			// Get current player score and tiebreaker
			const { data: playerData, error: playerError } = await supabase.from('players').select('score, tiebreaker').eq('room_id', room.id).eq('name', playerName).single();

			if (playerError) throw playerError;

			// Prepare answer data
			const answerData = {
				room_id: room.id,
				round_id: room.current_round,
				player_name: playerName,
				// Only include content if anime_title is not explicitly disabled or if there's an answer
				content: room.enabled_fields?.anime_title === false ? '' : processedAnswer,
				extra_fields: Object.keys(extraFields).length > 0 ? extraFields : null,
				answer_status: {
					main_answer: false,
					song_title: false,
					song_artist: false,
					other: false
				},
				// Save current score and tiebreaker
				score_snapshot: playerData.score || 0,
				tiebreaker_snapshot: playerData.tiebreaker || 0,
				// Save current points value for normal answers too
				potential_points: currentPointsValue
			};

			const { error } = await supabase.from('answers').insert(answerData);

			if (error) {
				if (error.code === '23505') {
					// Unique constraint violation
					toast.error('Odpowiedź dla tej rundy została już wysłana');
				} else {
					throw error;
				}
				return;
			}

			hasSubmitted = true;
			toast.success('Odpowiedź przesłana');
			resetAnswerState();
		} catch (error) {
			toast.error('Błąd: ' + error.message);
		} finally {
			loading = false;
		}
	}

	async function enterTakeoverMode() {
		// First check if takeover mode is enabled for this room
		try {
			const { data: roomData, error: roomError } = await supabase.from('rooms').select('takeover_mode').eq('id', room.id).single();

			if (roomError) throw roomError;

			// If takeover mode is disabled, show toast and return
			if (!roomData.takeover_mode) {
				toast.error('Tryb przejęć jest obecnie wyłączony');
				return;
			}

			// Continue with normal takeover mode flow
			inTakeoverMode = true;
			checkingHandRaiseStatus = true; // Set loading state

			// Start monitoring latency
			setupLatencyMonitoring();

			// Check if user already raised hand in this room
			try {
				const { data, error } = await supabase.from('hand_raises').select('*').eq('room_id', room.id).eq('player_name', playerName).maybeSingle();

				if (data) {
					// User already raised hand, set flag and load results
					handRaised = true;
					await loadHandRaiseResults();
				}
			} catch (error) {
				console.error('Error checking hand raise status:', error);
			} finally {
				checkingHandRaiseStatus = false; // Clear loading state
			}
		} catch (error) {
			console.error('Error checking takeover mode status:', error);
			toast.error('Wystąpił błąd podczas włączania trybu przejęć');
		}
	}

	async function raiseHand() {
		if (handRaised) return;

		// Force a fresh latency measurement before submission
		if (!measuringLatency) {
			await measureNetworkLatency();
		}

		const clientTimestamp = Date.now();
		handRaised = true;

		try {
			const { error } = await supabase.from('hand_raises').insert({
				room_id: room.id,
				player_name: playerName,
				client_timestamp: clientTimestamp,
				measured_latency: networkLatency // Use the latest latency measurement
			});

			if (error) {
				if (error.code === '23505') {
					// Already raised hand
					await loadHandRaiseResults();
				} else {
					throw error;
				}
			} else {
				// Add this to load results after successful insert
				await loadHandRaiseResults();
			}
		} catch (error) {
			console.error('Failed to raise hand:', error);
			toast.error('Nie udało się przejąć');
			handRaised = false;
		}
	}

	function exitTakeoverMode() {
		inTakeoverMode = false;
		handRaised = false;
		handRaiseResults = null;
		// Stop monitoring latency
		cleanupLatencyMonitoring();
	}

	async function loadHandRaiseResults() {
		try {
			const { data, error } = await supabase.from('hand_raises').select('*').eq('room_id', room.id).order('server_timestamp', { ascending: true });

			if (error) throw error;

			if (data && data.length > 0) {
				// Find the player's position
				const playerIndex = data.findIndex((d) => d.player_name === playerName);

				if (playerIndex >= 0) {
					const position = playerIndex + 1;

					// Calculate time differences with latency correction
					const firstTimestamp = new Date(data[0].server_timestamp).getTime();
					const firstLatency = data[0].measured_latency || 0;

					const playerTimestamp = new Date(data[playerIndex].server_timestamp).getTime();
					const playerLatency = data[playerIndex].measured_latency || 0;

					// Adjust timestamps by subtracting latency
					const adjustedFirstTime = firstTimestamp - firstLatency;
					const adjustedPlayerTime = playerTimestamp - playerLatency;

					const timeDifferenceMs = adjustedPlayerTime - adjustedFirstTime;

					handRaiseResults = {
						position,
						timeDifferenceMs,
						latency: playerLatency
					};
				}

				// Update the full leaderboard with latency-corrected times
				const firstTimestamp = new Date(data[0].server_timestamp).getTime();
				const firstLatency = data[0].measured_latency || 0;
				const adjustedFirstTime = firstTimestamp - firstLatency;

				playerPositions = data.map((d, index) => {
					const timestamp = new Date(d.server_timestamp).getTime();
					const latency = d.measured_latency || 0;
					const adjustedTime = timestamp - latency;
					const timeDifferenceMs = index === 0 ? 0 : adjustedTime - adjustedFirstTime;

					return {
						name: d.player_name,
						position: index + 1,
						timeDifferenceMs,
						latency
					};
				});
			} else {
				playerPositions = [];
				if (handRaised) {
					handRaiseResults = null;
				}
			}
		} catch (error) {
			console.error('Failed to load hand raise results:', error);
		}
	}

	async function measureNetworkLatency(continuous = false) {
		if (measuringLatency) return networkLatency;

		measuringLatency = true;

		try {
			const startTime = Date.now();
			// Make a lightweight ping request to the server
			const { data } = await supabase.rpc('ping');
			const endTime = Date.now();
			const currentLatency = endTime - startTime;

			// Add to history (keep last 5 measurements)
			latencyHistory.push(currentLatency);
			if (latencyHistory.length > 5) {
				latencyHistory.shift();
			}

			// Calculate average latency
			const sortedLatencies = [...latencyHistory].sort((a, b) => a - b);

			// Remove outliers (highest and lowest if we have enough samples)
			let validMeasurements = sortedLatencies;
			if (sortedLatencies.length >= 4) {
				validMeasurements = sortedLatencies.slice(1, -1);
			}

			networkLatency = Math.round(validMeasurements.reduce((sum, val) => sum + val, 0) / validMeasurements.length);

			// Update displayed latency with color indicator
			displayLatency = networkLatency;
			latencyMeasured = true;

			console.log(`Current network latency: ${networkLatency}ms`);
		} catch (error) {
			console.error('Error measuring latency:', error);
		} finally {
			measuringLatency = false;
		}

		return networkLatency;
	}

	function setupLatencyMonitoring() {
		if (latencyInterval) {
			clearInterval(latencyInterval);
		}

		// Take initial measurement
		measureNetworkLatency();

		// Then set up interval for continuous monitoring
		latencyInterval = setInterval(async () => {
			await measureNetworkLatency(true);
		}, 1000); // Check every 3 seconds
	}

	function cleanupLatencyMonitoring() {
		if (latencyInterval) {
			clearInterval(latencyInterval);
			latencyInterval = null;
		}
	}

	// Quick guess functions
	async function startQuickGuess() {
		if (!room.quick_guess_enabled || hasSubmitted || isQuickGuessActive) {
			// If user already submitted an answer, show error message
			if (hasSubmitted) {
				toast.error('Odpowiedź dla tej rundy została już wysłana');
			}
			return;
		}

		// Fetch a fresh state of the points_value from screen_game_points
		try {
			const { data: screenPointsData, error: screenPointsError } = await supabase
				.from('screen_game_points')
				.select('points_value')
				.eq('room_id', room.id)
				.eq('round_id', room.current_round)
				.maybeSingle();

			if (!screenPointsError && screenPointsData && screenPointsData.points_value !== null) {
				// Update the current points value with the fresh data
				currentPointsValue = screenPointsData.points_value;
			}
		} catch (error) {
			console.error('Error fetching fresh points value:', error);
			// Continue with the current value if there's an error
		}

		// First check if an answer already exists for this round
		const { data: existingAnswer } = await supabase
			.from('answers')
			.select('*, created_at')
			.eq('room_id', room.id)
			.eq('round_id', room.current_round)
			.eq('player_name', playerName)
			.maybeSingle();

		if (existingAnswer) {
			// Check if the answer was created within the last 15 seconds
			const createdAt = new Date(existingAnswer.created_at);
			const now = new Date();
			const diffSeconds = (now - createdAt) / 1000;

			if (diffSeconds > 15) {
				// Answer is too old to update
				toast.error('Odpowiedź dla tej rundy została już wysłana');
				return;
			}
		} else {
			// No answer exists yet, create a new placeholder answer entry IMMEDIATELY
			try {
				const { error } = await supabase.from('answers').insert({
					room_id: room.id,
					round_id: room.current_round,
					player_name: playerName,
					content: '',
					extra_fields: null,
					potential_points: currentPointsValue
				});

				if (error) {
					console.error('Error creating placeholder answer:', error);
					if (error.code === '23505') { // Unique constraint violation
						toast.error('Odpowiedź dla tej rundy została już wysłana');
					} else {
						toast.error('Nie udało się rozpocząć odliczania');
					}
					return;
				}
			} catch (error) {
				console.error('Error creating placeholder answer:', error);
				toast.error('Nie udało się rozpocząć odliczania');
				return;
			}
		}

		// Now that we've handled the database operations, set the UI state
		isQuickGuessActive = true;
		countdownValue = 10;

		// Start countdown
		countdownInterval = setInterval(() => {
			countdownValue--;

			if (countdownValue <= 0) {
				clearInterval(countdownInterval);
				submitQuickGuess();
			}
		}, 1000);
	}

	// Function removed as per requirements

	// Function removed as it's no longer needed

	// Function to handle form submission
	function handleSubmit(event) {
		// If quick guess is active, prevent form submission
		if (isQuickGuessActive) {
			event.preventDefault();
			return;
		}

		// Otherwise, proceed with normal submission
		submitAnswer();
	}

	async function submitQuickGuess() {
		// When the countdown reaches zero, we need to update the placeholder answer
		// that was created when the user clicked "Zgaduję!"

		// Check if an answer exists
		const { data: existingAnswer, error: fetchError } = await supabase
			.from('answers')
			.select('*, created_at')
			.eq('room_id', room.id)
			.eq('round_id', room.current_round)
			.eq('player_name', playerName)
			.maybeSingle();

		if (fetchError) {
			console.error('Error fetching answer:', fetchError);
			toast.error('Nie udało się wysłać odpowiedzi');
			return;
		}

		if (!existingAnswer) {
			// This shouldn't happen as we create the placeholder immediately when clicking "Zgaduję!"
			console.error('No placeholder answer found');
			toast.error('Nie znaleziono odpowiedzi do aktualizacji');

			// Reset quick guess state
			isQuickGuessActive = false;

			if (countdownInterval) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}
			return;
		}

		// Check if the answer was created within the last 15 seconds
		const createdAt = new Date(existingAnswer.created_at);
		const now = new Date();
		const diffSeconds = (now - createdAt) / 1000;

		if (diffSeconds > 15) {
			// Answer is too old to update
			toast.error('Upłynął czas na aktualizację odpowiedzi');
			isQuickGuessActive = false;
			hasSubmitted = true;

			if (countdownInterval) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}

			return;
		}

		// Update the answer with full data, similar to submitAnswer
		loading = true;
		try {
			const extraFields = {};

			// Apply regex rules to input fields
			const processedAnswer = answer ? answer.trim() : '';
			console.log(processedAnswer)

			if (room.enabled_fields?.song_title && songTitle) {
				extraFields.song_title = songTitle;
			}
			if (room.enabled_fields?.song_artist && songArtist) {
				extraFields.song_artist = songArtist;
			}
			if (room.enabled_fields?.other && otherAnswer) {
				extraFields.other = otherAnswer;
			}

			// Get current player score and tiebreaker
			const { data: playerData, error: playerError } = await supabase.from('players').select('score, tiebreaker').eq('room_id', room.id).eq('name', playerName).single();

			if (playerError) throw playerError;

			// Update the answer with full data
			const { error } = await supabase
				.from('answers')
				.update({
					content: processedAnswer,
					extra_fields: Object.keys(extraFields).length > 0 ? extraFields : null,
					answer_status: {
						main_answer: false,
						song_title: false,
						song_artist: false,
						other: false
					},
				})
				.eq('room_id', room.id)
				.eq('round_id', room.current_round)
				.eq('player_name', playerName);

			if (error) {
				console.error('Error updating answer:', error);
				toast.error('Nie udało się wysłać odpowiedzi');
			} else {
				toast.success('Odpowiedź została wysłana');
				hasSubmitted = true;
			}
		} catch (error) {
			console.error('Error updating answer:', error);
			toast.error('Nie udało się wysłać odpowiedzi: ' + error.message);
		} finally {
			loading = false;
		}

		// Reset quick guess state
		isQuickGuessActive = false;

		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}

		// Clear any existing fields
		answer = '';
		songTitle = '';
		songArtist = '';
		otherAnswer = '';
	}

	onDestroy(() => {
		cleanupLatencyMonitoring();
		if (channel) channel.unsubscribe();
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
	});

	function getLatencyColorClass(latency) {
		if (latency < 50) return 'text-green-400';
		if (latency < 150) return 'text-yellow-400';
		return 'text-red-400';
	}
</script>

<div class="min-h-screen bg-gray-950">
	{#if hasJoined && teamCode}
		<div class="fixed left-4 top-4 z-20 flex items-center gap-2 rounded-md bg-gray-800/90 px-3 py-2 shadow-lg">
			<span class="text-sm text-gray-300">Kod drużyny: <span class="font-mono font-bold text-cyan-400">{teamCode}</span></span>
			<!-- svelte-ignore a11y_consider_explicit_label -->
			<button
				class="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
				on:click={() => {
					navigator.clipboard.writeText(teamCode);
					toast.success('Kod skopiowany do schowka');
				}}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
			</button>
		</div>
	{/if}
	<div class="container mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
		<Card.Root class="w-full border-gray-800 bg-gray-900 shadow-xl">
			<Card.Header>
				<Card.Title class="text-white">
					{room.name}
					{hasJoined ? `- ${playerName}` : '- Dołącz do pokoju'}
				</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if !hasJoined}
					{#if teamCodeRequired}
						<form on:submit|preventDefault={verifyTeamCode} class="space-y-4">
							<div class="mb-4 text-center">
								<p class="text-lg text-white">Drużyna "{playerName}" już istnieje</p>
								<p class="text-sm text-gray-400">Wprowadź kod drużyny aby dołączyć</p>
							</div>
							<Input type="text" placeholder="Kod drużyny" bind:value={teamCodeInputValue} required class={`border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0 ${!teamCodeCorrect ? 'border-red-500' : ''}`} />
							{#if !teamCodeCorrect}
								<p class="text-sm text-red-500">Niepoprawny kod drużyny</p>
							{/if}
							<div class="flex gap-2">
								<Button
									type="button"
									on:click={() => {
										teamCodeRequired = false;
										teamCodeCorrect = true;
									}}
									class="flex-1 border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
								>
									Wróć
								</Button>
								<Button type="submit" disabled={loading} class="flex-1 border border-gray-700 bg-blue-800 text-white hover:bg-blue-700">
									{loading ? 'Weryfikacja...' : 'Weryfikuj'}
								</Button>
							</div>
						</form>
					{:else}
						<form on:submit|preventDefault={joinGame} class="space-y-4">
							<Input type="text" placeholder="Twój nick" bind:value={playerName} required disabled={loading} class="border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0" />
							<Button type="submit" disabled={loading} class="w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
								{loading ? 'Dołączanie...' : 'Dołącz do pokoju'}
							</Button>
						</form>
					{/if}
				{:else if !hasSubmitted}
					<div class="mb-6 overflow-hidden rounded-xl border border-gray-700 bg-gray-800/60 shadow-lg">
						{#if !hintRequested && room.enabled_fields?.hint_mode}
							<div class="flex items-center justify-between p-4">
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700/50 text-xl text-blue-400">?</div>
								</div>
								<Button on:click={requestHint} class="bg-blue-600/50 text-white hover:bg-blue-600/70" size="sm">
									Pokaż podpowiedź (-{room.points_config?.hint_penalty_percent || 40}% punktów)
								</Button>
							</div>
						{:else if hintRequested}
							<div class="p-4">
								<div class="mb-2 flex items-center gap-3">
									<div class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/30 text-lg text-blue-400">
										<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<circle cx="12" cy="12" r="10"></circle>
											<line x1="12" y1="16" x2="12" y2="12"></line>
											<line x1="12" y1="8" x2="12.01" y2="8"></line>
										</svg>
									</div>
									<h3 class="font-medium text-blue-400">Podpowiedź</h3>
								</div>
								<div class="mt-2 rounded-lg bg-gray-900/60 p-3">
									{#if maskedAnswer}
										<p class="text-center font-mono text-lg tracking-tight text-white">
											<!-- Process the hint to make it more word-like -->
											{#each maskedAnswer.split(' ') as word, i}
												<span class="mb-1 mr-2 inline-block">
													{#each word.split('') as char}
														<span class={char === '_' ? 'mx-px' : char === '•' ? 'mx-px text-blue-500' : 'mx-px font-bold text-blue-400'}>
															{char}
														</span>
													{/each}
												</span>
											{/each}
										</p>
									{:else}
										<p class="text-center font-mono text-lg text-white">Ładowanie...</p>
									{/if}
								</div>
								<p class="mt-2 text-center text-xs text-gray-400">
									<span class="mx-auto inline-flex items-center rounded border border-gray-700 bg-gray-800/80 px-2 py-1 font-mono text-sm text-blue-400">
										<span class="mr-1 font-bold">•</span> = Dowolny znak specjalny
									</span>
								</p>
							</div>
						{/if}
					</div>

					<form on:submit|preventDefault={handleSubmit} class="space-y-4">
						{#if isQuickGuessActive}
							<div class="mb-4 rounded-lg bg-amber-900/30 p-4 text-center">
								<p class="mb-2 text-xl font-bold text-amber-400">Masz {countdownValue}s na odpowiedź</p>
								<p class="mb-4 text-sm text-amber-300">Twoja odpowiedź zostanie automatycznie wysłana za {countdownValue} sekund.</p>
								<p class="text-sm text-amber-300">Potencjalne punkty: <span class="font-bold">{currentPointsValue}</span></p>
							</div>
						{/if}
						{#if room.enabled_fields?.anime_title !== false}
							<Autocomplete bind:value={answer} placeholder="Nazwa anime" index="animeTitles" searchKey="animeTitle" type="anime" />
						{/if}

						{#if room.enabled_fields?.song_title}
							<Autocomplete bind:value={songTitle} placeholder="Tytuł piosenki" index="songNames" searchKey="songName" type="songs" />
						{/if}

						{#if room.enabled_fields?.song_artist}
							<Autocomplete bind:value={songArtist} placeholder="Artysta" index="artists" searchKey="artist" type="artists" />
						{/if}

						{#if room.enabled_fields?.other}
							<Input type="text" placeholder="Inne" bind:value={otherAnswer} disabled={loading} class="border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0" />
						{/if}

						{#if !isQuickGuessActive}
							<div class="flex gap-2">
								<Button type="submit" disabled={loading || hasSubmitted} class="flex-1 border-green-700 bg-green-800 text-white hover:bg-green-700">
									{loading ? 'Wysyłanie...' : 'Wyślij odpowiedź'}
								</Button>

								{#if room.type === 'screen' && room.quick_guess_enabled}
									<Button type="button" on:click={startQuickGuess} disabled={loading || hasSubmitted} class="flex-1 border border-amber-700 bg-amber-800 text-white hover:bg-amber-700">
										Zgaduję! ({currentPointsValue}pkt)
									</Button>
								{/if}
							</div>
						{/if}
					</form>
				{:else if !hasSubmitted}
					<form on:submit|preventDefault={handleSubmit} class="space-y-4">
						{#if room.enabled_fields?.anime_title !== false}
							<Autocomplete bind:value={answer} placeholder="Nazwa anime" index="animeTitles" searchKey="animeTitle" type="anime" />
						{/if}

						{#if room.enabled_fields?.song_title}
							<Autocomplete bind:value={songTitle} placeholder="Tytuł piosenki" index="songNames" searchKey="songName" type="songs" />
						{/if}

						{#if room.enabled_fields?.song_artist}
							<Autocomplete bind:value={songArtist} placeholder="Artysta" index="artists" searchKey="artist" type="artists" />
						{/if}

						{#if room.enabled_fields?.other}
							<Input type="text" placeholder="Inne" bind:value={otherAnswer} disabled={loading} class="border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0" />
						{/if}

						<div class="flex gap-2">
							<Button type="submit" disabled={loading} class="flex-1 border-green-700 bg-green-800 text-white hover:bg-green-700">
								{loading ? 'Wysyłanie...' : 'Wyślij odpowiedź'}
							</Button>

							{#if room.type === 'screen' && room.quick_guess_enabled}
								<Button type="button" on:click={startQuickGuess} disabled={loading} class="flex-1 border border-amber-700 bg-amber-800 text-white hover:bg-amber-700">
									Zgaduję! ({currentPointsValue}pkt)
								</Button>
							{/if}
						</div>
					</form>
				{:else}
					<div class="space-y-4">
						<p class="text-center text-gray-200">Odpowiedź dla tej rundy została już wysłana</p>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if hasJoined && !inTakeoverMode}
			<div class="fixed right-4 top-4 z-20">
				<Button on:click={enterTakeoverMode} class="border border-gray-700 bg-gray-600 text-white hover:bg-gray-700">Tryb przejęć</Button>
			</div>
		{/if}

		<!-- Takeover Mode Overlay -->
		{#if inTakeoverMode}
			<div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900">
				<div class="absolute right-4 top-4 flex flex-col items-end gap-2">
					<div class="flex items-center gap-2 rounded-lg bg-gray-800 p-3">
						<span class="text-gray-300">Twój ping:</span>
						<span class={getLatencyColorClass(displayLatency)}>
							{displayLatency}ms
							<span class="text-xs">
								{#if displayLatency < 50}
									(Doskonały)
								{:else if displayLatency < 150}
									(Dobry)
								{:else}
									(Wysoki)
								{/if}
							</span>
						</span>
					</div>
					<div class="flex gap-2">
						<Button on:click={exitTakeoverMode} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">Wyjdź</Button>
						<Button on:click={showLeaderboard} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">Wyniki</Button>
					</div>
				</div>

				{#if checkingHandRaiseStatus}
					<!-- Show loading indicator while checking status -->
					<div class="flex flex-col items-center justify-center">
						<div class="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
						<p class="text-xl text-white">Ładowanie...</p>
					</div>
				{:else if !handRaised}
					<button on:mousedown={raiseHand} on:touchstart|preventDefault={raiseHand} class="flex h-full w-full items-center justify-center bg-blue-600 text-4xl font-bold text-white active:bg-blue-800"> DOTKNIJ BY PODNIEŚĆ ŁAPĘ </button>
				{:else if handRaiseResults}
					<div class="flex flex-col items-center justify-center rounded-lg bg-gray-800 p-8">
						<!-- Show player's position only if they participated -->
						{#if playerPositions.some((p) => p.name === playerName)}
							<h2 class="mb-4 text-3xl font-bold text-white">
								Jesteś #{handRaiseResults.position}
							</h2>

							{#if handRaiseResults.position > 1}
								<p class="mb-2 text-xl text-white">
									{(handRaiseResults.timeDifferenceMs / 1000).toFixed(3)}s za pierwszym miejscem
								</p>
								<p class="mb-6 text-sm text-gray-400">
									Twój ping: <span class={getLatencyColorClass(handRaiseResults.latency)}>{handRaiseResults.latency}ms</span>
								</p>
							{:else}
								<p class="mb-2 text-xl text-green-400">Jesteś pierwszy!</p>
								<p class="mb-6 text-sm text-gray-400">
									Twój ping: <span class={getLatencyColorClass(handRaiseResults.latency)}>{handRaiseResults.latency}ms</span>
								</p>
							{/if}
						{:else}
							<!-- Spectator mode message -->
							<h2 class="mb-4 text-3xl font-bold text-white">Wyniki przejęć</h2>
							<p class="mb-6 text-xl text-gray-300">Jesteś obserwatorem</p>
						{/if}

						<h3 class="mb-2 text-xl font-semibold text-white">Kto był pierwszy?</h3>
						<div class="max-h-96 w-full overflow-y-auto">
							<table class="leaderboard-table w-full text-left transition-colors duration-300">
								<thead>
									<tr>
										<th class="px-4 py-2 text-gray-300">Pozycja</th>
										<th class="px-4 py-2 text-gray-300">Gracz</th>
										<th class="px-4 py-2 text-gray-300">Czas</th>
										<th class="px-4 py-2 text-gray-300">Ping</th>
									</tr>
								</thead>
								<tbody>
									{#each playerPositions as player}
										<tr class={player.name === playerName ? 'bg-blue-900/30' : ''}>
											<td class="px-4 py-2 text-gray-200">{player.position}</td>
											<td class="px-4 py-2 text-gray-200">{player.name}</td>
											<td class="px-4 py-2 text-gray-200">
												{player.position === 1 ? '-' : `+${(player.timeDifferenceMs / 1000).toFixed(3)}s`}
											</td>
											<td class="px-4 py-2">
												<span class={getLatencyColorClass(player.latency)}>
													{player.latency || 0}ms
												</span>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<p class="mb-2 text-center text-base text-yellow-400">Pamiętaj by wyjść z tego ekranu<br /> przed rozpoczęciem kolejnej rundy!</p>

						<Button on:click={closeLeaderboardView} class="mt-6 border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">Wróć</Button>
					</div>
				{:else}
					<div class="text-xl text-white">Przetwarzanie...</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
