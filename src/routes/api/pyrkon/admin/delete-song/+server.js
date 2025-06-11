// src/routes/api/pyrkon/admin/delete-song/+server.js
import { json, error } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/database.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
  try {
    // Check admin privileges
    const { session, user } = await locals.safeGetSession();
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

    const { songFilename } = await request.json();
    
    if (!songFilename) {
      throw error(400, 'Song filename is required');
    }

    const db = getDatabase();
    
    // Delete from song_statistics
    const deleteStatsStmt = db.prepare('DELETE FROM song_statistics WHERE song_filename = ?');
    const statsResult = deleteStatsStmt.run(String(songFilename));
    
    // Delete from user_answers
    const deleteAnswersStmt = db.prepare('DELETE FROM user_answers WHERE song_filename = ?');
    const answersResult = deleteAnswersStmt.run(String(songFilename));
    
    // Recalculate leaderboard for affected users
    const affectedUsersStmt = db.prepare(`
      SELECT DISTINCT username, difficulty FROM user_answers
    `);
    const affectedUsers = affectedUsersStmt.all();
    
    // Update leaderboard for each affected user
    for (const user of affectedUsers) {
      const userStatsStmt = db.prepare(`
        SELECT 
          COUNT(*) as total_guesses,
          SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as total_correct,
          SUM(points_awarded) as total_points
        FROM user_answers 
        WHERE username = ? AND difficulty = ? AND is_correct IS NOT NULL
      `);
      
      const userStats = userStatsStmt.get(String(user.username), String(user.difficulty));
      
      if (userStats && userStats.total_guesses > 0) {
        const accuracy = (userStats.total_correct / userStats.total_guesses) * 100;
        
        const updateLeaderboardStmt = db.prepare(`
          UPDATE user_leaderboard 
          SET 
            total_points = ?,
            total_correct = ?,
            total_guesses = ?,
            accuracy_percentage = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE username = ? AND difficulty = ?
        `);
        
        updateLeaderboardStmt.run(
          userStats.total_points || 0,
          userStats.total_correct || 0,
          userStats.total_guesses || 0,
          Math.round(accuracy * 100) / 100,
          String(user.username),
          String(user.difficulty)
        );
      } else {
        // Remove user from leaderboard if no valid answers remain
        const removeLeaderboardStmt = db.prepare(`
          DELETE FROM user_leaderboard WHERE username = ? AND difficulty = ?
        `);
        removeLeaderboardStmt.run(String(user.username), String(user.difficulty));
      }
    }
    
    return json({ 
      success: true, 
      message: `Deleted song data: ${statsResult.changes} statistics, ${answersResult.changes} answers`,
      deletedStats: statsResult.changes,
      deletedAnswers: answersResult.changes
    });
  } catch (err) {
    console.error('Error deleting song data:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to delete song data');
  }
}
