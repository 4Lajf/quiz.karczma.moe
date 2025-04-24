// src/lib/utils/pixeldrain.js
import fs from 'fs';
import path from 'path';
import { PIXELDRAIN_API_KEY } from '$env/static/private';

/**
 * Uploads a file to Pixeldrain
 * @param {string} filePath - Path to the file to upload
 * @returns {Promise<string>} - URL to the uploaded file
 */
export async function uploadToPixeldrain(filePath) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const fileName = path.basename(filePath);
      const apiUrl = `https://pixeldrain.com/api/file`;

      // Read file as buffer instead of stream
      const fileBuffer = fs.readFileSync(filePath);

      console.log(`Attempting to upload ${fileName} to Pixeldrain (attempt ${attempts})`);

      // Create form data
      const formData = new FormData();
      const file = new Blob([fileBuffer]);
      formData.append('file', file, fileName);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${PIXELDRAIN_API_KEY}`).toString('base64')}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const data = await response.json();
      console.log(`Successfully uploaded ${fileName} to Pixeldrain`);
      return `https://pixeldrain.com/api/file/${data.id}`;
    } catch (error) {
      console.error(`Upload attempt ${attempts} failed:`, error);
      if (attempts >= maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }
}
