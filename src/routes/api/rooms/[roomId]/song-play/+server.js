import { json, error } from '@sveltejs/kit';
import { validateRoomOwnership } from '$lib/server/ownership.js';

const PLAY_DELAY_MS = 2000;

export const POST = async ({ request, params, locals: { supabase, user, profile } }) => {
	await validateRoomOwnership(supabase, params.roomId, user, profile);

	const body = await request.json().catch(() => ({}));
	const { roundId, phase = 'play', startOffsetMs, sampleType } = body;

	if (phase === 'stop') {
		// Stop clears playback state without needing a roundId
	} else if (!roundId) {
		throw error(400, { message: 'Missing roundId' });
	}
	if (phase !== 'prepare' && phase !== 'play' && phase !== 'stop') {
		throw error(400, { message: 'Invalid phase' });
	}
	if (startOffsetMs !== undefined && (typeof startOffsetMs !== 'number' || !Number.isFinite(startOffsetMs) || startOffsetMs < 0)) {
		throw error(400, { message: 'Invalid startOffsetMs' });
	}

	const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('id', params.roomId).single();
	if (roomError) throw error(500, { message: roomError.message });

	if (room.type !== 'song') {
		throw error(400, { message: 'Song playback is only available for song rooms' });
	}

	const songQuiz = room.settings?.songQuiz || {};

	if (phase !== 'stop') {
		const selectedSong = songQuiz.rounds?.[roundId];
		if (!selectedSong?.audioUrl) {
			throw error(400, { message: 'No audio uploaded for this round' });
		}
	}

	const nowMs = Date.now();
	let nextSongQuiz;

	// startOffsetMs / sampleType, when provided, override what was previously
	// stored. Otherwise we keep whatever the prepare phase last set.
	const resolvedStartOffsetMs = startOffsetMs !== undefined ? Math.round(startOffsetMs) : (songQuiz.startOffsetMs ?? 0);
	const resolvedSampleType = sampleType !== undefined ? sampleType : (songQuiz.sampleType ?? null);

	if (phase === 'stop') {
		nextSongQuiz = {
			...songQuiz,
			playIssuedAt: null,
			playAt: null,
			playToken: null,
			playDelayMs: null,
			stoppedAt: new Date(nowMs).toISOString(),
			stopToken: `stop-${nowMs}`
		};
	} else if (phase === 'prepare') {
		nextSongQuiz = {
			...songQuiz,
			activeRoundId: roundId,
			preparedAt: new Date(nowMs).toISOString(),
			prepareToken: `${roundId}-${nowMs}`,
			playIssuedAt: null,
			playAt: null,
			playToken: null,
			playDelayMs: null,
			startOffsetMs: resolvedStartOffsetMs,
			sampleType: resolvedSampleType
		};
	} else {
		const playAtMs = nowMs + PLAY_DELAY_MS;
		nextSongQuiz = {
			...songQuiz,
			activeRoundId: roundId,
			playIssuedAt: new Date(nowMs).toISOString(),
			playAt: new Date(playAtMs).toISOString(),
			playDelayMs: PLAY_DELAY_MS,
			playToken: `${roundId}-${nowMs}`,
			startOffsetMs: resolvedStartOffsetMs,
			sampleType: resolvedSampleType
		};
	}

	const settings = {
		...(room.settings || {}),
		songQuiz: nextSongQuiz
	};

	const { error: updateError } = await supabase.from('rooms').update({ settings }).eq('id', room.id);
	if (updateError) throw error(500, { message: updateError.message });

	return json({
		settings,
		phase,
		serverNow: nowMs,
		playAt: nextSongQuiz.playAt,
		playDelayMs: nextSongQuiz.playDelayMs ?? null,
		prepareToken: nextSongQuiz.prepareToken ?? null,
		playToken: nextSongQuiz.playToken ?? null,
		stopToken: nextSongQuiz.stopToken ?? null,
		startOffsetMs: nextSongQuiz.startOffsetMs ?? 0,
		sampleType: nextSongQuiz.sampleType ?? null
	});
};
