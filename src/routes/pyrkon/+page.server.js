// src/routes/pyrkon/+page.server.js
export const load = async ({ depends, locals: { supabase, safeGetSession } }) => {
  depends('pyrkon');

  const { session, user } = await safeGetSession();

  let profile = null;
  if (session && user) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, role')
      .eq('id', user.id)
      .single();
    profile = profileData;
  }

  return {
    session,
    profile
  };
};
