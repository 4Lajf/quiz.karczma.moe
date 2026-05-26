import fs from 'node:fs';
import path from 'node:path';

const INPUT_DIR = 'C:\\Users\\4Lajf\\Downloads\\nucone-openingi-mp3';
const OUTPUT_CSV = path.join(INPUT_DIR, 'nucone-openings-metadata.csv');
const API_URL = 'https://anisongdb.com/api/search_request';
const REQUEST_DELAY_MS = 1500;
const MAX_RETRIES = 6;

/** Alternate search titles for filenames that do not match AnisongDB naming. */
const TITLE_ALIASES = {
	'FateZero': ['Fate/Zero', 'Fate Zero'],
	'Shinseiki Evangelion': ['Neon Genesis Evangelion', 'Shinseiki Evangelion'],
	'Code Geass Hangyaku no Lelouch': ['Code Geass: Lelouch of the Rebellion', 'Code Geass'],
	'Hagane no Renkinjutsushi Brotherhood': ['Fullmetal Alchemist: Brotherhood'],
	'Mahou Shoujo MadokaMagica': ['Puella Magi Madoka Magica', 'Mahou Shoujo Madoka Magica'],
	'Mahou Shoujo Madoka★Magica': ['Puella Magi Madoka Magica', 'Mahou Shoujo Madoka Magica'],
	'Spy × Family': ['Spy x Family', 'SPY×FAMILY'],
	'Spy x Family': ['SPY×FAMILY', 'Spy x Family'],
	'Dragon Ball Z Tatta Hitori no Saishuu Kessen - Freezer ni Idonda Z Senshi Son Goku no Chichi':
		['Dragon Ball Z: The History of Trunks'],
	'ReZero kara Hajimeru Isekai Seikatsu': ['Re:Zero kara Hajimeru Isekai Seikatsu', 'Re:Zero'],
	'Oshi no Ko': ['[Oshi no Ko]', 'Oshi no Ko']
};

/** @param {string} message */
function log(message) {
	const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
	process.stdout.write(`[${time}] ${message}\n`);
}

/** @param {Array<Record<string, string>>} rows @param {string[]} headers */
function writeCsvFile(filePath, rows, headers) {
	const csv = [
		headers.join(','),
		...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
	].join('\r\n');
	fs.writeFileSync(filePath, csv, 'utf8');
}

const OPENING_RE = /^(.+?)\s*-\s*Opening\s+(\d+)(?:\s*\(\d+\))?\s*\.mp3$/i;

/** @param {string} animeTitle */
function normalizeTitle(animeTitle) {
	return animeTitle
		.replace(/\uFFFD/g, '')
		.replace(/\u00D7/g, 'x')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string} filename */
function parseFilename(filename) {
	const match = filename.match(OPENING_RE);
	if (!match) return null;
	return {
		filename,
		animeTitle: normalizeTitle(match[1]),
		openingNumber: Number(match[2]),
		songType: `Opening ${match[2]}`
	};
}

/** @param {unknown} value */
function csvEscape(value) {
	const text = value == null ? '' : String(value);
	if (/[",\n\r]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

/** @param {string} animeTitle */
function searchTitlesFor(animeTitle) {
	const normalized = normalizeTitle(animeTitle);
	return [normalized, ...(TITLE_ALIASES[normalized] ?? [])];
}

/** @param {number} ms */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {string} animeTitle @param {(message: string) => void} onProgress */
async function searchAnisongDB(animeTitle, onProgress = () => {}) {
	const searchTitles = searchTitlesFor(animeTitle);
	let lastError = null;

	for (const search of searchTitles) {
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			try {
				const response = await fetch(API_URL, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						anime_search_filter: {
							search,
							partial_match: true
						},
						and_logic: false,
						ignore_duplicate: false,
						opening_filter: true,
						ending_filter: false,
						insert_filter: false,
						normal_broadcast: true,
						dub: true,
						rebroadcast: true,
						standard: true,
						instrumental: true,
						chanting: true,
						character: true
					})
				});

				if (response.status === 429 || response.status === 503) {
					const waitMs = Math.min(30000, 2000 * 2 ** attempt);
					lastError = new Error(`API ${response.status}`);
					onProgress(
						`rate limited (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(waitMs / 1000)}s (search: "${search}")`
					);
					await sleep(waitMs);
					continue;
				}

				if (!response.ok) {
					throw new Error(`API ${response.status}`);
				}

				const results = await response.json();
				if (results.length > 0 || search === searchTitles.at(-1)) {
					return results;
				}

				break;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt === MAX_RETRIES) break;
				const waitMs = 2000 * 2 ** attempt;
				onProgress(`request failed (${lastError.message}), retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(waitMs / 1000)}s`);
				await sleep(waitMs);
			}
		}
	}

	throw lastError ?? new Error('Unknown API error');
}

/** @param {string} value */
function normalizeComparableTitle(value) {
	return normalizeTitle(value)
		.toLowerCase()
		.replace(/[\[\](){}]/g, ' ')
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string} value */
function titleTokens(value) {
	return normalizeComparableTitle(value).split(' ').filter((token) => token.length > 1);
}

