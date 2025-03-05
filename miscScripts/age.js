import { readFileSync } from 'fs';

const parseVintage = (vintage) => {
    const year = parseInt(vintage.split(' ')[1]);
    return year;
};

const countPre2000Songs = (data) => {
    let count = 0;
    let totalSongs = 0;

    try {
        if (!data.songs?.length) {
            throw new Error('Invalid data format: songs array not found');
        }

        totalSongs = data.songs.length;

        count = data.songs.reduce((acc, { songInfo }) => {
            if (songInfo?.vintage) {
                const year = parseVintage(songInfo.vintage);
                return year < 2005 ? acc + 1 : acc;
            }
            return acc;
        }, 0);

        console.log(`Found ${count} songs from before 2000 out of ${totalSongs} total songs`);
        console.log(`Percentage: ${((count / totalSongs) * 100).toFixed(2)}%`);

    } catch (error) {
        console.error('Error processing songs:', error.message);
        throw error;
    }

    return count;
};

try {
    const fileName = 'miscScripts/amq2.json';
    const jsonData = JSON.parse(readFileSync(fileName, 'utf8'));
    countPre2000Songs(jsonData);
} catch (error) {
    if (error.code === 'ENOENT') {
        console.error('Error: File not found. Please ensure songs.json exists in the current directory.');
    } else {
        console.error('Error reading or parsing JSON file:', error.message);
    }
}