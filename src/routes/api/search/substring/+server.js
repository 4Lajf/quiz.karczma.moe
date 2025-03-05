// src/routes/api/search/substring/+server.js
import { json } from '@sveltejs/kit';
import { loadData } from '$lib/staticData';

function substringMatch(query, item, type = 'songs') {
    const normalizedQuery = query.toLowerCase();

    // Handle different data structures based on type
    if (type === 'anime') {
        // Check all normalized title fields for anime
        const matchInRomaji = item.normalizedRomajiTitle && item.normalizedRomajiTitle.includes(normalizedQuery);
        const matchInEnglish = item.normalizedEnglishTitle && item.normalizedEnglishTitle.includes(normalizedQuery);

        // Check in all normalized alt titles
        let matchInAlt = false;
        let matchedAltIndex = -1;
        if (item.normalizedAltTitles && item.normalizedAltTitles.length > 0) {
            for (let i = 0; i < item.normalizedAltTitles.length; i++) {
                if (item.normalizedAltTitles[i].includes(normalizedQuery)) {
                    matchInAlt = true;
                    matchedAltIndex = i;
                    break;
                }
            }
        }

        if (matchInRomaji || matchInEnglish || matchInAlt) {
            // Determine which title had the exact match
            const exactMatchRomaji = item.normalizedRomajiTitle === normalizedQuery;
            const exactMatchEnglish = item.normalizedEnglishTitle === normalizedQuery;
            const exactMatchAlt = matchedAltIndex >= 0 && item.normalizedAltTitles[matchedAltIndex] === normalizedQuery;

            // Determine which title starts with the query
            const startsWithRomaji = item.normalizedRomajiTitle && item.normalizedRomajiTitle.startsWith(normalizedQuery);
            const startsWithEnglish = item.normalizedEnglishTitle && item.normalizedEnglishTitle.startsWith(normalizedQuery);
            const startsWithAlt = matchedAltIndex >= 0 && item.normalizedAltTitles[matchedAltIndex].startsWith(normalizedQuery);

            // Find the best matching title (exact > starts with > contains)
            let bestMatchType = '';
            let bestMatchTitle = '';
            let bestMatchNormalizedTitle = '';

            if (exactMatchEnglish) {
                bestMatchType = 'english';
                bestMatchTitle = item.englishTitle;
                bestMatchNormalizedTitle = item.normalizedEnglishTitle;
            } else if (exactMatchRomaji) {
                bestMatchType = 'romaji';
                bestMatchTitle = item.romajiTitle;
                bestMatchNormalizedTitle = item.normalizedRomajiTitle;
            } else if (exactMatchAlt) {
                bestMatchType = 'alt';
                bestMatchTitle = item.altTitles[matchedAltIndex];
                bestMatchNormalizedTitle = item.normalizedAltTitles[matchedAltIndex];
            } else if (startsWithEnglish) {
                bestMatchType = 'english';
                bestMatchTitle = item.englishTitle;
                bestMatchNormalizedTitle = item.normalizedEnglishTitle;
            } else if (startsWithRomaji) {
                bestMatchType = 'romaji';
                bestMatchTitle = item.romajiTitle;
                bestMatchNormalizedTitle = item.normalizedRomajiTitle;
            } else if (startsWithAlt) {
                bestMatchType = 'alt';
                bestMatchTitle = item.altTitles[matchedAltIndex];
                bestMatchNormalizedTitle = item.normalizedAltTitles[matchedAltIndex];
            } else if (matchInEnglish) {
                bestMatchType = 'english';
                bestMatchTitle = item.englishTitle;
                bestMatchNormalizedTitle = item.normalizedEnglishTitle;
            } else if (matchInRomaji) {
                bestMatchType = 'romaji';
                bestMatchTitle = item.romajiTitle;
                bestMatchNormalizedTitle = item.normalizedRomajiTitle;
            } else if (matchInAlt) {
                bestMatchType = 'alt';
                bestMatchTitle = item.altTitles[matchedAltIndex];
                bestMatchNormalizedTitle = item.normalizedAltTitles[matchedAltIndex];
            }

            const matchInfo = {
                exactMatch: exactMatchRomaji || exactMatchEnglish || exactMatchAlt,
                startsWith: startsWithRomaji || startsWithEnglish || startsWithAlt,
                isSubstring: true,
                matchedInRomaji: matchInRomaji,
                matchedInEnglish: matchInEnglish,
                matchedInAlt: matchInAlt,
                matchedAltIndex: matchedAltIndex,
                bestMatchType: bestMatchType,
                bestMatchTitle: bestMatchTitle,
                bestMatchNormalizedTitle: bestMatchNormalizedTitle
            };

            // Calculate a score based on match quality and title type preference
            let score = 0;
            if (matchInfo.exactMatch) score = 100;
            else if (matchInfo.startsWith) score = 90;
            else score = 80;

            // Prioritize matches by title type (preference: English > Romaji > Alt)
            if (matchInEnglish) score += 3;
            if (matchInRomaji) score += 2;
            if (matchInAlt) score += 1;

            // Bonus for matching in multiple fields
            if ((matchInRomaji && matchInEnglish) ||
                (matchInRomaji && matchInAlt) ||
                (matchInEnglish && matchInAlt)) {
                score += 5;
            }

            return {
                matched: true,
                score,
                matchInfo
            };
        }
    } else {
        // Original logic for songs and artists
        const searchKey = type === 'songs' ? 'songName' : 'artist';

        // Check original value
        const originalMatch = item[searchKey].toLowerCase().includes(normalizedQuery);
        // Check normalized value
        const normalizedMatch = item.normalizedName.includes(normalizedQuery);

        if (originalMatch || normalizedMatch) {
            const matchInfo = {
                exactMatch: item[searchKey].toLowerCase() === normalizedQuery,
                startsWith: item[searchKey].toLowerCase().startsWith(normalizedQuery) ||
                    item.normalizedName.startsWith(normalizedQuery),
                isSubstring: originalMatch || normalizedMatch,
                matchedInNormalized: normalizedMatch,
                matchedInOriginal: originalMatch
            };

            // Calculate a score
            let score = 0;
            if (matchInfo.exactMatch) score = 100;
            else if (matchInfo.startsWith) score = 90;
            else if (matchInfo.isSubstring) score = 80;
            if (matchInfo.matchedInNormalized && matchInfo.matchedInOriginal) score += 5;

            return {
                matched: true,
                score,
                matchInfo
            };
        }
    }

    return { matched: false };
}

