// src/routes/api/pyrkon/admin/update-points/+server.js
import { json, error } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/database.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
  try {
    // No authentication required - admin endpoints are now unprotected

    const { username, difficulty, points } = await request.json();
    
    if (!username || !difficulty || points === undefined) {
      throw error(400, 'Username, difficulty, and points are required');
    }

    const db = getDatabase();
    
    // Update leaderboard points
    const updateLeaderboardStmt = db.prepare(`
      UPDATE user_leaderboard 
      SET 
        total_points = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE username = ? AND difficulty = ?
    `);
    
    const result = updateLeaderboardStmt.run(
      Number(points),
      String(username),
      String(difficulty)
    );
    
    if (result.changes === 0) {
      throw error(404, 'User not found in leaderboard');
    }
    
    return json({ 
      success: true, 
      message: `Updated points for ${username} (${difficulty}) to ${points}`,
      updatedRows: result.changes
    });
  } catch (err) {
    console.error('Error updating user points:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to update user points');
  }
}
