import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(root, 'static', 'data', 'anisongdb-2025-2026-tv-openings-webm');
const csvPath = join(root, 'static', 'data', 'anisongdb-2025-2026-tv-openings.csv');
const sourceBaseUrl = 'https://naedist.animemusicquiz.com/';
const seasons = [
  'Winter 2025',
  'Spring 2025',
  'Summer 2025',
  'Fall 2025',
  'Winter 2026',
  'Spring 2026',
  'Summer 2026',
  'Fall 2026'
];
const header = [
  'FileName',
  'difficulty',
  'diff',
  'JPName',
  'ENName',
  'Vintage',
  'SongName',
  'Artist',
  'Difficulty',
  'Length',
  'easy',
  'med',
  'hard',
  'very hard',
  'Genres',
  'Tags'
];

mkdirSync(outputDir, { recursive: true });

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function safeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeFileName(song) {
  const anime = safeName(song.animeENName || song.animeJPName || 'Unknown Anime');
  const title = safeName(song.songName || 'Unknown Song');
  const artist = safeName(song.songArtist || 'Unknown Artist');
  const descriptor = `${anime} - ${title} by ${artist}`.slice(0, 170).trim();
  return `${descriptor} [amq-${song.amqSongId}].webm`;
}

function difficultyBucket(score) {
  if (score == null || Number.isNaN(Number(score))) return 'medium';
  const value = Number(score);
  if (value < 40) return 'easy';
  if (value < 60) return 'medium';
  if (value < 80) return 'hard';
  return 'very hard';
}

function decimalComma(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  return Number(value).toFixed(3).replace('.', ',');
}

async function postSeason(season) {
  const response = await fetch('https://anisongdb.com/api/season_request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ season, ignore_duplicate: false })
  });

  if (!response.ok) {
    throw new Error(`AniSongDB ${season} request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function contentLength(url) {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) return null;
  const length = response.headers.get('content-length');
  return length ? Number(length) : null;
}

async function downloadFile(song, index, total) {
  const url = `${sourceBaseUrl}${song.HQ}`;
  const target = join(outputDir, song.FileName);
  const expectedLength = await contentLength(url);

  if (expectedLength && existsSync(target) && statSync(target).size === expectedLength) {
    console.log(`[${index}/${total}] skip ${song.FileName}`);
    return;
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${song.HQ}: ${response.status} ${response.statusText}`);
  }

  const temp = `${target}.part`;
  try {
    await pipeline(response.body, createWriteStream(temp));
    if (expectedLength && statSync(temp).size !== expectedLength) {
      throw new Error(`Size mismatch for ${song.HQ}: expected ${expectedLength}, got ${statSync(temp).size}`);
    }
    renameSync(temp, target);
    console.log(`[${index}/${total}] saved ${song.FileName}`);
  } catch (error) {
    if (existsSync(temp)) unlinkSync(temp);
    throw error;
  }
}

async function runPool(items, worker, concurrency = 8) {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index + 1, items.length);
    }
  });
  await Promise.all(workers);
}

const allSongs = [];
for (const season of seasons) {
  const songs = await postSeason(season);
  console.log(`${season}: ${songs.length} rows`);
  allSongs.push(...songs);
}

const rows = allSongs
  .filter((song) =>
    song.animeType === 'TV' &&
    /^Opening\b/i.test(song.songType || '') &&
    typeof song.HQ === 'string' &&
    song.HQ.endsWith('.webm')
  )
  .map((song) => {
    const bucket = difficultyBucket(song.songDifficulty);
    return {
      ...song,
      FileName: makeFileName(song),
      difficulty: bucket,
      diff: bucket
    };
  });

const csv = [
  header.join(','),
  ...rows.map((song) =>
    [
      song.FileName,
      song.difficulty,
      song.diff,
      song.animeJPName,
      song.animeENName,
      song.animeVintage,
      song.songName,
      song.songArtist,
      song.songDifficulty == null ? '' : Math.round(Number(song.songDifficulty)),
      decimalComma(song.songLength),
      '',
      '',
      '',
      '',
      '',
      ''
    ].map(csvEscape).join(',')
  )
].join('\n');

writeFileSync(csvPath, `${csv}\n`, 'utf8');
console.log(`Wrote ${rows.length} CSV rows to ${csvPath}`);
console.log(`Selected ${rows.length} TV opening rows with HQ WEBM files`);
console.log(`Skipped ${allSongs.length - rows.length} rows outside the TV opening HQ WEBM filter`);

await runPool(rows, downloadFile, 8);
console.log(`Done. Files are in ${outputDir}`);
