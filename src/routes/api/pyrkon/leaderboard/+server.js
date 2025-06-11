// src/routes/api/pyrkon/leaderboard/+server.js
import { json, error } from '@sveltejs/kit';
import { getLeaderboard, getSongStatistics } from '$lib/server/database.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, locals }) {
  try {
    // Check admin privileges for detailed stats, but allow public access for basic leaderboard
    const { session, user } = await locals.safeGetSession();
    
    const difficulty = url.searchParams.get('difficulty');
    const type = url.searchParams.get('type') || 'leaderboard';
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    if (type === 'leaderboard') {
      const leaderboard = getLeaderboard(difficulty, limit);
      return json(leaderboard);
    } else if (type === 'statistics') {
      // Require admin for detailed statistics
      if (!session) {
        throw error(401, 'Unauthorized');
      }

      const { data: profile } = await locals.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role !== 'admin') {
        throw error(403, 'Admin privileges required');
      }
      
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
