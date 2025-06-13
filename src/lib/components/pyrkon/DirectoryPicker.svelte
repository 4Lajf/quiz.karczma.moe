<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import { Folder, FolderOpen, X, AlertCircle, CheckCircle } from 'lucide-svelte';
	import { fileSystemClient, isFileSystemAPISupported } from '$lib/utils/fileSystemAPI.js';

	export let useLocalFiles = false;
	export let currentDirectory = null;

	const dispatch = createEventDispatcher();

	let isSupported = false;
	let isLoading = false;
	let videoFiles = [];

	// Difficulty mapping
	function getDifficultyInPolish(englishDifficulty) {
		const difficultyMap = {
			'easy': 'Łatwa',
			'medium': 'Średnia',
			'hard': 'Trudna',
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
			const restored = await fileSystemClient.restoreDirectoryHandle();
			if (restored) {
				currentDirectory = fileSystemClient.getDirectoryName();
				useLocalFiles = true;
				await loadVideoFiles();
				dispatch('directoryChanged', {
					useLocalFiles: true,
					directory: currentDirectory,
					files: videoFiles
				});
			}
		} catch (error) {
			console.warn('Failed to restore directory handle:', error);
		}
	});

	async function selectDirectory() {
		isLoading = true;
		try {
			const selected = await fileSystemClient.selectDirectory();

			if (selected) {
				currentDirectory = fileSystemClient.getDirectoryName();
				useLocalFiles = true;
				await loadVideoFiles();

				toast.success(`Wybrano katalog: ${currentDirectory}`);

				dispatch('directoryChanged', {
					useLocalFiles: true,
					directory: currentDirectory,
					files: videoFiles
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
			await fileSystemClient.clearStoredDirectory();
			currentDirectory = null;
			useLocalFiles = false;
			videoFiles = [];

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

	async function loadVideoFiles() {
		if (!fileSystemClient.hasDirectory()) return;

		try {
			videoFiles = await fileSystemClient.getVideoFiles();
			console.log(`Loaded ${videoFiles.length} video files from local directory`);
		} catch (error) {
			console.error('Error loading video files:', error);
			toast.error('Błąd podczas ładowania plików wideo');
			videoFiles = [];
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

<Card class="bg-gray-900 border-gray-800">
	<CardHeader>
		<CardTitle class="text-white flex items-center gap-2">
			<Folder class="w-5 h-5" />
			Źródło plików wideo
		</CardTitle>
	</CardHeader>
	<CardContent class="space-y-4">
		<!-- Browser compatibility info -->
		<div class="flex items-center gap-2 p-3 bg-blue-900/30 border border-blue-800 rounded-lg">
			<CheckCircle class="w-5 h-5 text-blue-400" />
			<div class="text-blue-200">
				<p class="font-medium">Dostęp do lokalnych plików</p>
				<p class="text-sm text-blue-300">
					Najlepiej działa w Chrome/Edge 86+ lub Firefox 111+. Inne przeglądarki mogą wyświetlić błąd.
				</p>
			</div>
		</div>

		<!-- Directory Selection -->
		<div class="space-y-3">
			{#if currentDirectory}
				<div class="flex items-center justify-between p-3 bg-blue-900/30 border border-blue-800 rounded-lg">
					<div class="flex items-center gap-2">
						<FolderOpen class="w-5 h-5 text-blue-400" />
						<div>
							<p class="text-blue-200 font-medium">{currentDirectory}</p>
							<p class="text-sm text-blue-300">
								{videoFiles.length} plików wideo
							</p>
						</div>
					</div>
					<Button
						on:click={clearDirectory}
						variant="outline"
						size="sm"
						class="border-red-600 text-red-400 hover:bg-red-900/30"
					>
						<X class="w-4 h-4" />
					</Button>
				</div>
			{/if}

			<Button
				on:click={selectDirectory}
				disabled={isLoading}
				class="w-full bg-purple-600 hover:bg-purple-700 text-white"
			>
				<Folder class="w-4 h-4 mr-2" />
				{isLoading ? 'Wybieranie...' : currentDirectory ? 'Zmień katalog' : 'Wybierz katalog'}
			</Button>
		</div>

		<!-- File List Preview -->
		{#if useLocalFiles && videoFiles.length > 0}
			<div class="space-y-2">
				<p class="text-sm text-gray-300 font-medium">Pliki w katalogu:</p>
				<div class="max-h-32 overflow-y-auto space-y-1">
					{#each videoFiles.slice(0, 10) as file}
						<div class="flex flex-col text-xs text-gray-400 p-2 bg-gray-800 border border-gray-700 rounded space-y-1">
							<div class="flex items-center justify-between">
								<span class="truncate flex-1 font-medium text-gray-200">{file.FileName || 'Unknown'}</span>
								<Badge variant="outline" class="text-xs border-gray-600 text-gray-400">
									{formatFileSize(file.localFileInfo?.size || 0)}
								</Badge>
							</div>
							{#if file.JPName && file.JPName !== file.FileName}
								<div class="text-blue-300 text-xs">
									{file.JPName} {file.ENName ? `(${file.ENName})` : ''}
								</div>
							{/if}
							{#if file.SongName && file.Artist}
								<div class="text-green-300 text-xs">
									{file.SongName} - {file.Artist}
								</div>
							{/if}
							{#if file.difficulty}
								<div class="flex items-center gap-1">
									<Badge variant="outline" class="text-xs px-1 py-0 border-purple-500 text-purple-400 bg-purple-900/20">
										{getDifficultyInPolish(file.difficulty)}
									</Badge>
								</div>
							{/if}
						</div>
					{/each}
					{#if videoFiles.length > 10}
						<p class="text-xs text-gray-500 text-center">
							... i {videoFiles.length - 10} więcej
						</p>
					{/if}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>
