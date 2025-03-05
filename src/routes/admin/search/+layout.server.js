// src/admin/search/+layout.server.js
export const load = ({ locals }) => {
  const config = {
    typesense: {
      'nodes': [{
        'host': 'search.lycoris.cafe', // For Typesense Cloud use xxx.a1.typesense.net
        'port': 80,      // For Typesense Cloud use 443
        'protocol': 'http'   // For Typesense Cloud use https
      }],
      'apiKey': '9ec5c0f9-85f3-494e-ab43-8225c4ffc14e',
      'connectionTimeoutSeconds': 2,
    }
  };

  return config;
};