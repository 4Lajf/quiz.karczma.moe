// src/routes/screens/presenter/+page.server.js

export const load = async ({ depends }) => {
  depends('screens-presenter');

  // No authentication required - presenter pages are now unprotected
  return {
    session: null,
    user: null,
    profile: null
  };
};
