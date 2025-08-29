// src/lib/utils/screenFileSystemAPI.js
/**
 * File System API utility for accessing local screen/image files
 * Based on the existing fileSystemAPI.js but adapted for screens
 */

import { matchScreenFilesWithMetadata } from './screenMetadataLoader.js';

// Check if File System Access API is supported
export const isFileSystemAPISupported = () => {
  if (typeof window === 'undefined') return false;
  // Always return true to allow all browsers to attempt using the API
  return true;
};

// Supported image file extensions for filtering
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

/**
 * File System API client for handling local screen file access
 */
export class ScreenFileSystemClient {
  constructor() {
    this.directoryHandle = null;
    this.fileCache = new Map();
    this.metadataCache = null;
  }

  /**
   * Check if the API is supported in the current browser
   */
  isSupported() {
    return isFileSystemAPISupported();
  }

  /**
   * Show directory picker and store the selected directory handle
   * @returns {Promise<boolean>} - True if directory was selected successfully
   */
  async selectDirectory() {
    if (typeof window === 'undefined') {
      throw new Error('File System API is only available in browser environment');
    }

    // Check if the API is actually available at runtime
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API is not supported in this browser. Please use Chrome 86+, Edge 86+, or Firefox 111+');
    }

    try {
      this.directoryHandle = await window.showDirectoryPicker({
        mode: 'read',
        startIn: 'pictures' // Suggest starting in pictures directory
      });

      // Clear file cache when new directory is selected
      this.fileCache.clear();

      // Store directory handle in IndexedDB for persistence
      await this.storeDirectoryHandle();

      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        // User cancelled the picker
        return false;
      }
      throw error;
    }
  }

  /**
   * Get all image files from the selected directory with metadata
   * @returns {Promise<Array>} - Array of screen objects with metadata
   */
  async getImageFiles() {
    if (!this.directoryHandle) {
      throw new Error('No directory selected. Call selectDirectory() first.');
    }

    const files = [];

    try {
      for await (const [name, handle] of this.directoryHandle.entries()) {
        if (handle.kind === 'file') {
          const extension = '.' + name.split('.').pop().toLowerCase();

          if (SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) {
            const file = await handle.getFile();

            files.push({
              FileName: name,
              name: name,
              handle: handle,
              localFileInfo: {
                size: file.size,
                lastModified: file.lastModified,
                type: file.type
              },
              extension: extension,
              isLocalFile: true
            });
          }
        }
      }
    } catch (error) {
      console.error('Error reading directory:', error);
      throw new Error('Failed to read directory contents');
    }

    // Match files with screen metadata
    const { matchScreenFilesWithMetadata } = await import('./screenMetadataLoader.js');
    const matchedScreens = await matchScreenFilesWithMetadata(files);
    return matchedScreens;
  }

  /**
   * Get a file by name from the selected directory
   * @param {string} fileName - Name of the file to retrieve
   * @returns {Promise<File|null>} - File object or null if not found
   */
  async getFileByName(fileName) {
    if (!this.directoryHandle) {
      throw new Error('No directory selected');
    }

    // Check cache first
    if (this.fileCache.has(fileName)) {
      return this.fileCache.get(fileName);
    }

    try {
      const fileHandle = await this.directoryHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      // Cache the file
      this.fileCache.set(fileName, file);

      return file;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a blob URL for a file
   * @param {string} fileName - Name of the file
   * @returns {Promise<string>} - Blob URL for the file
   */
  async createFileURL(fileName) {
    const file = await this.getFileByName(fileName);
    if (!file) {
      throw new Error(`File not found: ${fileName}`);
    }

    return URL.createObjectURL(file);
  }

  /**
   * Store directory handle in IndexedDB for persistence
   */
  async storeDirectoryHandle() {
    if (!this.directoryHandle) return;

    try {
      const db = await this.openDB();
      const transaction = db.transaction(['directories'], 'readwrite');
      const store = transaction.objectStore('directories');

      await store.put({
        id: 'screens-directory',
        handle: this.directoryHandle,
        timestamp: Date.now()
      });

      db.close();
    } catch (error) {
      console.warn('Failed to store directory handle:', error);
    }
  }

  /**
   * Restore directory handle from IndexedDB
   */
  async restoreDirectoryHandle() {
    try {
      const db = await this.openDB();
      const transaction = db.transaction(['directories'], 'readonly');
      const store = transaction.objectStore('directories');

      const result = await store.get('screens-directory');
      db.close();

      if (result && result.handle) {
        // Verify the handle is still valid
        try {
          await result.handle.queryPermission({ mode: 'read' });
          this.directoryHandle = result.handle;
          return true;
        } catch (error) {
          // Handle is no longer valid, remove it
          await this.clearStoredDirectory();
          return false;
        }
      }

      return false;
    } catch (error) {
      console.warn('Failed to restore directory handle:', error);
      return false;
    }
  }

  /**
   * Clear stored directory handle
   */
  async clearStoredDirectory() {
    try {
      const db = await this.openDB();
      const transaction = db.transaction(['directories'], 'readwrite');
      const store = transaction.objectStore('directories');

      await store.delete('screens-directory');
      db.close();

      this.directoryHandle = null;
      this.fileCache.clear();
    } catch (error) {
      console.warn('Failed to clear stored directory:', error);
    }
  }

  /**
   * Open IndexedDB for storing directory handles
   */
  async openDB() {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ScreenFileSystemAPI', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('directories')) {
          db.createObjectStore('directories', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Get current directory name
   */
  getDirectoryName() {
    return this.directoryHandle ? this.directoryHandle.name : null;
  }

  /**
   * Check if a directory is currently selected
   */
  hasDirectory() {
    return this.directoryHandle !== null;
  }
}

// Create a singleton instance
export const screenFileSystemClient = new ScreenFileSystemClient();

/**
 * Utility function to check if we should use File System API or server files
 * @returns {boolean} - True if File System API should be used
 */
export const shouldUseScreenFileSystemAPI = () => {
  return isFileSystemAPISupported() && screenFileSystemClient.hasDirectory();
};
