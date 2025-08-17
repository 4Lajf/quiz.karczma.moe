//src/routes/admin/rooms/[roomId]/answers
import { error } from '@sveltejs/kit';
import { validateRoomOwnership } from '$lib/server/ownership.js';

export const load = async ({ params, depends, locals: { supabase, user, profile } }) => {
    depends('answers');

    try {
        // Validate room ownership
        await validateRoomOwnership(supabase, params.roomId, user, profile);

        // Fetch room data
        const { data: rooms, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', params.roomId)
            .single();

        if (roomError) {
            throw roomError;
        }

        // Fetch rounds for this room
        const { data: rounds, error: roundsError } = await supabase
            .from('quiz_rounds')
            .select('*')
            .eq('room_id', params.roomId)
            .order('round_number', { ascending: false });

        if (roundsError) throw roundsError;

        const currentRound = rounds.find(r => r.id === rooms.current_round) || rounds[0];

        return {
            room: rooms,
            rounds,
            currentRound
        };
    } catch (error) {
        console.error('Load error:', error);
        throw error;
    }
};