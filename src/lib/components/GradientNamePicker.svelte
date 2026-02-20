<script lang="ts">
	import { onMount } from 'svelte';

	let {
		onSave = (gradient: { colors: string[]; angle: number }) => {},
		initialGradient = {
			colors: ['#5c7cfa', '#ff6b6b', '#51cf66'],
			angle: 45
		}
	}: {
		onSave?: (gradient: { colors: string[]; angle: number }) => void;
		initialGradient?: { colors: string[]; angle: number };
	} = $props();

	let colors = $state<string[]>(['#5c7cfa', '#ff6b6b', '#51cf66']);
	let angle = $state(45);
	let namePreview = $state('Your Name Here');
	let isDraggingAngle = $state(false);
	let activeColorIndex = $state<number | null>(null);
	let angleWheelRef: HTMLDivElement;
	let colorPickerPopup: HTMLDivElement;

	onMount(() => {
		colors = [...initialGradient.colors];
		angle = initialGradient.angle;
	});

	function handleAngleWheelMouseDown(event: MouseEvent) {
		isDraggingAngle = true;
		updateAngleFromMouse(event);

		const handleMouseMove = (e: MouseEvent) => {
			if (isDraggingAngle) {
				updateAngleFromMouse(e);
			}
		};

		const handleMouseUp = () => {
			isDraggingAngle = false;
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	function updateAngleFromMouse(event: MouseEvent) {
		if (!angleWheelRef) return;

		const rect = angleWheelRef.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const dx = event.clientX - centerX;
		const dy = event.clientY - centerY;

		let newAngle = Math.atan2(dy, dx) * (180 / Math.PI);
		newAngle = (newAngle + 90 + 360) % 360; 
		angle = Math.round(newAngle);
	}

	function addColor() {
		if (colors.length < 5) {
			colors = [...colors, '#ffffff'];
		}
	}

	function removeColor(index: number) {
		if (colors.length > 2) {
			colors = colors.filter((_, i) => i !== index);
			if (activeColorIndex === index) {
				activeColorIndex = null;
			}
		}
	}

	function toggleColorPicker(index: number) {
		activeColorIndex = activeColorIndex === index ? null : index;
	}

	function handleSave() {
		onSave({ colors, angle });
	}

	$effect(() => {
		const gradient = `linear-gradient(${angle}deg, ${colors.join(', ')})`;
		const previewElements = document.querySelectorAll('.gradient-preview-text');
		previewElements.forEach((element) => {
			(element as HTMLElement).style.background = gradient;
			(element as HTMLElement).style.webkitBackgroundClip = 'text';
			(element as HTMLElement).style.webkitTextFillColor = 'transparent';
			(element as HTMLElement).style.backgroundClip = 'text';
		});
	});
</script>

<div class="gradient-picker mx-auto max-w-4xl p-6">
	<div
		class="mb-8 flex items-center justify-between border-b border-primary-300 pb-4 dark:border-primary-700"
	>
		<h2 class="text-xl font-semibold">Name Gradient</h2>
		<button
			onclick={handleSave}
			class="rounded border border-primary-700 bg-primary-600 px-5 py-2 font-medium text-white hover:bg-primary-700"
		>
			Save Changes
		</button>
	</div>

	
	<div
		class="preview-card mb-8 rounded border border-primary-300 bg-[var(--bg-base)] p-6 text-center dark:border-primary-700"
	>
		<div
			class="mb-3 block text-xs font-medium tracking-wide text-primary-600 uppercase dark:text-primary-400"
		>
			Preview
		</div>
		<h1 class="gradient-preview-text mb-4 text-5xl font-bold">
			{namePreview}
		</h1>
		<input
			type="text"
			bind:value={namePreview}
			placeholder="Type your name..."
			class="mx-auto w-full max-w-md rounded border border-primary-300 bg-[var(--bg-base)] px-4 py-2 text-center outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-primary-700"
		/>
	</div>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
		
		<div
			class="angle-wheel-section rounded border border-primary-300 bg-[var(--bg-base)] p-6 dark:border-primary-700"
		>
			<h3
				class="mb-4 text-sm font-semibold tracking-wide text-primary-700 uppercase dark:text-primary-300"
			>
				Gradient Angle
			</h3>
			<div class="flex flex-col items-center">
				<div class="relative mb-6">
					<div
						bind:this={angleWheelRef}
						onmousedown={handleAngleWheelMouseDown}
						role="slider"
						aria-label="Gradient angle selector"
						aria-valuenow={angle}
						aria-valuemin={0}
						aria-valuemax={360}
						tabindex="0"
						class="angle-wheel relative h-56 w-56 cursor-pointer rounded-full border-4 border-primary-400 bg-[var(--bg-base)] dark:border-primary-600"
					>
						<div
							class="absolute inset-3 rounded-full border border-primary-300 bg-[var(--bg-base)] dark:border-primary-700"
						></div>

						
						<div
							class="angle-pointer pointer-events-none absolute top-0 left-1/2 w-1 origin-bottom -translate-x-1/2"
							style="height: 50%; transform: translate(-50%, 0) rotate({angle}deg); transform-origin: bottom center;"
						>
							<div
								class="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-white bg-primary-600"
							></div>
							<div class="absolute left-1/2 h-full w-0.5 -translate-x-1/2 bg-primary-600"></div>
						</div>

						
						<div class="pointer-events-none absolute inset-0">
							{#each [0, 45, 90, 135, 180, 225, 270, 315] as markerAngle}
								<div
									class="absolute top-1/2 left-1/2 h-2 w-1 bg-primary-400 dark:bg-primary-600"
									style="transform: translate(-50%, -50%) rotate({markerAngle}deg) translateY(-110px);"
								></div>
							{/each}
						</div>
					</div>

					<div class="text-center">
						<div class="text-2xl font-semibold text-primary-600">{angle}°</div>
						<p class="mt-1 text-xs text-primary-500">Click and drag to adjust angle</p>
					</div>
				</div>

				
				<div class="w-full border-t border-primary-300 pt-4 dark:border-primary-700">
					<div class="mb-2 block text-xs font-medium text-primary-600 dark:text-primary-400">
						Quick Presets
					</div>
					<div class="grid grid-cols-4 gap-2">
						<button
							onclick={() => (angle = 0)}
							class="rounded border border-primary-300 bg-[var(--bg-base)] px-3 py-1.5 text-sm hover:bg-primary-200 dark:border-primary-700 dark:hover:bg-primary-700"
						>
							0°
						</button>
						<button
							onclick={() => (angle = 45)}
							class="rounded border border-primary-300 bg-[var(--bg-base)] px-3 py-1.5 text-sm hover:bg-primary-200 dark:border-primary-700 dark:hover:bg-primary-700"
						>
							45°
						</button>
						<button
							onclick={() => (angle = 90)}
							class="rounded border border-primary-300 bg-[var(--bg-base)] px-3 py-1.5 text-sm hover:bg-primary-200 dark:border-primary-700 dark:hover:bg-primary-700"
						>
							90°
						</button>
						<button
							onclick={() => (angle = 135)}
							class="rounded border border-primary-300 bg-[var(--bg-base)] px-3 py-1.5 text-sm hover:bg-primary-200 dark:border-primary-700 dark:hover:bg-primary-700"
						>
							135°
						</button>
					</div>
				</div>
			</div>
		</div>

		<div
			class="color-stops-section rounded border border-primary-300 bg-[var(--bg-base)] p-6 dark:border-primary-700"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3
					class="text-sm font-semibold tracking-wide text-primary-700 uppercase dark:text-primary-300"
				>
					Color Stops
				</h3>
				{#if colors.length < 5}
					<button
						onclick={addColor}
						class="rounded border border-primary-700 bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
					>
						Add Color
					</button>
				{/if}
			</div>

			
			<div
				class="gradient-bar-container mb-4 rounded border border-primary-300 bg-[var(--bg-base)] p-4 dark:border-primary-700"
			>
				<div
					class="relative mb-6 h-10 overflow-hidden rounded border border-primary-300 dark:border-primary-700"
					style="background: linear-gradient(90deg, {colors.join(', ')})"
				>
					{#each colors as color, index}
						<button
							onclick={() => toggleColorPicker(index)}
							aria-label="Edit color {index + 1}"
							class="absolute top-1/2 h-6 w-6 cursor-pointer rounded-sm border-2 border-white dark:border-primary-900"
							style="left: {(index / (colors.length - 1)) *
								100}%; background-color: {color}; transform: translate(-50%, -50%);"
						>
						</button>
					{/each}
				</div>

				
				<div class="space-y-2">
					{#each colors as color, index}
						<div
							class="flex items-center gap-2 rounded border border-primary-300 bg-[var(--bg-base)] p-2 dark:border-primary-700"
						>
							<button
								onclick={() => toggleColorPicker(index)}
								aria-label="Pick color for stop {index + 1}"
								class="h-8 w-8 flex-shrink-0 rounded border border-primary-400 dark:border-primary-600"
								style="background-color: {color};"
							>
							</button>

							<input
								type="text"
								bind:value={colors[index]}
								class="flex-1 bg-transparent px-2 font-mono text-sm outline-none"
								placeholder="#000000"
							/>

							<span class="w-14 text-xs font-medium text-primary-500">Stop {index + 1}</span>

							{#if colors.length > 2}
								<button
									onclick={() => removeColor(index)}
									class="flex h-7 w-7 items-center justify-center rounded border border-primary-300 text-lg text-primary-500 hover:bg-red-50 hover:text-red-600 dark:border-primary-700 dark:hover:bg-red-900/20"
									title="Remove color stop"
								>
									×
								</button>
							{/if}
						</div>

						{#if activeColorIndex === index}
							<div
								class="rounded border border-primary-300 bg-[var(--bg-base)] p-3 dark:border-primary-700"
							>
								<input
									type="color"
									bind:value={colors[index]}
									class="h-24 w-full cursor-pointer rounded"
								/>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<div
				class="rounded border border-primary-300 bg-[var(--bg-base)] p-3 text-xs text-primary-600 dark:border-primary-700 dark:text-primary-400"
			>
				<strong>Tip:</strong> Click color boxes to pick colors. 2-3 colors typically work best for readability.
			</div>
		</div>
	</div>
</div>

<style>
	.gradient-preview-text {
		background: linear-gradient(45deg, #5c7cfa, #ff6b6b, #51cf66);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.angle-wheel {
		user-select: none;
	}

	.angle-wheel:active {
		cursor: grabbing;
	}

	input[type='color'] {
		appearance: none;
		-webkit-appearance: none;
		border: none;
		cursor: pointer;
	}

	input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	input[type='color']::-webkit-color-swatch {
		border: none;
		border-radius: 0.25rem;
	}
</style>
