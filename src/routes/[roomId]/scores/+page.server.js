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

        return {
            room
        };
    } catch (err) {
        console.error('Error loading room:', err);
        throw error(404, { message: 'Not found' });
    }
}