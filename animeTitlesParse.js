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
  "0": "o",
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

const transformAnimeTitles = (inputObject) => {
  return Object.entries(inputObject)
    .map(([id, anime]) => {
      if (!anime.animeJPName && !anime.animeENName && (!Array.isArray(anime.animeAltName) || anime.animeAltName.length === 0)) {
        return null;
      }

      const entry = {
        id,
        // Separate original titles by type with the requested naming
        romajiTitle: anime.animeJPName || null,
        englishTitle: anime.animeENName || null,
        altTitles: Array.isArray(anime.animeAltName) ? anime.animeAltName.filter(name => name) : [],
        
        // Normalized versions
        normalizedRomajiTitle: anime.animeJPName ? normalizeText(anime.animeJPName) : null,
        normalizedEnglishTitle: anime.animeENName ? normalizeText(anime.animeENName) : null,
        normalizedAltTitles: Array.isArray(anime.animeAltName) 
          ? anime.animeAltName.filter(name => name).map(name => normalizeText(name)) 
          : []
      };
      
      // Calculate lengths
      if (entry.romajiTitle) {
        entry.romajiTitleLength = entry.romajiTitle.length;
        entry.normalizedRomajiTitleLength = entry.normalizedRomajiTitle.length;
      }
      
      if (entry.englishTitle) {
        entry.englishTitleLength = entry.englishTitle.length;
        entry.normalizedEnglishTitleLength = entry.normalizedEnglishTitle.length;
      }
      
      if (entry.altTitles.length > 0) {
        entry.altTitleLengths = entry.altTitles.map(title => title.length);
        entry.normalizedAltTitleLengths = entry.normalizedAltTitles.map(title => title.length);
      }

      return entry;
    })
    .filter(entry => entry !== null);
};

// Get input file path
const inputFilePath = 'miscScripts/anime_autocomplete.json';

if (!inputFilePath) {
  console.error('Please provide an input JSON file path');
  process.exit(1);
}

try {
  // Read input file
  const rawData = fs.readFileSync(inputFilePath, 'utf8');
  const originalObject = JSON.parse(rawData);

  // Transform the object with normalization
  const transformedArray = transformAnimeTitles(originalObject);

  // Generate output file path
  const outputPath = path.join(__dirname, 'transformed_anime_names.json');

  // Write transformed array to file
  fs.writeFileSync(outputPath, JSON.stringify(transformedArray, null, 2));

  console.log('Successfully processed anime titles and saved to:', outputPath);
} catch (error) {
  console.error('Error processing file:', error.message);
  process.exit(1);
}