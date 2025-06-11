// src/routes/api/pyrkon/submit-answer/+server.js
import { json, error } from '@sveltejs/kit';
import { submitAnswer } from '$lib/server/database.js';

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

    const { username, songData, userAnswer } = await request.json();
    
    if (!username || !songData || !userAnswer) {
      throw error(400, 'Missing required fields: username, songData, userAnswer');
    }

    // Validate songData has required fields
    if (!songData.FileName || !songData.difficulty) {
      throw error(400, 'Invalid songData: missing FileName or difficulty');
    }

    const result = submitAnswer(username, songData, userAnswer);
    
    return json({ 
      success: true, 
      answerId: result.lastInsertRowid,
      message: 'Answer submitted successfully' 
    });
  } catch (err) {
    console.error('Error submitting answer:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to submit answer');
  }
}
