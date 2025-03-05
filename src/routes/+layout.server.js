//src/routes/+layout.server.js
export const load = async ({ locals, cookies }) => {
  // safeGetSession already uses getUser() internally as set up in hooks.server.js
  const { session, user, profile } = await locals.safeGetSession()
  return {
    session,
    cookies: cookies.getAll(),
    user,
    profile
  }
}