// src/routes/api/screens/screens/+server.js
import { json } from '@sveltejs/kit';
import { getScreenStatistics } from '$lib/server/screensDatabase.js';

export async function GET({ url }) {
  try {
    const difficulty = url.searchParams.get('difficulty');

    const statistics = getScreenStatistics(difficulty);

    return json({
      success: true,
      statistics,
      filters: { difficulty }
    });
  } catch (error) {
    console.error('Error fetching screen statistics:', error);
    return json({ error: 'Failed to fetch screen statistics' }, { status: 500 });
  }
}
