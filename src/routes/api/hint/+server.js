import { json } from '@sveltejs/kit';

export async function POST({ request, locals, fetch }) {
    const { supabase } = locals;

    try {
        const { roomId, roundId, playerName } = await request.json();

        if (!roomId || !roundId) {
            return json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch correct answers for the round
        const { data: correctAnswers, error: answersError } = await supabase
            .from('correct_answers')
            .select('content, hint')
            .eq('round_id', roundId);
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
        if (playerName) {
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
        }

        return json({ hint: maskedAnswer });
    } catch (error) {
        console.error('Error generating hint:', error);
        return json({ error: error.message }, { status: 500 });
    }
}