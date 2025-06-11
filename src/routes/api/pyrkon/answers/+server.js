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
    // Check admin privileges
    const { session, user } = await locals.safeGetSession();
    if (!session) {
      throw error(401, 'Unauthorized');
    }

    const { data: profile } = await locals.supabase
      .from('profiles')
      .select('role, username')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      throw error(403, 'Admin privileges required');
    }

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
