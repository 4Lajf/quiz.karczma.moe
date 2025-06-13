// src/lib/server/database.js
import Database from 'better-sqlite3';
import { dev } from '$app/environment';
import path from 'path';

// Database file path
const dbPath = 'pyrkon_quiz.db';//dev ? 'pyrkon_quiz.db' : '/tmp/pyrkon_quiz.db';
let db = null;

/**
 * Initialize the database connection and create tables
 */
export function initDatabase() {
  if (db) return db;
  
  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Create tables
  createTables();
  
  return db;
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Create all necessary tables
 */
function createTables() {
  // User answers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      song_filename TEXT NOT NULL,
      anime_title TEXT,
      song_title TEXT,
      artist TEXT,
      difficulty TEXT NOT NULL,
      is_correct BOOLEAN,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      validated_at DATETIME,
      validated_by TEXT,
      points_awarded INTEGER DEFAULT 0
    )
  `);

  // Song statistics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS song_statistics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_filename TEXT NOT NULL UNIQUE,
      anime_title TEXT NOT NULL,
      song_title TEXT NOT NULL,
      artist TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      total_guesses INTEGER DEFAULT 0,
      correct_guesses INTEGER DEFAULT 0,
      incorrect_guesses INTEGER DEFAULT 0,
      last_played DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User leaderboard table (separate for each difficulty)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_leaderboard (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      total_correct INTEGER DEFAULT 0,
      total_guesses INTEGER DEFAULT 0,
      accuracy_percentage REAL DEFAULT 0.0,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(username, difficulty)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_answers_username ON user_answers(username);
    CREATE INDEX IF NOT EXISTS idx_user_answers_difficulty ON user_answers(difficulty);
    CREATE INDEX IF NOT EXISTS idx_user_answers_song ON user_answers(song_filename);
    CREATE INDEX IF NOT EXISTS idx_song_stats_difficulty ON song_statistics(difficulty);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_difficulty ON user_leaderboard(difficulty);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_points ON user_leaderboard(total_points DESC);
  `);
}

/**
 * Submit a user answer
 */
export function submitAnswer(username, songData, userAnswer) {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    INSERT INTO user_answers (username, song_filename, anime_title, song_title, artist, difficulty)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  return stmt.run(
    username,
    songData.FileName,
    userAnswer.anime_title || null,
    userAnswer.song_title || null,
    userAnswer.artist || null,
    songData.difficulty
  );
}

/**
 * Validate an answer (mark as correct/incorrect and award points)
 */
export function validateAnswer(answerId, isCorrect, validatedBy, pointsAwarded = 0) {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE user_answers 
    SET is_correct = ?, validated_at = CURRENT_TIMESTAMP, validated_by = ?, points_awarded = ?
    WHERE id = ?
  `);
  
  const result = stmt.run(isCorrect, validatedBy, pointsAwarded, answerId);
  
  // Update statistics and leaderboard
  if (result.changes > 0) {
    updateStatisticsAfterValidation(answerId);
  }
  
  return result;
}

/**
 * Update statistics after answer validation
 */
function updateStatisticsAfterValidation(answerId) {
  const db = getDatabase();
  
  // Get the answer details
  const answer = db.prepare(`
    SELECT * FROM user_answers WHERE id = ?
  `).get(answerId);
  
  if (!answer || answer.is_correct === null) return;
  
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
  
  const correctIncrement = answer.is_correct ? 1 : 0;
  const incorrectIncrement = answer.is_correct ? 0 : 1;
  
  songStatsStmt.run(
    answer.song_filename,
    answer.anime_title || 'Unknown',
    answer.song_title || 'Unknown',
    answer.artist || 'Unknown',
    answer.difficulty,
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
  
  const accuracy = answer.is_correct ? 100.0 : 0.0;
  
  leaderboardStmt.run(
    answer.username,
    answer.difficulty,
    answer.points_awarded || 0,
    correctIncrement,
    accuracy,
    answer.points_awarded || 0,
    correctIncrement,
    correctIncrement
  );
}

/**
 * Get pending answers (not yet validated)
 */
export function getPendingAnswers() {
  const db = getDatabase();
  
  return db.prepare(`
    SELECT * FROM user_answers 
    WHERE is_correct IS NULL 
    ORDER BY submitted_at DESC
  `).all();
}

/**
 * Get leaderboard for a specific difficulty
 */
export function getLeaderboard(difficulty = null, limit = 10) {
  const db = getDatabase();
  
  let query = `
    SELECT username, difficulty, total_points, total_correct, total_guesses, accuracy_percentage, last_activity
    FROM user_leaderboard
  `;
  
  if (difficulty) {
    query += ` WHERE difficulty = ?`;
  }
  
  query += ` ORDER BY total_points DESC, accuracy_percentage DESC, total_correct DESC LIMIT ?`;
  
  const stmt = db.prepare(query);
  
  if (difficulty) {
    return stmt.all(difficulty, limit);
  } else {
    return stmt.all(limit);
  }
}

/**
 * Get song statistics
 */
export function getSongStatistics(difficulty = null) {
  const db = getDatabase();
  
  let query = `
    SELECT song_filename, anime_title, song_title, artist, difficulty, 
           total_guesses, correct_guesses, incorrect_guesses,
           ROUND((CAST(correct_guesses AS REAL) / total_guesses) * 100, 2) as success_rate,
           last_played
    FROM song_statistics
  `;
  
  if (difficulty) {
    query += ` WHERE difficulty = ?`;
  }
  
  query += ` ORDER BY total_guesses DESC, success_rate ASC`;
  
  const stmt = db.prepare(query);
  
  if (difficulty) {
    return stmt.all(difficulty);
  } else {
    return stmt.all();
  }
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
