// src/routes/screen/[roomId]/+page.server.js
export const load = async ({ params, depends, locals: { supabase } }) => {
    depends('screen');

    try {
        // Fetch room data
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', params.roomId)
            .single();

        if (roomError) throw roomError;

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

        // Look for image for the current round
        const { data: screenImages, error: imagesError } = await supabase
            .storage
            .from('screens')
            .list(`quiz/${params.roomId}`);

        let screenImage = null;

        if (screenImages && !imagesError) {
            // Look for round_X.* where X is the round number
            const roundImage = screenImages.find(img =>
                img.name.startsWith(`round_${currentRound.round_number}.`)
            );

            if (roundImage) {
                // Use createSignedUrl instead of getPublicUrl
                const { data: { signedUrl }, error: signedUrlError } = await supabase
                    .storage
                    .from('screens')
                    .createSignedUrl(`quiz/${params.roomId}/${roundImage.name}`, 60 * 60); // 1 hour expiry

                if (!signedUrlError && signedUrl) {
                    screenImage = {
                        filename: roundImage.name,
                        url: signedUrl
                    };
                } else {
                    console.error('Error getting signed URL:', signedUrlError);
                }
            }
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