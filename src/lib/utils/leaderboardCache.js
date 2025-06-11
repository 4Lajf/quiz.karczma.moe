/**
 * Utility functions for managing pyrkon leaderboard cache
 */

/**
 * Invalidate the leaderboard cache and trigger refresh
 * This should be called whenever data changes that would affect the leaderboard
 */
export function invalidateLeaderboardCache() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pyrkon-leaderboard-invalidate'));
  }
}

/**
 * Clear the leaderboard cache from localStorage
 */
export function clearLeaderboardCache() {
  try {
    localStorage.removeItem('pyrkon_leaderboard_cache');
  } catch (error) {
    console.error('Failed to clear leaderboard cache:', error);
  }
}

/**
 * Get cached leaderboard data if still valid
 * @param {number} maxAge - Maximum age in milliseconds (default: 30000)
 * @returns {Object|null} Cached data or null if expired/not found
 */
export function getCachedLeaderboardData(maxAge = 30000) {
  try {
    const cached = localStorage.getItem('pyrkon_leaderboard_cache');
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();
      if (now - timestamp < maxAge) {
        return data;
      }
    }
  } catch (error) {
    console.error('Failed to get cached leaderboard data:', error);
  }
  return null;
}