// Helper function to convert Typesense results to a format similar to substring search
function formatTypesenseResult(hit, type) {
    if (type === 'anime') {
        // Determine the best matching field based on the highlight
        const highlights = hit.highlights || [];
        let bestMatchType = '';
        let bestMatchTitle = '';
        let bestMatchNormalizedTitle = '';

        // Check which field was highlighted
        const highlightedField = highlights.length > 0 ? highlights[0].field : '';

        if (highlightedField.includes('normalizedEnglishTitle')) {
            bestMatchType = 'english';
            bestMatchTitle = hit.document.englishTitle;
            bestMatchNormalizedTitle = hit.document.normalizedEnglishTitle;
        } else if (highlightedField.includes('normalizedRomajiTitle')) {
            bestMatchType = 'romaji';
            bestMatchTitle = hit.document.romajiTitle;
            bestMatchNormalizedTitle = hit.document.normalizedRomajiTitle;
        } else if (highlightedField.includes('normalizedAltTitles')) {
            bestMatchType = 'alt';
            // We'd need to determine which alt title was matched - this is simplified
            bestMatchTitle = hit.document.altTitles.length > 0 ? hit.document.altTitles[0] : '';
            bestMatchNormalizedTitle = hit.document.normalizedAltTitles.length > 0 ? hit.document.normalizedAltTitles[0] : '';
        } else {
            // Default to English title if available, then Romaji, then first alt
            if (hit.document.englishTitle) {
                bestMatchType = 'english';
                bestMatchTitle = hit.document.englishTitle;
                bestMatchNormalizedTitle = hit.document.normalizedEnglishTitle;
            } else if (hit.document.romajiTitle) {
                bestMatchType = 'romaji';
                bestMatchTitle = hit.document.romajiTitle;
                bestMatchNormalizedTitle = hit.document.normalizedRomajiTitle;
            } else if (hit.document.altTitles.length > 0) {
                bestMatchType = 'alt';
                bestMatchTitle = hit.document.altTitles[0];
                bestMatchNormalizedTitle = hit.document.normalizedAltTitles[0];
            }
        }

        // Return a standardized format
        return {
            document: {
                id: hit.document.id,
                animeTitle: bestMatchTitle,
                matchType: bestMatchType,
                displayTitle: bestMatchTitle,
                romajiTitle: hit.document.romajiTitle,
                englishTitle: hit.document.englishTitle,
                altTitles: hit.document.altTitles,
                normalizedRomajiTitle: hit.document.normalizedRomajiTitle,
                normalizedEnglishTitle: hit.document.normalizedEnglishTitle,
                normalizedAltTitles: hit.document.normalizedAltTitles
            },
            highlight: {
                [bestMatchType === 'english' ? 'normalizedEnglishTitle' :
                    bestMatchType === 'romaji' ? 'normalizedRomajiTitle' : 'normalizedAltTitle']: {
                    matched_tokens: hit.highlights && hit.highlights.length > 0
                        ? hit.highlights[0].matched_tokens
                        : [],
                    snippet: hit.highlights && hit.highlights.length > 0
                        ? hit.highlights[0].snippet
                        : '',
                    value: hit.highlights && hit.highlights.length > 0
                        ? hit.highlights[0].value
                        : ''
                }
            },
            text_match: hit.text_match,
            text_match_info: {
                best_field_score: hit.text_match_info?.best_field_score || 0,
                best_field_weight: hit.text_match_info?.best_field_weight || 0,
                fields_matched: hit.text_match_info?.fields_matched || 0,
                tokens_matched: hit.highlights && hit.highlights.length > 0
                    ? hit.highlights[0].matched_tokens.length
                    : 0,
                typo_prefix_score: hit.text_match_info?.typo_prefix_score || 0,
                bestMatchType: bestMatchType,
                bestMatchTitle: bestMatchTitle
            }
        };
    } else {
        // For songs and artists, keep original format
        return hit;
    }
}

