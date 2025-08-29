// src/routes/api/screens/presenter-state/+server.js
import { json } from '@sveltejs/kit';

let presenterState = {
  currentScreen: null,
  showMetadata: false,
  showImagePlaceholder: true,
  guessingPhase: true,
  imageSrc: '',
  currentMode: 'normal',
  modeSettings: {
    gridRows: 4,
    gridCols: 4,
    revealDelay: 100,
    partsCount: 100,
    pixelationLevel: 64
  },
  currentTime: 0,
  isPlaying: false,
  lastUpdated: Date.now()
};

export async function POST({ request }) {
  try {
    const updates = await request.json();

    // Update presenter state
    presenterState = {
      ...presenterState,
      ...updates,
      lastUpdated: Date.now()
    };

    console.log('Updated presenter state:', presenterState);

    return json({ success: true, state: presenterState });
  } catch (error) {
    console.error('Error updating presenter state:', error);
    return json({ error: 'Failed to update presenter state' }, { status: 500 });
  }
}

export async function GET() {
  return json({
    success: true,
    state: presenterState
  });
}
