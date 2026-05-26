<script>
	//src/routes/admin/rooms/[roomId]/songs/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Files, Music, Trash2, Upload } from 'lucide-svelte';
	import { canModifyRoom } from '$lib/client/roomSecurity.js';

	export let data;
	$: ({ supabase, room, rounds, user, profile } = data);

	let channel;
	let files = {};
	let uploading = {};
	let batchFiles = [];
	let batchImporting = false;
	let batchProgress = { current: 0, total: 0, fileName: '' };
	let batchFileInput;

	const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm', '.opus']);

	$: sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);
	$: songRounds = room.settings?.songQuiz?.rounds || {};
	$: batchPreview = batchFiles.map((file, index) => ({
		file,
		roundNumber: index + 1,
		replacesExisting: Boolean(sortedRounds[index] && songRounds[sortedRounds[index]?.id])
	}));
	$: roundsToCreate = Math.max(0, batchFiles.length - sortedRounds.length);

	function buildSongQuizSettings(updates) {
		const currentSettings = room.settings || {};
		return {
			...currentSettings,
			songQuiz: {
				...(currentSettings.songQuiz || {}),
				...updates
			}
		};
	}

	function isAudioFile(file) {
		if (file.type.startsWith('audio/')) return true;

		const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
		return AUDIO_EXTENSIONS.has(extension);
	}

	function sortAudioFiles(selectedFiles) {
		return [...selectedFiles].sort((a, b) => a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' }));
	}

	function handleFileSelect(roundId, event) {
		const selectedFile = event.target.files?.[0];
		if (!selectedFile) return;

		if (!isAudioFile(selectedFile)) {
			toast.error('Wybierz plik audio');
			event.target.value = '';
			return;
		}

		files[roundId] = selectedFile;
		files = { ...files };
	}

	function handleBatchFileSelect(event) {
		const selectedFiles = [...(event.target.files || [])].filter(isAudioFile);

		if (selectedFiles.length === 0) {
			toast.error('Nie znaleziono plików audio');
			event.target.value = '';
			return;
		}

		if (selectedFiles.length !== event.target.files?.length) {
			toast.warning(`Pominięto ${event.target.files.length - selectedFiles.length} plików, które nie wyglądają na audio`);
		}

		batchFiles = sortAudioFiles(selectedFiles);
	}

	function clearBatchSelection() {
		batchFiles = [];
		if (batchFileInput) batchFileInput.value = '';
	}

	async function uploadAudioForRound(file) {
		const formData = new FormData();
		formData.append('file', file);

		const response = await fetch('/api/upload', {
			method: 'POST',
			body: formData
		});

		const result = await response.json().catch(() => null);

		if (!response.ok || !result?.success) {
			const message = result?.message || `HTTP ${response.status}`;
			throw new Error(`Pixeldrain odrzucił "${file.name}": ${message}`);
		}

		return {
			audioUrl: result.url,
			audioPath: result.fileId,
			fileName: file.name,
			contentType: file.type || 'audio/mpeg',
			uploadedAt: new Date().toISOString()
		};
	}

	async function ensureRoundsForImport(fileCount) {
		let availableRounds = [...sortedRounds];
		const highestRound = availableRounds.reduce((max, round) => Math.max(max, round.round_number), 0);
		const missingRoundCount = fileCount - availableRounds.length;

		for (let i = 0; i < missingRoundCount; i++) {
			const { data: newRound, error } = await supabase
				.from('quiz_rounds')
				.insert({
					room_id: room.id,
					round_number: highestRound + 1 + i
				})
				.select()
				.single();

			if (error) throw error;
			availableRounds.push(newRound);
		}

		return availableRounds.sort((a, b) => a.round_number - b.round_number).slice(0, fileCount);
	}

	async function executeBatchImport() {
		if (batchFiles.length === 0) return;

		batchImporting = true;
		batchProgress = { current: 0, total: batchFiles.length, fileName: '' };

		try {
			canModifyRoom(room, user, profile);

			const targetRounds = await ensureRoundsForImport(batchFiles.length);
			const nextRounds = { ...songRounds };
			let importedCount = 0;

			for (let index = 0; index < batchFiles.length; index++) {
				const file = batchFiles[index];
				const round = targetRounds[index];

				batchProgress = {
					current: index + 1,
					total: batchFiles.length,
					fileName: file.name
				};

				nextRounds[round.id] = await uploadAudioForRound(file);
				importedCount++;

				if (index % 5 === 4 || index === batchFiles.length - 1) {
					const partialSettings = buildSongQuizSettings({ rounds: nextRounds });
					await supabase.from('rooms').update({ settings: partialSettings }).eq('id', room.id);
				}
			}

			const settings = buildSongQuizSettings({ rounds: nextRounds });
			const { error } = await supabase.from('rooms').update({ settings }).eq('id', room.id);
			if (error) throw error;

			room = { ...room, settings };
			clearBatchSelection();
			toast.success(`Zaimportowano ${importedCount} utworów alfabetycznie do rund 1–${importedCount}`);
			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się wykonać importu wsadowego: ' + error.message);
		} finally {
			batchImporting = false;
			batchProgress = { current: 0, total: 0, fileName: '' };
		}
	}

	async function uploadSong(round) {
		const file = files[round.id];
		if (!file) return;

		uploading[round.id] = true;
		uploading = { ...uploading };

		try {
			canModifyRoom(room, user, profile);

			const nextRounds = {
				...songRounds,
				[round.id]: await uploadAudioForRound(file)
			};
			const settings = buildSongQuizSettings({ rounds: nextRounds });

			const { error } = await supabase.from('rooms').update({ settings }).eq('id', room.id);
			if (error) throw error;

			room = { ...room, settings };
			files[round.id] = null;
			files = { ...files };
			toast.success(`Zapisano utwór dla rundy ${round.round_number}`);
			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się zapisać utworu: ' + error.message);
		} finally {
			uploading[round.id] = false;
			uploading = { ...uploading };
		}
	}

	async function deleteSong(round) {
		if (!songRounds[round.id]) return;

		try {
			canModifyRoom(room, user, profile);

			const nextRounds = { ...songRounds };
			delete nextRounds[round.id];

			const currentSongQuiz = room.settings?.songQuiz || {};
			const resetPlayback = currentSongQuiz.activeRoundId === round.id;
			const settings = buildSongQuizSettings({
				rounds: nextRounds,
				activeRoundId: resetPlayback ? null : currentSongQuiz.activeRoundId,
				playIssuedAt: resetPlayback ? null : currentSongQuiz.playIssuedAt,
				playAt: resetPlayback ? null : currentSongQuiz.playAt,
				playToken: resetPlayback ? null : currentSongQuiz.playToken
			});

			const { error } = await supabase.from('rooms').update({ settings }).eq('id', room.id);
			if (error) throw error;

			room = { ...room, settings };
			toast.success(`Usunięto utwór dla rundy ${round.round_number}`);
			await invalidateAll();
		} catch (error) {
			toast.error('Nie udało się usunąć utworu: ' + error.message);
		}
	}

	onMount(() => {
		channel = supabase
			.channel(`room-songs:${room.id}`)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'rooms',
					filter: `id=eq.${room.id}`
				},
				(payload) => {
					room = { ...room, ...payload.new };
					invalidate('songs');
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'quiz_rounds',
					filter: `room_id=eq.${room.id}`
				},
				async () => await invalidateAll()
			)
			.subscribe();
	});

	onDestroy(() => {
		if (channel) channel.unsubscribe();
	});
