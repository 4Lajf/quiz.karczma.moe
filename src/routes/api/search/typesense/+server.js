// src/routes/api/search/typesense/+server.js
import { json } from '@sveltejs/kit';
import Typesense from 'typesense';
import { TYPESENSE_API_KEY } from '$env/static/private'
// Create Typesense client on server side
const searchClient = new Typesense.Client({
  nodes: [
    {
      host: 'search.lycoris.cafe',
      port: 443,
      protocol: 'https'
    }
  ],
  apiKey: TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 2
});

export async function GET({ url }) {
  const query = url.searchParams.get('q');
  const type = url.searchParams.get('type') || 'songs'; // 'songs', 'artists', or 'anime'
  const index = url.searchParams.get('index') || '';
  const searchKey = url.searchParams.get('searchKey') || '';

  if (!query || !index) {
    return json({ hits: [] });
  }

  try {
    // Different search parameters based on type
    const queryBy =
      type === 'anime'
        ? 'normalizedRomajiTitle,normalizedEnglishTitle,normalizedAltTitles'
        : 'normalizedName';

    const searchParameters = {
      q: query,
      query_by: queryBy,
      per_page: 25,
      drop_tokens_threshold: 1,
      typo_tokens_threshold: 1,
      prioritize_exact_match: true,
      prioritize_token_position: true,
      prefix: true,
      infix: query.length > 3 ? 'always' : 'off',
      num_typos: 2,
      min_len_1typo: 3,
      min_len_2typo: 5,
      split_join_tokens: true,
      text_match_type: 'max_score',
      highlight_full_fields:
        type === 'anime'
          ? 'normalizedRomajiTitle,normalizedEnglishTitle,normalizedAltTitles'
          : `normalizedName,${searchKey}`,
      highlight_start_tag: '<mark>',
      highlight_end_tag: '</mark>',
      sort_by: '_text_match:desc'
    };

    const response = await searchClient.collections(index).documents().search(searchParameters);
    return json({ hits: response.hits || [] });
  } catch (error) {
    console.error('Typesense search error:', error);
    return json({ hits: [], error: error.message }, { status: 500 });
  }
}