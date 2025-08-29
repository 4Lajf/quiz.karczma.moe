// src/lib/server/screensDatabase.js
import Database from 'better-sqlite3';
import { dev } from '$app/environment';
import path from 'path';

// Database file path
const dbPath = 'screeny.db';
let db = null;

/**
 * Initialize the database connection and create tables
 */
export function initScreensDatabase() {
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
export function getScreensDatabase() {
  if (!db) {
    return initScreensDatabase();
  }
  return db;
}

/**
 * Create all necessary tables
 */
function createTables() {
  // User answers table for screens
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      screen_filename TEXT NOT NULL,
      anime_title TEXT,
      screen_title TEXT,
      artist TEXT,
      difficulty TEXT NOT NULL DEFAULT 'normal',
      is_correct BOOLEAN,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      validated_at DATETIME,
      validated_by TEXT,
      points_awarded INTEGER DEFAULT 0
    )
  `);

  // Screen statistics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS screen_statistics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screen_filename TEXT NOT NULL UNIQUE,
      anime_title TEXT NOT NULL,
      screen_title TEXT NOT NULL,
      artist TEXT,
      difficulty TEXT NOT NULL DEFAULT 'normal',
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

  // Screen metadata table (for CSV data integration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS screen_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER,
      season TEXT,
      rank INTEGER,
      title TEXT NOT NULL,
      english_title TEXT,
      romaji_title TEXT,
      wymagane INTEGER,
      ile_jest INTEGER,
      brakuje INTEGER,
      kolumna1 TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Screen file mappings (linking filenames to metadata)
  db.exec(`
    CREATE TABLE IF NOT EXISTS screen_file_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screen_filename TEXT NOT NULL UNIQUE,
      metadata_id INTEGER,
      title TEXT,
      year INTEGER,
      season TEXT,
      rank INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (metadata_id) REFERENCES screen_metadata(id)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_answers_username ON user_answers(username);
    CREATE INDEX IF NOT EXISTS idx_user_answers_difficulty ON user_answers(difficulty);
    CREATE INDEX IF NOT EXISTS idx_user_answers_screen ON user_answers(screen_filename);
    CREATE INDEX IF NOT EXISTS idx_screen_stats_difficulty ON screen_statistics(difficulty);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_difficulty ON user_leaderboard(difficulty);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_points ON user_leaderboard(total_points DESC);
    CREATE INDEX IF NOT EXISTS idx_screen_metadata_title ON screen_metadata(title);
    CREATE INDEX IF NOT EXISTS idx_screen_metadata_year ON screen_metadata(year);
    CREATE INDEX IF NOT EXISTS idx_file_mappings_filename ON screen_file_mappings(screen_filename);
    CREATE INDEX IF NOT EXISTS idx_file_mappings_title ON screen_file_mappings(title);
  `);
}

/**
 * Submit a user answer for a screen
 */
export function submitScreenAnswer(username, screenData, userAnswer) {
  const db = getScreensDatabase();

  const stmt = db.prepare(`
    INSERT INTO user_answers (username, screen_filename, anime_title, screen_title, artist, difficulty)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return stmt.run(
    username,
    screenData.FileName || screenData.screen_filename,
    userAnswer.anime_title || null,
    userAnswer.screen_title || screenData.title || null,
    userAnswer.artist || null,
    screenData.difficulty || 'normal'
  );
}

/**
 * Validate a screen answer (mark as correct/incorrect and award points)
 */
export function validateScreenAnswer(answerId, isCorrect, validatedBy, pointsAwarded = 0) {
  const db = getScreensDatabase();

  const stmt = db.prepare(`
    UPDATE user_answers
    SET is_correct = ?, validated_at = CURRENT_TIMESTAMP, validated_by = ?, points_awarded = ?
    WHERE id = ?
  `);

  const result = stmt.run(isCorrect, validatedBy, pointsAwarded, answerId);

  // Update statistics and leaderboard
  if (result.changes > 0) {
    updateScreenStatisticsAfterValidation(answerId);
  }

  return result;
}

/**
 * Update screen statistics after answer validation
 */
