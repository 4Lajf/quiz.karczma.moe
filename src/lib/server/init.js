// src/lib/server/init.js
import { initDatabase } from './database.js';

/**
 * Initialize server-side components
 * This should be called when the server starts
 */
export function initServer() {
  console.log('Initializing server components...');
  
  // Initialize SQLite database
  try {
    initDatabase();
    console.log('✅ SQLite database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize SQLite database:', error);
    throw error;
  }
  
  console.log('✅ Server initialization complete');
}
