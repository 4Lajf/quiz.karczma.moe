import fs from 'node:fs';
import path from 'node:path';

const TARGET_DIR = 'C:\\Users\\4Lajf\\Downloads\\nucone-openingi-mp3';
const MAIN_CSV = path.join(TARGET_DIR, 'nucone-openings-metadata.csv');
const DETAILS_CSV = path.join(TARGET_DIR, 'nucone-openings-metadata-details.csv');
const PREFIX_RE = /^(\d{3}) - (.+\.mp3)$/i;

/** @param {unknown} value */
function csvEscape(value) {
	const text = value == null ? '' : String(value);
	if (/[",\n\r]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

/** @param {string} line */
function parseCsvLine(line) {
	const values = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i += 1) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i += 1;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			values.push(current);
			current = '';
		} else {
			current += char;
		}
	}

	values.push(current);
	return values;
}

/** @param {string[]} headers @param {Record<string, string>[]} rows */
function writeCsv(filePath, headers, rows) {
	const csv = [
		headers.join(','),
		...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
	].join('\r\n');
	fs.writeFileSync(filePath, csv, 'utf8');
}

function main() {
	const prefixBySourceFile = new Map(
		fs
			.readdirSync(TARGET_DIR)
			.filter((name) => PREFIX_RE.test(name))
			.map((name) => {
				const match = name.match(PREFIX_RE);
				return [match[2], match[1]];
			})
	);

	const detailsLines = fs.readFileSync(DETAILS_CSV, 'utf8').trimEnd().split(/\r?\n/);
	const detailHeaders = parseCsvLine(detailsLines[0]);
	const sourceFileIndex = detailHeaders.indexOf('source_file');

	const detailRows = detailsLines.slice(1).map((line) => {
		const values = parseCsvLine(line);
		const row = Object.fromEntries(detailHeaders.map((header, index) => [header, values[index] ?? '']));
		const prefix = prefixBySourceFile.get(row.source_file);
		if (!prefix) {
			throw new Error(`No prefix found for source file: ${row.source_file}`);
		}
		return { ...row, number: prefix };
	});

	detailRows.sort((a, b) => Number(a.number) - Number(b.number));

	const mainHeaders = [
		'number',
		'anime_title_english',
		'anime_title_romaji',
		'song_title',
		'song_artist',
		'song_composer',
		'song_arranger'
	];

	const detailHeadersOut = [
		'number',
		...detailHeaders.filter((header) => header !== 'number'),
		'renamed_file'
	];

	const mainRows = detailRows.map((row) => ({
		number: row.number,
		anime_title_english: row.anime_title_english,
		anime_title_romaji: row.anime_title_romaji,
		song_title: row.song_title,
		song_artist: row.song_artist,
		song_composer: row.song_composer,
		song_arranger: row.song_arranger
	}));

	const detailRowsOut = detailRows.map((row) => ({
		...Object.fromEntries(detailHeaders.map((header) => [header, row[header]])),
		number: row.number,
		renamed_file: `${row.number} - ${row.source_file}`
	}));

	writeCsv(MAIN_CSV, mainHeaders, mainRows);
	writeCsv(DETAILS_CSV, detailHeadersOut, detailRowsOut);

	console.log(`Rewrote ${mainRows.length} rows in ${MAIN_CSV}`);
	console.log(`First: ${mainRows[0].number} - ${mainRows[0].song_title}`);
	console.log(`Last: ${mainRows.at(-1).number} - ${mainRows.at(-1).song_title}`);
}

main();
