// src/routes/screens/+page.server.js

export const load = async ({ depends }) => {
  depends('admin-screens');

  // No authentication required - admin pages are now unprotected
  // Provide default values for components that expect user data
  return {
    session: { user: { id: 'admin' } },
    user: { id: 'admin' },
    profile: { username: 'admin', role: 'admin' }
  };
};
