<script lang="ts">
	import { onMount } from 'svelte';
	let users: any[] = [];
	let selectedTab: 'users' | 'newsletter' | 'reindex' = 'users';
	let loading = true;
	let subject = '';
	let body = '';
	let status = '';
	let reindexRunning = false;
	let reindexStatus = '';
	let reindexOutput = '';

	async function loadUsers() {
		const res = await fetch('/api/admin/users');
		if (res.ok) {
			const j = await res.json();
			users = j.users || [];
		}
	}

	onMount(async () => {
		await loadUsers();
		loading = false;
	});

	async function updateUser(u: { id: number; role?: string; newsletterSubscribed?: boolean }) {
		await fetch('/api/admin/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(u)
		});
		await loadUsers();
	}

	async function sendNewsletter() {
		status = 'sending';
		const res = await fetch('/api/newsletter', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ subject, body })
		});
		const j = await res.json();
		status = res.ok ? `sent ${j.count || 0}` : `error: ${j?.error}`;
	}

	async function runReindex(target: 'albums' | 'artists' | 'tracks') {
		reindexRunning = true;
		reindexStatus = `running ${target} reindex...`;
		reindexOutput = '';

		try {
			const res = await fetch('/api/admin/reindex', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ target })
			});

			const payload = await res.json().catch(() => ({}));
			if (res.ok) {
				reindexStatus = `${target} reindex completed`;
				reindexOutput = payload.output || '';
			} else {
				reindexStatus = payload.error || `failed to reindex ${target}`;
				reindexOutput = payload.output || '';
			}
		} catch (err) {
			console.error('Reindex request failed:', err);
			reindexStatus = `failed to reindex ${target}`;
		} finally {
			reindexRunning = false;
		}
	}
</script>

<h1>Admin Panel</h1>
<nav>
	<button on:click={() => (selectedTab = 'users')}>Users</button>
	<button on:click={() => (selectedTab = 'newsletter')}>Newsletter</button>
	<button on:click={() => (selectedTab = 'reindex')}>Reindex</button>
</nav>

{#if loading}
	<p>Loading...</p>
{:else if selectedTab === 'users'}
	<h2>Users</h2>
	<table>
		<thead
			><tr><th>Name</th><th>Email</th><th>Role</th><th>Newsletter</th><th>Action</th></tr></thead
		>
		<tbody>
			{#each users as u}
				<tr>
					<td>{u.name}</td>
					<td>{u.email}</td>
					<td>
						<select bind:value={u.role} on:change={() => updateUser({ id: u.id, role: u.role })}>
							<option value="contributor">contributor</option>
							<option value="moderator">moderator</option>
							<option value="admin">admin</option>
						</select>
					</td>
					<td>
						<input
							type="checkbox"
							checked={u.newsletterSubscribed}
							on:change={(e) =>
								updateUser({
									id: u.id,
									newsletterSubscribed: (e.target as HTMLInputElement).checked
								})}
						/>
					</td>
					<td></td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else if selectedTab === 'newsletter'}
	<h2>Newsletter</h2>
	<div>
		<label>Subject<input bind:value={subject} /></label>
	</div>
	<div>
		<label>Body<textarea rows="8" bind:value={body}></textarea></label>
	</div>
	<button on:click={sendNewsletter}>Send</button>
	<div>{status}</div>
{:else}
	<h2>Reindex</h2>
	<p>Run full reindex jobs for albums, artists, or tracks.</p>
	<div style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;">
		<button on:click={() => runReindex('albums')} disabled={reindexRunning}>reindex all albums</button>
		<button on:click={() => runReindex('artists')} disabled={reindexRunning}>reindex all artists</button>
		<button on:click={() => runReindex('tracks')} disabled={reindexRunning}>reindex all tracks</button>
	</div>
	<div>{reindexStatus}</div>
	{#if reindexOutput}
		<pre style="margin-top: 10px; max-height: 320px; overflow: auto;">{reindexOutput}</pre>
	{/if}
{/if}
