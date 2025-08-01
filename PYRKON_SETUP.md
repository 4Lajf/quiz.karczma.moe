# Pyrkon Quiz Setup Guide

## Overview

The Pyrkon route is a music quiz feature that allows playing local video files from your computer. This is an admin-only interface for managing and presenting music quiz content.

## Features

### Admin Side:
- **Local file playback** - Play video files directly from your computer disk
- **Search functionality** - Search songs by name, artist, anime title, or difficulty
- **Random song selection** - Play random songs from filtered categories
- **Presenter screen** - Show placeholder during guessing phase, then reveal video with metadata
- **Video/Audio controls** - Play, pause, stop, volume control
- **Difficulty filtering** - Filter by easy, medium, hard, very hard

## Setup Instructions

### 1. Video Files Location

**Option A: Edit Configuration File (Recommended)**
Edit `src/lib/pyrkon.config.js` and change the `VIDEO_DIRECTORY` setting:
```javascript
export const PYRKON_CONFIG = {
  VIDEO_DIRECTORY: 'C:\\Your\\Videos\\Directory', // Change this path
  // ... other settings
};
```

**Option B: Environment Variable**
```bash
set PYRKON_VIDEO_DIR=C:\Your\Videos\Directory
```

**Option C: Edit the code directly**
Edit `src/routes/api/pyrkon/play/+server.js` and change the `VIDEO_BASE_DIR` constant.

### 2. File Organization

- All video files should be in the same folder (the one specified above)
- Filenames should match the `FileName` column in `static/data/oped.csv`
- Supported formats: `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`, `.m4v`
- The system will automatically try different extensions if exact filename doesn't exist

### 3. CSV Data

The system reads song metadata from `static/data/oped.csv`. Required columns:
- `FileName` - Name of the audio file (without extension)
- `JPName` - Japanese anime title
- `ENName` - English anime title  
- `SongName` - Song title
- `Artist` - Artist name
- `difficulty` - Difficulty level (easy, medium, hard, very hard)

### 4. Access URLs

- **Admin Interface**: `/pyrkon` (requires admin role)
- **Presenter Screen**: `/pyrkon/presenter` (full-screen presenter view)

## Usage

### For Admins:
1. Navigate to `/pyrkon`
2. Use the **Pliki** tab to select local directory with video files
3. Use the **Odtwarzacz** tab to control current playback
4. Use the **Wyszukiwanie** tab to search and select songs
5. Open the **Prezenter** screen to display content to participants

#### Admin Controls:
- **Losowa piosenka** - Play a random song from current difficulty filter
- **Otwórz prezenter** - Open full-screen presenter view in new window
- **Search** - Filter songs by title, artist, or anime name
- **Difficulty filter** - Filter by difficulty level
- **Presenter screen** - Toggle between placeholder and metadata view
- **Audio controls** - Standard play/pause/volume controls

#### Presenter Screen:
- **Full-screen display** - Optimized for projection/large screens
- **Keyboard shortcuts**:
  - `ESC` - Exit fullscreen
  - `SPACE` - Toggle metadata display
  - `F` - Enter fullscreen
- **Real-time sync** - Automatically updates with admin panel changes
- **Clean interface** - No controls, just content display

## Technical Details

### API Endpoints:
- `GET /api/pyrkon/songs` - Get songs with optional filtering
- `POST /api/pyrkon/songs` - Search songs with filters
- `GET /api/pyrkon/play?file=filename` - Stream audio file

### Security:
- Admin access required for admin interface
- File path validation prevents directory traversal
- Only supported audio formats are served

### Performance:
- CSV data is cached in memory
- Audio files support range requests for streaming
- Automatic file extension detection

## Troubleshooting

### Common Issues:

1. **"Audio file not found"**
   - Check that the audio file exists in the specified directory
   - Verify the filename matches the CSV data
   - Ensure the file has a supported extension

2. **"No songs available"**
   - Check that `static/data/oped.csv` exists and has valid data
   - Verify CSV format and required columns

3. **Admin access denied**
   - Ensure user has `admin` role in the database
   - Check authentication status

### File Path Examples:
If `AUDIO_BASE_DIR` is `D:\Music\Anime` and CSV has `FileName` as "Naruto - Blue Bird", the system will look for:
- `D:\Music\Anime\Naruto - Blue Bird.mp3`
- `D:\Music\Anime\Naruto - Blue Bird.wav`
- `D:\Music\Anime\Naruto - Blue Bird.ogg`
- etc.

## Development Notes

The implementation reuses existing quiz infrastructure while adding local file support. Key components:

- **Audio streaming** with range request support
- **CSV parsing** with proper quote handling
- **Real-time search** with debouncing
- **Presenter mode** for controlled reveal of information
- **Volume persistence** across sessions

## Future Enhancements

Potential improvements:
- Playlist management
- Custom timing controls
- Multiple audio directories
- File upload interface
- Advanced search filters
- Score tracking integration
