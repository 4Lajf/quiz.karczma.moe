// Node.js script to fetch data from GUS BIR1 API using NIP
// Uses built-in fetch (Node.js 18+) and no external libraries for XML parsing.

const API_KEY = 'e7b87d7546c54b8ea000';
// const companyNip = inputData.companyNip || '';
const NIP_TO_SEARCH = "7792455049";

const TEST_ENDPOINT = 'https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
const PROD_ENDPOINT = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
const SERVICE_ENDPOINT = PROD_ENDPOINT; // Change to PROD_ENDPOINT for production

const SOAP_NAMESPACE = 'http://CIS/BIR/PUBL/2014/07';
const WSA_NAMESPACE = 'http://www.w3.org/2005/08/addressing';
const DATA_CONTRACT_NAMESPACE = 'http://CIS/BIR/PUBL/2014/07/DataContract'; // Assumed namespace for search params

// --- PKD to Industry Sector Mapping ---
function determineIndustrySector(pkdCode) {
  if (!pkdCode) return null;

  // Remove any non-alphanumeric characters and convert to uppercase
  const normalizedPkd = pkdCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // Extract the numeric part for category checks (first two digits)
  const pkdDivision = normalizedPkd.substring(0, 2);
  const pkdInt = parseInt(pkdDivision, 10);

  // E-commerce
  if (normalizedPkd === '4791Z') {
    return "E-commerce";
  }

  // Uber/Bolt/Free now
  if (normalizedPkd === '4932Z') {
    return "Uber/Bolt/Free now";
  }

  // Produkcja (Divisions 10-33)
  if (pkdInt >= 10 && pkdInt <= 33) {
    return "Produkcja";
  }

  // Prawne, konsultingowe i doradcze
  if (normalizedPkd === '6910Z') {
    return "Prawne, konsultingowe i doradcze";
  }

  // Przedszkola / żłobki / oświata
  if (normalizedPkd === '7022Z') {
    return "Przedszkola / żłobki / oświata";
  }

  // Transport / logistyka
  const transportCodes = ['4941Z', '4910Z', '4920Z', '4931Z', '4939Z', '4942Z', '4950A', '4950B'];
  if (transportCodes.includes(normalizedPkd) || (pkdInt >= 50 && pkdInt <= 53)) {
    return "Transport / logistyka";
  }

  // Spółdzielnie i wspólnoty
  const spoldzielnieCodes = ['6820Z', '6832Z', '8130Z', '3530Z'];
  if (spoldzielnieCodes.includes(normalizedPkd)) {
    return "Spółdzielnie i wspólnoty";
  }

  // Budowlana / deweloperska (Divisions 41-43)
  if (pkdInt >= 41 && pkdInt <= 43) {
    return "Budowlana / deweloperska";
  }

  // Kryptowaluty
  if (normalizedPkd === '6419Z') {
    return "Kryptowaluty";
  }

  // Handel (bez e-commerce) - Divisions 45-47 excluding 4791Z
  if ((pkdInt >= 45 && pkdInt <= 47) && normalizedPkd !== '4791Z') {
    return "Handel (bez e-commerce)";
  }

  // Gastronomia / catering
  const gastronomyCodes = ['5610A', '5621Z', '5629Z', '5610B', '5630Z', '5510Z', '5520Z', '5590Z'];
  if (gastronomyCodes.includes(normalizedPkd)) {
    return "Gastronomia / catering";
  }

  // Biura rachunkowe
  const accountingCodes = ['6920Z', '6920A', '6920B', '6920C'];
  if (accountingCodes.includes(normalizedPkd)) {
    return "Biura rachunkowe";
  }

  // Return the original PKD name if no mapping is found
  return null;
}

