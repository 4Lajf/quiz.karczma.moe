import fs from 'node:fs';
import path from 'node:path';

const TARGET_DIR = 'C:\\Users\\4Lajf\\Downloads\\nucone-openingi-mp3';
const PREFIX_RE = /^\d{3} - /;

/** @param {string} message */
function log(message) {
	const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
	process.stdout.write(`[${time}] ${message}\n`);
}

/** @param {number} maxExclusive */
function shuffledNumbers(maxExclusive) {
	const numbers = Array.from({ length: maxExclusive }, (_, index) => index);
	for (let i = numbers.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[numbers[i], numbers[j]] = [numbers[j], numbers[i]];
	}
	return numbers;
}

function main() {
	const entries = fs
		.readdirSync(TARGET_DIR, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b, 'en'));

	if (entries.length > 999) {
		throw new Error(`Too many files (${entries.length}). 3-digit prefixes only support up to 999 files.`);
	}

	const prefixes = shuffledNumbers(1000).slice(0, entries.length);
	const planned = entries.map((filename, index) => {
		const baseName = filename.replace(PREFIX_RE, '');
		const prefix = String(prefixes[index]).padStart(3, '0');
		return {
			from: filename,
			to: `${prefix} - ${baseName}`
		};
	});

	const targetNames = new Set(planned.map((item) => item.to));
	if (targetNames.size !== planned.length) {
		throw new Error('Generated duplicate target filenames.');
	}

	log(`Randomizing ${planned.length} mp3 files in ${TARGET_DIR}`);

	for (const [index, item] of planned.entries()) {
		const step = `[${index + 1}/${planned.length}]`;
		const fromPath = path.join(TARGET_DIR, item.from);
		const toPath = path.join(TARGET_DIR, item.to);

		if (item.from === item.to) {
			log(`${step} SKIP ${item.from}`);
			continue;
		}

		if (fs.existsSync(toPath)) {
			throw new Error(`${step} Target already exists: ${item.to}`);
		}

		fs.renameSync(fromPath, toPath);
		log(`${step} ${item.from} -> ${item.to}`);
	}

	log('Done.');
}

main();
