// src/lib/utils/screenMetadataLoader.js

let metadataCache = null;
let lastLoadTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load screen metadata from CSV file
 */
export async function loadScreenMetadata() {
  const now = Date.now();

  // Return cached data if still valid
  if (metadataCache && (now - lastLoadTime) < CACHE_DURATION) {
    return metadataCache;
  }

  try {
    // Use fetch to load CSV file in browser environment
    const response = await fetch('/data/screeny.csv');

    if (!response.ok) {
      console.warn('screeny.csv file not found or not accessible');
      return [];
    }

    const csvContent = await response.text();
    const lines = csvContent.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.warn('Invalid CSV format');
      return [];
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const csvData = lines.slice(1).map((line, index) => {
      const values = parseCSVLine(line);
      const row = {};

      headers.forEach((header, headerIndex) => {
        let value = values[headerIndex] || null;

        // Clean up the value
        if (value) {
          value = value.trim().replace(/^"|"$/g, '');
        }

        row[header] = value;
      });

      // Add a unique ID
      row.id = index + 1;

      return row;
    });

    metadataCache = csvData;
    lastLoadTime = now;

    console.log(`Loaded ${csvData.length} screen metadata entries`);
    return csvData;
  } catch (error) {
    console.error('Error loading screen metadata:', error);
    return [];
  }
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current);

  return result;
}

/**
 * Match screen files with metadata
 */
export async function matchScreenFilesWithMetadata(files) {
  const metadata = await loadScreenMetadata();
  const matchedFiles = [];

  for (const file of files) {
    const fileName = file.FileName || file.name || '';
    const fileBaseName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension

    // Try to find matching metadata
    let matchedMetadata = null;

    // First, try exact title match
    matchedMetadata = metadata.find(meta => {
      if (!meta.Title) return false;

      const metaTitle = meta.Title.trim();
      return fileBaseName.includes(metaTitle) ||
        metaTitle.includes(fileBaseName) ||
        normalizeString(fileBaseName).includes(normalizeString(metaTitle));
    });

    // If no exact match, try pattern matching for numbered files
    if (!matchedMetadata) {
      // Pattern: "Title (number)" or "Title(number)"
      const patternMatch = fileBaseName.match(/^(.+?)\s*\((\d+)\)$/);
      if (patternMatch) {
        const [_, title, number] = patternMatch;
        matchedMetadata = metadata.find(meta => {
          if (!meta.Title) return false;

          const metaTitle = meta.Title.trim();
          return metaTitle === title ||
            normalizeString(metaTitle) === normalizeString(title);
        });
      }
    }

    // Create enhanced file object
    const enhancedFile = {
      ...file,
      isLocalFile: true,
      title: matchedMetadata?.Title || extractTitleFromFilename(fileName),
      JPName: matchedMetadata?.Title || null,
      ENName: matchedMetadata?.['English Title'] || null,
      Year: matchedMetadata?.Year ? parseInt(matchedMetadata.Year) : null,
      Season: matchedMetadata?.Season || null,
      Rank: matchedMetadata?.Rank ? parseInt(matchedMetadata.Rank) : null,
      Vintage: matchedMetadata?.Year ? `${matchedMetadata.Season} ${matchedMetadata.Year}` : null,
      metadata: matchedMetadata || null
    };

    matchedFiles.push(enhancedFile);
  }

  return matchedFiles;
}

/**
 * Extract title from filename
 */
function extractTitleFromFilename(filename) {
  if (!filename) return 'Unknown';

  // Remove extension
  let title = filename.replace(/\.[^/.]+$/, '');

  // Remove numbers in parentheses at the end
  title = title.replace(/\s*\(\d+\)$/, '');

  // Clean up underscores and multiple spaces
  title = title.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

  return title;
}

/**
 * Normalize string for comparison
 */
function normalizeString(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get screen metadata by title
 */
export function getScreenMetadataByTitle(title) {
  const metadata = loadScreenMetadata();

  return metadata.find(meta =>
    meta.Title &&
    normalizeString(meta.Title) === normalizeString(title)
  );
}

/**
 * Search screen metadata
 */
export async function searchScreenMetadata(searchTerm, year = null, season = null) {
  const metadata = await loadScreenMetadata();

  return metadata.filter(meta => {
    // Text search
    if (searchTerm && searchTerm.trim()) {
      const term = normalizeString(searchTerm);
      const titleMatch = meta.Title && normalizeString(meta.Title).includes(term);
      const englishTitleMatch = meta['English Title'] && normalizeString(meta['English Title']).includes(term);
      const romajiTitleMatch = meta['Romaji Title'] && normalizeString(meta['Romaji Title']).includes(term);

      if (!titleMatch && !englishTitleMatch && !romajiTitleMatch) {
        return false;
      }
    }

    // Year filter
    if (year && meta.Year !== year.toString()) {
      return false;
    }

    // Season filter
    if (season && meta.Season !== season) {
      return false;
    }

    return true;
  });
}

/**
 * Get unique values for filters
 */
export async function getScreenMetadataFilters() {
  const metadata = await loadScreenMetadata();

  const years = [...new Set(metadata.map(m => m.Year).filter(Boolean))].sort((a, b) => b - a);
  const seasons = [...new Set(metadata.map(m => m.Season).filter(Boolean))];

  return {
    years,
    seasons
  };
}
