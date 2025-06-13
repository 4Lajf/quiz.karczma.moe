// src/routes/api/pyrkon/admin/clear-user/+server.js
import { json, error } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/database.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
  try {
    // No authentication required - admin endpoints are now unprotected

    const { username, difficulty } = await request.json();
    
    if (!username || !difficulty) {
      throw error(400, 'Username and difficulty are required');
    }

    const db = getDatabase();
    
    // Delete user answers for this difficulty
    const deleteAnswersStmt = db.prepare('DELETE FROM user_answers WHERE username = ? AND difficulty = ?');
    const answersResult = deleteAnswersStmt.run(String(username), String(difficulty));
    
    // Delete from leaderboard
    const deleteLeaderboardStmt = db.prepare('DELETE FROM user_leaderboard WHERE username = ? AND difficulty = ?');
    const leaderboardResult = deleteLeaderboardStmt.run(String(username), String(difficulty));
    
    // Update song statistics by recalculating them
    // Get all songs that this user answered
    const songsToUpdateStmt = db.prepare(`
      SELECT DISTINCT song_filename FROM user_answers WHERE song_filename IN (
        SELECT song_filename FROM user_answers WHERE username = ? AND difficulty = ?
      )
    `);
    
    // Since we already deleted the answers, we need to recalculate stats for affected songs
    const allSongsStmt = db.prepare('SELECT DISTINCT song_filename FROM song_statistics');
    const allSongs = allSongsStmt.all();
    
    for (const song of allSongs) {
      const songStatsStmt = db.prepare(`
        SELECT 
          COUNT(*) as total_guesses,
          SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_guesses,
          SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as incorrect_guesses
        FROM user_answers 
        WHERE song_filename = ? AND is_correct IS NOT NULL
      `);
      
      const songStats = songStatsStmt.get(String(song.song_filename));
      
      if (songStats && songStats.total_guesses > 0) {
        const updateSongStatsStmt = db.prepare(`
          UPDATE song_statistics 
          SET 
            total_guesses = ?,
            correct_guesses = ?,
            incorrect_guesses = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE song_filename = ?
        `);
        
        updateSongStatsStmt.run(
          songStats.total_guesses || 0,
          songStats.correct_guesses || 0,
          songStats.incorrect_guesses || 0,
          String(song.song_filename)
        );
      } else {
        // If no answers remain for this song, delete its statistics
        const deleteSongStatsStmt = db.prepare('DELETE FROM song_statistics WHERE song_filename = ?');
        deleteSongStatsStmt.run(String(song.song_filename));
      }
    }
    
    return json({ 
      success: true, 
      message: `Cleared user data for ${username} (${difficulty})`,
      deletedAnswers: answersResult.changes,
      deletedLeaderboard: leaderboardResult.changes
    });
  } catch (err) {
    console.error('Error clearing user data:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to clear user data');
  }
}
