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

        // Get existing screen images from correct_answers table
        const { data: correctAnswers, error: correctAnswersError } = await supabase
            .from('correct_answers')
            .select('*')
            .in('round_id', rounds.map(r => r.id));

        if (correctAnswersError) {
            console.error('Error fetching correct answers:', correctAnswersError);
        }

        const roundImages = {};

        // Process correct answers to extract image URLs
        if (correctAnswers && correctAnswers.length > 0) {
            for (const answer of correctAnswers) {
                // Find the round for this answer
                const round = rounds.find(r => r.id === answer.round_id);
                if (round && answer.image) {
                    // Use the round number as the key
                    roundImages[round.round_number] = {
                        filename: `round_${round.round_number}.jpg`, // Just for compatibility
                        url: answer.image
                    };
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