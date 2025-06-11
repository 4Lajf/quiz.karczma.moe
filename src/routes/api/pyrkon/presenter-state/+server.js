import { json } from '@sveltejs/kit';
import { getPresenterState, updatePresenterState } from '$lib/server/presenterState.js';

export async function GET() {
  return json(getPresenterState());
}

export async function POST({ request }) {
  try {
    const update = await request.json();

    // Update the presenter state
    const newState = updatePresenterState(update);

    return json({ success: true, state: newState });
  } catch (error) {
    console.error('Error updating presenter state:', error);
    return json({ error: 'Failed to update state' }, { status: 500 });
  }
}
