<script lang="ts">
	type Head = {
		id?: string;
		name?: string;
		image?: string | null;
	};

	let {
		users = [],
		max = 5,
		size = 18
	}: {
		users?: Head[];
		max?: number;
		size?: number;
	} = $props();

	const visibleUsers = $derived(users.slice(0, max));
</script>

{#if visibleUsers.length > 0}
	<div class="heads" aria-hidden="true">
		{#each visibleUsers as u, index (u.id || `${u.name || 'user'}-${index}`)}
			<div
				class="head"
				style={`--head-size:${size}px; z-index:${visibleUsers.length - index};`}
				title={u.name || 'User'}
			>
				{#if u.image}
					<img src={u.image} alt="" class="h-full w-full object-cover" />
				{:else}
					<span>{u.name?.[0]?.toUpperCase() || '?'}</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.heads {
		display: inline-flex;
		align-items: center;
	}

	.head {
		width: var(--head-size);
		height: var(--head-size);
		margin-left: calc(var(--head-size) * -0.28);
		border-radius: 9999px;
		overflow: hidden;
		background: var(--bg-secondary);
		border: 2px solid var(--bg-base);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: calc(var(--head-size) * 0.5);
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1;
	}

	.head:first-child {
		margin-left: 0;
	}
</style>