</script>

<div class="min-h-screen bg-gray-950">
	<div class="container mx-auto p-6">
		<Card.Root class="mb-6 border-gray-800 bg-gray-900">
			<Card.Header>
				<div class="flex items-center justify-between">
					<div class="!-mt-4 mb-2 flex items-center gap-4">
						<Card.Title class="text-white">Kreator utworów: {room.name}</Card.Title>
					</div>

					<div class="!-mt-4 mb-2 flex items-center gap-2">
						<Button href="/admin/rooms/{room.id}" variant="outline" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">Dashboard</Button>
						<Button href="/admin" variant="outline" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">Powrót</Button>
					</div>
				</div>
			</Card.Header>
			<Card.Content>
				<p class="text-sm text-gray-400">Dodaj pliki audio do rund. Na dashboardzie w zakładce przejęć admin uruchamia właściwy utwór przyciskiem Play.</p>
			</Card.Content>
		</Card.Root>

		<Card.Root class="mb-8 border-gray-800 bg-gray-900">
			<Card.Header>
				<Card.Title class="text-white">Masowy import utworów</Card.Title>
				<Card.Description class="text-gray-400">
					Wybierz wiele plików audio naraz. Zostaną posortowane alfabetycznie i wgrane na Pixeldrain, a następnie przypisane do rund 1, 2, 3 itd. Jeśli brakuje rund, zostaną utworzone automatycznie.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="space-y-4">
					<div class="flex flex-col gap-3 sm:flex-row">
						<input bind:this={batchFileInput} type="file" id="batch-song-files" accept="audio/*" multiple on:change={handleBatchFileSelect} class="hidden" disabled={batchImporting} />
						<label
							for="batch-song-files"
							class="inline-flex cursor-pointer items-center justify-center rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 ring-offset-background transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 {batchImporting ? 'pointer-events-none opacity-50' : ''}"
						>
							<Files class="mr-2 h-4 w-4" />
							Wybierz pliki audio
						</label>

						{#if batchFiles.length > 0}
							<Button on:click={clearBatchSelection} disabled={batchImporting} variant="outline" class="border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700">
								Wyczyść wybór
							</Button>
						{/if}
					</div>

					{#if batchFiles.length > 0}
						<div class="rounded-lg border border-gray-800 bg-gray-800/30 p-4 text-sm text-gray-300">
							<p>Wybrano {batchFiles.length} plików.</p>
							{#if roundsToCreate > 0}
								<p class="text-yellow-400">Import utworzy {roundsToCreate} {roundsToCreate === 1 ? 'nową rundę' : 'nowe rundy'}.</p>
							{/if}
							{#if batchPreview.some((item) => item.replacesExisting)}
								<p class="text-amber-300">Istniejące utwory w docelowych rundach zostaną nadpisane.</p>
							{/if}
						</div>

						<div class="max-h-64 overflow-y-auto rounded-lg border border-gray-800">
							<table class="w-full text-sm">
								<thead class="sticky top-0 bg-gray-900">
									<tr class="border-b border-gray-800 text-left text-gray-400">
										<th class="px-4 py-2 font-medium">Runda</th>
										<th class="px-4 py-2 font-medium">Plik</th>
									</tr>
								</thead>
								<tbody>
									{#each batchPreview as item}
										<tr class="border-b border-gray-800/80 text-gray-200">
											<td class="px-4 py-2 whitespace-nowrap">Runda {item.roundNumber}</td>
											<td class="px-4 py-2">{item.file.name}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						{#if batchImporting}
							<div class="rounded-lg border border-gray-800 bg-gray-800/30 p-4 text-sm text-gray-300">
								<p>Importowanie {batchProgress.current}/{batchProgress.total}: {batchProgress.fileName}</p>
								<div class="mt-2 h-2 overflow-hidden rounded-full bg-gray-800">
									<div class="h-full bg-blue-600 transition-all" style={`width: ${batchProgress.total ? (batchProgress.current / batchProgress.total) * 100 : 0}%`}></div>
								</div>
							</div>
						{/if}

						<Button on:click={executeBatchImport} disabled={batchImporting} class="w-full border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
							{#if batchImporting}
								<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
								Importowanie...
							{:else}
								<Upload class="mr-2 h-4 w-4" />
								Importuj {batchFiles.length} {batchFiles.length === 1 ? 'utwór' : 'utworów'} alfabetycznie
							{/if}
						</Button>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		<div class="space-y-8">
			{#each sortedRounds as round (round.id)}
				<Card.Root class="border border-gray-800 bg-gray-900">
					<Card.Header>
						<Card.Title class="text-white">Runda {round.round_number}</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div class="space-y-4">
								<h3 class="text-lg font-medium text-gray-300">Audio</h3>

								{#if songRounds[round.id]}
									<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
										<div class="mb-3 flex items-start justify-between gap-3">
											<div>
												<p class="font-medium text-gray-100">{songRounds[round.id].fileName}</p>
												<p class="text-xs text-gray-500">Dodano: {new Date(songRounds[round.id].uploadedAt).toLocaleString()}</p>
											</div>
											<Button on:click={() => deleteSong(round)} class="bg-red-600/70 hover:bg-red-700" size="sm">
												<Trash2 class="h-4 w-4" />
											</Button>
										</div>
										<audio src={songRounds[round.id].audioUrl} controls class="w-full"></audio>
									</div>
								{:else}
									<div class="flex h-52 items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-800/50">
										<div class="text-center">
											<Music class="mx-auto h-12 w-12 text-gray-500" />
											<p class="mt-2 text-sm text-gray-400">Nie załadowano żadnego utworu</p>
										</div>
									</div>
								{/if}

								<div class="flex flex-col gap-2">
									<input type="file" id="song-file-{round.id}" accept="audio/*" on:change={(event) => handleFileSelect(round.id, event)} class="hidden" />
									<label for="song-file-{round.id}" class="inline-flex cursor-pointer items-center justify-center rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 ring-offset-background transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
										<Upload class="mr-2 h-4 w-4" />
										Wybierz plik
									</label>

									{#if files[round.id]}
										<Button on:click={() => uploadSong(round)} disabled={uploading[round.id]} class="border border-gray-700 bg-gray-800 text-white hover:bg-gray-700">
											{#if uploading[round.id]}
												<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
												Przesyłanie...
											{:else}
												Prześlij {files[round.id].name}
											{/if}
										</Button>
									{/if}
								</div>
							</div>

							<div class="space-y-4">
								<h3 class="text-lg font-medium text-gray-300">Status</h3>
								<div class="rounded-lg border border-gray-800 bg-gray-800/30 p-4 text-sm">
									{#if songRounds[round.id]}
										<p class="text-green-400">Utwór gotowy do odtworzenia na dashboardzie.</p>
									{:else}
										<p class="text-yellow-400">Brak utworu. Runda nie będzie miała audio do odtworzenia.</p>
									{/if}
								</div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	</div>
</div>
