//src/routes/admin/+page.server.js
export const load = async ({ depends, locals: { supabase, user, profile } }) => {
  depends('rooms');

  const { data: rooms, error } = await supabase
    .from('rooms')
    .select(`
      id,
      name,
      created_by,
      created_at,
      is_active,
      enabled_fields,
      settings,
      profiles (
        id,
        username,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false });

  return {
    rooms: rooms || [],
    profile,
    user
  };
};