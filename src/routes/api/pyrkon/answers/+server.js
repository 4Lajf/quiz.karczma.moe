// src/routes/api/pyrkon/answers/+server.js
import { json, error } from '@sveltejs/kit';
import { 
  getPendingAnswers, 
  validateAnswer, 
  submitAnswer,
  getDatabase 
} from '$lib/server/database.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, locals }) {
  try {
    // No authentication required - admin endpoints are now unprotected

    const type = url.searchParams.get('type') || 'pending';
    
    if (type === 'pending') {
      const answers = getPendingAnswers();
      return json(answers);
    } else if (type === 'all') {
      const db = getDatabase();
      const answers = db.prepare(`
        SELECT * FROM user_answers 
        ORDER BY submitted_at DESC 
        LIMIT 100
      `).all();
      return json(answers);
    }
    
    return json([]);
  } catch (err) {
    console.error('Error fetching answers:', err);
    throw error(500, 'Failed to fetch answers');
  }
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
  try {
    // No authentication required - admin endpoints are now unprotected
    // Use a default admin username for validation tracking
    const profile = { username: 'admin' };

    const { action, answerId, isCorrect, pointsAwarded } = await request.json();
    
    if (action === 'validate') {
      if (!answerId || isCorrect === undefined) {
        throw error(400, 'Missing required fields');
      }
      
      const result = validateAnswer(
        answerId, 
        isCorrect, 
        profile.username, 
        pointsAwarded || 0
      );
      
      if (result.changes === 0) {
        throw error(404, 'Answer not found');
      }
      
      return json({ success: true, message: 'Answer validated successfully' });
    } else if (action === 'submit') {
      // For submitting new answers from the admin interface
      const { username, songData, userAnswer } = await request.json();
      
      if (!username || !songData || !userAnswer) {
        throw error(400, 'Missing required fields');
      }
      
      const result = submitAnswer(username, songData, userAnswer);
      
      return json({ 
        success: true, 
        answerId: result.lastInsertRowid,
        message: 'Answer submitted successfully' 
      });
    }
    
    throw error(400, 'Invalid action');
  } catch (err) {
    console.error('Error processing answer:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to process answer');
  }
}
