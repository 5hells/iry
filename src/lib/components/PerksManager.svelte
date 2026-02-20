<script lang="ts">
	import { Gift, Image, Palette, Type, Sparkles, Lock } from '@lucide/svelte';

	interface Perk {
		id: string;
		name: string;
		description: string;
		type: string;
		pointsRequired: number;
		configParsed?: any;
		customConfig?: any;
		isActive?: boolean;
	}

	interface Props {
		locked?: Perk[];
		unlocked?: Perk[];
		totalPoints?: number;
		onActivate?: (perkId: string, customConfig?: any) => void;
	}

	let { locked = [], unlocked = [], totalPoints = 0, onActivate }: Props = $props();

	let selectedPerk = $state<Perk | null>(null);
	let customGradient = $state<string[]>(['#ff6b6b', '#feca57']);
	let selectedFont = $state<string>('');
	let bannerFile = $state<File | null>(null);

	function openPerkCustomizer(perk: Perk) {
		selectedPerk = perk;

		if (perk.customConfig) {
			if (perk.type === 'gradient' && perk.customConfig.colors) {
				customGradient = perk.customConfig.colors;
			} else if (perk.type === 'font' && perk.customConfig.selectedFont) {
				selectedFont = perk.customConfig.selectedFont;
			}
		}
	}

	function closePerkCustomizer() {
		selectedPerk = null;
	}

	async function activatePerkWithConfig() {
		if (!selectedPerk) return;

		let config = null;

		if (selectedPerk.type === 'gradient') {
			config = { colors: customGradient };
		} else if (selectedPerk.type === 'font') {
			config = { selectedFont };
		}

		if (onActivate) {
			await onActivate(selectedPerk.id, config);
		}

		closePerkCustomizer();
	}

	function addGradientColor() {
		customGradient = [...customGradient, '#000000'];
	}

	function removeGradientColor(index: number) {
		customGradient = customGradient.filter((_, i) => i !== index);
	}

	function updateGradientColor(index: number, color: string) {
		customGradient[index] = color;
	}

	const perkIcons: Record<string, any> = {
		banner: Image,
		gradient: Palette,
		font: Type,
		effect: Sparkles
	};

	function getGradientPreview(colors: string[]): string {
		return `linear-gradient(45deg, ${colors.join(', ')})`;
	}
</script>

