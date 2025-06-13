// src/routes/api/pyrkon/grant-points/+server.js
import { json, error } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/database.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
  try {
    // No authentication required - admin endpoints are now unprotected
    // Use a default admin username for validation tracking
    const profile = { username: 'admin' };

    const { participantName, participantDifficulty, songData, isCorrect } = await request.json();

    if (!participantName || !songData || isCorrect === undefined) {
      throw error(400, 'Missing required fields');
    }

    // Always give 1 point for correct answers, 0 for incorrect
    const pointsAwarded = isCorrect ? 1 : 0;

    const db = getDatabase();

    // Insert the answer record
    const answerStmt = db.prepare(`
      INSERT INTO user_answers (username, song_filename, anime_title, song_title, artist, difficulty, is_correct, validated_at, validated_by, points_awarded)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `);

    const answerResult = answerStmt.run(
      String(participantName),
      String(songData.FileName || `song_${Date.now()}`),
      songData.JPName ? String(songData.JPName) : (songData.ENName ? String(songData.ENName) : null),
      songData.SongName ? String(songData.SongName) : null,
      songData.Artist ? String(songData.Artist) : null,
      String(participantDifficulty || songData.difficulty || 'easy'),
      isCorrect ? 1 : 0,
      String(profile.username),
      pointsAwarded
    );

    if (answerResult.changes > 0) {
      // Update song statistics
      const songStatsStmt = db.prepare(`
        INSERT INTO song_statistics (song_filename, anime_title, song_title, artist, difficulty, total_guesses, correct_guesses, incorrect_guesses, last_played, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(song_filename) DO UPDATE SET
          total_guesses = total_guesses + 1,
          correct_guesses = correct_guesses + ?,
          incorrect_guesses = incorrect_guesses + ?,
          last_played = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `);
      
      const correctIncrement = isCorrect ? 1 : 0;
      const incorrectIncrement = isCorrect ? 0 : 1;
      
      songStatsStmt.run(
        String(songData.FileName || `song_${Date.now()}`),
        String(songData.JPName || songData.ENName || 'Unknown'),
        String(songData.SongName || 'Unknown'),
        String(songData.Artist || 'Unknown'),
        String(participantDifficulty || songData.difficulty || 'easy'),
        correctIncrement,
        incorrectIncrement,
        correctIncrement,
        incorrectIncrement
      );
      
      // Update user leaderboard
      const leaderboardStmt = db.prepare(`
        INSERT INTO user_leaderboard (username, difficulty, total_points, total_correct, total_guesses, accuracy_percentage, last_activity, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(username, difficulty) DO UPDATE SET
          total_points = total_points + ?,
          total_correct = total_correct + ?,
          total_guesses = total_guesses + 1,
          accuracy_percentage = ROUND((CAST(total_correct + ? AS REAL) / (total_guesses + 1)) * 100, 2),
          last_activity = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `);
      
      const accuracy = isCorrect ? 100.0 : 0.0;
      
      leaderboardStmt.run(
        String(participantName),
        String(participantDifficulty || songData.difficulty || 'easy'),
        pointsAwarded,
        correctIncrement,
        accuracy,
        pointsAwarded,
        correctIncrement,
        correctIncrement
      );
    }
    
    return json({ 
      success: true, 
      message: `Points ${isCorrect ? 'granted' : 'deducted'} successfully`,
      answerId: answerResult.lastInsertRowid
    });
  } catch (err) {
    console.error('Error granting points:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to grant points');
  }
}
