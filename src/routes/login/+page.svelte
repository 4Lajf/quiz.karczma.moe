<!-- src/routes/login/+page.svelte -->
<script>
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	export let form;
	let loading = false;
	let clientError = '';

	function handleSubmit() {
		loading = true;
		clientError = '';

		return async ({ result }) => {
			loading = false;

			if (result.type === 'failure') {
				try {
					clientError = result.data.error;
				} catch (e) {
					clientError = 'An unexpected error occurred';
				}
			}

			if (result.type === 'redirect') {
				goto(result.location, { invalidateAll: true });
			}
		};
	}
</script>

<div class="min-h-screen bg-gray-950">
	<div class="container flex flex-col items-center justify-center min-h-screen">
		<Card.Root class="w-full max-w-md bg-gray-900 border-gray-800">
			<Card.Header class="space-y-1">
				<Card.Title class="text-2xl text-center text-white">Zaloguj się do swojego konta</Card.Title>
				<Card.Description class="text-center text-gray-400">
					Nie masz konta?
					<a href="/register" class="font-medium text-blue-400 hover:text-blue-300 hover:underline">
						Stwórz je.
					</a>
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/login" class="space-y-4" use:enhance={handleSubmit}>
					{#if clientError}
						<Alert.Root variant="destructive" class="border-red-900/50 bg-red-900/20">
							<Alert.Title class="text-red-400">Logowanie nie powiodło się</Alert.Title>
							<Alert.Description class="text-red-300">
								{clientError}
							</Alert.Description>
						</Alert.Root>
					{:else if form?.success}
						<Alert.Root variant="default" class="border-green-900/50 bg-green-900/20">
							<Alert.Title class="text-green-400">Sukces</Alert.Title>
							<Alert.Description class="text-green-300">
								{form.success}
							</Alert.Description>
						</Alert.Root>
					{/if}

					<div class="space-y-2">
						<Label for="email" class="text-gray-200">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="name@example.com"
							required
							class="text-gray-100 bg-gray-800 border-gray-700 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0"
						/>
					</div>

					<div class="space-y-2">
						<Label for="password" class="text-gray-200">Hasło</Label>
						<Input
							id="password"
							name="password"
							type="password"
							required
							class="text-gray-100 bg-gray-800 border-gray-700 focus-visible:ring-1 focus-visible:ring-gray-600 focus-visible:ring-offset-0"
						/>
					</div>

					<Button
						type="submit"
						class="w-full text-white bg-blue-600 hover:bg-blue-700"
						disabled={loading}
					>
						{loading ? 'Signing in...' : 'Sign in'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
