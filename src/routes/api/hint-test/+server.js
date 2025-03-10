import { json } from '@sveltejs/kit';

export async function POST({ request }) {
    try {
        const { titles } = await request.json();
        
        if (!titles || !Array.isArray(titles) || titles.length === 0) {
            return json({ error: 'Missing or invalid titles array' }, { status: 400 });
        }
        
        const results = [];
        
        // Process each title to generate a hint
        for (const title of titles) {
            // Process the answer to create the hint
            const words = title.split(' ');
            const hintWords = [];

            // Count actual characters to potentially reveal (excluding spaces)
            const nonSpaceChars = title.replace(/\s/g, '').length;

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
            for (let i = 0; i < title.length; i++) {
                if (title[i] !== ' ') {
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
            
            // Add this hint to results
            results.push({
                original: title,
                hint: maskedAnswer,
                revealed: charsToReveal,
                totalNonSpace: nonSpaceChars,
                percentage: (charsToReveal / nonSpaceChars * 100).toFixed(2) + '%'
            });
        }
        
        return json({ hints: results });
    } catch (error) {
        console.error('Error generating hints:', error);
        return json({ error: error.message }, { status: 500 });
    }
}