// src/lib/staticData.js
import { dev } from '$app/environment';
import fs from 'fs/promises';
import path from 'path';

// Cache the data
let songCache = null;
let artistCache = null;
let animeCache = null;

export async function loadData() {
  if (!songCache || !artistCache || !animeCache) {
    try {
      // Determine the correct path based on environment
      const basePath = path.join(process.cwd(), 'static/data');

      const songsPath = path.join(basePath, 'transformed_song_names.json');
      const artistsPath = path.join(basePath, 'transformed_artists.json');
      const animePath = path.join(basePath, 'transformed_anime_names.json');

      const [songsData, artistsData, animeData] = await Promise.all([
        fs.readFile(songsPath, 'utf-8'),
        fs.readFile(artistsPath, 'utf-8'),
        fs.readFile(animePath, 'utf-8')
      ]);

      songCache = JSON.parse(songsData);
      artistCache = JSON.parse(artistsData);
      animeCache = JSON.parse(animeData);

      console.log(`Loaded ${songCache.length} songs, ${artistCache.length} artists, and ${animeCache.length} anime titles from ${basePath}`);
    } catch (error) {
      console.error('Error loading data files:', error.message);
      // More detailed error for better debugging
      if (error.code === 'ENOENT') {
        console.error(`File not found: ${error.path}`);
        console.error(`Current working directory: ${process.cwd()}`);

        // Try to list files in the directory to help debug
        try {
          const dir = path.dirname(error.path);
          const files = await fs.readdir(dir, { withFileTypes: true });
          console.error(`Files in ${dir}:`, files.map(f => f.name));
        } catch (e) {
          console.error(`Could not list directory: ${e.message}`);
        }
      }
      throw new Error(`Failed to load search data: ${error.message}`);
    }
  }
  return { songs: songCache, artists: artistCache, anime: animeCache };
}