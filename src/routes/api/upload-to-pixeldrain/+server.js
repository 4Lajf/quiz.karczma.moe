// src/routes/api/upload-to-pixeldrain/+server.js
import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
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

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `${uuidv4()}-${file.name}`);

    // Write the file to disk
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, fileBuffer);

    // Upload to Pixeldrain directly
    try {
      const fileName = path.basename(tempFilePath);
      const apiUrl = 'https://pixeldrain.com/api/file';

      // Create form data for the API request
      const uploadFormData = new FormData();
      uploadFormData.append('file', new Blob([fileBuffer]), fileName);

      console.log(`Uploading ${fileName} to Pixeldrain`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`
        },
        body: uploadFormData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const data = await response.json();
      // Use the direct image URL format for better compatibility with <img> tags
      const fileUrl = `https://pixeldrain.com/api/file/${data.id}`;

      // Clean up the temporary file
      fs.unlinkSync(tempFilePath);

      return json({ url: fileUrl });
    } catch (uploadError) {
      console.error('Error in Pixeldrain upload:', uploadError);

      // Clean up the temporary file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      throw uploadError;
    }
  } catch (error) {
    console.error('Error uploading to Pixeldrain:', error);
    return json({ error: error.message }, { status: 500 });
  }
}
