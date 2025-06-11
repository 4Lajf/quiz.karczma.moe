import { json } from '@sveltejs/kit';
import { toggleMetadata, showPlaceholder, showMetadata } from '$lib/server/presenterState.js';

export async function POST({ request }) {
  try {
    const { action } = await request.json();

    let newState;

    switch (action) {
      case 'toggleMetadata':
        newState = toggleMetadata();
        break;
      case 'showPlaceholder':
        newState = showPlaceholder();
        break;
      case 'showMetadata':
        newState = showMetadata();
        break;
      default:
        return json({ error: 'Unknown action' }, { status: 400 });
    }

    return json({ success: true, state: newState });
  } catch (error) {
    console.error('Error toggling presenter state:', error);
    return json({ error: 'Failed to toggle state' }, { status: 500 });
  }
}
