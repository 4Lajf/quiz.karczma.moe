import { json } from '@sveltejs/kit';

export async function POST({ request, locals }) {
    const { supabase } = locals;

    try {
        const { roomId, roundId, playerName } = await request.json();

        if (!roomId || !roundId || !playerName) {
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

        // Select a random correct answer
        const correctAnswer = correctAnswers[0];
        
        // Check if this answer has a pre-calculated hint
        let maskedAnswer;
        if (correctAnswer.hint) {
            // Use the pre-calculated hint
            maskedAnswer = correctAnswer.hint;
        } else {
            // Fallback to generating a hint for legacy entries without pre-calculated hints
            
            // Process the answer to create the hint
            const words = correctAnswer.content.split(' ');
            const hintWords = [];

            // Count actual characters to potentially reveal (excluding spaces)
            const nonSpaceChars = correctAnswer.content.replace(/\s/g, '').length;

            // Calculate characters to reveal (balanced approach)
            let charsToReveal;
            if (nonSpaceChars <= 1) {
                // Special case for single-character titles
                charsToReveal = 1;
            } else if (nonSpaceChars <= 2) {
                // Special case for two-character titles
                charsToReveal = 1;
            } else {
                // Logarithmic scaling for all other lengths
                // Formula: 1.6 * ln(length + 1)
                // This creates a smooth curve that reveals:
                // - 3 chars for a 3-letter word
                // - 4 chars for a 10-letter word
                // - 6 chars for a 25-letter word 
                // - 7 chars for a 50-letter word
                // - 8 chars for a 100-letter word
                charsToReveal = Math.ceil(1.6 * Math.log(nonSpaceChars + 1));

                // Add a safety cap to ensure we never reveal too much
                const maxRevealPercentage = 0.35; // Never reveal more than 35%
                const percentageCap = Math.floor(nonSpaceChars * maxRevealPercentage);
                charsToReveal = Math.min(charsToReveal, percentageCap);

                // Ensure we always reveal at least one character
                charsToReveal = Math.max(1, charsToReveal);
            }

            console.log(`Title length: ${nonSpaceChars}, revealing: ${charsToReveal} characters`);

            // Prepare array of character positions to potentially reveal (excluding spaces)
            const allPositions = [];
            for (let i = 0; i < correctAnswer.content.length; i++) {
                if (correctAnswer.content[i] !== ' ') {
                    allPositions.push(i);
                }
            }

            // Randomly select positions to reveal
            const positionsToReveal = [];
            while (positionsToReveal.length < charsToReveal && allPositions.length > 0) {
                const randomIndex = Math.floor(Math.random() * allPositions.length);
                positionsToReveal.push(allPositions[randomIndex]);
                allPositions.splice(randomIndex, 1);
            }

            // Process each word
            let currentPos = 0;
            for (const word of words) {
                let hintWord = '';

                for (let i = 0; i < word.length; i++) {
                    const globalPos = currentPos + i;
                    const char = word[i];

                    if (positionsToReveal.includes(globalPos)) {
                        // Reveal this character
                        hintWord += char;
                    } else if (/[a-zA-Z0-9]/.test(char)) {
                        // Replace alphanumeric characters with underscore
                        hintWord += '_';
                    } else {
                        // Replace special characters with a symbol
                        hintWord += '•';
                    }
                }

                hintWords.push(hintWord);
                currentPos += word.length + 1; // +1 for the space
            }

            // Join words with spaces for the final hint
            maskedAnswer = hintWords.join(' ');
            
            // Optionally update the database with this generated hint for future use
            try {
                await supabase
                    .from('correct_answers')
                    .update({ hint: maskedAnswer })
                    .eq('id', correctAnswer.id);
            } catch (updateError) {
                console.error('Failed to update answer with generated hint:', updateError);
                // Continue anyway since we already have the hint for current use
            }
        }

        // Record hint usage in the hint_usages table
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

        if (hintError) throw hintError;

        return json({ hint: maskedAnswer });
    } catch (error) {
        console.error('Error generating hint:', error);
        return json({ error: error.message }, { status: 500 });
    }
}