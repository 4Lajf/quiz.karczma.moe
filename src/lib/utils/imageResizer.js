// src/lib/utils/imageResizer.js

/**
 * Resizes an image file to fit within the specified dimensions while maintaining aspect ratio
 * @param {File} file - The image file to resize
 * @param {Object} options - Resize options
 * @param {number} options.maxWidth - Maximum width in pixels
 * @param {number} options.maxHeight - Maximum height in pixels
 * @param {number} options.quality - JPEG quality (0-1)
 * @param {string} options.format - Output format ('jpeg', 'png', 'webp')
 * @returns {Promise<File>} - A promise that resolves to the resized file
 */
export async function resizeImage(file, options = {}) {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.8,
    format = 'jpeg'
  } = options;

  return new Promise((resolve, reject) => {
    // Create a FileReader to read the file
    const reader = new FileReader();
    
    reader.onload = function(event) {
      // Create an image element
      const img = new Image();
      
      img.onload = function() {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        // Scale down if needed
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        // Create a canvas and resize the image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to desired format
        const mimeType = `image/${format}`;
        
        // Get the resized image as a blob
        canvas.toBlob(
          (blob) => {
            // Create a new file from the blob
            const resizedFile = new File([blob], file.name, {
              type: mimeType,
              lastModified: Date.now()
            });
            
            resolve(resizedFile);
          },
          mimeType,
          quality
        );
      };
      
      img.onerror = function() {
        reject(new Error('Failed to load image'));
      };
      
      // Set the image source to the file data
      img.src = event.target.result;
    };
    
    reader.onerror = function() {
      reject(new Error('Failed to read file'));
    };
    
    // Read the file as a data URL
    reader.readAsDataURL(file);
  });
}