// --- Helper Function for SOAP Requests ---
async function makeSoapRequest(action, soapBody, sessionId = null) {
  const soapAction = `${SOAP_NAMESPACE}/IUslugaBIRzewnPubl/${action}`;

  const headers = {
    'Content-Type': 'application/soap+xml; charset=utf-8',
    'SOAPAction': soapAction,
  };
  if (sessionId) {
    headers['sid'] = sessionId;
  }

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="${SOAP_NAMESPACE}" xmlns:wsa="${WSA_NAMESPACE}">
  <soap:Header>
    <wsa:To>${SERVICE_ENDPOINT}</wsa:To>
    <wsa:Action>${soapAction}</wsa:Action>
  </soap:Header>
  <soap:Body>
    ${soapBody}
  </soap:Body>
</soap:Envelope>`;

  try {
    // console.log(`Requesting Action: ${action}`);
    // console.log(`Request Body:\n${soapEnvelope}`); // Uncomment for debugging requests
    const response = await fetch(SERVICE_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: soapEnvelope,
    });

    const responseText = await response.text();
    // console.log(`Response Status: ${response.status}`);
    // console.log(`Response Text:\n${responseText}`); // Uncomment for debugging responses

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, Body: ${responseText}`);
    }
    if (responseText.includes('<ErrorCode>') && !responseText.includes('<ZalogujResult>') && !responseText.includes('<WylogujResult>')) { // Avoid flagging login/logout errors here
      const errorCodeMatch = responseText.match(/<ErrorCode>(.*?)<\/ErrorCode>/);
      const errorMessageMatch = responseText.match(/<ErrorMessagePl>(.*?)<\/ErrorMessagePl>/);
      const errorCode = errorCodeMatch ? errorCodeMatch[1] : 'Unknown';
      const errorMessage = errorMessageMatch ? errorMessageMatch[1] : 'Unknown error from API';
      // Ignore specific errors like "No data found for the specified criteria" (code 4) during report fetching, handle later
      if (errorCode !== '4') {
        throw new Error(`GUS API Error! Code: ${errorCode}, Message: ${errorMessage}`);
      } else {
        console.warn(`GUS API Info: Code ${errorCode} - ${errorMessage} (for action ${action})`);
        // Return null or specific indicator if data not found is acceptable for some reports
        if (action === 'DanePobierzPelnyRaport') return null;
      }
    }

    return responseText;
  } catch (error) {
    console.error(`Error during SOAP request for action ${action}:`, error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

// --- Helper Function to Extract Value from XML String ---
function extractValue(xmlString, tagName) {
  if (!xmlString) return null;
  const regex = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's');
  const match = xmlString.match(regex);
  if (match && match[1]) {
    return match[1].trim().replace(/&amp;/g, '&');
  }
  return null;
}

// --- Helper Function to Extract Multiple Records and Find Main PKD ---
/**
 * Parses the PKD report XML to find the main PKD.
 * @param {string|null} pkdXmlString The XML string for the PKD report.
 * @returns {object|null} An object { kod: string, nazwa: string } for the main PKD, or null.
 */
function parsePkdData(pkdXmlString, prefix) {
  if (!pkdXmlString) {
    console.warn("PKD Report XML was empty or null.");
    return null;
  }

  // Handle different element naming patterns for F vs P types
  const pkdKodTag = prefix === 'praw' ? `${prefix}_pkdKod` : `${prefix}_pkd_Kod`;
  const pkdNazwaTag = prefix === 'praw' ? `${prefix}_pkdNazwa` : `${prefix}_pkd_Nazwa`;
  const pkdPrzewazajaceTag = prefix === 'praw' ? `${prefix}_pkdPrzewazajace` : `${prefix}_pkd_Przewazajace`;

  // Regex to find all <dane> blocks within the root
  const daneBlocksRegex = /<dane>(.*?)<\/dane>/gs;
  let match;
  const pkdEntries = [];

  // Extract content of each <dane> block
  while ((match = daneBlocksRegex.exec(pkdXmlString)) !== null) {
    pkdEntries.push(match[1]); // match[1] contains the content inside <dane>...</dane>
  }

  if (pkdEntries.length === 0) {
    // Sometimes the structure might be different, try extracting directly if no <dane> blocks found but tags exist
    const mainPkdCode = extractValue(pkdXmlString, pkdKodTag);
    const mainPkdName = extractValue(pkdXmlString, pkdNazwaTag);
    const isMain = extractValue(pkdXmlString, pkdPrzewazajaceTag);
    if (mainPkdCode && mainPkdName && isMain === '1') {
      console.log("Found main PKD directly within the root.");
      return { kod: mainPkdCode, nazwa: mainPkdName };
    }
    console.warn("No <dane> blocks found in PKD report XML.");
    return null;
  }

  // Iterate through the content of each <dane> block
  for (const entryContent of pkdEntries) {
    const isMain = extractValue(entryContent, pkdPrzewazajaceTag);
    // Check if this is the main activity ('1')
    if (isMain === '1') {
      const pkdCode = extractValue(entryContent, pkdKodTag);
      const pkdName = extractValue(entryContent, pkdNazwaTag);
      if (pkdCode && pkdName) {
        console.log(`Found Main PKD: ${pkdCode} - ${pkdName}`);
        return { kod: pkdCode, nazwa: pkdName };
      }
    }
  }

  console.warn("Could not find main PKD entry (pkd_Przewazajace = '1') in the report.");
  // Fallback: If no main PKD is marked, maybe return the first one? Or null? Returning null for clarity.
  if (pkdEntries.length > 0) {
    const firstPkdCode = extractValue(pkdEntries[0], pkdKodTag);
    const firstPkdName = extractValue(pkdEntries[0], pkdNazwaTag);
    if (firstPkdCode && firstPkdName) {
      console.warn(`Returning first PKD found as fallback: ${firstPkdCode} - ${firstPkdName}`);
      // return { kod: firstPkdCode, nazwa: firstPkdName }; // Uncomment to enable fallback
    }
  }
  return null; // Main PKD not found
}


// --- API Functions ---

// 1. Zaloguj (Login)
async function login(apiKey) {
  const action = 'Zaloguj';
  const soapBody = `<ns:Zaloguj><ns:pKluczUzytkownika>${apiKey}</ns:pKluczUzytkownika></ns:Zaloguj>`;
  const responseText = await makeSoapRequest(action, soapBody);
  const match = responseText.match(/<ZalogujResult>(.*?)<\/ZalogujResult>/);
  if (match && match[1]) {
    console.log('Login successful.');
    return match[1];
  } else {
    console.error("Login Response Text:", responseText);
    throw new Error('Could not find session ID in Zaloguj response.');
  }
}

// 2. DaneSzukajPodmioty (Search by NIP)
async function searchByNip(sessionId, nip) {
  const action = 'DaneSzukajPodmioty';
  const soapBody = `<ns:DaneSzukajPodmioty>
    <ns:pParametryWyszukiwania>
      <dat:Nip xmlns:dat="${DATA_CONTRACT_NAMESPACE}">${nip}</dat:Nip>
    </ns:pParametryWyszukiwania>
  </ns:DaneSzukajPodmioty>`;
  const responseText = await makeSoapRequest(action, soapBody, sessionId);
  const resultMatch = responseText.match(/<DaneSzukajPodmiotyResult>(.*?)<\/DaneSzukajPodmiotyResult>/s);

  if (!resultMatch || !resultMatch[1]) {
    console.warn("Search Response:", responseText);
    throw new Error('Could not find DaneSzukajPodmiotyResult tag in response.');
  }

  let encodedResultXml = resultMatch[1];
  const decodedResultXml = encodedResultXml
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#xD;/g, '');

  const regonMatch = decodedResultXml.match(/<Regon>(\d{9,14})<\/Regon>/);
  const typeMatch = decodedResultXml.match(/<Typ>(P|F)<\/Typ>/);
  const nameMatch = decodedResultXml.match(/<Nazwa>(.*?)<\/Nazwa>/);

  if (regonMatch && regonMatch[1] && typeMatch && typeMatch[1]) {
    const regon = regonMatch[1];
    const type = typeMatch[1];
    const name = nameMatch ? nameMatch[1].replace(/&amp;/g, '&') : 'Name not found in search result';
    console.log(`Found entity in search: ${name}, REGON: ${regon}, Type: ${type}`);
    return { regon, type };
  } else {
    console.warn("Decoded Search Result XML:", decodedResultXml);
    console.warn("Regon Match:", regonMatch);
    console.warn("Type Match:", typeMatch);
    throw new Error('Could not find required Regon or Typ tag in the decoded DaneSzukajPodmioty result.');
  }
}

// 3a. DanePobierzPelnyRaport (Get Full General Report) - Renamed for clarity
async function getFullGeneralReport(sessionId, regon, entityType) {
  const action = 'DanePobierzPelnyRaport';
  let reportName = '';
  if (entityType === 'P') {
    reportName = 'BIR11OsPrawna';
  } else if (entityType === 'F') {
    reportName = 'BIR11OsFizycznaDaneOgolne';
  } else {
    throw new Error(`Unknown entity type: ${entityType}`);
  }
  console.log(`Requesting general report: ${reportName}`);

  const soapBody = `<ns:DanePobierzPelnyRaport>
      <ns:pRegon>${regon}</ns:pRegon>
      <ns:pNazwaRaportu>${reportName}</ns:pNazwaRaportu>
    </ns:DanePobierzPelnyRaport>`;
  const responseText = await makeSoapRequest(action, soapBody, sessionId);

  if (!responseText) { // Handle null return from makeSoapRequest (e.g., error code 4)
    console.warn(`General report ${reportName} not found or empty.`);
    return null; // Indicate no report data
  }

  const reportMatch = responseText.match(/<DanePobierzPelnyRaportResult>(.*?)<\/DanePobierzPelnyRaportResult>/s);
  if (reportMatch && reportMatch[1]) {
    let reportData = reportMatch[1].trim();
    if (reportData.startsWith('<![CDATA[')) {
      reportData = reportData.substring(9, reportData.length - 3);
    }
    reportData = reportData.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    console.log('Successfully retrieved full general report.');
    return reportData;
  } else {
    console.warn("Full General Report Response:", responseText);
    // Check for specific non-error messages if needed
    if (responseText.includes("<GetValueResult>")) {
      console.warn("Received GetValueResult instead of report data. Maybe report doesn't exist?");
      return null; // Indicate no report data found
    }
    throw new Error('Could not find report data in DanePobierzPelnyRaport response for general report.');
  }
}

// 3b. NEW: DanePobierzPelnyRaport (Get PKD Report)
async function getPkdReport(sessionId, regon, entityType) {
  const action = 'DanePobierzPelnyRaport';
  let reportName = '';
  if (entityType === 'P') {
    reportName = 'BIR11OsPrawnaPkd'; // PKD Report for Legal Entity
  } else if (entityType === 'F') {
    reportName = 'BIR11OsFizycznaPkd'; // PKD Report for Natural Person
  } else {
    throw new Error(`Unknown entity type for PKD report: ${entityType}`);
  }
  console.log(`Requesting PKD report: ${reportName}`);

  const soapBody = `<ns:DanePobierzPelnyRaport>
      <ns:pRegon>${regon}</ns:pRegon>
      <ns:pNazwaRaportu>${reportName}</ns:pNazwaRaportu>
    </ns:DanePobierzPelnyRaport>`;
  const responseText = await makeSoapRequest(action, soapBody, sessionId);

  if (!responseText) { // Handle null return from makeSoapRequest (e.g., error code 4)
    console.warn(`PKD report ${reportName} not found or empty.`);
    return null; // Indicate no report data
  }


  const reportMatch = responseText.match(/<DanePobierzPelnyRaportResult>(.*?)<\/DanePobierzPelnyRaportResult>/s);
  if (reportMatch && reportMatch[1]) {
    let reportData = reportMatch[1].trim();
    if (reportData.startsWith('<![CDATA[')) {
      reportData = reportData.substring(9, reportData.length - 3);
    }
    reportData = reportData.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    console.log('Successfully retrieved PKD report.');
    return reportData;
  } else {
    console.warn("PKD Report Response:", responseText);
    // Check for specific non-error messages if needed
    if (responseText.includes("<GetValueResult>")) {
      console.warn("Received GetValueResult instead of report data. Maybe report doesn't exist or has no PKD?");
      return null; // Indicate no report data found
    }
    // Don't throw an error if PKD report is missing, just return null
    console.warn('Could not find report data tag in DanePobierzPelnyRaport response for PKD report. Report might be empty.');
    return null;
  }
}


// 4. Wyloguj (Logout)
async function logout(sessionId) {
  const action = 'Wyloguj';
  const soapBody = `<ns:Wyloguj><ns:pIdentyfikatorSesji>${sessionId}</ns:pIdentyfikatorSesji></ns:Wyloguj>`;
  try {
    await makeSoapRequest(action, soapBody, sessionId);
    console.log('Logout successful.');
  } catch (error) {
    console.error('Error during logout:', error.message);
  }
}

// --- Main Execution ---
async function fetchGusDataByNip(apiKey, nip) {
  if (!apiKey || apiKey === 'YOUR_GUS_API_KEY' || apiKey.length < 10) {
    console.error('Error: Please provide a valid GUS API key.');
    return;
  }
  if (!nip || !/^\d{10}$/.test(nip)) {
    console.error('Error: Please provide a valid 10-digit NIP number.');
    return;
  }

  let sessionId = null;
  let generalReportXml = null;
  let pkdReportXml = null;

  try {
    // 1. Login
    sessionId = await login(apiKey);

    // 2. Search by NIP
    const { regon, type } = await searchByNip(sessionId, nip);
    const prefix = type === 'P' ? 'praw' : 'fiz';

    // 3a. Get Full General Report
    generalReportXml = await getFullGeneralReport(sessionId, regon, type);
    // Only log if report was actually retrieved
    if (generalReportXml) {
      console.log('\n--- Full General Report XML ---');
      console.log(generalReportXml);
      console.log('--- End of General Report ---');
    } else {
      console.log('\n--- Full General Report XML: Not Found or Empty ---');
    }


    // 3b. Get PKD Report
    pkdReportXml = await getPkdReport(sessionId, regon, type);
    if (pkdReportXml) {
      console.log('\n--- PKD Report XML ---');
      console.log(pkdReportXml);
      console.log('--- End of PKD Report ---');
    } else {
      console.log('\n--- PKD Report XML: Not Found or Empty ---');
    }

    // 4. Parse PKD Data
    const mainPkd = parsePkdData(pkdReportXml, prefix); // Will return null if no PKD found

    // --- Extracting specific fields ---
    // Initialize with defaults or 
    const extractedData = {
      nip: '',
      branza: '', // Will be updated from main PKD name
      glownePkdKod: '', // Will be updated from main PKD code
      glownePkdNazwa: '', // Will be updated from main PKD name
      adres: '',
      adres2: '',
      miejscowosc: '',
      stanRegion: '',
      kodPocztowy: '',
      kodRegion: '',
      numerTelefonu: '',
      nazwa: '',
      regon: '',
      email: '',
      dataPowstania: '',
      dataRozpoczeciaDzialalnosci: '',
      formaPrawna: '',
      szczegolnaFormaPrawna: '',
    };

    // Populate from General Report if available
    if (generalReportXml) {
      extractedData.nip = extractValue(generalReportXml, `${prefix}_nip`) || extractedData.nip;

      // Different field for natural persons (name fields)
      if (type === 'F') {
        const nazwisko = extractValue(generalReportXml, `fiz_nazwisko`) || '';
        const imie1 = extractValue(generalReportXml, `fiz_imie1`) || '';
        const imie2 = extractValue(generalReportXml, `fiz_imie2`) || '';
        extractedData.nazwa = `${imie1} ${imie2 ? imie2 + ' ' : ''}${nazwisko}`.trim();
      } else {
        extractedData.nazwa = extractValue(generalReportXml, `${prefix}_nazwa`) || extractedData.nazwa;
      }

      extractedData.adres2 = extractValue(generalReportXml, `${prefix}_adSiedzNumerLokalu`) || extractedData.adres2;
      extractedData.miejscowosc = extractValue(generalReportXml, `${prefix}_adSiedzMiejscowosc_Nazwa`) || extractedData.miejscowosc;
      extractedData.stanRegion = extractValue(generalReportXml, `${prefix}_adSiedzWojewodztwo_Nazwa`) || extractedData.stanRegion;
      extractedData.kodPocztowy = extractValue(generalReportXml, `${prefix}_adSiedzKodPocztowy`) || extractedData.kodPocztowy;
      extractedData.kodRegion = (extractValue(generalReportXml, `${prefix}_adSiedzKraj_Symbol`) || '') +
        (extractValue(generalReportXml, `${prefix}_adSiedzKraj_Nazwa`) ? ` (${extractValue(generalReportXml, `${prefix}_adSiedzKraj_Nazwa`)})` : '') || extractedData.kodRegion;
      extractedData.numerTelefonu = extractValue(generalReportXml, `${prefix}_numerTelefonu`) || extractedData.numerTelefonu;
      extractedData.regon = extractValue(generalReportXml, `${prefix}_regon9`) || extractValue(generalReportXml, `${prefix}_regon14`) || extractedData.regon;
      extractedData.email = extractValue(generalReportXml, `${prefix}_adresEmail`) || extractedData.email;

      // Different field names for dates
      if (type === 'F') {
        extractedData.dataPowstania = extractValue(generalReportXml, `fiz_dataWpisuPodmiotuDoRegon`) || extractedData.dataPowstania;
        extractedData.dataRozpoczeciaDzialalnosci = extractValue(generalReportXml, `fiz_dataWpisuPodmiotuDoRegon`) || extractedData.dataRozpoczeciaDzialalnosci;
      } else {
        extractedData.dataPowstania = extractValue(generalReportXml, `${prefix}_dataPowstania`) || extractedData.dataPowstania;
        extractedData.dataRozpoczeciaDzialalnosci = extractValue(generalReportXml, `${prefix}_dataRozpoczeciaDzialalnosci`) || extractedData.dataRozpoczeciaDzialalnosci;
      }

      extractedData.formaPrawna = extractValue(generalReportXml, `${prefix}_podstawowaFormaPrawna_Nazwa`) || extractedData.formaPrawna;
      extractedData.szczegolnaFormaPrawna = extractValue(generalReportXml, `${prefix}_szczegolnaFormaPrawna_Nazwa`) || extractedData.szczegolnaFormaPrawna;

      const ulica = extractValue(generalReportXml, `${prefix}_adSiedzUlica_Nazwa`);
      const numerNieruchomosci = extractValue(generalReportXml, `${prefix}_adSiedzNumerNieruchomosci`);
      if (ulica && numerNieruchomosci) extractedData.adres = `${ulica} ${numerNieruchomosci}`;
      else if (ulica) extractedData.adres = ulica;
      else if (numerNieruchomosci) extractedData.adres = numerNieruchomosci;

    } else {
      // Fallback: Try getting basic info like NIP/Regon from the search result if general report failed
      const searchResultRegon = await searchByNip(sessionId, nip).then(res => res.regon).catch(() => null); // Re-search might be inefficient
      if (searchResultRegon) extractedData.regon = searchResultRegon;
      extractedData.nip = nip; // We know the NIP we searched for
      console.warn("General report was empty, some fields will remain ''.")
    }


    // Populate from PKD Report if available
    if (mainPkd) {
      extractedData.glownePkdKod = mainPkd.kod;
      extractedData.glownePkdNazwa = mainPkd.nazwa;

      // Determine industry sector (branża) from PKD code
      const industrySector = determineIndustrySector(mainPkd.kod);
      if (industrySector) {
        extractedData.branza = industrySector;
      } else {
        extractedData.branza = mainPkd.nazwa; // Fallback to PKD name if no specific industry mapping found
      }
    }

    console.log('\n--- Final Extracted Data ---');
    console.log(JSON.stringify(extractedData, null, 2));
    console.log('--- End of Final Extracted Data ---');
    return extractedData;

  } catch (error) {
    console.error('\n--- An error occurred during the process ---');
    console.error(error.message);
    // Log reports if they were fetched before the error
    // if (generalReportXml) console.error('\n--- General Report XML at time of error ---\n', generalReportXml);
    // if (pkdReportXml) console.error('\n--- PKD Report XML at time of error ---\n', pkdReportXml);
  } finally {
    // 5. Logout
    if (sessionId) {
      await logout(sessionId);
    }
  }
}

// Run the main function
const companyData = await fetchGusDataByNip(API_KEY, NIP_TO_SEARCH);
// output = { company: companyData };