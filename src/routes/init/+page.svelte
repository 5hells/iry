<script lang="ts">
	import { onMount } from 'svelte';
	let needsInit = false;
	let loading = true;
	let name = '';
	let email = '';
	let password = '';
	let message = '';

	onMount(async () => {
		const res = await fetch('/init');
		const j = await res.json();
		needsInit = j?.needsInit === true;
		loading = false;
	});

	async function submit() {
		message = '';
		const res = await fetch('/init', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, email, password })
		});
		const j = await res.json();
		if (!res.ok) {
			message = j?.error || 'Failed to initialize';
		} else {
			message = 'Admin created. You can now log in.';
		}
	}
</script>

{#if loading}
	<p>Checking initialization...</p>
{:else if needsInit}
	<h1>Initial Setup — Create Admin</h1>
	<p>Create the first admin account for this instance.</p>
	<div>
		<label>Name<input bind:value={name} /></label>
	</div>
	<div>
		<label>Email<input bind:value={email} type="email" /></label>
	</div>
	<div>
		<label>Password<input bind:value={password} type="password" /></label>
	</div>
	<button on:click={submit}>Create Admin</button>
	{#if message}
		<p>{message}</p>
	{/if}
{:else}
	<h1>Instance Already Initialized</h1>
	<p>An admin user already exists. Visit the login page to sign in.</p>
{/if}
