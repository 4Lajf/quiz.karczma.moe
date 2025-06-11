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

	onMount(async () => {
		// Only run in browser environment
		if (typeof window === 'undefined') return;

		isSupported = isFileSystemAPISupported();

		if (isSupported) {
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
		}
	});

	async function selectDirectory() {
		if (!isSupported) {
			toast.error('File System API nie jest obsługiwane w tej przeglądarce');
			return;
		}

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

	function toggleMode() {
		useLocalFiles = !useLocalFiles;
		
		dispatch('directoryChanged', {
			useLocalFiles,
			directory: currentDirectory,
			files: useLocalFiles ? videoFiles : []
		});
		
		toast.success(useLocalFiles ? 'Przełączono na pliki lokalne' : 'Przełączono na pliki serwera');
	}

	function formatFileSize(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}
</script>

<Card class="bg-gray-800/50 border-gray-700">
	<CardHeader>
		<CardTitle class="text-white flex items-center gap-2">
			<Folder class="w-5 h-5" />
			Źródło plików wideo
		</CardTitle>
	</CardHeader>
	<CardContent class="space-y-4">
		<!-- API Support Status -->
		{#if !isSupported}
			<div class="flex items-center gap-2 p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg">
				<AlertCircle class="w-5 h-5 text-yellow-400" />
				<div class="text-yellow-200">
					<p class="font-medium">File System API nie jest obsługiwane</p>
					<p class="text-sm text-yellow-300">
						Używaj Chrome/Edge 86+ lub Firefox 111+ dla dostępu do lokalnych plików
					</p>
				</div>
			</div>
		{:else}
			<div class="flex items-center gap-2 p-3 bg-green-900/50 border border-green-700 rounded-lg">
				<CheckCircle class="w-5 h-5 text-green-400" />
				<div class="text-green-200">
					<p class="font-medium">File System API jest obsługiwane</p>
					<p class="text-sm text-green-300">
						Możesz wybierać lokalne katalogi z plikami wideo
					</p>
				</div>
			</div>
		{/if}

		<!-- Mode Toggle -->
		<div class="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
			<div>
				<p class="text-white font-medium">Tryb plików</p>
				<p class="text-sm text-gray-300">
					{useLocalFiles ? 'Pliki lokalne' : 'Pliki serwera'}
				</p>
			</div>
			<Button
				on:click={toggleMode}
				variant="outline"
				class="border-gray-600 text-gray-300 hover:bg-gray-600"
				disabled={!isSupported || (!currentDirectory && !useLocalFiles)}
			>
				{useLocalFiles ? 'Przełącz na serwer' : 'Przełącz na lokalne'}
			</Button>
		</div>

		<!-- Directory Selection -->
		{#if isSupported}
			<div class="space-y-3">
				{#if currentDirectory}
					<div class="flex items-center justify-between p-3 bg-blue-900/50 border border-blue-700 rounded-lg">
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
							class="border-red-600 text-red-400 hover:bg-red-900/50"
						>
							<X class="w-4 h-4" />
						</Button>
					</div>
				{/if}

				<Button
					on:click={selectDirectory}
					disabled={isLoading}
					class="w-full bg-purple-600 hover:bg-purple-700"
				>
					<Folder class="w-4 h-4 mr-2" />
					{isLoading ? 'Wybieranie...' : currentDirectory ? 'Zmień katalog' : 'Wybierz katalog'}
				</Button>
			</div>
		{/if}

		<!-- File List Preview -->
		{#if useLocalFiles && videoFiles.length > 0}
			<div class="space-y-2">
				<p class="text-sm text-gray-300 font-medium">Pliki w katalogu:</p>
				<div class="max-h-32 overflow-y-auto space-y-1">
					{#each videoFiles.slice(0, 10) as file}
						<div class="flex flex-col text-xs text-gray-400 p-2 bg-gray-700/30 rounded space-y-1">
							<div class="flex items-center justify-between">
								<span class="truncate flex-1 font-medium">{file.FileName || 'Unknown'}</span>
								<Badge variant="outline" class="text-xs">
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
									<Badge variant="secondary" class="text-xs px-1 py-0">
										{file.difficulty}
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
