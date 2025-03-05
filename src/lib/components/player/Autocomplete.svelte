<!-- Autocomplete.svelte -->
<script>
	const SCORE_GAP_THRESHOLD = 100_000;
	const MIN_FIELD_SCORE = 1000; // Minimum required field score
	const USE_HYBRID_SEARCH = true; // Toggle between hybrid and full Typesense search

	import { onMount, onDestroy } from 'svelte';
	import Typesense from 'typesense';
	import Awesomplete from 'awesomplete';
	import { cn } from '$lib/utils';

	export let value = '';
	export let placeholder = '';
	export let index = '';
	export let searchKey = '';
	export let disabled = false;
	export let type = 'songs'; // 'songs', 'artists', or 'anime'

	let inputElement;
	let awesomplete;
	let isLoading = false;
	let currentInputValue = value;
	let suggestionsList = [];

	const searchClient = new Typesense.Client({
		nodes: [
			{
				host: 'search.lycoris.cafe',
				port: 443,
				protocol: 'https'
			}
		],
		apiKey: '9ec5c0f9-85f3-494e-ab43-8225c4ffc14e',
		connectionTimeoutSeconds: 2
	});

	function handleTab(event) {
		if (awesomplete && awesomplete.opened) {
			const highlighted = awesomplete.ul.querySelector('[aria-selected="true"]');
			if (highlighted) {
				event.preventDefault();
				awesomplete.select();
			}
		}
	}

	function getSuggestionByValue(value) {
		return suggestionsList.find((s) => s.value === value);
	}

	async function performSubstringSearch(query) {
		try {
			const params = new URLSearchParams({
				q: query,
				type
			});
			const response = await fetch(`/api/search/substring?${params}`);
			if (!response.ok) throw new Error('Substring search failed');
			const data = await response.json();
			return data.hits || [];
		} catch (error) {
			console.error('Substring search error:', error);
			return [];
		}
	}

	async function performTypesenseSearch(query) {
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
			return response.hits || [];
		} catch (error) {
			console.error('Typesense search error:', error);
			return [];
		}
	}

	function mergeResults(substringHits, typesenseHits) {
		// Start with substring matches as they're more intuitive
		const merged = [...substringHits];

		// Pre-filter Typesense hits to remove low-scoring results
		const filteredByScore = typesenseHits.filter((hit) => {
			const score = hit.text_match_info?.text_match || hit.text_match || 0;
			return score >= MIN_FIELD_SCORE;
		});

		// Sort filtered Typesense hits by best_field_score in descending order
		const sortedTypesenseHits = [...filteredByScore].sort((a, b) => {
			const scoreA = a.text_match_info?.text_match || a.text_match || 0;
			const scoreB = b.text_match_info?.text_match || b.text_match || 0;
			return scoreB - scoreA;
		});

		// Filter Typesense results based on score gap threshold
		const filteredTypesenseHits = [];
		let previousScore = null;

		for (const hit of sortedTypesenseHits) {
			const currentScore = hit.text_match_info?.text_match || hit.text_match || 0;

			if (previousScore === null) {
				// Always include the first result
				filteredTypesenseHits.push(hit);
				previousScore = currentScore;
			} else {
				// Check if the gap between scores is within threshold
				if (previousScore - currentScore <= SCORE_GAP_THRESHOLD) {
					filteredTypesenseHits.push(hit);
					previousScore = currentScore;
				} else {
					// Stop including results once we hit a gap larger than threshold
					break;
				}
			}
		}

		// Add filtered Typesense results if they don't exist in substring matches
		for (const hit of filteredTypesenseHits) {
			// Standardize comparison for songs and artists
			let exists = false;

			if (type === 'anime') {
				// For anime, check against all title fields
				exists = merged.some((m) => m.document.id === hit.document?.id);
			} else {
				// For songs and artists - simplified consistent approach
				const hitValue = hit.document?.[searchKey]?.toLowerCase();
				exists =
					hitValue &&
					merged.some((m) => {
						const mValue = m.document?.[searchKey]?.toLowerCase();
						return mValue === hitValue;
					});
			}

			if (!exists) {
				// Create a new hit object with adjusted score but preserving original match info
				merged.push({
					...hit,
					text_match: 70, // Cap fuzzy match scores below substring matches
					text_match_info: {
						...hit.text_match_info,
						best_field_score: hit.text_match_info?.text_match || hit.text_match || 0,
						best_field_weight: hit.text_match_info?.weight || 1,
						fields_matched: hit.text_match_info?.fields_matched || 1,
						tokens_matched: hit.highlight?.normalizedName?.matched_tokens?.length || 0,
						typo_prefix_score: hit.text_match_info?.typo_prefix_score || 0,
						// Not a substring match or exact match
						exactMatch: false,
						startsWith: false,
						isSubstring: false
					}
				});
			}
		}

		// Standardized sorting for all types
		merged.sort((a, b) => {
			const infoA = a.text_match_info || {};
			const infoB = b.text_match_info || {};

			// Prioritize exact matches
			if (infoA.exactMatch && !infoB.exactMatch) return -1;
			if (!infoA.exactMatch && infoB.exactMatch) return 1;

			// Then prioritize prefix matches
			if (infoA.startsWith && !infoB.startsWith) return -1;
			if (!infoA.startsWith && infoB.startsWith) return 1;

			// Then prioritize substring matches
			if (infoA.isSubstring && !infoB.isSubstring) return -1;
			if (!infoA.isSubstring && infoB.isSubstring) return 1;

			// For the same match type, sort by string length for non-song types
			if (
				type !== 'songs' &&
				infoA.exactMatch === infoB.exactMatch &&
				infoA.startsWith === infoB.startsWith &&
				infoA.isSubstring === infoB.isSubstring
			) {
				let lenA, lenB;

				if (type === 'anime') {
					// For anime, use the displayed title length
					const displayTitleA = a.document?.displayTitle || a.document?.animeTitle || '';
					const displayTitleB = b.document?.displayTitle || b.document?.animeTitle || '';
					lenA = displayTitleA.length;
					lenB = displayTitleB.length;
				} else {
					// For artists
					lenA = a.document?.string_length || a.document?.[searchKey]?.length || 0;
					lenB = b.document?.string_length || b.document?.[searchKey]?.length || 0;
				}

				if (lenA !== lenB) {
					return lenA - lenB; // Sort by length ascending
				}
			}

			// Finally, sort by score within the same match type and length
			return b.text_match - a.text_match;
		});

		return merged.slice(0, 25); // Limit to 25 results
	}

	onMount(() => {
		if (inputElement) {
			inputElement.addEventListener('keydown', (event) => {
				if (event.key === 'Tab') {
					handleTab(event);
				}
			});

			awesomplete = new Awesomplete(inputElement, {
				minChars: 1,
				maxItems: 25,
				autoFirst: true,
				filter: () => true,
				sort: false,
				data: function (item) {
					return {
						label: item.label,
						value: item.value
					};
				},
				item: function (suggestion) {
					const li = document.createElement('li');

					if (suggestion.value === '' && suggestion.label === 'No matches found') {
						li.innerHTML = `
      <div class="p-4 text-center">
        <span class="text-gray-400">No matches found</span>
      </div>
    `;
						li.className = 'cursor-default';
						return li;
					}

					const fullSuggestion = getSuggestionByValue(suggestion.value);
					if (!fullSuggestion) return li;

					// Get the original text and any substring match info
					const originalText = fullSuggestion.value.replace(/k>\s*/g, ''); // Remove k> tokens
					const matchInfo = fullSuggestion.matchInfo || {};

					// Create highlighted version of original text based on match type
					let highlightedText = originalText;
					const query = currentInputValue.toLowerCase();

					if (matchInfo.isSubstring) {
						// Helper function to normalize text (remove diacritics)
						const normalizeText = (text) => {
							return text
								.normalize('NFD')
								.replace(/[\u0300-\u036f]/g, '')
								.toLowerCase();
						};

						const normalizedOriginal = normalizeText(originalText);
						const normalizedQuery = normalizeText(query);

						// Find all possible match positions in the normalized text
						let matches = [];
						let pos = -1;
						while ((pos = normalizedOriginal.indexOf(normalizedQuery, pos + 1)) !== -1) {
							matches.push({
								start: pos,
								end: pos + normalizedQuery.length
							});
						}

						// Apply highlights while preserving original case
						if (matches.length > 0) {
							// Sort matches in reverse order to avoid position shifts when adding markup
							matches.sort((a, b) => b.start - a.start);

							// Apply highlights for each match
							for (const match of matches) {
								highlightedText =
									highlightedText.slice(0, match.start) +
									'<mark>' +
									highlightedText.slice(match.start, match.end) +
									'</mark>' +
									highlightedText.slice(match.end);
							}
						}
					} else if (fullSuggestion.highlight) {
						// For fuzzy matches from Typesense, handle differently based on type
						if (type === 'anime') {
							// For anime, use the highlighted version of the best matching title
							const matchField =
								fullSuggestion.highlight?.normalizedRomajiTitle ||
								fullSuggestion.highlight?.normalizedEnglishTitle ||
								fullSuggestion.highlight?.normalizedAltTitle;

							if (matchField && matchField.matched_tokens) {
								const tokens = matchField.matched_tokens;
								// Split the original text into words
								const words = originalText.split(' ');

								// Highlight words that match tokens
								highlightedText = words
									.map((word) => {
										const normalizedWord = word.toLowerCase().replace(/[!?.@]/g, '');
										if (tokens.some((token) => normalizedWord.includes(token))) {
											return `<mark>${word}</mark>`;
										}
										return word;
									})
									.join(' ');
							}
						} else {
							// Original logic for songs/artists
							if (fullSuggestion.highlight?.normalizedName?.matched_tokens) {
								const tokens = fullSuggestion.highlight.normalizedName.matched_tokens;
								highlightedText = originalText
									.replace(/k>\s*/g, '') // Remove k> tokens
									.split(' ')
									.map((word) => {
										// Check if this word is in matched_tokens
										const normalized = word.toLowerCase().replace(/[!?.]/g, '');
										if (tokens.some((token) => normalized.includes(token))) {
											return `<mark>${word}</mark>`;
										}
										return word;
									})
									.join(' ');
							}
						}
					}

					const matchType = matchInfo.exactMatch
						? 'Exact'
						: matchInfo.startsWith
							? 'Prefix'
							: matchInfo.isSubstring
								? 'Substring'
								: 'Fuzzy';

					li.innerHTML = `
    <div class="px-2 py-1">
      <div class="mb-1">
        <span class="text-base">${highlightedText}</span>
      </div>
    </div>
  `;
					li.className = cn('cursor-pointer', 'hover:bg-gray-800/50 text-gray-100');
					return li;
				}
			});

			inputElement.addEventListener('awesomplete-selectcomplete', (event) => {
				if (event.text.value === '') {
					event.preventDefault();
					return;
				}
			});

			inputElement.addEventListener('awesomplete-select', (event) => {
				value = event.text.value;
				currentInputValue = event.text.value;
			});

			inputElement.addEventListener('awesomplete-close', () => {
				if (inputElement) {
					inputElement.value = currentInputValue;
				}
			});
		}
	});

	// In the Autocomplete.svelte file, modify the handleInput function:

	async function handleInput(event) {
		const query = event.target.value;
		currentInputValue = query;
		value = query;

		if (query.length < 1) {
			awesomplete.list = [];
			suggestionsList = [];
			return;
		}

		isLoading = true;
		try {
			let substringHits = [];
			let typesenseHits = [];

			// Use the same approach for both songs and artists
			if (USE_HYBRID_SEARCH) {
				[substringHits, typesenseHits] = await Promise.all([
					performSubstringSearch(query),
					performTypesenseSearch(query)
				]);
			} else {
				typesenseHits = await performTypesenseSearch(query);
			}

			const mergedHits = mergeResults(substringHits, typesenseHits);

			if (mergedHits.length > 0) {
				let rawSuggestions = [];

				if (type === 'anime') {
					// Special handling for anime
					rawSuggestions = mergedHits.map((hit) => {
						const displayTitle =
							hit.document?.displayTitle ||
							hit.document?.animeTitle ||
							hit.document?.englishTitle ||
							hit.document?.romajiTitle ||
							(hit.document?.altTitles?.length > 0 ? hit.document.altTitles[0] : '');

						return {
							label: displayTitle,
							value: displayTitle,
							id: hit.document?.id,
							textScore: Number(hit.text_match) || 0,
							highlight: hit.highlight || null,
							matchInfo: hit.text_match_info || {},
							titleType: hit.document?.matchType || null
						};
					});
				} else {
					// Unified handling for songs and artists
					rawSuggestions = mergedHits.map((hit) => {
						// Safely access document and properties
						const docValue = hit.document?.[searchKey];
						const cleanValue = docValue ? docValue.replace(/k>/g, '') : '';

						return {
							label: cleanValue,
							value: cleanValue,
							id: hit.document?.id,
							textScore: Number(hit.text_match) || 0,
							highlight: hit.highlight || null,
							matchInfo: hit.text_match_info || {}
						};
					});
				}

				// Filter out items with empty values and remove duplicates
				const uniqueValues = new Set();
				suggestionsList = rawSuggestions.filter((suggestion) => {
					const normalizedValue = suggestion.value?.toLowerCase()?.trim();
					if (normalizedValue && !uniqueValues.has(normalizedValue)) {
						uniqueValues.add(normalizedValue);
						return true;
					}
					return false;
				});

				awesomplete.list = suggestionsList.map(({ label, value }) => ({ label, value }));
				awesomplete.evaluate();
				awesomplete.open();
			} else {
				suggestionsList = [{ label: 'No matches found', value: '', isNoMatch: true }];
				awesomplete.list = suggestionsList;
				awesomplete.evaluate();
				awesomplete.open();
			}
		} catch (error) {
			console.error('Search error:', error);
			awesomplete.list = [];
			suggestionsList = [];
		} finally {
			isLoading = false;
		}
	}

	onDestroy(() => {
		if (awesomplete) {
			awesomplete.destroy();
		}
	});

	$: if (inputElement && value !== inputElement.value) {
		inputElement.value = value;
		currentInputValue = value;
	}
