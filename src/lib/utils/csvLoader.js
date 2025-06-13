/**
 * CSV loader utility for client-side CSV parsing
 * Used to load metadata for local files from the oped2.csv file
 */

/**
 * Parse a CSV line handling quoted values
 * @param {string} line - CSV line to parse
 * @returns {string[]} - Array of parsed values
 */
function parseCsvLine(line) {
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

/**
 * Parse CSV content into song objects
 * @param {string} csvContent - Raw CSV content
 * @returns {Object[]} - Array of song objects
 */
export function parseCsvContent(csvContent) {
  try {
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }
    
    // Parse header
    const headers = parseCsvLine(lines[0]);
    const songs = [];
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      if (values.length >= headers.length) {
        const song = {};
        headers.forEach((header, index) => {
          song[header] = values[index] || '';
        });
        
        // Only include songs that have required fields
        if (song.FileName && song.JPName && song.difficulty) {
          songs.push(song);
        }
      }
    }
    
    return songs;
  } catch (error) {
    console.error('Error parsing CSV content:', error);
    throw error;
  }
}

/**
 * Load CSV data from the server
 * @returns {Promise<Object[]>} - Array of song objects
 */
export async function loadCsvData() {
  try {
    const response = await fetch('/data/oped2.csv');
    if (!response.ok) {
      throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
    }

    const csvContent = await response.text();
    return parseCsvContent(csvContent);
  } catch (error) {
    console.error('Error loading CSV data:', error);
    throw error;
  }
}

/**
 * Create a lookup map from filename to song metadata
 * @param {Object[]} songs - Array of song objects
 * @returns {Map<string, Object>} - Map from filename to song object
 */
export function createFilenameLookup(songs) {
  const lookup = new Map();
  
  songs.forEach(song => {
    if (song.FileName) {
      // Store by exact filename
      lookup.set(song.FileName, song);
      
      // Also store by filename without extension for flexibility
      const nameWithoutExt = song.FileName.replace(/\.[^/.]+$/, '');
      lookup.set(nameWithoutExt, song);
    }
  });
  
  return lookup;
}

/**
 * Match local files with CSV metadata
 * @param {Object[]} localFiles - Array of local file objects
 * @param {Object[]} csvData - Array of CSV song objects
 * @returns {Object[]} - Array of matched song objects with local file info
 */
export function matchFilesWithMetadata(localFiles, csvData) {
  const lookup = createFilenameLookup(csvData);
  const matchedSongs = [];
  
  localFiles.forEach(file => {
    // Try to match by filename (with and without extension)
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    let metadata = lookup.get(file.name) || lookup.get(nameWithoutExt);
    
    if (metadata) {
      // Create song object with metadata and local file info
      matchedSongs.push({
        ...metadata,
        FileName: file.name, // Use actual local filename
        isLocalFile: true,
        localFileInfo: {
          size: file.size,
          lastModified: file.lastModified,
          type: file.type,
          extension: file.extension
        }
      });
    } else {
      // Create basic song object for files without metadata
      matchedSongs.push({
        FileName: file.name,
        JPName: nameWithoutExt,
        ENName: '',
        SongName: nameWithoutExt,
        Artist: 'Unknown',
        difficulty: 'medium',
        isLocalFile: true,
        localFileInfo: {
          size: file.size,
          lastModified: file.lastModified,
          type: file.type,
          extension: file.extension
        }
      });
    }
  });
  
  return matchedSongs.sort((a, b) => a.JPName.localeCompare(b.JPName));
}

/**
 * Filter songs by search term and difficulty
 * @param {Object[]} songs - Array of song objects
 * @param {string} searchTerm - Search term
 * @param {string} difficulty - Difficulty filter
 * @returns {Object[]} - Filtered songs
 */
export function filterSongs(songs, searchTerm = '', difficulty = 'all') {
  let filtered = [...songs];
  
  // Filter by difficulty
  if (difficulty && difficulty !== 'all') {
    filtered = filtered.filter(song => 
      song.difficulty?.toLowerCase() === difficulty.toLowerCase()
    );
  }
  
  // Filter by search term
  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.toLowerCase().trim();
    filtered = filtered.filter(song => 
      song.JPName?.toLowerCase().includes(term) ||
      song.ENName?.toLowerCase().includes(term) ||
      song.SongName?.toLowerCase().includes(term) ||
      song.Artist?.toLowerCase().includes(term) ||
      song.FileName?.toLowerCase().includes(term)
    );
  }
  
  return filtered;
}

/**
 * Get a random song from the filtered list
 * @param {Object[]} songs - Array of song objects
 * @param {string} difficulty - Difficulty filter
 * @returns {Object|null} - Random song or null if none found
 */
export function getRandomSong(songs, difficulty = 'all') {
  const filtered = filterSongs(songs, '', difficulty);
  
  if (filtered.length === 0) {
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * filtered.length);
  return filtered[randomIndex];
}
