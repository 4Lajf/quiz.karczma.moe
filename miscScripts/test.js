const data = `[
  { "success": 1, "data": 2 },
  true,
  { "synonyms": 3 },
  [4],
  { "id": 5, "root": 6, "synonyms": 7 },
  "v01s4mlm1",
  "",
  [8, 9],
  "phone",
  "mobile"
]`;

function extractSynonymId(parsedData) {
  // Look for strings that match the pattern of IDs (starts with 'v' followed by numbers and letters)
  for (const item of parsedData) {
    if (
      typeof item === 'string' &&
      item.match(/^v\d+[a-z0-9]+$/i)  // Matches patterns like v01s4mlm1
    ) {
      return item;
    }
  }
  return null;
}

function extractSynonyms(dataString) {
  // Parse the JSON string into a JavaScript object
  const parsedData = JSON.parse(dataString);
  
  const synonymPairs = [];
  const id = extractSynonymId(parsedData);
  
  // Look for consecutive non-empty strings
  for (let i = 0; i < parsedData.length - 1; i++) {
    if (
      typeof parsedData[i] === 'string' && 
      typeof parsedData[i + 1] === 'string' &&
      parsedData[i].length > 0 &&
      parsedData[i + 1].length > 0 &&
      !parsedData[i].includes('[') &&  // Exclude array-like strings
      !parsedData[i + 1].includes('[')
    ) {
      synonymPairs.push({
        id: id,
        word1: parsedData[i],
        word2: parsedData[i + 1]
      });
    }
  }
  
  return synonymPairs;
}

try {
  // Extract and log the synonyms
  const foundSynonyms = extractSynonyms(data);
  console.log('Found synonyms:', foundSynonyms);
} catch (error) {
  console.error('Error parsing JSON:', error);
}