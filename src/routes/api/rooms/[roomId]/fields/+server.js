import { json } from '@sveltejs/kit';
import { validateRoomOwnership } from '$lib/server/ownership.js';

// GET endpoint to fetch room fields
export const GET = async ({ params, locals: { supabase, user, profile } }) => {
  try {
    const { roomId } = params;

    // Validate room ownership
    await validateRoomOwnership(supabase, roomId, user, profile);

    const { data, error } = await supabase
      .from('rooms')
      .select('enabled_fields')
      .eq('id', roomId)
      .single();

    if (error) {
      console.error('Failed to fetch room fields:', error);
      return json({ success: false, message: error.message }, { status: 500 });
    }

    return json({
      success: true,
      data: data?.enabled_fields || {}
    });
  } catch (error) {
    console.error('Error in get room fields API:', error);
    if (error.status) {
      return json({ success: false, message: error.body.message }, { status: error.status });
    }
    return json({ success: false, message: 'Server error' }, { status: 500 });
  }
};

// POST endpoint to update room fields
export const POST = async ({ params, request, locals: { supabase, user, profile } }) => {
  try {
    const { roomId } = params;
    const newFields = await request.json();

    // Validate the input
    if (!newFields) {
      return json({ success: false, message: 'Missing required data' }, { status: 400 });
    }

    // Validate room ownership
    await validateRoomOwnership(supabase, roomId, user, profile);

    // Fetch the current room data first
    const { data: currentRoom, error: fetchError } = await supabase
      .from('rooms')
      .select('enabled_fields')
      .eq('id', roomId)
      .single();

    if (fetchError) {
      console.error('Failed to fetch current room:', fetchError);
      return json({ success: false, message: fetchError.message }, { status: 500 });
    }

    // Merge the existing fields with the new fields to ensure all properties are preserved
    const currentFields = currentRoom?.enabled_fields || {};
    const updatedFields = {
      ...currentFields,
      ...newFields
    };

    // Update the room with the complete fields object
    const { data, error } = await supabase
      .from('rooms')
      .update({ enabled_fields: updatedFields })
      .eq('id', roomId)
      .select();

    if (error) {
      console.error('Failed to update fields:', error);
      return json({ success: false, message: error.message }, { status: 500 });
    }

    return json({ success: true, data });
  } catch (error) {
    console.error('Error in update room fields API:', error);
    if (error.status) {
      return json({ success: false, message: error.body.message }, { status: error.status });
    }
    return json({ success: false, message: 'Server error' }, { status: 500 });
  }
};