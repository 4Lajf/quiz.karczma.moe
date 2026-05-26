<script>
	//src/routes/admin/rooms/[roomId]/songs/+page.svelte
	import { onMount, onDestroy } from 'svelte';
	import { invalidate, invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Music, Trash2, Upload } from 'lucide-svelte';
	import { canModifyRoom } from '$lib/client/roomSecurity.js';

	export let data;
	$: ({ supabase, room, rounds, user, profile } = data);

	let channel;
	let files = {};
	let uploading = {};

	const SONG_AUDIO_BUCKET = 'song-quiz-audio';
	const MAX_DATA_URL_SONG_BYTES = 8 * 1024 * 1024;

	$: sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);
	$: songRounds = room.settings?.songQuiz?.rounds || {};

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

	function fileToDataUrl(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
	}

	function handleFileSelect(roundId, event) {
		const selectedFile = event.target.files?.[0];
		if (!selectedFile) return;

		if (!selectedFile.type.startsWith('audio/')) {
			toast.error('Wybierz plik audio');
			event.target.value = '';
			return;
		}

		files[roundId] = selectedFile;
		files = { ...files };
	}

	async function uploadSong(round) {
		const file = files[round.id];
		if (!file) return;

		uploading[round.id] = true;
		uploading = { ...uploading };

		try {
			canModifyRoom(room, user, profile);

			let audioUrl = null;
			let audioPath = null;
			const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
			const storagePath = `${room.id}/${round.id}/${Date.now()}-${safeFileName}`;

			try {
				const { error: uploadError } = await supabase.storage.from(SONG_AUDIO_BUCKET).upload(storagePath, file, {
					cacheControl: '3600',
					upsert: true
				});

				if (uploadError) throw uploadError;

				const { data: publicUrlData } = supabase.storage.from(SONG_AUDIO_BUCKET).getPublicUrl(storagePath);
				audioUrl = publicUrlData.publicUrl;
				audioPath = storagePath;
			} catch (storageError) {
				if (file.size > MAX_DATA_URL_SONG_BYTES) {
					throw new Error(`Nie udało się wysłać do storage (${storageError.message}). Pliki powyżej 8 MB wymagają skonfigurowanego bucketu "${SONG_AUDIO_BUCKET}".`);
				}

				audioUrl = await fileToDataUrl(file);
			}

			const nextRounds = {
				...songRounds,
				[round.id]: {
					audioUrl,
					audioPath,
					fileName: file.name,
					contentType: file.type,
					uploadedAt: new Date().toISOString()
				}
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
