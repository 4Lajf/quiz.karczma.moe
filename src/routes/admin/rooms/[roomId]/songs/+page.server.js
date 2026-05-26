//src/routes/admin/rooms/[roomId]/songs/+page.server.js
import { error } from '@sveltejs/kit';
import { validateRoomOwnership } from '$lib/server/ownership.js';

export const load = async ({ params, depends, locals: { supabase, user, profile } }) => {
	depends('songs');

	try {
		await validateRoomOwnership(supabase, params.roomId, user, profile);

		const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('id', params.roomId).single();

		if (roomError) throw roomError;

		if (room.type !== 'song') {
			throw error(404, { message: 'This route is only for song rooms' });
		}

		const { data: rounds, error: roundsError } = await supabase.from('quiz_rounds').select('*').eq('room_id', params.roomId).order('round_number', { ascending: false });

		if (roundsError) throw roundsError;

		return {
			room,
			rounds,
			user,
			profile
		};
	} catch (err) {
		console.error('Load error:', err);
		if (err.status) throw err;
		throw error(500, { message: 'Internal server error' });
	}
};
