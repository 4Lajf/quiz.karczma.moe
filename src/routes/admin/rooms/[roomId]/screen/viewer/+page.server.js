// src/routes/admin/rooms/[roomId]/screen/viewer/+page.server.js
import { error } from '@sveltejs/kit';
import { validateRoomOwnership } from '$lib/server/ownership.js';

export const load = async ({ params, depends, locals: { supabase, user, profile } }) => {
    depends('screen');

    try {
        // Validate room ownership
        await validateRoomOwnership(supabase, params.roomId, user, profile);

        // Fetch room data
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', params.roomId)
            .single();

        if (roomError) {
            throw roomError;
        }

        // Verify this is a screen-type room
        if (room.type !== 'screen') {
            throw new Error('This route is only for screen-type rooms');
        }

        // Fetch rounds for this room
        const { data: rounds, error: roundsError } = await supabase
            .from('quiz_rounds')
            .select('*')
            .eq('room_id', params.roomId)
            .order('round_number', { ascending: true });

        if (roundsError) throw roundsError;

        const currentRound = rounds.find(r => r.id === room.current_round);

        // If no current round, return early
        if (!currentRound) {
            return {
                room,
                rounds,
                currentRound: null,
                screenImage: null
            };
        }

        // Look for image for the current round in the correct_answers table
        const { data: correctAnswer, error: correctAnswerError } = await supabase
            .from('correct_answers')
            .select('*')
            .eq('round_id', currentRound.id)
            .maybeSingle();

        let screenImage = null;

        if (correctAnswer && !correctAnswerError && correctAnswer.image) {
            screenImage = {
                filename: `round_${currentRound.round_number}.jpg`, // Just for compatibility
                url: correctAnswer.image
            };
        } else if (correctAnswerError) {
            console.error('Error fetching correct answer:', correctAnswerError);
        }

        return {
            room,
            rounds,
            currentRound,
            screenImage
        };
    } catch (error) {
        console.error('Load error:', error);
        throw error;
    }
};