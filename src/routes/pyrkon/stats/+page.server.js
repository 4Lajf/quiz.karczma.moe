// src/routes/pyrkon/stats/+page.server.js

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  // No authentication required - admin pages are now unprotected
  // Provide default values for components that expect user data
  return {
    session: { user: { id: 'admin' } },
    user: { id: 'admin' },
    profile: { username: 'admin', role: 'admin' }
  };
}
