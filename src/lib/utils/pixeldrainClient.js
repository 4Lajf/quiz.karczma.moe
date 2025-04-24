// src/lib/utils/pixeldrainClient.js
import { PUBLIC_PIXELDRAIN_API_KEY } from '$env/static/public';

/**
 * Client-side utility for uploading files to Pixeldrain
 */
export const pixeldrainClient = {
  /**
   * Upload a file to Pixeldrain
   * @param {File} file - The file to upload
   * @returns {Promise<string>} - The URL of the uploaded file
   */
  async uploadFile(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    // Create form data for the upload
    const formData = new FormData();
    formData.append('file', file);

    console.log(`Uploading ${file.name} to Pixeldrain (size: ${(file.size / 1024).toFixed(2)}KB)`);

    // Upload to Pixeldrain
    const response = await fetch('https://pixeldrain.com/api/file', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`:${PUBLIC_PIXELDRAIN_API_KEY}`)}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Successfully uploaded to Pixeldrain. File ID: ${data.id}`);
    
    // Return the direct download URL
    return `https://pixeldrain.com/api/file/${data.id}/download`;
  }
};