export async function GET({ url }) {
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type') || 'songs'; // 'songs', 'artists', or 'anime'

    if (!query) {
        return json({ hits: [] });
    }

    try {
        // Use the loadData function from the staticData module
        const { songs, artists, anime } = await loadData();
        let data;

        if (type === 'anime') {
            data = anime;
        } else if (type === 'artists') {
            data = artists;
        } else {
            data = songs;
        }

        // Perform substring matching
        const matches = data
            .map(item => {
                const match = substringMatch(query, item, type);
                if (match.matched) {
                    return {
                        ...item,
                        text_match: match.score,
                        text_match_info: match.matchInfo
                    };
                }
                return null;
            })
            .filter(Boolean);

        // Sort by match type first (exact > prefix > substring) and then by score
        matches.sort((a, b) => {
            const infoA = a.text_match_info;
            const infoB = b.text_match_info;

            // First, prioritize exact matches
            if (infoA.exactMatch && !infoB.exactMatch) return -1;
            if (!infoA.exactMatch && infoB.exactMatch) return 1;

            // Then prioritize prefix matches
            if (infoA.startsWith && !infoB.startsWith) return -1;
            if (!infoA.startsWith && infoB.startsWith) return 1;

            // Within the same match type, sort by score
            return b.text_match - a.text_match;
        });

        // Limit results
        const limitedMatches = matches.slice(0, 25);

        // Format the response based on type
        if (type === 'anime') {
            return json({
                hits: limitedMatches.map(item => {
                    // Use the best matching title based on the query
                    const matchInfo = item.text_match_info;
                    const displayTitle = matchInfo.bestMatchTitle;

                    // Create a document structure with all title information but highlighting the best match
                    const document = {
                        id: item.id,
                        animeTitle: displayTitle, // Use the best matching title as the primary display
                        displayTitle: displayTitle, // Additional field for clarity
                        matchType: matchInfo.bestMatchType, // Indicate which title type matched best
                        romajiTitle: item.romajiTitle,
                        englishTitle: item.englishTitle,
                        altTitles: item.altTitles,
                        normalizedRomajiTitle: item.normalizedRomajiTitle,
                        normalizedEnglishTitle: item.normalizedEnglishTitle,
                        normalizedAltTitles: item.normalizedAltTitles
                    };

                    // Create a custom highlight object for the best matching title
                    const highlight = {};
                    if (matchInfo.bestMatchType === 'romaji') {
                        highlight.normalizedRomajiTitle = {
                            matched_tokens: query.toLowerCase().split(' '),
                            snippet: document.normalizedRomajiTitle,
                            value: document.normalizedRomajiTitle
                        };
                    } else if (matchInfo.bestMatchType === 'english') {
                        highlight.normalizedEnglishTitle = {
                            matched_tokens: query.toLowerCase().split(' '),
                            snippet: document.normalizedEnglishTitle,
                            value: document.normalizedEnglishTitle
                        };
                    } else if (matchInfo.bestMatchType === 'alt') {
                        const altIdx = matchInfo.matchedAltIndex >= 0 ? matchInfo.matchedAltIndex : 0;
                        highlight.normalizedAltTitle = {
                            matched_tokens: query.toLowerCase().split(' '),
                            snippet: document.normalizedAltTitles[altIdx] || '',
                            value: document.normalizedAltTitles[altIdx] || ''
                        };
                    }

                    return {
                        document,
                        highlight,
                        text_match: item.text_match,
                        text_match_info: matchInfo
                    };
                })
            });
        } else {
            // Original format for songs and artists
            return json({
                hits: limitedMatches.map(item => ({
                    document: {
                        [type === 'songs' ? 'songName' : 'artist']: item[type === 'songs' ? 'songName' : 'artist'],
                        normalizedName: item.normalizedName
                    },
                    text_match: item.text_match,
                    text_match_info: item.text_match_info
                }))
            });
        }
    } catch (error) {
        console.error('Search error:', error);
        return json({ error: 'Search failed' }, { status: 500 });
    }
}