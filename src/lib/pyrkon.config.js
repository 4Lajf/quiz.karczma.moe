// Pyrkon Configuration
// Update this file to point to your local video files directory

export const PYRKON_CONFIG = {
  // Path to your local video files directory
  // Examples:
  // Windows: 'C:\\Users\\YourName\\Videos\\Anime'
  // Windows: 'D:\\Videos\\Anime'
  // Linux/Mac: '/home/username/Videos/Anime'
  // Linux/Mac: '/Users/username/Videos/Anime'

  VIDEO_DIRECTORY: 'C:\\Openingówka', // Change this to your actual path

  // Supported video file extensions
  SUPPORTED_EXTENSIONS: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'],

  // CSV file path (relative to project root)
  CSV_PATH: 'static/data/oped2.csv'
};

// You can also set the video directory via environment variable:
// Set PYRKON_VIDEO_DIR environment variable to override the above setting
