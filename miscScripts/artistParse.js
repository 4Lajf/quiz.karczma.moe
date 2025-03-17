import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Character mappings for normalization
const CHAR_MAPPINGS = {
  "&": 'and',
  "ə": "a",
  "t": 't',
  "ˈ": '',
  "ά": "a",
  "α": "a",
  "ɪ": "i",
  'ō': 'o',
  'ó': 'o',
  'ò': 'o',
  'ö': 'o',
  'ô': 'o',
  'ø': 'o',
  'Φ': 'o',
  'ο': 'o',
  'ū': 'u',
  'û': 'u',
  'ú': 'u',
  'ù': 'u',
  'ü': 'u',
  'ǖ': 'u',
  'ä': 'a',
  '@': 'a',
  'â': 'a',
  'à': 'a',
  'á': 'a',
  'ạ': 'a',
  'å': 'a',
  'æ': 'a',
  'ā': 'a',
  '∀': 'a',
  'č': 'c',
  'é': 'e',
  'ê': 'e',
  'ё': 'e',
  'ë': 'e',
  'è': 'e',
  'ē': 'e',
  'ñ': 'n',
  '²': '2',
  '＊': '*',
  'í': 'i',
  'ί': 'i',
  '³': '3',
  '×': 'x',
  'ß': 'b',
  'β': 'b',
  'Я': 'r',
  'ς': 's',
  '˥': 'l',
  '★': ' ',
  '☆': ' ',
  '♥': ' ',
  '♡': ' ',
  '∽': '~',
  '・': ' ',
  '±': '+',
  '⇔': ' ',
  '≒': ' ',
  '〜': '~',
  '†': ' ',
  '×': 'x',
  '♪': ' ',
  '→': ' ',
  '␣': ' ',
  '∞': ' ',
};

function normalizeText(text) {
  if (!text) return text;

  let normalized = text.toLowerCase();

  // Replace special characters based on mapping
  normalized = normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics

  // Replace mapped characters
  for (const [char, replacement] of Object.entries(CHAR_MAPPINGS)) {
    normalized = normalized.replace(new RegExp(char, 'g'), replacement);
  }

  // Additional normalization
  normalized = normalized
    .replace(/[\s\-_]+/g, ' ')       // Normalize spaces and dashes
    .replace(/[◯○]/g, '0')           // Replace circle characters with zero
    .trim();                         // Remove leading/trailing whitespace

  return normalized;
}

const transformArtists = (inputArray) =>
  inputArray.map((artist, index) => ({
    id: `${index + 1}`,
    artist,                           // Original artist name
    normalizedName: normalizeText(artist), // Normalized version for searching
    displayName: artist,              // Name to display in UI
    string_length: artist.length,     // Length of original string
    normalized_length: normalizeText(artist).length // Length of normalized string
  }));

// Get input file path from command-line arguments
const inputFilePath = 'miscScripts/artist_autocomplete.json'

if (!inputFilePath) {
  console.error('Please provide an input JSON file path');
  process.exit(1);
}

try {
  // Read input file
  const rawData = fs.readFileSync(inputFilePath, 'utf8');
  const originalArray = JSON.parse(rawData);

  // Transform the array
  const transformedArray = transformArtists(originalArray);

  // Generate output file path
  const outputPath = path.join(__dirname, 'transformed_artists.json');

  // Write transformed array to file
  fs.writeFileSync(outputPath, JSON.stringify(transformedArray, null, 2));
} catch (error) {
  console.error('Error processing file:', error.message);
  process.exit(1);
}