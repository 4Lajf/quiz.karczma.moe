// src/routes/api/screens/leaderboard/+server.js
import { json } from '@sveltejs/kit';
import { getScreenLeaderboard } from '$lib/server/screensDatabase.js';

export async function GET({ url }) {
  try {
    const difficulty = url.searchParams.get('difficulty');
    const limit = parseInt(url.searchParams.get('limit')) || 10;

    const leaderboard = getScreenLeaderboard(difficulty, limit);

    return json({
      success: true,
      leaderboard,
      filters: { difficulty, limit }
    });
  } catch (error) {
    console.error('Error fetching screen leaderboard:', error);
    return json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
