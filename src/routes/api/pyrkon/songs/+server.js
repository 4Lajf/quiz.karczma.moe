import { json } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PYRKON_CONFIG } from '$lib/pyrkon.config.js';

// Cache for parsed CSV data
let cachedSongs = null;
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

function loadSongsFromCsv() {
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
    console.error('Error loading songs from CSV:', error);
    throw error;
  }
}

function getSongs() {
  try {
    // For now, always reload (in production, you might want to cache based on file modification time)
    cachedSongs = loadSongsFromCsv();
    return cachedSongs;
  } catch (error) {
    console.error('Error getting songs:', error);
    return [];
  }
}

// Helper function to extract year from vintage string
function extractYear(vintage) {
  if (!vintage) return null;
  const yearMatch = vintage.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? parseInt(yearMatch[0]) : null;
}

// Helper function to check if item matches genre filter
function matchesGenre(song, genreFilter) {
  if (!genreFilter || genreFilter.trim() === '') return true;
  const genres = song.Genres || '';
  return genres.toLowerCase().includes(genreFilter.toLowerCase().trim());
}

// Helper function to check if item matches tag filter
function matchesTag(song, tagFilter) {
  if (!tagFilter || tagFilter.trim() === '') return true;
  const tags = song.Tags || '';
  return tags.toLowerCase().includes(tagFilter.toLowerCase().trim());
}

// Helper function to check if item matches year filter
function matchesYear(song, yearFilter) {
  if (!yearFilter || yearFilter.trim() === '') return true;
  const songYear = extractYear(song.Vintage);
  const filterYear = parseInt(yearFilter.trim());
  return songYear === filterYear;
}

export async function GET({ url }) {
  try {
    const songs = getSongs();
    
    if (songs.length === 0) {
      return json({ error: 'No songs available' }, { status: 404 });
    }
    
    const searchParams = url.searchParams;
    const random = searchParams.get('random') === 'true';
    const difficulty = searchParams.get('difficulty');
    const search = searchParams.get('search');
    const genre = searchParams.get('genre');
    const tag = searchParams.get('tag');
    const year = searchParams.get('year');
    
    let filteredSongs = [...songs];
    
    // Filter by difficulty if specified
    if (difficulty && difficulty !== 'all') {
      filteredSongs = filteredSongs.filter(song => 
        song.difficulty?.toLowerCase() === difficulty.toLowerCase()
      );
    }
    
    // Filter by search term if specified
    if (search && search.trim()) {
      const searchTerm = search.toLowerCase().trim();
      filteredSongs = filteredSongs.filter(song =>
        song.JPName?.toLowerCase().includes(searchTerm) ||
        song.ENName?.toLowerCase().includes(searchTerm) ||
        song.SongName?.toLowerCase().includes(searchTerm) ||
        song.Artist?.toLowerCase().includes(searchTerm)
      );
    }

    // Filter by genre if specified
    if (genre && genre.trim()) {
      filteredSongs = filteredSongs.filter(song => matchesGenre(song, genre));
    }

    // Filter by tag if specified
    if (tag && tag.trim()) {
      filteredSongs = filteredSongs.filter(song => matchesTag(song, tag));
    }

    // Filter by year if specified
    if (year && year.trim()) {
      filteredSongs = filteredSongs.filter(song => matchesYear(song, year));
    }
    
    if (filteredSongs.length === 0) {
      return json({ error: 'No songs match the criteria' }, { status: 404 });
    }
    
    // Return random song or all filtered songs
    if (random) {
      const randomIndex = Math.floor(Math.random() * filteredSongs.length);
      return json(filteredSongs[randomIndex]);
    } else {
      return json(filteredSongs);
    }
    
  } catch (error) {
    console.error('Error in songs API:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const { difficulty, search, genre, tag, year } = await request.json();
    
    const songs = getSongs();
    let filteredSongs = [...songs];
    
    // Filter by difficulty
    if (difficulty && difficulty !== 'all') {
      filteredSongs = filteredSongs.filter(song => 
        song.difficulty?.toLowerCase() === difficulty.toLowerCase()
      );
    }
    
    // Filter by search term
    if (search && search.trim()) {
      const searchTerm = search.toLowerCase().trim();
      filteredSongs = filteredSongs.filter(song =>
        song.JPName?.toLowerCase().includes(searchTerm) ||
        song.ENName?.toLowerCase().includes(searchTerm) ||
        song.SongName?.toLowerCase().includes(searchTerm) ||
        song.Artist?.toLowerCase().includes(searchTerm)
      );
    }

    // Filter by genre if specified
    if (genre && genre.trim()) {
      filteredSongs = filteredSongs.filter(song => matchesGenre(song, genre));
    }

    // Filter by tag if specified
    if (tag && tag.trim()) {
      filteredSongs = filteredSongs.filter(song => matchesTag(song, tag));
    }

    // Filter by year if specified
    if (year && year.trim()) {
      filteredSongs = filteredSongs.filter(song => matchesYear(song, year));
    }
    
    return json({
      songs: filteredSongs,
      total: filteredSongs.length
    });
    
  } catch (error) {
    console.error('Error in songs search:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
