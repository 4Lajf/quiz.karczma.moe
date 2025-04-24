import { json } from '@sveltejs/kit';
import { PUBLIC_PIXELDRAIN_API_KEY } from '$env/static/public';

/**
 * POST endpoint to handle file uploads to Pixeldrain
 * This server-side endpoint avoids CORS issues that occur with direct client-side uploads
 */
export const POST = async ({ request }) => {
  try {
    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    console.log(`Uploading file ${file.name} to Pixeldrain (size: ${(file.size / 1024).toFixed(2)}KB)...`);

    // Convert the file to a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate a safe filename for the API
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');

    // Upload to Pixeldrain using PUT method
    const response = await fetch(`https://pixeldrain.com/api/file/${safeFileName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${PUBLIC_PIXELDRAIN_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/octet-stream'
      },
      body: buffer
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pixeldrain upload error:', errorText);
      return json({ success: false, message: `Upload failed: ${errorText}` }, { status: 500 });
    }

    const data = await response.json();
    console.log(`Successfully uploaded to Pixeldrain. File ID: ${data.id}`);

    // Return the direct download URL
    const url = `https://pixeldrain.com/api/file/${data.id}`;

    return json({
      success: true,
      url: url,
      fileId: data.id
    });
  } catch (error) {
    console.error('Server error during file upload:', error);
    return json({ success: false, message: 'Server error during file upload' }, { status: 500 });
  }
};
