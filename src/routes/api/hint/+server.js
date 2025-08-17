import { json } from '@sveltejs/kit';

export async function POST({ request, locals, fetch }) {
    const { supabase, user, profile } = locals;

    try {
        const { roomId, roundId, playerName } = await request.json();

        if (!roomId || !roundId) {
            return json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // For authenticated users, validate room ownership
        if (user && profile) {
            try {
                const { validateRoomOwnership } = await import('$lib/server/ownership.js');
                await validateRoomOwnership(supabase, roomId, user, profile);
            } catch (error) {
                // If ownership validation fails, continue with public access check
                console.log('Ownership validation failed, checking public access:', error.message);
            }
        }

        // For all users (authenticated or not), validate that room and round exist and are active
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('id, is_active, current_round')
            .eq('id', roomId)
            .single();

        if (roomError || !room) {
            return json({ error: 'Room not found' }, { status: 404 });
        }

        if (!room.is_active) {
            return json({ error: 'Room is not active' }, { status: 403 });
        }

        // Validate that the requested round is the current round
        if (room.current_round !== roundId) {
            return json({ error: 'Invalid round' }, { status: 400 });
        }

        // Fetch correct answers for the round
        const { data: correctAnswers, error: answersError } = await supabase
            .from('correct_answers')
            .select('content, hint')
            .eq('round_id', roundId)
            .order('created_at', { ascending: true });
        if (answersError) throw answersError;

        if (!correctAnswers || correctAnswers.length === 0) {
            return json({ error: 'No correct answers found for this round' }, { status: 404 });
        }

        const correctAnswer = correctAnswers[0];

        // Check if this answer has a pre-calculated hint
        let maskedAnswer;
        if (correctAnswer.hint) {
            // Use the pre-calculated hint
            maskedAnswer = correctAnswer.hint;
        } else {
            // Call the generate-hint API to create a new hint
            const generateResponse = await fetch('/api/generate-hint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: correctAnswer.content,
                    roundId: roundId
                })
            });
            if (!generateResponse.ok) {
                throw new Error('Failed to generate hint');
            }

            const hintData = await generateResponse.json();
            maskedAnswer = hintData.hint;
        }

        // Record hint usage in the hint_usages table
        // Note: This requires the hint_usages table to have RLS policies that allow
        // unauthenticated inserts for active rooms, or we need to use service role
        if (playerName) {
            try {
                const { error: hintError } = await supabase
                    .from('hint_usages')
                    .upsert({
                        room_id: roomId,
                        round_id: roundId,
                        player_name: playerName
                    }, {
                        onConflict: 'player_name, round_id',
                        ignoreDuplicates: true
                    });

                if (hintError) {
                    console.error('Error recording hint usage:', hintError);
                    // Continue anyway since the hint functionality is more important than recording usage
                }
            } catch (error) {
                console.error('Error recording hint usage:', error);
                // Continue anyway since the hint functionality is more important than recording usage
            }
        }

        return json({ hint: maskedAnswer });
    } catch (error) {
        console.error('Error generating hint:', error);
        if (error.status) {
            return json({ error: error.body.message }, { status: error.status });
        }
        return json({ error: error.message }, { status: 500 });
    }
}