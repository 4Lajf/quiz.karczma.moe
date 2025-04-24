// src/routes/api/upload-to-pixeldrain/+server.js
import { json } from '@sveltejs/kit';
import { PIXELDRAIN_API_KEY } from '$env/static/private';

/**
 * Handles file upload to Pixeldrain
 * @param {Request} request - The request object
 * @returns {Promise<Response>} - JSON response with the URL of the uploaded file
 */
export async function POST({ request }) {
  try {
    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Check file size - Pixeldrain has a 10GB limit, but we'll enforce Vercel's limit
    const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5MB (Vercel's limit is 4.5MB for the request body)
    if (file.size > MAX_SIZE) {
      return json({
        error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the maximum allowed size (4.5MB)`
      }, { status: 400 });
    }

    // Upload to Pixeldrain directly
    try {
      const apiUrl = 'https://pixeldrain.com/api/file';

      // Create a new FormData for the Pixeldrain API
      const pixeldrainFormData = new FormData();
      pixeldrainFormData.append('file', file);

      console.log(`Uploading ${file.name} to Pixeldrain (size: ${(file.size / 1024).toFixed(2)}KB)`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`
        },
        body: pixeldrainFormData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const data = await response.json();
      // Use the direct image URL format for better compatibility with <img> tags
      const fileUrl = `https://pixeldrain.com/api/file/${data.id}`;

      console.log(`Successfully uploaded to Pixeldrain. File ID: ${data.id}`);
      return json({ url: fileUrl });
    } catch (uploadError) {
      console.error('Error in Pixeldrain upload:', uploadError);
      throw uploadError;
    }
  } catch (error) {
    console.error('Error uploading to Pixeldrain:', error);
    return json({ error: error.message }, { status: 500 });
  }
}
