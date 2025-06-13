// src/routes/api/pyrkon/submit-answer/+server.js
import { json, error } from '@sveltejs/kit';
import { submitAnswer } from '$lib/server/database.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
  try {
    // No authentication required - admin endpoints are now unprotected
    // Use a default admin username for validation tracking
    const profile = { username: 'admin' };

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
