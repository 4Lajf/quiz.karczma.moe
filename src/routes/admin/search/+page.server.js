// src/admin/search/+page.server.js
import Typesense from 'typesense';
import axios from 'axios'
const HOST = 'search.karczma.moe';
import { PUBLIC_TYPESENSE_API_KEY } from '$env/static/public';

const createClient = () => {
  return new Typesense.Client({
    'nodes': [{
      'host': 'search.karczma.moe', // For Typesense Cloud use xxx.a1.typesense.net
      'port': 80,      // For Typesense Cloud use 443
      'protocol': 'http'   // For Typesense Cloud use https
    }],
    'apiKey': PUBLIC_TYPESENSE_API_KEY,
    'connectionTimeoutSeconds': 2,
    // logLevel: 'debug'
  });
};

export const load = async () => {
  const config = {
    'nodes': [{
      'host': 'search.karczma.moe', // For Typesense Cloud use xxx.a1.typesense.net
      'port': 80,      // For Typesense Cloud use 443
      'protocol': 'http'   // For Typesense Cloud use https
    }],
    'apiKey': PUBLIC_TYPESENSE_API_KEY,
    'connectionTimeoutSeconds': 2,
  };

  try {
    const client = createClient();
    const collections = await client.collections().retrieve();

    const serializedCollections = collections.map(collection => ({
      uid: collection.name,
      primaryKey: collection.fields.find(f => f.index)?.name || '',
      stats: {
        numberOfDocuments: collection.num_documents || 0
      }
    }));

    return {
      indexes: serializedCollections,
      typesense: {
        nodes: config.nodes,
        apiKey: config.apiKey,
        connectionTimeoutSeconds: config.connectionTimeoutSeconds
      }
    };
  } catch (error) {
    console.error('Typesense connection error:', error);
    return {
      indexes: [],
      error: error.message || 'Failed to connect to Typesense server',
      typesense: {
        nodes: config.nodes,
        apiKey: config.apiKey,
        connectionTimeoutSeconds: config.connectionTimeoutSeconds
      }
    };
  }
};

