//src/routes/admin/rooms/[roomId]/screen/answers/+page.server.js
//src/routes/admin/rooms/[roomId]/screen/answers/+page.server.js
export const load = async ({ params, depends, locals: { supabase } }) => {
    depends('answers');

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
            .order('round_number', { ascending: false });

        if (roundsError) throw roundsError;

        const currentRound = rounds.find(r => r.id === room.current_round) || rounds[0];

        // Get existing screen images for each round
        const { data: screenImages, error: imagesError } = await supabase
            .storage
            .from('screens')
            .list(`quiz/${params.roomId}`);

        const roundImages = {};

        if (screenImages && !imagesError) {
            for (const image of screenImages) {
                // Parse round number from filename (assuming format like round_1.jpg)
                const match = image.name.match(/round_(\d+)\.\w+$/);
                if (match && match[1]) {
                    const roundNumber = parseInt(match[1]);

                    // Get signed URL for the image instead of public URL
                    const { data: { signedUrl }, error: signedUrlError } = await supabase
                        .storage
                        .from('screens')
                        .createSignedUrl(`quiz/${params.roomId}/${image.name}`, 60 * 60); // 1 hour expiry

                    if (!signedUrlError && signedUrl) {
                        roundImages[roundNumber] = {
                            filename: image.name,
                            url: signedUrl
                        };
                    } else {
                        console.error('Error getting signed URL:', signedUrlError);
                    }
                }
            }
        }

        // Fetch player answers for the current round
        const { data: playerAnswers, error: answersError } = await supabase
            .from('answers')
            .select('id, player_name, content, created_at, extra_fields, answer_status, potential_points')
            .eq('room_id', room.id)
            .eq('round_id', currentRound.id)
            .order('created_at', { ascending: true });

        if (answersError) {
            console.error('Error fetching player answers:', answersError);
        }

        return {
            room,
            rounds,
            currentRound,
            roundImages,
            playerAnswers: playerAnswers || []
        };
    } catch (error) {
        console.error('Load error:', error);
        throw error;
    }
};