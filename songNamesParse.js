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
  const transformedEntries = [];

  Object.entries(inputObject).forEach(([id, anime]) => {
    if (anime.animeJPName || anime.animeENName || (Array.isArray(anime.animeAltName) && anime.animeAltName.length > 0)) {
      const entry = { id };

      // Japanese title
      if (anime.animeJPName) {
        entry.originalNameJP = anime.animeJPName;
        entry.normalizedNameJP = normalizeText(anime.animeJPName);
        entry.lengthJP = anime.animeJPName.length.toString();
        entry.normalizedLengthJP = normalizeText(anime.animeJPName).length.toString();
      }

      // English title
      if (anime.animeENName) {
        entry.originalNameEN = anime.animeENName;
        entry.normalizedNameEN = normalizeText(anime.animeENName);
        entry.lengthEN = anime.animeENName.length.toString();
        entry.normalizedLengthEN = normalizeText(anime.animeENName).length.toString();
      }

      // Alternative titles
      if (Array.isArray(anime.animeAltName)) {
        const validAltNames = anime.animeAltName.filter(name => name);
        if (validAltNames.length > 0) {
          entry.originalNamesAlt = validAltNames.join('||');
          entry.normalizedNamesAlt = validAltNames.map(name => normalizeText(name)).join('||');
          entry.lengthsAlt = validAltNames.map(name => name.length).join('||');
          entry.normalizedLengthsAlt = validAltNames.map(name => normalizeText(name).length).join('||');
        }
      }

      transformedEntries.push(entry);
    }
  });

  return transformedEntries;
};

// Get input file path from command-line arguments
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