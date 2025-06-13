// src/routes/api/pyrkon/leaderboard/+server.js
import { json, error } from '@sveltejs/kit';
import { getLeaderboard, getSongStatistics } from '$lib/server/database.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, locals }) {
  try {
    // No authentication required - admin endpoints are now unprotected
    
    const difficulty = url.searchParams.get('difficulty');
    const type = url.searchParams.get('type') || 'leaderboard';
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    if (type === 'leaderboard') {
      const leaderboard = getLeaderboard(difficulty, limit);
      return json(leaderboard);
    } else if (type === 'statistics') {
      // No authentication required - admin endpoints are now unprotected
      
      const statistics = getSongStatistics(difficulty);
      return json(statistics);
    }
    
    throw error(400, 'Invalid type parameter');
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to fetch leaderboard data');
  }
}
