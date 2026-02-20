<script lang="ts">
	import { ImagePlus, Wand2, Upload, X, Loader } from '@lucide/svelte';

	interface Props {
		collectionId: string;
		currentCoverUrl?: string | null;
		currentCoverType?: string | null;
		onCoverSelected?: (coverUrl: string, coverType: string) => void;
		isOpen?: boolean;
		onClose?: () => void;
	}

	let {
		collectionId,
		currentCoverUrl = null,
		currentCoverType = null,
		onCoverSelected,
		isOpen = false,
		onClose
	}: Props = $props();

	let activeTab = $state<'auto' | 'manual'>('auto');
	let isGenerating = $state(false);
	let isUploading = $state(false);
	let generationError = $state('');
	let uploadError = $state('');
	let uploadPreview = $state<string | null>(null);

	async function generateAutoCover() {
		isGenerating = true;
		generationError = '';

		try {
			const response = await fetch(`/api/collections/${collectionId}/cover/auto`, {
				method: 'POST'
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to generate cover');
			}

			const data = await response.json();
			onCoverSelected?.(data.coverImageUrl, data.coverImageType);
			isOpen = false;
		} catch (error) {
			generationError = error instanceof Error ? error.message : 'Failed to generate cover';
		} finally {
			isGenerating = false;
		}
	}

	function handleImageChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			uploadPreview = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function uploadManualCover() {
		const input = document.querySelector('#cover-upload') as HTMLInputElement;
		const file = input?.files?.[0];

		if (!file) {
			uploadError = 'Please select an image';
			return;
		}

		isUploading = true;
		uploadError = '';

		try {
			const formData = new FormData();
			formData.append('image', file);

			const response = await fetch(`/api/collections/${collectionId}/cover/manual`, {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to upload cover');
			}

			const data = await response.json();
			onCoverSelected?.(data.coverImageUrl, data.coverImageType);
			isOpen = false;
			uploadPreview = null;
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Failed to upload cover';
		} finally {
			isUploading = false;
		}
	}

	function resetForm() {
		const input = document.querySelector('#cover-upload') as HTMLInputElement;
		if (input) input.value = '';
		uploadPreview = null;
		uploadError = '';
		onClose?.();
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
	>
		<div class="w-full max-w-md rounded-lg bg-surface-50 p-6 shadow-lg dark:bg-surface-900">
			
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-bold">Edit Collection Cover</h2>
				<button
					onclick={resetForm}
					class="rounded hover:bg-surface-200 dark:hover:bg-surface-800"
					aria-label="Close"
				>
					<X size={24} />
				</button>
			</div>

			
			{#if currentCoverUrl}
				<div class="mb-4">
					<p class="mb-2 text-sm font-medium text-surface-600 dark:text-surface-400">
						Current Cover ({currentCoverType})
					</p>
					<img
						src={currentCoverUrl}
						alt="Current cover"
						class="h-40 w-full rounded-lg object-cover"
					/>
				</div>
			{/if}

			
			<div class="mb-4 flex gap-2 border-b border-surface-200 dark:border-surface-700">
				<button
					onclick={() => (activeTab = 'auto')}
					class={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
						activeTab === 'auto'
							? 'border-b-2 border-primary-500 text-primary-500'
							: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'
					}`}
				>
					<Wand2 size={18} />
					Auto-Generate
				</button>
				<button
					onclick={() => (activeTab = 'manual')}
					class={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
						activeTab === 'manual'
							? 'border-b-2 border-primary-500 text-primary-500'
							: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'
					}`}
				>
					<Upload size={18} />
					Upload
				</button>
			</div>

			
			{#if activeTab === 'auto'}
				<div class="space-y-4">
					<p class="text-sm text-surface-600 dark:text-surface-400">
						Automatically generate a 3D album stack cover from your collection's album artwork.
						Perfect for a visual representation of your collection!
					</p>

					{#if generationError}
						<div
							class="rounded-lg bg-error-100 p-3 text-sm text-error-900 dark:bg-error-900/30 dark:text-error-200"
						>
							{generationError}
						</div>
					{/if}

					<button
						onclick={generateAutoCover}
						disabled={isGenerating}
						class="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
					>
						{#if isGenerating}
							<Loader size={18} class="animate-spin" />
							Generating...
						{:else}
							<Wand2 size={18} />
							Generate Cover
						{/if}
					</button>
				</div>
			{:else if activeTab === 'manual'}
				<div class="space-y-4">
					<p class="text-sm text-surface-600 dark:text-surface-400">
						Upload a custom image as your collection cover. Recommended size: 300x300px. Max 5MB.
					</p>

					{#if uploadError}
						<div
							class="rounded-lg bg-error-100 p-3 text-sm text-error-900 dark:bg-error-900/30 dark:text-error-200"
						>
							{uploadError}
						</div>
					{/if}

					
					{#if uploadPreview}
						<div>
							<p class="mb-2 text-sm font-medium">Preview</p>
							<img src={uploadPreview} alt="Preview" class="h-40 w-full rounded-lg object-cover" />
						</div>
					{/if}

					<!-- Upload Input -->
					<label class="cursor-pointer">
						<input
							id="cover-upload"
							type="file"
							accept="image/*"
							onchange={handleImageChange}
							disabled={isUploading}
							class="hidden"
						/>
						<div
							class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-surface-300 p-6 transition-colors hover:border-primary-400 dark:border-surface-600 dark:hover:border-primary-400"
						>
							<ImagePlus size={32} class="mb-2 text-surface-400" />
							<p class="text-sm font-medium">Click to select an image</p>
							<p class="text-xs text-surface-500">or drag and drop</p>
						</div>
					</label>

					<button
						onclick={uploadManualCover}
						disabled={isUploading || !uploadPreview}
						class="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
					>
						{#if isUploading}
							<Loader size={18} class="animate-spin" />
							Uploading...
						{:else}
							<Upload size={18} />
							Upload Cover
						{/if}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
