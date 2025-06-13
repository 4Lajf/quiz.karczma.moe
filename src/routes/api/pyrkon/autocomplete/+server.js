import { json } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PYRKON_CONFIG } from '$lib/pyrkon.config.js';
import { getDatabase } from '$lib/server/database.js';

// Cache for parsed CSV data
let cachedData = null;
let lastModified = null;

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

function loadCsvData() {
  try {
    const csvPath = join(process.cwd(), PYRKON_CONFIG.CSV_PATH);
    const csvContent = readFileSync(csvPath, 'utf-8');
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
    console.error('Error loading CSV data:', error);
    throw error;
  }
}

function getUniqueGenres() {
  const songs = cachedData || loadCsvData();
  const genresSet = new Set();
  
  songs.forEach(song => {
    if (song.Genres) {
      // Split by semicolon and clean up
      const genres = song.Genres.split(';').map(g => g.trim()).filter(g => g);
      genres.forEach(genre => genresSet.add(genre));
    }
  });
  
  return Array.from(genresSet).sort();
}

function getUniqueTags() {
  const songs = cachedData || loadCsvData();
  const tagsSet = new Set();
  
  songs.forEach(song => {
    if (song.Tags) {
      // Split by semicolon and clean up
      const tags = song.Tags.split(';').map(t => t.trim()).filter(t => t);
      tags.forEach(tag => tagsSet.add(tag));
    }
  });
  
  return Array.from(tagsSet).sort();
}

function getUniqueYears() {
  const songs = cachedData || loadCsvData();
  const yearsSet = new Set();
  
  songs.forEach(song => {
    if (song.Vintage) {
      // Extract year from vintage string (e.g., "Summer 2023" -> "2023")
      const yearMatch = song.Vintage.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        yearsSet.add(yearMatch[0]);
      }
    }
  });
  
  return Array.from(yearsSet).sort((a, b) => b - a); // Sort descending (newest first)
}

function getAllPlayers() {
  const db = getDatabase();
  
  const players = db.prepare(`
    SELECT DISTINCT username 
    FROM user_leaderboard 
    ORDER BY username ASC
  `).all();
  
  return players.map(p => p.username);
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
  try {
    const type = url.searchParams.get('type');
    
    // Cache CSV data for this request
    if (!cachedData) {
      cachedData = loadCsvData();
    }
    
    switch (type) {
      case 'genres':
        return json(getUniqueGenres());
      
      case 'tags':
        return json(getUniqueTags());
      
      case 'years':
        return json(getUniqueYears());
      
      case 'players':
        return json(getAllPlayers());
      
      default:
        return json({ error: 'Invalid type parameter. Use: genres, tags, years, or players' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in autocomplete API:', error);
    return json({ error: 'Failed to fetch autocomplete data' }, { status: 500 });
  }
}
