<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let {
		imageUrl,
		aspectRatio = 1,
		onCrop
	}: {
		imageUrl: string;
		aspectRatio?: number;
		onCrop: (position: { x: number; y: number; scale: number }) => void;
	} = $props();

	let container = $state<HTMLDivElement | null>(null);
	let img = $state<HTMLImageElement | null>(null);
	let isDragging = $state(false);
	let position = $state({ x: 0, y: 0 });
	let scale = $state(1);
	let dragStart = $state({ x: 0, y: 0 });

	onMount(() => {
		if (img) {
			img.onload = () => {
				centerImage();
			};
		}

		const handleMouseMove = (e: MouseEvent) => {
			if (!isDragging || !container) return;
			position.x = e.clientX - dragStart.x;
			position.y = e.clientY - dragStart.y;
		};

		const handleMouseUp = () => {
			isDragging = false;
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	});

	onDestroy(() => {
		isDragging = false;
	});

	function centerImage() {
		if (!img || !container) return;
		const containerRect = container.getBoundingClientRect();
		const imgRect = img.getBoundingClientRect();
		position.x = (containerRect.width - imgRect.width) / 2;
		position.y = (containerRect.height - imgRect.height) / 2;
	}

	function handleMouseDown(e: MouseEvent) {
		isDragging = true;
		dragStart = {
			x: e.clientX - position.x,
			y: e.clientY - position.y
		};
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? -0.1 : 0.1;
		scale = Math.max(0.5, Math.min(3, scale + delta));
	}

	function handleZoomIn() {
		scale = Math.min(3, scale + 0.1);
	}

	function handleZoomOut() {
		scale = Math.max(0.5, scale - 0.1);
	}

	function handleReset() {
		scale = 1;
		centerImage();
	}

	function handleConfirm() {
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const imgRect = img?.getBoundingClientRect();
		if (!imgRect) return;

		const leftInside = Math.max(0, -position.x);
		const topInside = Math.max(0, -position.y);
		const relativePos = {
			x: leftInside / imgRect.width,
			y: topInside / imgRect.height,
			widthFrac: rect.width / imgRect.width,
			heightFrac: rect.height / imgRect.height,
			scale,

			leftPx: (leftInside / imgRect.width) * (img?.naturalWidth || imgRect.width),
			topPx: (topInside / imgRect.height) * (img?.naturalHeight || imgRect.height),
			widthPx: (rect.width / imgRect.width) * (img?.naturalWidth || imgRect.width),
			heightPx: (rect.height / imgRect.height) * (img?.naturalHeight || imgRect.height)
		};

		const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
		const clamped = {
			x: Number.isFinite(relativePos.x) ? clamp(relativePos.x, 0, 1) : 0,
			y: Number.isFinite(relativePos.y) ? clamp(relativePos.y, 0, 1) : 0,
			widthFrac: Number.isFinite(relativePos.widthFrac) ? clamp(relativePos.widthFrac, 0, 1) : 1,
			heightFrac: Number.isFinite(relativePos.heightFrac) ? clamp(relativePos.heightFrac, 0, 1) : 1,

			leftPx: Number.isFinite(relativePos.leftPx)
				? Math.max(0, Math.round(relativePos.leftPx))
				: undefined,
			topPx: Number.isFinite(relativePos.topPx)
				? Math.max(0, Math.round(relativePos.topPx))
				: undefined,
			widthPx: Number.isFinite(relativePos.widthPx)
				? Math.max(1, Math.round(relativePos.widthPx))
				: undefined,
			heightPx: Number.isFinite(relativePos.heightPx)
				? Math.max(1, Math.round(relativePos.heightPx))
				: undefined,
			scale: Number.isFinite(relativePos.scale) ? clamp(relativePos.scale, 0.5, 3) : 1
		};

		console.log('[crop-send-debug]', { rect, imgRect, relativePos, clamped });
		onCrop(clamped);
	}
</script>

<div class="image-cropper">
	<div
		bind:this={container}
		class="crop-container"
		style="aspect-ratio: {aspectRatio};"
		onwheel={handleWheel}
	>
		<img
			bind:this={img}
			src={imageUrl}
			alt="Crop preview"
			class="crop-image"
			class:dragging={isDragging}
			style="transform: translate({position.x}px, {position.y}px) scale({scale}); cursor: {isDragging
				? 'grabbing'
				: 'grab'};"
			onmousedown={handleMouseDown}
			draggable="false"
		/>
	</div>

	<div class="controls">
		<div class="zoom-controls">
			<button onclick={handleZoomOut} class="control-btn">−</button>
			<span class="zoom-level">{Math.round(scale * 100)}%</span>
			<button onclick={handleZoomIn} class="control-btn">+</button>
		</div>
		<div class="action-controls">
			<button onclick={handleReset} class="secondary-btn">Reset</button>
			<button onclick={handleConfirm} class="primary-btn">Apply</button>
		</div>
	</div>
</div>

<style>
	.image-cropper {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.crop-container {
		position: relative;
		width: 100%;
		max-width: 500px;
		overflow: hidden;
		border: 2px solid var(--border-color);
		border-radius: 8px;
		background: var(--bg-secondary);
		margin: 0 auto;
	}

	.crop-image {
		position: absolute;
		max-width: none;
		user-select: none;
		touch-action: none;
	}

	.crop-image.dragging {
		cursor: grabbing !important;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: center;
	}

	.zoom-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
	}

	.zoom-level {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
		min-width: 4rem;
		text-align: center;
	}

	.control-btn {
		width: 2rem;
		height: 2rem;
		border: none;
		background: var(--bg-base);
		color: var(--text-primary);
		font-size: 1.25rem;
		font-weight: bold;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.control-btn:hover {
		background: var(--color-primary-500);
		color: white;
	}

	.action-controls {
		display: flex;
		gap: 0.75rem;
	}

	.secondary-btn,
	.primary-btn {
		padding: 0.5rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.secondary-btn {
		background: var(--bg-secondary);
		color: var(--text-primary);
		border: 1px solid var(--border-color);
	}

	.secondary-btn:hover {
		background: var(--bg-base);
	}

	.primary-btn {
		background: var(--color-primary-500);
		color: white;
	}

	.primary-btn:hover {
		background: var(--color-primary-600);
	}
</style>