function updateScreenStatisticsAfterValidation(answerId) {
  const db = getScreensDatabase();

  // Get the answer details
  const answer = db.prepare(`
    SELECT * FROM user_answers WHERE id = ?
  `).get(answerId);

  if (!answer || answer.is_correct === null) return;

  // Update screen statistics
  const screenStatsStmt = db.prepare(`
    INSERT INTO screen_statistics (screen_filename, anime_title, screen_title, artist, difficulty, total_guesses, correct_guesses, incorrect_guesses, last_played, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(screen_filename) DO UPDATE SET
      total_guesses = total_guesses + 1,
      correct_guesses = correct_guesses + ?,
      incorrect_guesses = incorrect_guesses + ?,
      last_played = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);

  const correctIncrement = answer.is_correct ? 1 : 0;
  const incorrectIncrement = answer.is_correct ? 0 : 1;

  screenStatsStmt.run(
    answer.screen_filename,
    answer.anime_title || 'Unknown',
    answer.screen_title || 'Unknown',
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
 * Get pending screen answers (not yet validated)
 */
export function getPendingScreenAnswers() {
  const db = getScreensDatabase();

  return db.prepare(`
    SELECT * FROM user_answers
    WHERE is_correct IS NULL
    ORDER BY submitted_at DESC
  `).all();
}

/**
 * Get leaderboard for a specific difficulty (screens)
 */
export function getScreenLeaderboard(difficulty = null, limit = 10) {
  const db = getScreensDatabase();

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
 * Get screen statistics
 */
export function getScreenStatistics(difficulty = null) {
  const db = getScreensDatabase();

  let query = `
    SELECT screen_filename, anime_title, screen_title, artist, difficulty,
           total_guesses, correct_guesses, incorrect_guesses,
           ROUND((CAST(correct_guesses AS REAL) / total_guesses) * 100, 2) as success_rate,
           last_played
    FROM screen_statistics
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
 * Import screen metadata from CSV data
 */
export function importScreenMetadata(csvData) {
  const db = getScreensDatabase();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO screen_metadata
    (year, season, rank, title, english_title, romaji_title, wymagane, ile_jest, brakuje, kolumna1, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insertStmt.run(
        row.Year ? parseInt(row.Year) : null,
        row.Season || null,
        row.Rank ? parseInt(row.Rank) : null,
        row.Title || '',
        row['English Title'] || null,
        row['Romaji Title'] || null,
        row.Wymagane ? parseInt(row.Wymagane) : null,
        row['Ile jest'] ? parseInt(row['Ile jest']) : null,
        row.Brakuje ? parseInt(row.Brakuje) : null,
        row.Kolumna1 || null
      );
    }
  });

  insertMany(csvData);
}

/**
 * Link screen files to metadata based on filename patterns
 */
export function linkScreenFilesToMetadata() {
  const db = getScreensDatabase();

  // Get all screen metadata
  const metadata = db.prepare('SELECT * FROM screen_metadata').all();

  const linkStmt = db.prepare(`
    INSERT OR REPLACE INTO screen_file_mappings
    (screen_filename, metadata_id, title, year, season, rank, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  for (const meta of metadata) {
    // Create filename patterns based on the title
    const title = meta.title;
    if (!title) continue;

    // Common patterns: "Title (number).extension"
    const patterns = [
      `${title} (${meta.rank || 1}).png`,
      `${title} (${meta.rank || 1}).jpg`,
      `${title} (${meta.rank || 1}).jpeg`,
      `${title} (${meta.rank || 1}).webp`,
      // Add more patterns as needed
    ];

    for (const pattern of patterns) {
      linkStmt.run(
        pattern,
        meta.id,
        title,
        meta.year,
        meta.season,
        meta.rank
      );
    }
  }
}

/**
 * Get screen metadata by filename
 */
export function getScreenMetadataByFilename(filename) {
  const db = getScreensDatabase();

  const stmt = db.prepare(`
    SELECT m.*, f.screen_filename, f.title as mapped_title
    FROM screen_metadata m
    JOIN screen_file_mappings f ON m.id = f.metadata_id
    WHERE f.screen_filename = ?
  `);

  return stmt.get(filename);
}

/**
 * Search screen metadata
 */
export function searchScreenMetadata(searchTerm, year = null) {
  const db = getScreensDatabase();

  let query = `
    SELECT m.*, f.screen_filename
    FROM screen_metadata m
    LEFT JOIN screen_file_mappings f ON m.id = f.metadata_id
    WHERE 1=1
  `;

  const params = [];

  if (searchTerm && searchTerm.trim()) {
    query += ` AND (m.title LIKE ? OR m.english_title LIKE ? OR m.romaji_title LIKE ?)`;
    const term = `%${searchTerm.trim()}%`;
    params.push(term, term, term);
  }

  if (year) {
    query += ` AND m.year = ?`;
    params.push(parseInt(year));
  }

  query += ` ORDER BY m.rank ASC, m.year DESC`;

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Close database connection
 */
export function closeScreensDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
