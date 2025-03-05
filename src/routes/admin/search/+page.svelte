<script>
//src/routes/admin/search/+page.svelte	
	import { onMount } from 'svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { Upload, Plus, Trash2 } from 'lucide-svelte';
	import { parseResponse } from '$lib/mystuff.js';

	export let data;
	let indexes = data.indexes || [];
	let file;
	let activeTab = 'indexes';
	let fileInput;
	let indexName = '';
	let loading = false;
	let selectedIndex = null;
	let showBatchInput = false;
	let batchSynonymsText = '';

	// Existing synonym variables
	let synonymGroups = [];
	let newSynonymWords = ['', '']; // Ensure this is initialized with at least two empty strings

	// New state for one-way synonyms
	let oneWaySynonyms = []; // Added initialization
	let oneWaySynonymRoot = '';
	let oneWaySynonymWords = [''];
	let showOneWaySynonymBatch = false;
	let oneWaySynonymBatchText = '';

	async function deleteAllOneWaySynonyms() {
		if (!selectedIndex) {
			toast.error('Please select a collection first');
			return;
		}

		if (
			!confirm(
				'Are you absolutely sure you want to delete ALL one-way synonym groups? This cannot be undone.'
			)
		) {
			return;
		}

		loading = true;
		try {
			const form = new FormData();
			form.append('indexUid', selectedIndex);

			const response = await fetch('?/deleteAllOneWaySynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);

			if (result.success) {
				toast.success('All one-way synonym groups deleted successfully');
				oneWaySynonyms = []; // Clear local state for one-way synonyms
				await loadOneWaySynonyms(selectedIndex);
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	async function deleteAllSynonyms() {
		if (!selectedIndex) {
			toast.error('Please select a collection first');
			return;
		}

		if (
			!confirm(
				'Are you absolutely sure you want to delete ALL synonym groups? This cannot be undone.'
			)
		) {
			return;
		}

		loading = true;
		try {
			const form = new FormData();
			form.append('indexUid', selectedIndex);

			const response = await fetch('?/deleteAllSynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);

			if (result.success) {
				toast.success('All synonym groups deleted successfully');
				synonymGroups = []; // Clear local state for traditional synonyms
				await loadSynonyms(selectedIndex);
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	function addWordToOneWaySynonym() {
		oneWaySynonymWords = [...oneWaySynonymWords, ''];
	}

	function removeWordFromOneWaySynonym(index) {
		if (oneWaySynonymWords.length > 1) {
			oneWaySynonymWords = oneWaySynonymWords.filter((_, i) => i !== index);
		}
	}

	async function addBatchOneWaySynonyms() {
		if (!selectedIndex) {
			toast.error('Please select a collection first');
			return;
		}

		try {
			// Validate JSON format
			const synonymsData = JSON.parse(oneWaySynonymBatchText);

			// Basic validation of structure
			if (!Array.isArray(synonymsData)) {
				throw new Error('Input must be an array of one-way synonym objects');
			}

			// Validate each group
			synonymsData.forEach((group, index) => {
				if (!group.root || !Array.isArray(group.synonyms) || group.synonyms.length === 0) {
					throw new Error(`Invalid one-way synonym group at index ${index}`);
				}
			});

			loading = true;
			const form = new FormData();
			form.append('indexUid', selectedIndex);
			form.append('oneWaySynonyms', oneWaySynonymBatchText);

			const response = await fetch('?/addBatchOneWaySynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);

			if (result.success) {
				toast.success(result.message);
				showOneWaySynonymBatch = false;
				oneWaySynonymBatchText = '';
				await loadOneWaySynonyms(selectedIndex);
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	async function addOneWaySynonymGroup() {
		if (!selectedIndex) {
			toast.error('Please select a collection first');
			return;
		}

		// Filter out empty words and check minimum requirement
		const words = oneWaySynonymWords.filter((word) => word.trim() !== '');
		if (!oneWaySynonymRoot.trim()) {
			toast.error('Please add a root word');
			return;
		}
		if (words.length === 0) {
			toast.error('Please add at least one synonym');
			return;
		}

		loading = true;
		try {
			const form = new FormData();
			form.append('indexUid', selectedIndex);
			form.append('root', oneWaySynonymRoot);
			form.append('synonyms', JSON.stringify(words));

			const response = await fetch('?/addOneWaySynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);
			if (result.success) {
				toast.success('One-way synonym group added successfully');
				oneWaySynonymRoot = ''; // Reset input
				oneWaySynonymWords = ['']; // Reset input
				await loadOneWaySynonyms(selectedIndex); // Reload synonyms
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	// New function to load one-way synonyms
	async function loadOneWaySynonyms(indexUid) {
		loading = true;
		try {
			const form = new FormData();
			form.append('indexUid', indexUid);

			const response = await fetch('?/getOneWaySynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);

			if (result.success) {
				selectedIndex = indexUid;
				// Typesense doesn't natively support one-way synonyms, so we'll store these client-side
				oneWaySynonyms = result.data || [];
				console.log('Parsed one-way synonyms:', oneWaySynonyms);
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error('One-way synonyms error:', error);
			toast.error(error.message);
			selectedIndex = null;
			oneWaySynonyms = [];
		} finally {
			loading = false;
		}
	}

	async function deleteOneWaySynonymGroup(index) {
		if (!confirm('Are you sure you want to delete this one-way synonym group?')) return;

		loading = true;
		try {
			const form = new FormData();
			form.append('indexUid', selectedIndex);
			form.append('index', index);

			const response = await fetch('?/deleteOneWaySynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);
			if (result.success) {
				toast.success('One-way synonym group deleted successfully');
				await loadOneWaySynonyms(selectedIndex);
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	function addWordToGroup() {
		newSynonymWords = [...newSynonymWords, ''];
	}

	function removeWordFromGroup(index) {
		if (newSynonymWords.length > 2) {
			newSynonymWords = newSynonymWords.filter((_, i) => i !== index);
		}
	}

	async function addBatchSynonyms() {
		if (!selectedIndex) {
			toast.error('Please select a collection first');
			return;
		}

		try {
			// Validate JSON format
			const synonymsData = JSON.parse(batchSynonymsText);

			// Basic validation of structure
			if (!Array.isArray(synonymsData)) {
				throw new Error('Input must be an array of synonym groups');
			}

			// Validate each group
			synonymsData.forEach((group, index) => {
				if (!group.id || !Array.isArray(group.synonyms) || group.synonyms.length < 2) {
					throw new Error(`Invalid synonym group at index ${index}`);
				}
			});

			loading = true;
			const form = new FormData();
			form.append('indexUid', selectedIndex);
			form.append('synonyms', batchSynonymsText);

			const response = await fetch('?/addBatchSynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);

			if (result.success) {
				toast.success(result.message);
				showBatchInput = false;
				batchSynonymsText = '';
				await loadSynonyms(selectedIndex);
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	async function loadSynonyms(indexUid) {
		loading = true;
		try {
			const form = new FormData();
			form.append('indexUid', indexUid);

			const response = await fetch('?/getSynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);

			if (result.success) {
				selectedIndex = indexUid;
				// The data is now an array of synonym objects
				synonymGroups = result.data.map((group) => ({
					id: group.id,
					synonyms: group.synonyms
				}));

				console.log('Parsed synonyms:', synonymGroups);
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error('Synonyms error:', error);
			toast.error(error.message);
			selectedIndex = null;
			synonymGroups = [];
		} finally {
			loading = false;
		}
	}
	async function addSynonymGroup() {
		if (!selectedIndex) {
			toast.error('Please select a collection first');
			return;
		}

		// Filter out empty words and check minimum requirement
		const words = newSynonymWords.filter((word) => word.trim() !== '');
		if (words.length < 2) {
			toast.error('Please add at least 2 words for the synonym group');
			return;
		}

		loading = true;
		try {
			const form = new FormData();
			form.append('indexUid', selectedIndex);
			form.append('synonyms', JSON.stringify(words));

			const response = await fetch('?/addSynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);
			if (result.success) {
				toast.success('Synonym group added successfully');
				newSynonymWords = ['', '']; // Reset input
				await loadSynonyms(selectedIndex); // Reload synonyms
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	async function deleteSynonymGroup(groupId) {
		if (!confirm('Are you sure you want to delete this synonym group?')) return;

		loading = true;
		try {
			const form = new FormData();
			form.append('indexUid', selectedIndex);
			form.append('synonymId', groupId);

			const response = await fetch('?/deleteSynonyms', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);
			if (result.success) {
				toast.success('Synonym group deleted successfully');
				await loadSynonyms(selectedIndex);
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	async function handleAddDocuments(event) {
		event.preventDefault();
		if (!file) {
			toast.error('Please select a file');
			return;
		}

		loading = true;
		try {
			const form = new FormData();
			form.append('file', file);
			form.append('indexName', indexName);

			const response = await fetch('?/addDocuments', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			console.log(result.data)
			result = parseResponse(result.data);
			if (result.success) {
				toast.success(`Successfully imported ${result.imported} documents`);
				fileInput.value = '';
				file = null;
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.log(error);
			console.error('Error details:', error);
			toast.error(error.message);
		} finally {
			loading = false;
		}
	}

	function handleFileChange(event) {
		const selectedFile = event.target.files[0];
		if (selectedFile && selectedFile.type === 'application/json') {
			file = selectedFile;
		} else {
			toast.error('Please select a JSON file');
			event.target.value = '';
		}
	}

	async function deleteIndex(indexUid) {
		if (!confirm(`Are you sure you want to delete collection ${indexUid}?`)) return;

		try {
			const form = new FormData();
			form.append('indexUid', indexUid);

			const response = await fetch('?/deleteIndex', {
				method: 'POST',
				body: form
			});

			let result = await response.json();
			result = parseResponse(result.data);
			if (result.success) {
				toast.success(result.message || 'Collection deleted successfully');
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error('Delete error:', error);
			toast.error(error.message);
		}
	}
</script>

<div class="container p-6 mx-auto">
	<h1 class="mb-8 text-3xl font-bold text-gray-100">Typesense Dashboard</h1>

	<Tabs.Root value={activeTab} onValueChange={(v) => (activeTab = v)}>
		<Tabs.List>
			<Tabs.Trigger value="indexes">Indexes</Tabs.Trigger>
			<Tabs.Trigger value="add">Add Documents</Tabs.Trigger>
			<Tabs.Trigger value="synonyms">Synonyms</Tabs.Trigger>
			<Tabs.Trigger value="one-way-synonyms">One-Way Synonyms</Tabs.Trigger>
		</Tabs.List>

		<!-- Indexes Tab -->
		<Tabs.Content value="indexes">
			<Card.Root class="mt-4">
				<Card.Header>
					<Card.Title>Indexes</Card.Title>
					<Card.Description>View and manage your Typesense indexes</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="space-y-4">
						{#if indexes.length === 0}
							<p class="text-gray-300">No indexes found</p>
						{:else}
							{#each indexes as index}
								<Card.Root class="bg-gray-800 border-gray-700">
									<Card.Content class="p-4">
										<div class="flex items-center justify-between">
											<div>
												<h3 class="text-lg font-medium text-gray-200">{index.uid}</h3>
												<p class="text-sm text-gray-400">
													Documents: {index.stats?.numberOfDocuments || 0}
												</p>
											</div>
											<div class="space-x-2">
												<Button
													variant="outline"
													class="text-red-400 bg-gray-800 border-red-900 hover:bg-gray-700"
													on:click={() => deleteIndex(index.uid)}
												>
													Delete
												</Button>
											</div>
										</div>
									</Card.Content>
								</Card.Root>
							{/each}
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<!-- Add Documents Tab -->
		<Tabs.Content value="add">
			<Card.Root class="mt-4">
				<Card.Header>
					<Card.Title>Add Documents</Card.Title>
					<Card.Description>Upload JSON documents to your Typesense index</Card.Description>
				</Card.Header>
				<Card.Content>
					<form on:submit={handleAddDocuments} class="space-y-4">
						<div>
							<!-- svelte-ignore a11y_label_has_associated_control -->
							<label class="block mb-1 text-sm font-medium text-gray-200">Index Name</label>
							<Input
								bind:value={indexName}
								required
								placeholder="Enter index name"
								class="text-gray-100 bg-gray-800 border-gray-700 placeholder:text-gray-500"
							/>
						</div>
						<div class="space-y-2">
							<!-- svelte-ignore a11y_label_has_associated_control -->
							<label class="block mb-1 text-sm font-medium text-gray-200">Upload JSON File</label>
							<div class="flex items-center justify-center w-full">
								<label
									class="flex flex-col items-center justify-center w-full h-32 bg-gray-800 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer hover:bg-gray-700"
								>
									<div class="flex flex-col items-center justify-center pt-5 pb-6">
										<Upload class="w-8 h-8 mb-2 text-gray-300" />
										<p class="mb-2 text-sm text-gray-300">
											<span class="font-semibold">Click to upload</span>
											or drag and drop
										</p>
										<p class="text-xs text-gray-300">JSON files only</p>
									</div>
									<input
										bind:this={fileInput}
										type="file"
										accept=".json,application/json"
										class="hidden"
										on:change={handleFileChange}
									/>
								</label>
							</div>
							{#if file}
								<p class="text-sm text-gray-300">Selected: {file.name}</p>
							{/if}
						</div>
						<Button
							type="submit"
							class="w-full text-white bg-blue-600 hover:bg-blue-700"
							disabled={loading || !file}
						>
							{loading ? 'Adding...' : 'Add Documents'}
						</Button>
					</form>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<!-- Settings Tab -->
		<!-- Inside your settings tab content -->
		<Tabs.Content value="synonyms">
			<Card.Root class="mt-4">
				<Card.Header>
					<Card.Title>Manage Synonyms</Card.Title>
					<Card.Description>Add and manage synonym groups for your Typesense index</Card.Description
					>
				</Card.Header>
				<Card.Content>
					<div class="space-y-4">
						<div>
							<!-- Select Index -->
							<!-- svelte-ignore a11y_label_has_associated_control -->
							<label class="block mb-2 text-sm font-medium text-gray-200">Select Index</label>
							<select
								class="w-full px-3 py-2 text-gray-100 bg-gray-800 border border-gray-700 rounded-md"
								on:change={(e) => loadSynonyms(e.target.value)}
							>
								<option value="">Select an index</option>
								{#each indexes as index}
									<option value={index.uid}>{index.uid}</option>
								{/each}
							</select>
						</div>

						{#if selectedIndex}
							<!-- Batch Import Section -->
							<Card.Root class="bg-gray-800 border-gray-700">
								<Card.Header class="flex flex-row items-center justify-between">
									<div>
										<Card.Title>Batch Import Synonyms</Card.Title>
										<Card.Description
											>Add multiple synonym groups at once using JSON format</Card.Description
										>
									</div>
									<Button
										variant="outline"
										class="text-gray-200 bg-gray-800 border-gray-700 hover:bg-gray-700"
										on:click={() => (showBatchInput = !showBatchInput)}
									>
										{showBatchInput ? 'Hide' : 'Show'} Batch Import
									</Button>
								</Card.Header>
								{#if showBatchInput}
									<Card.Content>
										<div class="space-y-4">
											<textarea
												bind:value={batchSynonymsText}
												class="w-full h-48 p-2 font-mono text-gray-100 bg-gray-800 border border-gray-700 rounded-md"
												placeholder="Paste your JSON array of synonym groups here..."
											></textarea>
											<div class="flex justify-end">
												<Button
													variant="default"
													class="text-white bg-blue-600 hover:bg-blue-700"
													on:click={addBatchSynonyms}
													disabled={loading || !batchSynonymsText.trim()}
												>
													{loading ? 'Importing...' : 'Import Synonyms'}
												</Button>
											</div>
										</div>
									</Card.Content>
								{/if}
							</Card.Root>

							<!-- Add Individual Synonym Group -->
							<Card.Root class="bg-gray-800 border-gray-700">
								<Card.Header>
									<Card.Title>Add New Synonym Group</Card.Title>
								</Card.Header>
								<Card.Content>
									<div class="space-y-4">
										{#each newSynonymWords as word, i}
											<div class="flex gap-2">
												<Input
													bind:value={newSynonymWords[i]}
													placeholder="Enter synonym word"
													class="text-gray-100 bg-gray-800 border-gray-700 placeholder:text-gray-500"
												/>
												{#if i > 1}
													<Button
														variant="outline"
														class="text-red-400 bg-gray-800 border-red-900 hover:bg-gray-700"
														on:click={() => removeWordFromGroup(i)}
													>
														<Trash2 class="w-4 h-4" />
													</Button>
												{/if}
											</div>
										{/each}
										<div class="flex gap-2">
											<Button
												variant="outline"
												class="text-gray-200 bg-gray-800 border-gray-700 hover:bg-gray-700"
												on:click={addWordToGroup}
											>
												<Plus class="w-4 h-4 mr-2" />
												Add Word
											</Button>
											<Button
												variant="default"
												class="text-white bg-blue-600 hover:bg-blue-700"
												on:click={addSynonymGroup}
												disabled={loading || newSynonymWords.filter((w) => w.trim()).length < 2}
											>
												{loading ? 'Adding...' : 'Create Synonym Group'}
											</Button>
										</div>
									</div>
								</Card.Content>
							</Card.Root>

							<!-- Existing Synonym Groups -->
							<div class="mt-6 space-y-4">
								<h3 class="text-lg font-medium text-gray-200">Existing Synonym Groups</h3>
								{#if selectedIndex && synonymGroups.length > 0}
									<div class="mt-4 text-right">
										<Button
											variant="destructive"
											class="text-white bg-red-600 hover:bg-red-700"
											on:click={deleteAllSynonyms}
											disabled={loading}
										>
											Delete All Synonym Groups
										</Button>
									</div>
								{/if}
								{#if synonymGroups.length === 0}
									<p class="text-gray-400">No synonym groups found</p>
								{:else}
									{#each synonymGroups as group}
										<Card.Root class="bg-gray-800 border-gray-700">
											<Card.Content class="p-4">
												<div class="flex items-center justify-between">
													<div class="flex flex-wrap gap-2">
														{#each group.synonyms as word}
															<span class="px-2 py-1 text-sm text-gray-200 bg-gray-700 rounded-md">
																{word}
															</span>
														{/each}
													</div>
													<Button
														variant="outline"
														class="text-red-400 bg-gray-800 border-red-900 hover:bg-gray-700"
														on:click={() => deleteSynonymGroup(group.id)}
													>
														<Trash2 class="w-4 h-4" />
													</Button>
												</div>
											</Card.Content>
										</Card.Root>
									{/each}
								{/if}
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="one-way-synonyms">
			<Card.Root class="mt-4">
				<Card.Header>
					<Card.Title>Manage One-Way Synonyms</Card.Title>
					<Card.Description
						>Add and manage one-way synonym groups for your Typesense index</Card.Description
					>
				</Card.Header>
				<Card.Content>
					<div class="space-y-4">
						<div>
							<!-- Select Index -->
							<!-- svelte-ignore a11y_label_has_associated_control -->
							<label class="block mb-2 text-sm font-medium text-gray-200">Select Index</label>
							<select
								class="w-full px-3 py-2 text-gray-100 bg-gray-800 border border-gray-700 rounded-md"
								on:change={(e) => loadOneWaySynonyms(e.target.value)}
							>
								<option value="">Select an index</option>
								{#each indexes as index}
									<option value={index.uid}>{index.uid}</option>
								{/each}
							</select>
						</div>

						{#if selectedIndex}
							<!-- Batch Import Section -->
							<Card.Root class="bg-gray-800 border-gray-700">
								<Card.Header class="flex flex-row items-center justify-between">
									<div>
										<Card.Title>Batch Import One-Way Synonyms</Card.Title>
										<Card.Description
											>Add multiple one-way synonym groups at once using JSON format</Card.Description
										>
									</div>
									<Button
										variant="outline"
										class="text-gray-200 bg-gray-800 border-gray-700 hover:bg-gray-700"
										on:click={() => (showOneWaySynonymBatch = !showOneWaySynonymBatch)}
									>
										{showOneWaySynonymBatch ? 'Hide' : 'Show'} Batch Import
									</Button>
								</Card.Header>
								{#if showOneWaySynonymBatch}
									<Card.Content>
										<div class="space-y-4">
											<textarea
												bind:value={oneWaySynonymBatchText}
												class="w-full h-48 p-2 font-mono text-gray-100 bg-gray-800 border border-gray-700 rounded-md"
												placeholder="Paste your JSON array of one-way synonym groups here..."
											></textarea>
											<div class="flex justify-end">
												<Button
													variant="default"
													class="text-white bg-blue-600 hover:bg-blue-700"
													on:click={addBatchOneWaySynonyms}
													disabled={loading || !oneWaySynonymBatchText.trim()}
												>
													{loading ? 'Importing...' : 'Import One-Way Synonyms'}
												</Button>
											</div>
										</div>
									</Card.Content>
								{/if}
							</Card.Root>

							<!-- Add Individual One-Way Synonym Group -->
							<Card.Root class="bg-gray-800 border-gray-700">
								<Card.Header>
									<Card.Title>Add New One-Way Synonym Group</Card.Title>
								</Card.Header>
								<Card.Content>
									<div class="space-y-4">
										<Input
											bind:value={oneWaySynonymRoot}
											placeholder="Enter root word/phrase"
											class="text-gray-100 bg-gray-800 border-gray-700 placeholder:text-gray-500"
										/>
										{#each oneWaySynonymWords as word, i}
											<div class="flex gap-2">
												<Input
													bind:value={oneWaySynonymWords[i]}
													placeholder="Enter synonym"
													class="text-gray-100 bg-gray-800 border-gray-700 placeholder:text-gray-500"
												/>
												{#if i > 0}
													<Button
														variant="outline"
														class="text-red-400 bg-gray-800 border-red-900 hover:bg-gray-700"
														on:click={() => removeWordFromOneWaySynonym(i)}
													>
														<Trash2 class="w-4 h-4" />
													</Button>
												{/if}
											</div>
										{/each}
										<div class="flex gap-2">
											<Button
												variant="outline"
												class="text-gray-200 bg-gray-800 border-gray-700 hover:bg-gray-700"
												on:click={addWordToOneWaySynonym}
											>
												<Plus class="w-4 h-4 mr-2" />
												Add Synonym
											</Button>
											<Button
												variant="default"
												class="text-white bg-blue-600 hover:bg-blue-700"
												on:click={addOneWaySynonymGroup}
												disabled={loading ||
													!oneWaySynonymRoot.trim() ||
													oneWaySynonymWords.filter((w) => w.trim()).length === 0}
											>
												{loading ? 'Adding...' : 'Create One-Way Synonym Group'}
											</Button>
										</div>
									</div>
								</Card.Content>
							</Card.Root>

							<!-- Existing One-Way Synonym Groups -->
							<div class="mt-6 space-y-4">
								<h3 class="text-lg font-medium text-gray-200">Existing One-Way Synonym Groups</h3>
								{#if selectedIndex && oneWaySynonyms.length > 0}
									<div class="mt-4 text-right">
										<Button
											variant="destructive"
											class="text-white bg-red-600 hover:bg-red-700"
											on:click={deleteAllOneWaySynonyms}
											disabled={loading}
										>
											Delete All One-Way Synonym Groups
										</Button>
									</div>
								{/if}
								{#if oneWaySynonyms.length === 0}
									<p class="text-gray-400">No one-way synonym groups found</p>
								{:else}
									{#each oneWaySynonyms as synonymGroup, index}
										<Card.Root class="bg-gray-800 border-gray-700">
											<Card.Content class="p-4">
												<div class="flex items-center justify-between">
													<div>
														<div class="mb-2">
															<span class="text-gray-300">Root: </span>
															<span class="px-2 py-1 text-sm text-gray-200 bg-gray-700 rounded-md">
																{synonymGroup.root}
															</span>
														</div>
														<div class="flex flex-wrap gap-2">
															<span class="text-gray-300">Synonyms: </span>
															{#each synonymGroup.synonyms as synonym}
																<span
																	class="px-2 py-1 text-sm text-gray-200 bg-gray-700 rounded-md"
																>
																	{synonym}
																</span>
															{/each}
														</div>
													</div>
													<Button
														variant="outline"
														class="text-red-400 bg-gray-800 border-red-900 hover:bg-gray-700"
														on:click={() => deleteOneWaySynonymGroup(index)}
													>
														<Trash2 class="w-4 h-4" />
													</Button>
												</div>
											</Card.Content>
										</Card.Root>
									{/each}
								{/if}
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>
