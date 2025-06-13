<script>
	import { onMount, onDestroy } from 'svelte';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';

	export let value = '';
	export let placeholder = '';
	export let type = 'genres'; // 'genres', 'tags', 'years', 'players'
	export let disabled = false;
	export let className = '';

	let inputElement;
	let suggestions = [];
	let filteredSuggestions = [];
	let showDropdown = false;
	let selectedIndex = -1;
	let loading = false;

	// Load suggestions from API
	async function loadSuggestions() {
		if (suggestions.length > 0) return; // Already loaded
		if (typeof window === 'undefined') return; // Skip during SSR

		loading = true;
		try {
			const response = await fetch(`/api/pyrkon/autocomplete?type=${type}`);
			if (response.ok) {
				suggestions = await response.json();
			}
		} catch (error) {
			console.error('Failed to load suggestions:', error);
		} finally {
			loading = false;
		}
	}

	// Filter suggestions based on input
	function filterSuggestions(query) {
		if (!query.trim()) {
			filteredSuggestions = [];
			return;
		}

		const lowerQuery = query.toLowerCase();
		filteredSuggestions = suggestions
			.filter(item => item.toLowerCase().includes(lowerQuery))
			.slice(0, 10); // Limit to 10 suggestions
	}

	// Handle input changes
	function handleInput(event) {
		value = event.target.value;
		filterSuggestions(value);
		showDropdown = filteredSuggestions.length > 0;
		selectedIndex = -1;
	}

	// Handle keyboard navigation
	function handleKeydown(event) {
		if (!showDropdown) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, filteredSuggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedIndex >= 0) {
					selectSuggestion(filteredSuggestions[selectedIndex]);
				}
				break;
			case 'Escape':
				showDropdown = false;
				selectedIndex = -1;
				break;
		}
	}

	// Select a suggestion
	function selectSuggestion(suggestion) {
		value = suggestion;
		showDropdown = false;
		selectedIndex = -1;
		inputElement.focus();
	}

	// Handle focus
	function handleFocus() {
		loadSuggestions();
		if (value.trim()) {
			filterSuggestions(value);
			showDropdown = filteredSuggestions.length > 0;
		}
	}

	// Handle blur with delay to allow clicking on suggestions
	function handleBlur() {
		setTimeout(() => {
			showDropdown = false;
			selectedIndex = -1;
		}, 150);
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event) {
		if (inputElement && !inputElement.contains(event.target)) {
			showDropdown = false;
			selectedIndex = -1;
		}
	}

	onMount(() => {
		// Only add event listeners in the browser
		if (typeof document !== 'undefined') {
			document.addEventListener('click', handleClickOutside);
		}
		loadSuggestions();
	});

	onDestroy(() => {
		// Only remove event listeners in the browser
		if (typeof document !== 'undefined') {
			document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<div class="relative w-full">
	<Input
		bind:this={inputElement}
		bind:value
		{placeholder}
		{disabled}
		class={cn('bg-gray-800 border-gray-700 text-white placeholder:text-gray-400', className)}
		on:input={handleInput}
		on:keydown={handleKeydown}
		on:focus={handleFocus}
		on:blur={handleBlur}
	/>

	{#if loading}
		<div class="absolute right-3 top-1/2 -translate-y-1/2 transform">
			<div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"></div>
		</div>
	{/if}

	{#if showDropdown && filteredSuggestions.length > 0}
		<div class="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
			{#each filteredSuggestions as suggestion, index}
				<button
					type="button"
					class={cn(
						'w-full px-3 py-2 text-left text-white hover:bg-gray-700 focus:bg-gray-700 focus:outline-none',
						index === selectedIndex && 'bg-gray-700'
					)}
					on:click={() => selectSuggestion(suggestion)}
				>
					{suggestion}
				</button>
			{/each}
		</div>
	{/if}
</div>
