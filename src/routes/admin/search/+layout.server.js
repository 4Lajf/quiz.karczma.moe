// src/admin/search/+layout.server.js
import { PUBLIC_TYPESENSE_API_KEY } from '$env/static/public';
export const load = ({ locals }) => {
  const config = {
    typesense: {
      'nodes': [{
        'host': 'search.karczma.moe', // For Typesense Cloud use xxx.a1.typesense.net
        'port': 80,      // For Typesense Cloud use 443
        'protocol': 'http'   // For Typesense Cloud use https
      }],
      'apiKey': PUBLIC_TYPESENSE_API_KEY,
      'connectionTimeoutSeconds': 2,
    }
  };

  return config;
};