</script>

<div class="relative w-full">
	<input
		bind:this={inputElement}
		{placeholder}
		{disabled}
		on:input={handleInput}
		class={cn(
			'w-full rounded-md border px-4 py-2',
			'border-gray-700 bg-gray-800 text-base text-gray-100',
			'placeholder:text-gray-500',
			'focus:outline-none focus:ring-2 focus:ring-gray-600',
			disabled && 'cursor-not-allowed opacity-50'
		)}
	/>

	{#if isLoading}
		<div class="absolute right-3 top-1/2 -translate-y-1/2 transform">
			<div
				class="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"
			></div>
		</div>
	{/if}
</div>

<style>
	:global(.awesomplete) {
		width: 100%;
	}

	:global(.awesomplete > ul) {
		position: absolute;
		left: 0;
		right: 0;
		background: theme('colors.gray.900');
		border: 1px solid theme('colors.gray.800');
		border-radius: theme('borderRadius.md');
		margin-top: 0.25rem;
		max-height: 500px;
		overflow-y: auto;
		padding: 0;
		z-index: 50;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}

	:global(.awesomplete > ul > li) {
		position: relative;
		border-bottom: 1px solid theme('colors.gray.800');
	}

	:global(.awesomplete > ul > li:last-child) {
		border-bottom: none;
	}

	:global(.awesomplete > ul > li[aria-selected='true']) {
		background: theme('colors.gray.800');
		color: theme('colors.gray.100');
	}

	:global(.awesomplete > ul > li[aria-selected='true'] .text-gray-400) {
		color: theme('colors.gray.300');
	}

	:global(.awesomplete mark) {
		background: transparent;
		color: theme('colors.blue.400');
		font-weight: 600;
		padding: 0;
	}

	:global(.awesomplete > ul[hidden]) {
		display: none;
	}
</style>
