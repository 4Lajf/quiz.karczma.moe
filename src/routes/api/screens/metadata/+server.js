// src/routes/api/screens/metadata/+server.js
import { json } from '@sveltejs/kit';
import {
  importScreenMetadata,
  searchScreenMetadata,
  linkScreenFilesToMetadata,
  getScreenMetadataByFilename
} from '$lib/server/screensDatabase.js';
import fs from 'fs';
import path from 'path';

export async function GET({ url }) {
  try {
    const action = url.searchParams.get('action');
    const filename = url.searchParams.get('filename');
    const searchTerm = url.searchParams.get('search');
    const year = url.searchParams.get('year');

    if (action === 'by_filename' && filename) {
      const metadata = getScreenMetadataByFilename(filename);
      return json({ success: true, metadata });
    } else if (action === 'search') {
      const results = searchScreenMetadata(searchTerm, year ? parseInt(year) : null);
      return json({ success: true, results });
    }

    return json({ error: 'Invalid action or missing parameters' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching screen metadata:', error);
    return json({ error: 'Failed to fetch metadata' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const { action } = await request.json();

    if (action === 'import_csv') {
      // Import metadata from CSV file
      const csvPath = path.resolve('static/data/screeny.csv');

      if (!fs.existsSync(csvPath)) {
        return json({ error: 'CSV file not found' }, { status: 404 });
      }

      // Read and parse CSV (simple implementation)
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        return json({ error: 'Invalid CSV format' }, { status: 400 });
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const csvData = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || null;
        });
        return row;
      });

      importScreenMetadata(csvData);
      linkScreenFilesToMetadata();

      return json({
        success: true,
        message: `Imported ${csvData.length} metadata entries`
      });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing metadata request:', error);
    return json({ error: 'Failed to process request' }, { status: 500 });
  }
}
