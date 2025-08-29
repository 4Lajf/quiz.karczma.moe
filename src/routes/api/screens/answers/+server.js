// src/routes/api/screens/answers/+server.js
import { json } from '@sveltejs/kit';
import {
  getPendingScreenAnswers,
  validateScreenAnswer,
  submitScreenAnswer,
  getScreensDatabase
} from '$lib/server/screensDatabase.js';

export async function GET() {
  try {
    const answers = getPendingScreenAnswers();
    return json({ success: true, answers });
  } catch (error) {
    console.error('Error fetching screen answers:', error);
    return json({ error: 'Failed to fetch answers' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const { action, ...data } = await request.json();

    if (action === 'submit') {
      // Submit a new answer
      const { username, screenData, userAnswer } = data;
      const result = submitScreenAnswer(username, screenData, userAnswer);
      return json({ success: true, answerId: result.lastInsertRowid });
    } else if (action === 'validate') {
      // Validate an existing answer
      const { answerId, isCorrect, validatedBy, pointsAwarded } = data;
      const result = validateScreenAnswer(answerId, isCorrect, validatedBy, pointsAwarded);
      return json({ success: true, changes: result.changes });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing screen answer:', error);
    return json({ error: 'Failed to process answer' }, { status: 500 });
  }
}
