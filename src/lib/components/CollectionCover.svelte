
<script lang="ts">
	interface Props {
		imageUrl: string;
		imageType?: string | null;
		alt?: string;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}

	let {
		imageUrl,
		imageType = null,
		alt = 'Collection cover',
		size = 'md',
		class: className = ''
	}: Props = $props();

	const sizeClasses = {
		sm: 'h-24 w-24',
		md: 'h-40 w-40',
		lg: 'h-64 w-64'
	};
</script>

<div class={className}>
	{#if imageType === 'auto'}
		
		<div class="{sizeClasses[size]} group relative cursor-default">
			<img
				src={imageUrl.startsWith('http') ? `/api/image-proxy?u=${encodeURIComponent(imageUrl)}` : imageUrl}
				{alt}
				class="relative h-full w-full rounded-lg object-cover shadow-lg transition-transform duration-300 group-hover:scale-105"
			/>
			<div
				class="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
			/>
		</div>
	{:else}
		
		<div class={`${sizeClasses[size]} group relative cursor-default`}>
			<img
				src={imageUrl.startsWith('http') ? `/api/image-proxy?u=${encodeURIComponent(imageUrl)}` : imageUrl}
				{alt}
				class="h-full w-full rounded-lg object-cover shadow-md transition-shadow duration-300 group-hover:shadow-lg"
			/>
		</div>
	{/if}
</div>

<style>
	:global(.collection-cover-3d) {
		perspective: 1000px;
		transform-style: preserve-3d;
	}

	:global(.collection-cover-3d img) {
		transform: translateY(0) rotateX(0deg);
		transform-style: preserve-3d;
		transition: transform 0.3s ease-out;
	}

	:global(.collection-cover-3d:hover img) {
		transform: translateY(-4px) rotateX(5deg);
	}
</style>
