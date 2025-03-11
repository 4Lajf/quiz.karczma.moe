import { error } from '@sveltejs/kit';

export async function load({ params, locals }) {
    const { supabase } = locals;
    const { roomId } = params;

    try {
        // Fetch room info
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (roomError) throw roomError;

        if (!room) {
            throw new Error('Room not found');
        }

        // Fetch all rounds for this room
        const { data: rounds, error: roundsError } = await supabase
            .from('quiz_rounds')
            .select('*')
            .eq('room_id', roomId)
            .order('round_number', { ascending: true });

        if (roundsError) throw roundsError;

        return {
            room,
            rounds: rounds || []
        };
    } catch (err) {
        console.error('Error loading room or rounds:', err);
        throw error(404, { message: 'Not found' });
    }
}