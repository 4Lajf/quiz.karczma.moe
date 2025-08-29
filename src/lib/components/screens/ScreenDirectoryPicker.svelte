<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import { Folder, FolderOpen, X, AlertCircle, CheckCircle, Image } from 'lucide-svelte';
	import { screenFileSystemClient, isFileSystemAPISupported } from '$lib/utils/screenFileSystemAPI.js';

	export let useLocalFiles = false;
	export let currentDirectory = null;

	const dispatch = createEventDispatcher();

	let isSupported = false;
	let isLoading = false;
	let imageFiles = [];

	// Difficulty mapping (for screens, we might not need this, but keeping for compatibility)
	function getDifficultyInPolish(englishDifficulty) {
		const difficultyMap = {
			easy: 'Łatwa',
			medium: 'Średnia',
			hard: 'Trudna',
			'very hard': 'Bardzo trudna'
		};
		return difficultyMap[englishDifficulty?.toLowerCase()] || englishDifficulty;
	}

	onMount(async () => {
		// Only run in browser environment
		if (typeof window === 'undefined') return;

		isSupported = isFileSystemAPISupported();

		try {
			// Try to restore previously selected directory
			const restored = await screenFileSystemClient.restoreDirectoryHandle();
			if (restored) {
				currentDirectory = screenFileSystemClient.getDirectoryName();
				useLocalFiles = true;
				await loadImageFiles();
				dispatch('directoryChanged', {
					useLocalFiles: true,
					directory: currentDirectory,
					files: imageFiles
				});
			}
		} catch (error) {
			console.warn('Failed to restore directory handle:', error);
		}
	});

	async function selectDirectory() {
		isLoading = true;
		try {
			const selected = await screenFileSystemClient.selectDirectory();

			if (selected) {
				currentDirectory = screenFileSystemClient.getDirectoryName();
				useLocalFiles = true;
				await loadImageFiles();

				toast.success(`Wybrano katalog: ${currentDirectory}`);

				dispatch('directoryChanged', {
					useLocalFiles: true,
					directory: currentDirectory,
					files: imageFiles
				});
			}
		} catch (error) {
			console.error('Error selecting directory:', error);
			toast.error('Błąd podczas wybierania katalogu: ' + error.message);
		} finally {
			isLoading = false;
		}
	}

	async function clearDirectory() {
		try {
			await screenFileSystemClient.clearStoredDirectory();
			currentDirectory = null;
			useLocalFiles = false;
			imageFiles = [];

			toast.success('Usunięto wybrany katalog');

			dispatch('directoryChanged', {
				useLocalFiles: false,
				directory: null,
				files: []
			});
		} catch (error) {
			console.error('Error clearing directory:', error);
			toast.error('Błąd podczas usuwania katalogu');
		}
	}

	async function loadImageFiles() {
		if (!screenFileSystemClient.hasDirectory()) return;

		try {
			imageFiles = await screenFileSystemClient.getImageFiles();
			console.log(`Loaded ${imageFiles.length} image files from local directory`);
		} catch (error) {
			console.error('Error loading image files:', error);
			toast.error('Błąd podczas ładowania plików obrazów');
			imageFiles = [];
		}
	}

	function formatFileSize(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}
</script>

<Card class="border-gray-800 bg-gray-900">
	<CardHeader>
		<CardTitle class="flex items-center gap-2 text-white">
			<Folder class="h-5 w-5" />
			Źródło plików obrazów
		</CardTitle>
	</CardHeader>
	<CardContent class="space-y-4">
		<!-- Browser compatibility info -->
		<div class="flex items-center gap-2 rounded-lg border border-blue-800 bg-blue-900/30 p-3">
			<CheckCircle class="h-5 w-5 text-blue-400" />
			<div class="text-blue-200">
				<p class="font-medium">Dostęp do lokalnych plików</p>
				<p class="text-sm text-blue-300">Najlepiej działa w Chrome/Edge 86+ lub Firefox 111+. Inne przeglądarki mogą wyświetlić błąd.</p>
			</div>
		</div>

		<!-- Directory Selection -->
		<div class="space-y-3">
			{#if currentDirectory}
				<div class="flex items-center justify-between rounded-lg border border-blue-800 bg-blue-900/30 p-3">
					<div class="flex items-center gap-2">
						<FolderOpen class="h-5 w-5 text-blue-400" />
						<div>
							<p class="font-medium text-blue-200">{currentDirectory}</p>
							<p class="text-sm text-blue-300">
								{imageFiles.length} plików obrazów
							</p>
						</div>
					</div>
					<Button on:click={clearDirectory} variant="outline" size="sm" class="border-red-600 text-red-400 hover:bg-red-900/30">
						<X class="h-4 w-4" />
					</Button>
				</div>
			{/if}

			<Button on:click={selectDirectory} disabled={isLoading} class="w-full bg-purple-600 text-white hover:bg-purple-700">
				<Folder class="mr-2 h-4 w-4" />
				{isLoading ? 'Wybieranie...' : currentDirectory ? 'Zmień katalog' : 'Wybierz katalog'}
			</Button>
		</div>

		<!-- File List Preview -->
		{#if useLocalFiles && imageFiles.length > 0}
			<div class="space-y-2">
				<p class="text-sm font-medium text-gray-300">Pliki w katalogu:</p>
				<div class="max-h-32 space-y-1 overflow-y-auto">
					{#each imageFiles.slice(0, 10) as file}
						<div class="flex flex-col space-y-1 rounded border border-gray-700 bg-gray-800 p-2 text-xs text-gray-400">
							<div class="flex items-center justify-between">
								<span class="flex-1 truncate font-medium text-gray-200">{file.FileName || 'Unknown'}</span>
								<Badge variant="outline" class="border-gray-600 text-xs text-gray-400">
									{formatFileSize(file.localFileInfo?.size || 0)}
								</Badge>
							</div>
							{#if file.title && file.title !== file.FileName}
								<div class="text-xs text-blue-300">
									{file.title}
								</div>
							{/if}
							{#if file.JPName && file.JPName !== file.title}
								<div class="text-xs text-green-300">
									{file.JPName}
								</div>
							{/if}
							{#if file.ENName}
								<div class="text-xs text-purple-300">
									{file.ENName}
								</div>
							{/if}
							{#if file.rank}
								<div class="flex items-center gap-1">
									<Badge variant="outline" class="border-yellow-500 bg-yellow-900/20 px-1 py-0 text-xs text-yellow-400">
										#{file.rank}
									</Badge>
								</div>
							{/if}
						</div>
					{/each}
					{#if imageFiles.length > 10}
						<p class="text-center text-xs text-gray-500">
							... i {imageFiles.length - 10} więcej
						</p>
					{/if}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>