export const actions = {
  addDocuments: async ({ request }) => {
    try {
      const data = await request.formData();
      const file = data.get('file');
      const collectionName = data.get('indexName');

      const documents = JSON.parse(await file.text());
      const firstDoc = documents[0];

      // Create schema from first document
      const schema = {
        name: collectionName,
        fields: Object.keys(firstDoc).map(key => {
          const value = firstDoc[key];
          let type = 'string';
          let fieldConfig = {
            name: key,
            facet: false,
            optional: true,
          };

          if (Array.isArray(value)) {
            fieldConfig.type = 'string[]';
            fieldConfig.stem = true;   // Enable stemming for string arrays
            fieldConfig.infix = true;
          } else if (typeof value === 'number') {
            fieldConfig.type = Number.isInteger(value) ? 'int32' : 'float';
            // Numeric fields don't get stem or infix
          } else if (typeof value === 'boolean') {
            fieldConfig.type = 'bool';
            // Boolean fields don't get stem or infix
          } else {
            // String fields
            fieldConfig.type = 'string';
            fieldConfig.stem = true;
            fieldConfig.infix = true;
          }

          return fieldConfig;
        }),
        // Expanded token separators to include more special characters
        // token_separators: [
        //   '~', '@', '/', '\\', '#', '$', '%', '^', '&', '*', '+', '=',
        //   '|', '<', '>', '(', ')', '[', ']', '{', '}', ',', ';', ':',
        //   "'", '"', '`'
        // ],
        // Updated symbols to index
        // symbols_to_index: [
        //   '-', '_', '.', '@', '%', '&', '=', '<', '>', '(', ')', '[', ']',
        //   '{', '}', '/', '!', '#', '$', '%', '*', '+', ';', ':', "'", '"',
        //   ',', '.', '^', '`', '?', '\\'
        // ],
        symbols_to_index: [
          '&',
        ]
      };

      // Create collection using Axios
      try {
        const createResponse = await axios({
          method: 'POST',
          url: `https://${HOST}/collections`,
          headers: {
            'Content-Type': 'application/json',
            'X-TYPESENSE-API-KEY': PUBLIC_TYPESENSE_API_KEY
          },
          data: schema
        });

        console.log('Collection created:', createResponse.data);
      } catch (error) {
        // Ignore if collection already exists (409 error)
        if (error.response?.status !== 409) {
          console.error('Collection creation error:', error.response?.data || error.message);
          return {
            success: false,
            error: `Failed to create collection: ${error.response?.data?.message || error.message}`
          };
        }
      }

      // Import documents using Typesense JS API
      const client = new Typesense.Client({
        nodes: [{
          host: HOST,
          port: '443',
          protocol: 'https'
        }],
        apiKey: PUBLIC_TYPESENSE_API_KEY,
        connectionTimeoutSeconds: 10
      });

      const importResponse = await client
        .collections(collectionName)
        .documents()
        .import(documents);

      return JSON.stringify({
        success: true,
      });

    } catch (error) {
      console.error('Import error:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to add documents'
      });
    }
  },
  deleteIndex: async ({ request }) => {
    try {
      const data = await request.formData();
      const collectionName = data.get('indexUid');
      const client = createClient();
      await client.collections(collectionName).delete();
      return JSON.stringify({
        success: true,
      });
    } catch (error) {
      console.error('Delete index error:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete collection'
      });
    }
  },

  getSynonyms: async ({ request }) => {
    try {
      const client = createClient();
      const data = await request.formData();
      const collectionName = data.get('indexUid');
      let synonyms = await client.collections(collectionName).synonyms().retrieve()
      console.log(synonyms)
      return JSON.stringify({
        success: true,
        data: synonyms.synonyms
      });
    } catch (error) {
      console.error('Get synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to retrieve synonyms'
      });
    }
  },

  addSynonyms: async ({ request }) => {
    try {
      const client = createClient();
      const data = await request.formData();
      const collectionName = data.get('indexUid');
      let synonyms = JSON.parse(data.get('synonyms'));
      synonyms = {
        "synonyms": synonyms
      }
      const synonymId = Math.random().toString(36).substr(2, 9);
      await client.collections(collectionName).synonyms().upsert(synonymId, synonyms)
      return JSON.stringify({
        success: true,
      });
    } catch (error) {
      console.error('Add synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to add synonyms'
      })
    }
  },

  addBatchSynonyms: async ({ request }) => {
    try {
      const data = await request.formData();
      const collectionName = data.get('indexUid');
      const synonymsData = JSON.parse(data.get('synonyms'));

      // Process each synonym group
      const results = await Promise.all(
        synonymsData.map(async (group) => {
          try {
            await axios({
              method: 'PUT',
              url: `https://${HOST}/collections/${collectionName}/synonyms/${group.id}`,
              headers: {
                'Content-Type': 'application/json',
                'X-TYPESENSE-API-KEY': PUBLIC_TYPESENSE_API_KEY
              },
              data: {
                synonyms: group.synonyms
              }
            });
            return { success: true, id: group.id };
          } catch (error) {
            return JSON.stringify({
              success: false,
              id: group.id,
              error: error.response?.data?.message || error.message
            });
          }
        })
      );

      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        return JSON.stringify({
          success: false,
          error: `Failed to add some synonyms: ${failures.map(f => f.id).join(', ')}`,
          details: failures
        });
      }

      return JSON.stringify({
        success: true,
        message: `Successfully added ${results.length} synonym groups`
      });
    } catch (error) {
      console.error('Batch add synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to add synonyms batch'
      });
    }
  },

  deleteSynonyms: async ({ request }) => {
    try {
      const client = createClient();
      const data = await request.formData();
      const collectionName = data.get('indexUid');
      const synonymId = data.get('synonymId');
      await client.collections(collectionName).synonyms(synonymId).delete()
      return JSON.stringify({
        success: true,
      });
    } catch (error) {
      console.error('Delete synonyms error:', error);
      JSON.stringify({
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to delete synonyms'
      })
    }
  },

  getOneWaySynonyms: async ({ request }) => {
    try {
      // Since Typesense doesn't natively support one-way synonyms, 
      // we'll store them in server-side storage or use a separate mechanism
      const data = await request.formData();
      const collectionName = data.get('indexUid');

      // Retrieve one-way synonyms from a local storage mechanism
      // This could be a database table, a JSON file, or another storage method
      // For this example, we'll use an in-memory store (replace with your actual storage method)
      const oneWaySynonyms = await retrieveOneWaySynonyms(collectionName);

      return JSON.stringify({
        success: true,
        data: oneWaySynonyms
      });
    } catch (error) {
      console.error('Get one-way synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to retrieve one-way synonyms'
      });
    }
  },

  addOneWaySynonyms: async ({ request }) => {
    try {
      const data = await request.formData();
      const collectionName = data.get('indexUid');
      const root = data.get('root');
      const synonyms = JSON.parse(data.get('synonyms'));

      // Create a one-way synonym object
      const oneWaySynonym = {
        root,
        synonyms
      };

      // Store the one-way synonym 
      await storeOneWaySynonym(collectionName, oneWaySynonym);

      return JSON.stringify({
        success: true,
      });
    } catch (error) {
      console.error('Add one-way synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to add one-way synonyms'
      });
    }
  },

  addBatchOneWaySynonyms: async ({ request }) => {
    try {
      const data = await request.formData();
      const collectionName = data.get('indexUid');
      const oneWaySynonymsData = JSON.parse(data.get('oneWaySynonyms'));

      // Validate input
      if (!Array.isArray(oneWaySynonymsData)) {
        throw new Error('Input must be an array of one-way synonym objects');
      }

      // Store batch of one-way synonyms
      await storeBatchOneWaySynonyms(collectionName, oneWaySynonymsData);

      return JSON.stringify({
        success: true,
        message: `Successfully added ${oneWaySynonymsData.length} one-way synonym groups`
      });
    } catch (error) {
      console.error('Batch add one-way synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to add one-way synonyms batch'
      });
    }
  },

  deleteOneWaySynonyms: async ({ request }) => {
    try {
      const data = await request.formData();
      const collectionName = data.get('indexUid');
      const index = parseInt(data.get('index'), 10);

      // Delete a specific one-way synonym group
      await deleteOneWaySynonym(collectionName, index);

      return JSON.stringify({
        success: true,
      });
    } catch (error) {
      console.error('Delete one-way synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete one-way synonyms'
      });
    }
  },

  deleteAllSynonyms: async ({ request }) => {
    try {
      const data = await request.formData();
      const collectionName = data.get('indexUid');

      // Retrieve all existing synonyms
      const client = createClient();
      const existingSynonyms = await client.collections(collectionName).synonyms().retrieve();

      // Delete each synonym
      for (const synonym of existingSynonyms.synonyms) {
        await client.collections(collectionName).synonyms(synonym.id).delete();
      }

      return JSON.stringify({
        success: true,
        message: `Deleted ${existingSynonyms.synonyms.length} synonym groups`
      });
    } catch (error) {
      console.error('Delete all synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete all synonyms'
      });
    }
  },

  deleteAllOneWaySynonyms: async ({ request }) => {
    try {
      const data = await request.formData();
      const collectionName = data.get('indexUid');

      // Clear one-way synonyms from the in-memory storage
      if (ONE_WAY_SYNONYMS_STORAGE[collectionName]) {
        ONE_WAY_SYNONYMS_STORAGE[collectionName] = [];
      }

      return JSON.stringify({
        success: true,
        message: 'Deleted all one-way synonym groups'
      });
    } catch (error) {
      console.error('Delete all one-way synonyms error:', error);
      return JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete all one-way synonyms'
      });
    }
  },
};

const ONE_WAY_SYNONYMS_STORAGE = {};

async function retrieveOneWaySynonyms(collectionName) {
  return ONE_WAY_SYNONYMS_STORAGE[collectionName] || [];
}

async function storeOneWaySynonym(collectionName, synonym) {
  if (!ONE_WAY_SYNONYMS_STORAGE[collectionName]) {
    ONE_WAY_SYNONYMS_STORAGE[collectionName] = [];
  }
  ONE_WAY_SYNONYMS_STORAGE[collectionName].push(synonym);
}

async function storeBatchOneWaySynonyms(collectionName, synonyms) {
  if (!ONE_WAY_SYNONYMS_STORAGE[collectionName]) {
    ONE_WAY_SYNONYMS_STORAGE[collectionName] = [];
  }
  ONE_WAY_SYNONYMS_STORAGE[collectionName].push(...synonyms);
}

async function deleteOneWaySynonym(collectionName, index) {
  if (ONE_WAY_SYNONYMS_STORAGE[collectionName]) {
    ONE_WAY_SYNONYMS_STORAGE[collectionName].splice(index, 1);
  }
}