/** @param {Array<Record<string, unknown>>} results @param {string} animeTitle @param {string} songType */
function pickBestMatch(results, animeTitle, songType) {
	const normalizedQuery = normalizeComparableTitle(animeTitle);
	const queryTokens = titleTokens(animeTitle);

	const openingMatches = results.filter((row) => row.songType === songType);
	if (openingMatches.length === 0) return null;

	const scoreRow = (row) => {
		const en = normalizeComparableTitle(String(row.animeENName ?? ''));
		const jp = normalizeComparableTitle(String(row.animeJPName ?? ''));
		const enTokens = titleTokens(en);
		const jpTokens = titleTokens(jp);
		let score = 0;

		if (en === normalizedQuery || jp === normalizedQuery) score += 100;
		else if (en.startsWith(normalizedQuery) || jp.startsWith(normalizedQuery)) score += 60;
		else if (normalizedQuery.startsWith(en) || normalizedQuery.startsWith(jp)) score += 40;

		const sharedEn = queryTokens.filter((token) => enTokens.includes(token)).length;
		const sharedJp = queryTokens.filter((token) => jpTokens.includes(token)).length;
		score += Math.max(sharedEn, sharedJp) * 12;

		if (queryTokens.length >= 2 && Math.max(sharedEn, sharedJp) < 2) score -= 100;

		if (row.animeCategory === 'TV') score += 10;
		if (row.animeType === 'TV') score += 5;
		if (!row.isDub) score += 2;
		if (!row.isRebroadcast) score += 1;

		return score;
	};

	return [...openingMatches].sort((a, b) => scoreRow(b) - scoreRow(a))[0];
}

async function main() {
	const files = fs
		.readdirSync(INPUT_DIR)
		.filter((name) => name.toLowerCase().endsWith('.mp3'))
		.sort((a, b) => a.localeCompare(b, 'en'));

	const headers = [
		'anime_title_english',
		'anime_title_romaji',
		'song_title',
		'song_artist',
		'song_composer',
		'song_arranger'
	];
	const detailHeaders = [...headers, 'source_file', 'query_anime_title', 'opening', 'status'];
	const detailCsvPath = path.join(INPUT_DIR, 'nucone-openings-metadata-details.csv');

	const rows = [];
	const failures = [];
	const total = files.length;
	let index = 0;

	log(`Starting fetch for ${total} files from ${INPUT_DIR}`);
	log(`Output: ${OUTPUT_CSV}`);

	for (const file of files) {
		index += 1;
		const prefix = `[${index}/${total}]`;

		const parsed = parseFilename(file);
		if (!parsed) {
			failures.push({ file, reason: 'Could not parse filename' });
			log(`${prefix} SKIP ${file} (could not parse filename)`);
			continue;
		}

		log(`${prefix} FETCH ${parsed.filename}`);

		try {
			const results = await searchAnisongDB(parsed.animeTitle, (message) => {
				log(`${prefix} ${message}`);
			});
			const match = pickBestMatch(results, parsed.animeTitle, parsed.songType);

			if (!match) {
				const reason = `No ${parsed.songType} found for "${parsed.animeTitle}" (${results.length} results)`;
				failures.push({ file, reason });
				rows.push({
					source_file: parsed.filename,
					query_anime_title: parsed.animeTitle,
					opening: parsed.songType,
					anime_title_english: '',
					anime_title_romaji: '',
					song_title: '',
					song_artist: '',
					song_composer: '',
					song_arranger: '',
					status: 'not_found'
				});
				log(`${prefix} NOT FOUND ${parsed.songType} for "${parsed.animeTitle}"`);
			} else {
				rows.push({
					source_file: parsed.filename,
					query_anime_title: parsed.animeTitle,
					opening: parsed.songType,
					anime_title_english: match.animeENName ?? '',
					anime_title_romaji: match.animeJPName ?? '',
					song_title: match.songName ?? '',
					song_artist: match.songArtist ?? '',
					song_composer: match.songComposer ?? '',
					song_arranger: match.songArranger ?? '',
					status: 'ok'
				});
				log(
					`${prefix} OK "${match.songName}" by ${match.songArtist} (${match.animeENName || match.animeJPName})`
				);
			}
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			failures.push({ file, reason });
			rows.push({
				source_file: parsed.filename,
				query_anime_title: parsed.animeTitle,
				opening: parsed.songType,
				anime_title_english: '',
				anime_title_romaji: '',
				song_title: '',
				song_artist: '',
				song_composer: '',
				song_arranger: '',
				status: 'error'
			});
			log(`${prefix} ERROR ${reason}`);
		}

		writeCsvFile(OUTPUT_CSV, rows, headers);
		writeCsvFile(detailCsvPath, rows, detailHeaders);

		const ok = rows.filter((row) => row.status === 'ok').length;
		const notFound = rows.filter((row) => row.status === 'not_found').length;
		const errors = rows.filter((row) => row.status === 'error').length;
		log(`${prefix} progress saved (${ok} ok, ${notFound} not found, ${errors} errors)`);

		if (index < total) {
			await sleep(REQUEST_DELAY_MS);
		}
	}

	log(`Done. Wrote ${rows.length} rows to ${OUTPUT_CSV}`);
	log(`Matched: ${rows.filter((r) => r.status === 'ok').length}`);
	log(`Not found: ${rows.filter((r) => r.status === 'not_found').length}`);
	log(`Errors: ${rows.filter((r) => r.status === 'error').length}`);

	if (failures.length > 0) {
		log('Failures:');
		for (const failure of failures) {
			log(`- ${failure.file}: ${failure.reason}`);
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