<div class="space-y-6">
	
	{#if unlocked.length > 0}
		<div class="card p-6">
			<h2 class="mb-4 flex items-center gap-2 h3">
				<Gift class="h-5 w-5" />
				Unlocked Perks
			</h2>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each unlocked as perk}
					{@const Icon = perkIcons[perk.type] || Gift}
					<button
						onclick={() => openPerkCustomizer(perk)}
						class="relative card p-4 text-left transition hover:bg-primary-200 dark:hover:bg-primary-700"
						class:ring-2={perk.isActive}
						class:ring-success-500={perk.isActive}
					>
						<div class="mb-2"><Icon class="h-7 w-7" /></div>
						<h3 class="font-semibold">{perk.name}</h3>
						<p class="mt-1 text-sm text-primary-600 dark:text-primary-400">
							{perk.description}
						</p>
						<div class="mt-3 flex items-center gap-2">
							<span class="badge-sm badge">{perk.pointsRequired} pts</span>
							{#if perk.isActive}
								<span class="badge-sm badge-success badge">Active</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	
	{#if locked.length > 0}
		<div class="card p-6">
			<h2 class="mb-4 flex items-center gap-2 h3">
				<Lock class="h-5 w-5" />
				Locked Perks
			</h2>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each locked as perk}
					{@const Icon = perkIcons[perk.type] || Gift}
					<div
						class="relative card p-4 text-left opacity-60"
						class:opacity-80={totalPoints >= perk.pointsRequired}
					>
						<div class="mb-2"><Icon class="h-7 w-7" /></div>
						<h3 class="font-semibold">{perk.name}</h3>
						<p class="mt-1 text-sm text-primary-600 dark:text-primary-400">
							{perk.description}
						</p>
						<div class="mt-3 flex items-center gap-2">
							<span class="badge-sm badge">{perk.pointsRequired} pts</span>
							{#if totalPoints >= perk.pointsRequired}
								<span class="badge-sm badge-warning badge">Almost there!</span>
							{:else}
								<span class="text-xs text-primary-500">
									{perk.pointsRequired - totalPoints} more pts needed
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>


{#if selectedPerk}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		onclick={closePerkCustomizer}
	>
		<div class="w-full max-w-2xl card p-6" onclick={(e) => e.stopPropagation()}>
			<div class="mb-4 flex items-start justify-between">
				<div>
					<h2 class="h2">{selectedPerk.name}</h2>
					<p class="text-sm text-primary-600 dark:text-primary-400">
						{selectedPerk.description}
					</p>
				</div>
				<button onclick={closePerkCustomizer} class="text-2xl hover:text-error-500">×</button>
			</div>

			
			{#if selectedPerk.type === 'gradient'}
				<div class="space-y-4">
					<div class="rounded-lg p-8" style="background: {getGradientPreview(customGradient)}">
						<h3 class="text-center text-2xl font-bold text-white">Preview Your Name</h3>
					</div>

					{#if selectedPerk.configParsed?.presets}
						<div>
							<h3 class="mb-2 font-semibold">Presets</h3>
							<div class="grid grid-cols-2 gap-2 md:grid-cols-3">
								{#each selectedPerk.configParsed.presets as preset}
									<button
										onclick={() => (customGradient = preset.colors)}
										class="rounded p-3"
										style="background: {getGradientPreview(preset.colors)}"
									>
										<span class="text-sm font-medium text-white">{preset.name}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div>
						<h3 class="mb-2 font-semibold">Custom Colors</h3>
						<div class="space-y-2">
							{#each customGradient as color, index}
								<div class="flex items-center gap-2">
									<input
										type="color"
										value={color}
										oninput={(e) => updateGradientColor(index, e.currentTarget.value)}
										class="h-12 w-12 cursor-pointer rounded"
									/>
									<input
										type="text"
										value={color}
										oninput={(e) => updateGradientColor(index, e.currentTarget.value)}
										class="input flex-1"
									/>
									{#if customGradient.length > 2}
										<button onclick={() => removeGradientColor(index)} class="btn-error btn btn-sm">
											Remove
										</button>
									{/if}
								</div>
							{/each}
						</div>
						<button onclick={addGradientColor} class="btn-secondary mt-2 btn btn-sm">
							Add Color
						</button>
					</div>
				</div>
			{/if}

			
			{#if selectedPerk.type === 'font'}
				<div class="space-y-4">
					<div
						class="rounded-lg bg-primary-100 p-8 dark:bg-primary-800"
						style="font-family: '{selectedFont}', sans-serif"
					>
						<h3 class="text-center text-2xl font-bold">
							Preview Text in {selectedFont || 'Default'}
						</h3>
					</div>

					{#if selectedPerk.configParsed?.fonts}
						<div>
							<h3 class="mb-2 font-semibold">Select Font</h3>
							<div class="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
								{#each selectedPerk.configParsed.fonts as font}
									<button
										onclick={() => (selectedFont = font)}
										class="rounded border-2 p-3 transition hover:border-primary-500"
										class:border-primary-500={selectedFont === font}
										style="font-family: '{font}', sans-serif"
									>
										{font}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			
			{#if selectedPerk.type === 'effect'}
				<div class="space-y-4">
					<div class="rounded-lg bg-primary-100 p-8 text-center dark:bg-primary-800">
						<p class="text-lg">Effect: <strong>{selectedPerk.configParsed?.effect}</strong></p>
						<p class="mt-2 text-sm text-primary-600 dark:text-primary-400">
							This effect will be applied to your profile background
						</p>
					</div>
				</div>
			{/if}

			
			{#if selectedPerk.type === 'banner'}
				<div class="space-y-4">
					<div class="rounded-lg bg-primary-100 p-8 text-center dark:bg-primary-800">
						<p class="text-sm text-primary-600 dark:text-primary-400">
							Upload a custom banner (max 5MB, 1200x300px recommended)
						</p>
						<input
							type="file"
							accept="image/*"
							class="mt-4 input"
							onchange={(e) => {
								const files = e.currentTarget.files;
								if (files && files.length > 0) {
									bannerFile = files[0];
								}
							}}
						/>
					</div>
				</div>
			{/if}

			<div class="mt-6 flex gap-2">
				<button onclick={activatePerkWithConfig} class="btn-primary btn flex-1"> Activate </button>
				<button onclick={closePerkCustomizer} class="btn-secondary btn">Cancel</button>
			</div>
		</div>
	</div>
{/if}
