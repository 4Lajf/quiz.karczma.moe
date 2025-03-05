// src/routes/+page.server.js
export const load = async ({ depends, locals: { supabase, safeGetSession } }) => {
  depends('rooms');

  const { session, user } = await safeGetSession();

  let profile = null;
  if (session) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, role')
      .eq('id', user.id)
      .single();
    profile = profileData;
  }

  const { data: rooms } = await supabase
    .from('rooms')
    .select(`
      *,
      creator:profiles!rooms_created_by_fkey (
        username,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false });

  return {
    session,
    profile,
    rooms: rooms || []
  };
};