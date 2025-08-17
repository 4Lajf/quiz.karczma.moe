import { json } from '@sveltejs/kit';

export async function POST({ request, locals }) {
    const { supabase, user, profile } = locals;

    try {
        const { content, roundId } = await request.json();

        if (!content || !roundId) {
            return json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // For authenticated users, validate round ownership
        if (user && profile) {
            try {
                const { validateRoundOwnership } = await import('$lib/server/ownership.js');
                await validateRoundOwnership(supabase, roundId, user, profile);
            } catch (error) {
                // If ownership validation fails, continue with public access check
                console.log('Ownership validation failed, checking public access:', error.message);
            }
        }

        // For all users (authenticated or not), validate that round exists and belongs to an active room
        const { data: round, error: roundError } = await supabase
            .from('quiz_rounds')
            .select(`
                id,
                rooms!quiz_rounds_room_id_fkey (
                    id,
                    is_active
                )
            `)
            .eq('id', roundId)
            .single();
        console.log(round, roundError)
        console.log(content, roundId)

        if (roundError || !round) {
            return json({ error: 'Round not found' }, { status: 404 });
        }

        if (!round.rooms.is_active) {
            return json({ error: 'Room is not active' }, { status: 403 });
        }

        // Process the answer to create the hint
        const words = content.split(' ');
        const hintWords = [];

        // Count actual characters to potentially reveal (excluding spaces)
        const nonSpaceChars = content.replace(/\s/g, '').length;

        // Calculate characters to reveal (balanced approach)
        let charsToReveal;
        if (nonSpaceChars <= 1) {
            // Special case for single-character titles
            charsToReveal = 0;
        } else if (nonSpaceChars <= 3) {
            // Special case for very short titles (2-3 chars)
            charsToReveal = 1;
        } else if (nonSpaceChars <= 5) {
            // Special case for short titles (4-5 chars)
            charsToReveal = 2;
        } else {
            // Length  Chars   Percentage
            // 3       1       33.3%
            // 5       2       40.0%
            // 10      4       40.0%
            // 20      6       30.0%
            // 40      7       17.5%
            // 100     9        9.0%
            charsToReveal = Math.ceil(2.0 * Math.log(nonSpaceChars) + 1);

            // Add a safety cap to ensure we never reveal too much
            const maxRevealPercentage = 0.3; // Never reveal more than 30%
            const percentageCap = Math.floor(nonSpaceChars * maxRevealPercentage);
            charsToReveal = Math.min(charsToReveal, percentageCap);
        }

        console.log(`Title length: ${nonSpaceChars}, revealing: ${charsToReveal} characters`);

        const isAlphaNumeric = (ch) => /[A-Za-z0-9]/.test(ch);

        // Process each word
        for (const word of words) {
            if (word.length === 0) {
                hintWords.push('');
                continue;
            }

            // For very short words (1-2 chars), handle per-character masking
            if (word.length <= 2) {
                const masked = word
                    .split('')
                    .map((ch, idx) => {
                        if (!isAlphaNumeric(ch)) {
                            return '•';
                        }
                        return Math.random() < 0.3 ? ch : '_';
                    })
                    .join('');
                hintWords.push(masked);
                continue;
            }

            // For longer words, reveal characters based on the calculated amount
            let revealedChars = 0;
            const wordChars = word.split('');
            const maskedChars = wordChars.map((char, index) => {
                // Non-alphanumeric characters are replaced with a bullet
                if (!isAlphaNumeric(char)) {
                    return '•';
                }

                // Reveal alphanumeric characters probabilistically up to the cap
                // console.log(`Revaling char ${char}`)
                if (revealedChars < charsToReveal && Math.random() < 0.3) {
                    revealedChars++;
                    // console.log('passed')
                    return char;
                }
                // console.log('failed')
                return '_';
            });

            hintWords.push(maskedChars.join(''));
        }

        // Join words with spaces for the final hint
        const maskedAnswer = hintWords.join(' ');

        // For non-empty roundId, update the database with this hint for future use
        if (roundId) {
            try {
                // Find the correct answer entry by content and round_id
                const { data: answerData, error: findError } = await supabase
                    .from('correct_answers')
                    .select('id')
                    .eq('content', content)
                    .eq('round_id', roundId)
                    .single();

                if (!findError && answerData) {
                    await supabase
                        .from('correct_answers')
                        .update({ hint: maskedAnswer })
                        .eq('id', answerData.id);
                } else {
                    // console.error('Failed to find answer entry for hint update:', findError);
                }
            } catch (updateError) {
                console.error('Failed to update answer with generated hint:', updateError);
                // Continue anyway since we already have the hint for current use
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