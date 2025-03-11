import { json } from '@sveltejs/kit';

export async function POST({ request, locals }) {
    const { supabase } = locals;

    try {
        const { content, roundId } = await request.json();

        if (!content || !roundId) {
            return json({ error: 'Missing required parameters' }, { status: 400 });
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

        // Prepare array of character positions to potentially reveal (excluding spaces)
        const allPositions = [];
        for (let i = 0; i < content.length; i++) {
            if (content[i] !== ' ') {
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
        return json({ error: error.message }, { status: 500 });
    }
}