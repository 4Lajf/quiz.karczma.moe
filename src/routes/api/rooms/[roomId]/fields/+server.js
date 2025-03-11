import { json } from '@sveltejs/kit';

// GET endpoint to fetch room fields
export const GET = async ({ params, locals: { supabase } }) => {
  try {
    const { roomId } = params;

    if (!roomId) {
      return json({ success: false, message: 'Room ID is required' }, { status: 400 });
    }

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
    return json({ success: false, message: 'Server error' }, { status: 500 });
  }
};

// POST endpoint to update room fields
export const POST = async ({ params, request, locals: { supabase } }) => {
  try {
    const { roomId } = params;
    const newFields = await request.json();

    // Validate the input
    if (!roomId || !newFields) {
      return json({ success: false, message: 'Missing required data' }, { status: 400 });
    }

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
    return json({ success: false, message: 'Server error' }, { status: 500 });
  }
};