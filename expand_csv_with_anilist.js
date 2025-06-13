import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limiting configuration
const RATE_LIMIT_DELAY = 2000; // 1 second between requests
const MAX_RETRIES = 3;

// AniList GraphQL endpoint
const ANILIST_API_URL = 'https://graphql.anilist.co';

// GraphQL query to get anime info
const ANIME_QUERY = `
query ($search: String) {
  Media (search: $search, type: ANIME) {
    id
    title {
      romaji
      english
      native
    }
    genres
    tags {
      name
      rank
    }
  }
}
`;

// Function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to make AniList API request with retry logic
async function queryAniList(animeName, retryCount = 0) {
    try {
        const response = await fetch(ANILIST_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: ANIME_QUERY,
                variables: { search: animeName }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.errors) {
            console.error(`GraphQL errors for "${animeName}":`, data.errors);
            return null;
        }

        return data.data?.Media || null;
    } catch (error) {
        console.error(`Error querying AniList for "${animeName}":`, error.message);

        if (retryCount < MAX_RETRIES) {
            console.log(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            await delay(RATE_LIMIT_DELAY * 2); // Double delay on retry
            return queryAniList(animeName, retryCount + 1);
        }

        return null;
    }
}

// Function to parse CSV line (simple CSV parser)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current.trim());
    return result;
}

// Function to escape CSV field
function escapeCSVField(field) {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
}

// Function to save CSV data
function saveCSV(outputPath, header, rows, animeCache, jpNameIndex) {
    const expandedRows = [header];

    for (const row of rows) {
        const animeName = row[jpNameIndex];
        const animeInfo = animeCache.get(animeName) || { genres: '', tags: '' };

        const expandedRow = [...row, animeInfo.genres, animeInfo.tags];
        expandedRows.push(expandedRow);
    }

    const csvOutput = expandedRows
        .map(row => row.map(field => escapeCSVField(String(field))).join(','))
        .join('\n');

    fs.writeFileSync(outputPath, csvOutput, 'utf-8');
    return expandedRows.length;
}

// Main function
async function expandCSVWithAniListData() {
    try {
        console.log('Reading CSV file...');
        const csvPath = path.join(__dirname, 'static', 'data', 'oped2.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim());

        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }

        // Parse header
        const header = parseCSVLine(lines[0]);
        const jpNameIndex = header.indexOf('JPName');

        if (jpNameIndex === -1) {
            throw new Error('JPName column not found in CSV');
        }

        console.log(`Found JPName column at index ${jpNameIndex}`);

        // Check if expanded CSV already exists
        const outputPath = path.join(__dirname, 'oped2_expanded.csv');
        const existingData = new Map();
        let newHeader = [...header, 'Genres', 'Tags'];
        let genresIndex = -1;
        let tagsIndex = -1;

        if (fs.existsSync(outputPath)) {
            console.log('Found existing expanded CSV, reading existing data...');
            const existingContent = fs.readFileSync(outputPath, 'utf-8');
            const existingLines = existingContent.split('\n').filter(line => line.trim());

            if (existingLines.length > 0) {
                const existingHeader = parseCSVLine(existingLines[0]);
                genresIndex = existingHeader.indexOf('Genres');
                tagsIndex = existingHeader.indexOf('Tags');
                newHeader = existingHeader; // Use existing header structure

                // Parse existing data
                for (let i = 1; i < existingLines.length; i++) {
                    const row = parseCSVLine(existingLines[i]);
                    if (row.length > jpNameIndex) {
                        const animeName = row[jpNameIndex];
                        const genres = genresIndex >= 0 ? (row[genresIndex] || '') : '';
                        const tags = tagsIndex >= 0 ? (row[tagsIndex] || '') : '';
                        existingData.set(animeName, { genres, tags });
                    }
                }
                console.log(`Loaded existing data for ${existingData.size} anime`);
            }
        } else {
            console.log('No existing expanded CSV found, will create new one');
        }

        // Parse all rows from original CSV
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            if (row.length > jpNameIndex) {
                rows.push(row);
            }
        }

        console.log(`Processing ${rows.length} rows...`);

        // Get unique anime names that need data
        const allUniqueAnimeNames = [...new Set(rows.map(row => row[jpNameIndex]))];
        const animeNeedingData = allUniqueAnimeNames.filter(animeName => {
            const existing = existingData.get(animeName);
            return !existing || (!existing.genres && !existing.tags) || (existing.genres.trim() === '' && existing.tags.trim() === '');
        });

        console.log(`Found ${allUniqueAnimeNames.length} unique anime names`);
        console.log(`${animeNeedingData.length} anime need data fetching`);
        console.log(`${allUniqueAnimeNames.length - animeNeedingData.length} anime already have data`);

        // Cache for anime data (start with existing data)
        const animeCache = new Map(existingData);

        // Query AniList for anime that need data
        if (animeNeedingData.length === 0) {
            console.log('All anime already have data, skipping API calls');
        } else {
            console.log(`Fetching data for ${animeNeedingData.length} anime...`);
            console.log('CSV will be saved after each successful API call to preserve progress');
        }

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < animeNeedingData.length; i++) {
            const animeName = animeNeedingData[i];
            const progress = `[${i + 1}/${animeNeedingData.length}]`;
            console.log(`${progress} Processing: ${animeName}`);

            const animeData = await queryAniList(animeName);
            let dataUpdated = false;

            if (animeData) {
                // Extract genres
                const genres = animeData.genres || [];

                // Extract tags with rank > 75
                const highRankTags = (animeData.tags || [])
                    .filter(tag => tag.rank > 75)
                    .map(tag => tag.name);

                animeCache.set(animeName, {
                    genres: genres.join('; '),
                    tags: highRankTags.join('; ')
                });

                console.log(`  Found ${genres.length} genres and ${highRankTags.length} high-rank tags`);
                dataUpdated = true;
                successCount++;
            } else {
                animeCache.set(animeName, {
                    genres: '',
                    tags: ''
                });
                console.log(`  No data found`);
                dataUpdated = true;
                errorCount++;
            }

            // Save CSV after each successful update
            if (dataUpdated) {
                try {
                    const totalRows = saveCSV(outputPath, newHeader, rows, animeCache, jpNameIndex);
                    console.log(`  ✓ CSV updated (${totalRows} total rows) | Success: ${successCount}, No data: ${errorCount}`);
                } catch (saveError) {
                    console.error(`  ✗ Failed to save CSV: ${saveError.message}`);
                    // Don't increment error count for save errors, as the API call might have succeeded
                }
            }

            // Rate limiting
            if (i < animeNeedingData.length - 1) {
                await delay(RATE_LIMIT_DELAY);
            }
        }

        // Final save to ensure all data is written (in case no new data was fetched)
        if (animeNeedingData.length === 0) {
            console.log('Ensuring final CSV is up to date...');
            const totalRows = saveCSV(outputPath, newHeader, rows, animeCache, jpNameIndex);
            console.log(`Final CSV saved with ${totalRows} total rows`);
        }

        console.log(`\n✓ Process completed!`);
        console.log(`Expanded CSV location: ${outputPath}`);
        console.log(`Total unique anime: ${allUniqueAnimeNames.length}`);
        console.log(`Anime that needed data fetching: ${animeNeedingData.length}`);
        console.log(`Anime with existing data: ${allUniqueAnimeNames.length - animeNeedingData.length}`);
        if (animeNeedingData.length > 0) {
            console.log(`API Results - Success: ${successCount}, No data found: ${errorCount}`);
        }
        console.log(`Total anime with data in cache: ${animeCache.size}`);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}
expandCSVWithAniListData();
