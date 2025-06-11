import { error } from '@sveltejs/kit';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { lookup } from 'mime-types';
import { PYRKON_CONFIG } from '$lib/pyrkon.config.js';

// Base directory where video files are stored
const VIDEO_BASE_DIR = process.env.PYRKON_VIDEO_DIR || PYRKON_CONFIG.VIDEO_DIRECTORY;

console.log('Pyrkon Video Directory:', VIDEO_BASE_DIR);

// Supported video file extensions
const SUPPORTED_EXTENSIONS = PYRKON_CONFIG.SUPPORTED_EXTENSIONS;

function findVideoFile(filename) {
  // Remove any existing extension from filename
  const baseName = filename.replace(/\.[^/.]+$/, '');

  // Try different extensions
  for (const ext of SUPPORTED_EXTENSIONS) {
    const fullPath = join(VIDEO_BASE_DIR, baseName + ext);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Also try the original filename as-is
  const originalPath = join(VIDEO_BASE_DIR, filename);
  if (existsSync(originalPath)) {
    return originalPath;
  }

  return null;
}

export async function GET({ url, request }) {
  try {
    const filename = url.searchParams.get('file');
    
    if (!filename) {
      throw error(400, 'File parameter is required');
    }
    
    // Security check: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw error(400, 'Invalid filename');
    }
    
    const filePath = findVideoFile(filename);

    if (!filePath || !existsSync(filePath)) {
      console.error(`Video file not found: ${filename}`);
      throw error(404, 'Video file not found');
    }
    
    const stats = statSync(filePath);
    const fileSize = stats.size;
    const fileExtension = extname(filePath);
    const mimeType = lookup(fileExtension) || 'video/mp4';
    
    // Handle range requests for audio streaming
    const range = request.headers.get('range');
    
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      
      // Create read stream for the requested range
      const stream = createReadStream(filePath, { start, end });
      
      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        }
      });
    } else {
      // Serve the entire file
      const stream = createReadStream(filePath);
      
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
        }
      });
    }
    
  } catch (err) {
    console.error('Error serving video file:', err);
    
    if (err.status) {
      throw err;
    }
    
    throw error(500, 'Internal server error');
  }
}
