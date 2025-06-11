/**
 * Shared presenter state for Pyrkon quiz
 * In production, this should be replaced with Redis or database storage
 */

// Shared presenter state
let presenterState = {
  currentSong: null,
  showMetadata: false,
  showVideoPlaceholder: true,
  guessingPhase: true,
  timeLeft: 0,
  videoSrc: null
};

/**
 * Get current presenter state
 * @returns {Object} Current presenter state
 */
export function getPresenterState() {
  return { ...presenterState };
}

/**
 * Update presenter state
 * @param {Object} updates - State updates to apply
 * @returns {Object} Updated presenter state
 */
export function updatePresenterState(updates) {
  presenterState = {
    ...presenterState,
    ...updates
  };
  return { ...presenterState };
}

/**
 * Toggle metadata display
 * @returns {Object} Updated presenter state
 */
export function toggleMetadata() {
  presenterState.showMetadata = !presenterState.showMetadata;
  presenterState.showVideoPlaceholder = !presenterState.showMetadata;
  return { ...presenterState };
}

/**
 * Show placeholder (hide metadata)
 * @returns {Object} Updated presenter state
 */
export function showPlaceholder() {
  presenterState.showMetadata = false;
  presenterState.showVideoPlaceholder = true;
  return { ...presenterState };
}

/**
 * Show metadata (hide placeholder)
 * @returns {Object} Updated presenter state
 */
export function showMetadata() {
  presenterState.showMetadata = true;
  presenterState.showVideoPlaceholder = false;
  return { ...presenterState };
}

/**
 * Reset presenter state
 * @returns {Object} Reset presenter state
 */
export function resetPresenterState() {
  presenterState = {
    currentSong: null,
    showMetadata: false,
    showVideoPlaceholder: true,
    guessingPhase: true,
    timeLeft: 0,
    videoSrc: null
  };
  return { ...presenterState };
}
