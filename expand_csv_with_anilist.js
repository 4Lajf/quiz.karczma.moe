import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limiting configuration
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
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
        
        // Add new columns to header
        const newHeader = [...header, 'Genres', 'Tags'];
        
        // Parse all rows
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            if (row.length > jpNameIndex) {
                rows.push(row);
            }
        }

        console.log(`Processing ${rows.length} rows...`);
        
        // Get unique anime names
        const uniqueAnimeNames = [...new Set(rows.map(row => row[jpNameIndex]))];
        console.log(`Found ${uniqueAnimeNames.length} unique anime names`);
        
        // Cache for anime data
        const animeCache = new Map();
        
        // Query AniList for each unique anime
        for (let i = 0; i < uniqueAnimeNames.length; i++) {
            const animeName = uniqueAnimeNames[i];
            console.log(`Processing ${i + 1}/${uniqueAnimeNames.length}: ${animeName}`);
            
            const animeData = await queryAniList(animeName);
            
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
            } else {
                animeCache.set(animeName, {
                    genres: '',
                    tags: ''
                });
                console.log(`  No data found`);
            }
            
            // Rate limiting
            if (i < uniqueAnimeNames.length - 1) {
                await delay(RATE_LIMIT_DELAY);
            }
        }
        
        console.log('Building expanded CSV...');
        
        // Build expanded CSV content
        const expandedRows = [newHeader];
        
        for (const row of rows) {
            const animeName = row[jpNameIndex];
            const animeInfo = animeCache.get(animeName) || { genres: '', tags: '' };
            
            const expandedRow = [...row, animeInfo.genres, animeInfo.tags];
            expandedRows.push(expandedRow);
        }
        
        // Convert to CSV string
        const csvOutput = expandedRows
            .map(row => row.map(field => escapeCSVField(String(field))).join(','))
            .join('\n');
        
        // Write expanded CSV
        const outputPath = path.join(__dirname, 'oped2_expanded.csv');
        fs.writeFileSync(outputPath, csvOutput, 'utf-8');
        
        console.log(`\nExpanded CSV saved to: ${outputPath}`);
        console.log(`Added genres and tags data for ${animeCache.size} unique anime`);
        console.log(`Total rows in expanded CSV: ${expandedRows.length}`);
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    expandCSVWithAniListData();
}

export { expandCSVWithAniListData };
