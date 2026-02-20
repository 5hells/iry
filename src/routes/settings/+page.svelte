<script lang="ts">
	import ThemeCustomizer from '$lib/components/ThemeCustomizer.svelte';
	import ImageCropper from '$lib/components/ImageCropper.svelte';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		Check,
		Link2,
		Moon,
		Sun,
		Upload,
		Settings,
		Palette,
		Music,
		User,
		Zap
	} from 'lucide-svelte';

	export const ssr = false;

	type TabId = 'theme' | 'darkmode' | 'lastfm' | 'profile' | 'discord' | 'admin';

	let activeTab: TabId = $state('profile');
	let initialTheme = $state<any>(null);
	let pronouns = $state('');
	let savingPronouns = $state(false);
	let loading = $state(true);
	let isDarkMode = $state(false);
	let saveMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	let lastfmUsername = $state<string>('');
	let lastfmConnected = $state(false);
	let lastfmLoading = $state(false);
	let newLastFMUsername = $state('');

	let discordUsername = $state<string>('');
	let discordConnected = $state(false);
	let discordLoading = $state(false);
	let newDiscordUsername = $state('');
	let discordId = $state<string | null>(null);

	let profilePictureFile = $state<File | null>(null);
	let bannerFile = $state<File | null>(null);
	let currentImage = $state<string | null>(null);
	let currentBanner = $state<string | null>(null);
	let uploadingProfile = $state(false);
	let showImageCropper = $state(false);
	let showBannerCropper = $state(false);
	let tempImageUrl = $state<string | null>(null);
	let tempBannerUrl = $state<string | null>(null);
	let imagePosition = $state<any>(null);
	let bannerPosition = $state<any>(null);

	let isPro = $state(false);
	let proLoading = $state(false);
	let proPrice = $state(5);
	let proTag = $state('PRO');
	let savingProTag = $state(false);
	let isAdmin = $state(false);
	let adminTargetUserId = $state('');
	let adminCustomTag = $state('PRO');
	let adminWorking = $state(false);
	let adminSubs = $state<Array<any>>([]);

	onMount(async () => {
		try {
			const response = await fetch('/api/user/theme');
			if (response.ok) {
				const data = await response.json();
				initialTheme = {
					primaryColor: data.primaryColor?.trim() || '#5c7cfa',
					secondaryColor: data.secondaryColor?.trim() || '#748ffc',
					accentColor: data.accentColor?.trim() || '#ff6b6b',
					backgroundColor: data.backgroundColor?.trim() || '#1a1b1e'
				};
			} else {
				initialTheme = {
					primaryColor: '#5c7cfa',
					secondaryColor: '#748ffc',
					accentColor: '#ff6b6b',
					backgroundColor: '#1a1b1e'
				};
			}
		} catch (error) {
			console.error('Failed to load theme:', error);
			initialTheme = {
				primaryColor: '#0078D4',
				secondaryColor: '#50E6FF',
				accentColor: '#F7630C',
				backgroundColor: '#1E1E1E'
			};
		}

		const saved = localStorage.getItem('darkMode');
		if (saved !== null) {
			isDarkMode = saved === 'true';
		} else {
			isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}

		try {
			const userResponse = await fetch('/api/user/profile');
			if (userResponse.ok) {
				const userData = await userResponse.json();
				const profileUser = userData.user || userData;
				isAdmin = profileUser.role === 'admin';
				if (profileUser.lastfmUsername) {
					lastfmUsername = profileUser.lastfmUsername;
					lastfmConnected = true;
				}
				if (profileUser.discordUsername) {
					discordUsername = profileUser.discordUsername;
					discordConnected = !!profileUser.discordId;
				}
				if (profileUser.discordId) {
					discordId = profileUser.discordId;
				}
				if (profileUser.image) {
					currentImage = profileUser.image;
				}
				if (profileUser.bannerUrl) {
					currentBanner = profileUser.bannerUrl;
				}
				if (profileUser.pronouns) {
					pronouns = profileUser.pronouns;
				}

				if (userData.activePerks && Array.isArray(userData.activePerks)) {
					const supportPerk = userData.activePerks.find((p: any) => p.type === 'support');
					if (supportPerk) {
						isPro = true;
						if (supportPerk.customConfig && supportPerk.customConfig.customTag) {
							proTag = supportPerk.customConfig.customTag;
						}
					}
				}
			}

			if (isAdmin) {
				await loadAdminSubscriptions();
			}
		} catch (error) {
			console.error('Failed to load user profile:', error);
		}

		try {
			const params = new URLSearchParams(window.location.search);
			const subId = params.get('subscription_id') || params.get('subscriptionId');
			if (subId) {
				await activateSubscription(subId);

				history.replaceState({}, '', window.location.pathname);
			}
		} catch (e) {}

		loading = false;
	});

	async function saveTheme(config: any) {
		console.log('[theme-settings] onSave config:', JSON.parse(JSON.stringify(config)));
		try {
			const cleanConfig = {
				primaryColor: config.primaryColor?.trim() || '#0078D4',
				secondaryColor: config.secondaryColor?.trim() || '#50E6FF',
				accentColor: config.accentColor?.trim() || '#F7630C',
				backgroundColor: config.backgroundColor?.trim() || '#1E1E1E'
			};

			const response = await fetch('/api/user/theme', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(cleanConfig)
			});
			if (response.ok) {
				initialTheme = { ...cleanConfig };
				showMessage('success', 'Theme saved!');
				applyTheme(cleanConfig);
			} else {
				const error = await response.json();
				showMessage('error', error.error || 'Failed to save theme');
			}
		} catch (error) {
			console.error('Failed to save theme:', error);
			showMessage('error', 'Failed to save theme');
		}
	}

	async function loadAdminSubscriptions() {
		try {
			const resp = await fetch('/api/admin/pro-subscriptions');
			if (resp.ok) {
				const data = await resp.json();
				adminSubs = data.subscriptions || [];
			}
		} catch (e) {
			console.error('Failed to load admin subscriptions', e);
		}
	}

	async function adminGrantPro() {
		if (!adminTargetUserId.trim()) return showMessage('error', 'Target user id is required');
		adminWorking = true;
		try {
			const resp = await fetch('/api/admin/pro-subscriptions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'grant',
					userId: adminTargetUserId.trim(),
					customTag: adminCustomTag.trim() || 'PRO'
				})
			});
			if (!resp.ok) {
				const text = await resp.text();
				throw new Error(text || 'Failed to grant Pro');
			}
			showMessage('success', 'Pro granted');
			await loadAdminSubscriptions();
		} catch (e: any) {
			showMessage('error', e.message || 'Failed to grant Pro');
		} finally {
			adminWorking = false;
		}
	}

	async function adminRevokePro() {
		if (!adminTargetUserId.trim()) return showMessage('error', 'Target user id is required');
		adminWorking = true;
		try {
			const resp = await fetch('/api/admin/pro-subscriptions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'revoke', userId: adminTargetUserId.trim() })
			});
			if (!resp.ok) {
				const text = await resp.text();
				throw new Error(text || 'Failed to revoke Pro');
			}
			showMessage('success', 'Pro revoked');
			await loadAdminSubscriptions();
		} catch (e: any) {
			showMessage('error', e.message || 'Failed to revoke Pro');
		} finally {
			adminWorking = false;
		}
	}

	async function savePronouns() {
		savingPronouns = true;
		try {
			const response = await fetch('/api/user/profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pronouns: pronouns.trim() || null })
			});
			if (response.ok) {
				showMessage('success', 'Pronouns saved');
			} else {
				const error = await response.json();
				showMessage('error', error.error || 'Failed to save pronouns');
			}
		} catch (error) {
			showMessage('error', 'Failed to save pronouns');
		} finally {
			savingPronouns = false;
		}
	}

	async function startProSubscription() {
		proLoading = true;
		try {
			const resp = await fetch('/api/paypal/create-subscription', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ price: proPrice, returnUrl: `${window.location.origin}/settings` })
			});
			if (!resp.ok) {
				const err = await resp.text();
				throw new Error(err || 'Failed to start subscription');
			}
			const data = await resp.json();
			if (data.approveUrl) {
				window.location.href = data.approveUrl;
			} else {
				throw new Error('No approval URL from PayPal');
			}
		} catch (e: any) {
			console.error('startProSubscription error', e);
			showMessage('error', e.message || 'Failed to start subscription');
		} finally {
			proLoading = false;
		}
	}

	async function activateSubscription(subscriptionId: string) {
		try {
			const resp = await fetch('/api/paypal/activate-subscription', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subscriptionId })
			});
			if (resp.ok) {
				showMessage('success', 'Subscription activated — thank you!');

				const u = await fetch('/api/user/profile');
				if (u.ok) {
					const ud = await u.json();
					if (ud.activePerks) {
						const supportPerk = ud.activePerks.find((p: any) => p.type === 'support');
						if (supportPerk) {
							isPro = true;
							if (supportPerk.customConfig && supportPerk.customConfig.customTag)
								proTag = supportPerk.customConfig.customTag;
						}
					}
				}
			} else {
				const err = await resp.text();
				throw new Error(err || 'Activation failed');
			}
		} catch (e: any) {
			console.error('activateSubscription error', e);
			showMessage('error', e.message || 'Failed to activate subscription');
		}
	}

	async function saveProTag() {
		if (!isPro) return showMessage('error', 'You are not a Pro supporter');
		savingProTag = true;
		try {
			const resp = await fetch('/api/user/pro-tag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tag: proTag })
			});
			if (resp.ok) {
				showMessage('success', 'Pro tag saved');
			} else {
				const err = await resp.json();
				showMessage('error', err.error || 'Failed to save pro tag');
			}
		} catch (e: any) {
			console.error('saveProTag error', e);
			showMessage('error', 'Failed to save pro tag');
		} finally {
			savingProTag = false;
		}
	}

	function toggleDarkMode() {
		isDarkMode = !isDarkMode;
		localStorage.setItem('darkMode', String(isDarkMode));
		applyDarkMode();
		showMessage('success', isDarkMode ? 'Dark mode enabled' : 'Light mode enabled');
	}

	function applyDarkMode() {
		if (isDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}

	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const normalized = hex.replace('#', '');
		if (normalized.length !== 6) return null;
		const r = Number.parseInt(normalized.slice(0, 2), 16);
		const g = Number.parseInt(normalized.slice(2, 4), 16);
		const b = Number.parseInt(normalized.slice(4, 6), 16);
		if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
		return { r, g, b };
	}

	function mixRgb(
		base: { r: number; g: number; b: number },
		mix: { r: number; g: number; b: number },
		weight: number
	): { r: number; g: number; b: number } {
		return {
			r: Math.round(base.r * (1 - weight) + mix.r * weight),
			g: Math.round(base.g * (1 - weight) + mix.g * weight),
			b: Math.round(base.b * (1 - weight) + mix.b * weight)
		};
	}

	function setColorScale(prefix: string, hex: string) {
		const base = hexToRgb(hex);
		if (!base) return;
		const white = { r: 255, g: 255, b: 255 };
		const black = { r: 0, g: 0, b: 0 };
		const scale: Record<number, { r: number; g: number; b: number }> = {
			50: mixRgb(base, white, 0.92),
			100: mixRgb(base, white, 0.84),
			200: mixRgb(base, white, 0.72),
			300: mixRgb(base, white, 0.58),
			400: mixRgb(base, white, 0.4),
			500: base,
			600: mixRgb(base, black, 0.12),
			700: mixRgb(base, black, 0.24),
			800: mixRgb(base, black, 0.38),
			900: mixRgb(base, black, 0.52),
			950: mixRgb(base, black, 0.68)
		};
		Object.entries(scale).forEach(([key, value]) => {
			document.documentElement.style.setProperty(
				`--color-${prefix}-${key}`,
				`${value.r} ${value.g} ${value.b}`
			);
		});
	}

	function applyTheme(theme: any) {
		document.documentElement.style.setProperty('--theme-primary', theme.primaryColor);
		document.documentElement.style.setProperty('--theme-secondary', theme.secondaryColor);
		document.documentElement.style.setProperty('--theme-accent', theme.accentColor);
		document.documentElement.style.setProperty('--theme-background', theme.backgroundColor);
		setColorScale('primary', theme.primaryColor);
		setColorScale('secondary', theme.secondaryColor);
		setColorScale('tertiary', theme.accentColor);
	}

	function showMessage(type: 'success' | 'error', text: string) {
		saveMessage = { type, text };
		setTimeout(() => {
			saveMessage = null;
		}, 3000);
	}

	async function handleConnectLastFM() {
		if (!newLastFMUsername) return;
		lastfmLoading = true;
		try {
			const response = await fetch('/api/user/lastfm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: newLastFMUsername })
			});
			if (response.ok) {
				const data = await response.json();
				lastfmUsername = data.lastfmUsername;
				lastfmConnected = true;
				newLastFMUsername = '';
				showMessage('success', 'LastFM account connected successfully');
			} else {
				const error = await response.json();
				showMessage('error', error.error || 'Failed to connect LastFM account');
			}
		} catch (error) {
			showMessage('error', 'Error connecting LastFM account');
		} finally {
			lastfmLoading = false;
		}
	}

	async function handleDisconnectLastFM() {
		lastfmLoading = true;
		try {
			const response = await fetch('/api/user/lastfm', { method: 'DELETE' });
			if (response.ok) {
				lastfmUsername = '';
				lastfmConnected = false;
				showMessage('success', 'LastFM account disconnected');
			} else {
				showMessage('error', 'Failed to disconnect LastFM account');
			}
		} catch (error) {
			showMessage('error', 'Error disconnecting LastFM account');
		} finally {
			lastfmLoading = false;
		}
	}

	async function handleDisconnectDiscord() {
		discordLoading = true;
		try {
			const response = await fetch('/api/user/discord', { method: 'DELETE' });
			if (response.ok) {
				discordUsername = '';
				discordConnected = false;
				discordId = null;
				showMessage('success', 'Discord account disconnected');
			} else {
				const error = await response.json();
				showMessage('error', error.error || 'Failed to disconnect Discord account');
			}
		} catch (error) {
			showMessage('error', 'Error disconnecting Discord account');
		} finally {
			discordLoading = false;
		}
	}

	function closeImageCropper() {
		showImageCropper = false;
		tempImageUrl = null;
		profilePictureFile = null;
	}

	function closeBannerCropper() {
		showBannerCropper = false;
		tempBannerUrl = null;
		bannerFile = null;
	}

	function handleModalBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeImageCropper();
		}
	}

	function handleBannerModalBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeBannerCropper();
		}
	}

	function switchTab(tab: TabId) {
		activeTab = tab;
		closeImageCropper();
		closeBannerCropper();
	}

	function handleProfilePictureSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) {
			profilePictureFile = input.files[0];
			const reader = new FileReader();
			reader.onload = (evt) => {
				tempImageUrl = evt.target?.result as string;
				showImageCropper = true;
			};
			reader.readAsDataURL(profilePictureFile);
		}
	}

	function handleBannerSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) {
			bannerFile = input.files[0];
			const reader = new FileReader();
			reader.onload = (evt) => {
				tempBannerUrl = evt.target?.result as string;
				showBannerCropper = true;
			};
			reader.readAsDataURL(bannerFile);
		}
	}

	async function handleImageCrop(position: any) {
		if (!profilePictureFile) return;
		imagePosition = position;
		const fileToUpload = profilePictureFile;
		showImageCropper = false;
		tempImageUrl = null;
		await handleUploadFile('picture', fileToUpload, position);
	}

	async function handleBannerCrop(position: any) {
		if (!bannerFile) return;
		bannerPosition = position;
		const fileToUpload = bannerFile;
		showBannerCropper = false;
		tempBannerUrl = null;
		await handleUploadFile('banner', fileToUpload, position);
	}

	async function handleUploadFile(type: 'picture' | 'banner', file: File, position?: any) {
		uploadingProfile = true;
		try {
			const formData = new FormData();
			formData.append('type', type);
			formData.append('file', file);
			if (position) {
				formData.append('position', JSON.stringify(position));
			}

			const response = await fetch('/api/user/uploads', {
				method: 'POST',
				body: formData
			});
			if (response.ok) {
				const data = await response.json();
				if (type === 'picture') {
					currentImage = data.user.image;
					profilePictureFile = null;
				} else {
					currentBanner = data.user.bannerUrl;
					bannerFile = null;
				}
				showMessage(
					'success',
					`${type === 'picture' ? 'Profile picture' : 'Banner'} uploaded successfully`
				);
			} else {
				const error = await response.json();
				showMessage('error', error.error || `Failed to upload ${type}`);
			}
		} catch (error) {
			showMessage('error', `Error uploading ${type}`);
		} finally {
			uploadingProfile = false;
		}
	}

	function getTabs() {
		const base = [
			{ id: 'profile' as TabId, label: 'Profile' },
			{ id: 'theme' as TabId, label: 'Theme' },
			{ id: 'darkmode' as TabId, label: 'Dark Mode' },
			{ id: 'lastfm' as TabId, label: 'LastFM' },
			{ id: 'discord' as TabId, label: 'Discord' }
		];
		if (isAdmin) base.push({ id: 'admin' as TabId, label: 'Admin' });
		return base;
	}
</script>

<div class="settings-wrapper">
	<header class="settings-header">
		<div class="header-content">
			<div class="header-top">
				<div class="icon-badge">
					<Settings class="h-6 w-6" />
				</div>
				<div class="header-text">
					<h1 class="page-title">settings</h1>
				</div>
			</div>
		</div>
	</header>

	{#if saveMessage}
		<div class="toast {saveMessage.type}">
			<div class="toast-icon">
				{#if saveMessage.type === 'success'}
					<Check class="h-5 w-5" />
				{:else}
					<span>⚠️</span>
				{/if}
			</div>
			<p>{saveMessage.text}</p>
		</div>
	{/if}

	<nav class="tabs-bar">
		<div class="tabs-container">
			{#each getTabs() as tab (tab.id)}
				<button
					type="button"
					onclick={() => switchTab(tab.id)}
					class="tab-button {activeTab === tab.id ? 'active' : ''}"
				>
					<span class="tab-icon">
						{#if tab.id === 'profile'}
							<User size={18} />
						{:else if tab.id === 'theme'}
							<Palette size={18} />
						{:else if tab.id === 'darkmode'}
							<Moon size={18} />
						{:else if tab.id === 'lastfm'}
							<Music size={18} />
						{:else if tab.id === 'discord'}
							<Zap size={18} />
						{:else if tab.id === 'admin'}
							<Settings size={18} />
						{/if}
					</span>
					<span class="tab-label">{tab.label}</span>
				</button>
			{/each}
		</div>
	</nav>

	<main class="settings-content">
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading your settings...</p>
			</div>
		{:else}
			{#key activeTab}
				<div class="tab-wrapper">
					{#if activeTab === 'profile'}
						<div class="tab-section">
							<div class="section-header">
								<h2>profile settings</h2>
								<p>manage your public profile information</p>
							</div>

							<div class="card">
								<div class="card-header">
									<h3>pronouns</h3>
									<p>let others know your preferred pronouns</p>
								</div>
								<div class="card-content">
									<div class="input-group">
										<input
											type="text"
											bind:value={pronouns}
											placeholder="e.g. she/her, he/him, they/them"
											class="form-input border-none outline-none focus:border-none focus:ring-0"
											style="border: none; outline: none; box-shadow: none;"
										/>
										<button
											type="button"
											onclick={savePronouns}
											disabled={savingPronouns}
											class="btn-primary btn"
										>
											{savingPronouns ? 'Saving...' : 'Save'}
										</button>
									</div>
								</div>
							</div>

							<div class="card">
								<div class="card-header">
									<h3>profile picture</h3>
									<p>upload a display picture for your profile</p>
								</div>
								<div class="card-content">
									<div class="upload-grid">
										<div class="upload-area">
											<input
												id="profile-picture-input"
												type="file"
												accept="image/*"
												onchange={handleProfilePictureSelect}
												disabled={uploadingProfile}
												class="hidden"
											/>
											<button
												type="button"
												onclick={() => document.getElementById('profile-picture-input')?.click()}
												disabled={uploadingProfile}
												class="upload-button"
											>
												<Upload class="h-5 w-5" />
												<span>
													{uploadingProfile ? 'uploading...' : 'choose picture'}
												</span>
											</button>
											{#if profilePictureFile}
												<p class="file-info">
													{profilePictureFile.name} ({(
														profilePictureFile.size /
														1024 /
														1024
													).toFixed(2)}mb)
												</p>
											{/if}
										</div>
										{#if currentImage}
											<div class="image-preview">
												<p class="preview-label">current picture</p>
												<img
													src={currentImage}
													alt="Profile preview"
													class="preview-image profile-preview"
												/>
											</div>
										{/if}
									</div>
								</div>
							</div>

							<div class="card">
								<div class="card-header">
									<h3>banner</h3>
									<p>upload a banner for your profile header</p>
								</div>
								<div class="card-content">
									<div class="upload-area">
										<input
											id="banner-input"
											type="file"
											accept="image/*"
											onchange={handleBannerSelect}
											disabled={uploadingProfile}
											class="hidden"
										/>
										<button
											type="button"
											onclick={() => document.getElementById('banner-input')?.click()}
											disabled={uploadingProfile}
											class="upload-button"
										>
											<Upload class="h-5 w-5" />
											<span>
												{uploadingProfile ? 'uploading...' : 'choose banner'}
											</span>
										</button>
										{#if bannerFile}
											<p class="file-info">
												{bannerFile.name} ({(bannerFile.size / 1024 / 1024).toFixed(2)}mb)
											</p>
										{/if}
									</div>

									{#if currentBanner}
										<div class="banner-preview-container">
											<p class="preview-label">current banner</p>
											<img
												src={currentBanner}
												alt="banner preview"
												class="preview-image banner-preview"
											/>
										</div>
									{/if}
								</div>
							</div>

							<div class="card">
								<div class="card-header">
									<h3>support (pro)</h3>
									<p>
										Become a Pro supporter and get a customizable PRO tag plus prioritized comments.
									</p>
								</div>
								<div class="card-content">
									{#if isPro}
										<p class="text-sm">You are a Pro supporter — thank you!</p>
										<div class="mt-2 input-group">
											<input type="text" bind:value={proTag} class="form-input" placeholder="PRO" />
											<button
												type="button"
												onclick={saveProTag}
												class="btn-primary btn"
												disabled={savingProTag}
											>
												{savingProTag ? 'Saving...' : 'Save tag'}
											</button>
										</div>
									{:else}
										<p class="text-sm">Monthly: ${proPrice.toFixed(2)} USD</p>
										<button
											type="button"
											onclick={startProSubscription}
											class="btn-primary mt-2 btn"
											disabled={proLoading}
										>
											{proLoading ? 'Redirecting...' : 'Become Pro — $5/mo'}
										</button>
									{/if}
								</div>
							</div>
						</div>
					{:else if activeTab === 'theme'}
						<div class="tab-section">
							<div class="section-header">
								<h2>theme customization</h2>
								<p>customize the color scheme of your experience</p>
							</div>

							{#if initialTheme}
								<ThemeCustomizer
									initialConfig={initialTheme as {
										primaryColor: string;
										secondaryColor: string;
										accentColor: string;
										backgroundColor: string;
									}}
									onSave={saveTheme}
								/>
							{/if}
						</div>
					{:else if activeTab === 'darkmode'}
						<div class="tab-section">
							<div class="section-header">
								<h2>dark mode</h2>
								<p>adjust the theme for your display</p>
							</div>

							<div class="settings-card">
								<div class="card-content">
									<div class="darkmode-toggle">
										<div class="toggle-info">
											<div class="toggle-icon">
												{#if isDarkMode}
													<Moon class="h-5 w-5" />
												{:else}
													<Sun class="h-5 w-5" />
												{/if}
											</div>
											<span class="toggle-status">
												{isDarkMode ? 'dark mode' : 'light mode'}
											</span>
										</div>
										<button type="button" onclick={toggleDarkMode} class="btn-secondary btn">
											{isDarkMode ? 'switch to light' : 'switch to dark'}
										</button>
									</div>
								</div>
							</div>
						</div>
					{:else if activeTab === 'lastfm'}
						<div class="tab-section">
							<div class="section-header">
								<h2>lastfm integration</h2>
								<p>connect your music listening history</p>
							</div>

							<div class="settings-card">
								<div class="card-content">
									{#if lastfmConnected}
										<div class="connection-status connected">
											<div class="status-indicator"></div>
											<div class="status-text">
												<p class="status-label">connected as</p>
												<p class="status-value">{lastfmUsername}</p>
											</div>
											<button
												type="button"
												onclick={handleDisconnectLastFM}
												disabled={lastfmLoading}
												class="btn-danger btn"
											>
												{lastfmLoading ? 'disconnecting...' : 'disconnect'}
											</button>
										</div>
									{:else}
										<div class="connection-form">
											<div class="form-group">
												<label for="lastfm-username">lastfm username</label>
												<input
													id="lastfm-username"
													type="text"
													bind:value={newLastFMUsername}
													placeholder="enter your lastfm username"
													class="form-input"
												/>
											</div>
											<button
												type="button"
												onclick={handleConnectLastFM}
												disabled={!newLastFMUsername || lastfmLoading}
												class="btn-primary btn-full btn"
											>
												<Link2 class="h-4 w-4" />
												{lastfmLoading ? 'connecting...' : 'connect lastfm'}
											</button>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{:else if activeTab === 'discord'}
						<div class="tab-section">
							<div class="section-header">
								<h2>discord integration</h2>
								<p>connect discord to use the iry bot</p>
							</div>

							<div class="settings-card">
								<div class="card-content discord-card">
									<div class="discord-header">
										<div class="discord-icon">
											<svg
												class="h-6 w-6"
												viewBox="0 0 24 24"
												fill="currentColor"
												aria-hidden="true"
											>
												<path
													d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.403.769-.552 1.116a18.27 18.27 0 0 0-5.666 0A12.64 12.64 0 0 0 9.115 3a19.736 19.736 0 0 0-4.433 1.369C1.886 8.553 1.127 12.632 1.507 16.654a19.9 19.9 0 0 0 6.105 3.087c.496-.676.939-1.389 1.317-2.137a12.93 12.93 0 0 1-2.07-.996c.174-.129.344-.263.508-.401c3.993 1.823 8.33 1.823 12.275 0 .165.138.335.272.509.401a13.12 13.12 0 0 1-2.073.998 15.04 15.04 0 0 0 1.318 2.135 19.89 19.89 0 0 0 6.106-3.086c.446-4.661-.762-8.703-3.189-12.286ZM8.02 14.121c-1.183 0-2.157-1.085-2.157-2.42s.955-2.42 2.157-2.42c1.21 0 2.176 1.095 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm7.961 0c-1.183 0-2.157-1.085-2.157-2.42s.955-2.42 2.157-2.42c1.21 0 2.176 1.095 2.157 2.42 0 1.335-.947 2.42-2.157 2.42Z"
												/>
											</svg>
										</div>
										<div class="discord-info">
											<p class="discord-label">discord account</p>
											<p class="discord-status">
												{#if discordConnected}
													Connected as <span class="highlight">{discordUsername}</span>
												{:else}
													Not connected
												{/if}
											</p>
										</div>
									</div>

									<div class="discord-action">
										{#if discordConnected}
											<button
												type="button"
												onclick={handleDisconnectDiscord}
												disabled={discordLoading}
												class="btn-danger btn"
											>
												{discordLoading ? 'Disconnecting...' : 'Disconnect'}
											</button>
										{:else}
											<form method="POST" action="?/linkDiscord">
												<button type="submit" class="btn-primary btn" disabled={discordLoading}>
													{discordLoading ? 'Connecting...' : 'Connect Discord'}
												</button>
											</form>
										{/if}
									</div>
								</div>
							</div>

							{#if discordConnected}
								<div class="success-message">
									<div class="success-header">
										<Check class="h-5 w-5" />
										<span>Successfully Verified</span>
									</div>
									<p>
										Your Discord account is linked to your Iry profile. Use <code>/review</code>
										in Discord servers with the Iry bot to post your reviews.
									</p>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'admin' && isAdmin}
						<div class="tab-section">
							<div class="section-header">
								<h2>admin · pro subscriptions</h2>
								<p>grant or revoke Pro supporter subscriptions.</p>
							</div>

							<div class="card">
								<div class="card-content">
									<div class="input-group">
										<input
											type="text"
											bind:value={adminTargetUserId}
											class="form-input"
											placeholder="target user id"
										/>
										<input
											type="text"
											bind:value={adminCustomTag}
											class="form-input"
											placeholder="custom tag (optional)"
										/>
										<button
											type="button"
											class="btn-primary btn"
											onclick={adminGrantPro}
											disabled={adminWorking}>grant</button
										>
										<button
											type="button"
											class="btn-danger btn"
											onclick={adminRevokePro}
											disabled={adminWorking}>revoke</button
										>
									</div>
								</div>
							</div>

							<div class="card">
								<div class="card-header">
									<h3>active pro users</h3>
								</div>
								<div class="card-content">
									{#if adminSubs.length === 0}
										<p class="text-sm opacity-70">No active pro subscriptions.</p>
									{:else}
										<div class="space-y-2">
											{#each adminSubs as sub (sub.id)}
												<div
													class="flex items-center justify-between rounded border border-[var(--border-color)] px-3 py-2"
												>
													<div>
														<p class="text-sm font-medium">
															{sub.user?.displayName || sub.user?.name || sub.userId}
														</p>
														<p class="text-xs opacity-70">
															{sub.user?.email || sub.userId} · tag: {sub.customTag || 'PRO'}
														</p>
													</div>
													<button
														type="button"
														class="btn-danger btn"
														onclick={() => {
															adminTargetUserId = sub.userId;
															adminRevokePro();
														}}
														disabled={adminWorking}>revoke</button
													>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/key}
		{/if}
	</main>
</div>

{#if showImageCropper && tempImageUrl}
	<div class="modal-overlay" onmousedown={handleModalBackdropClick} role="presentation">
		<div class="modal-content" onmousedown={(e) => e.stopPropagation()} role="presentation">
			<div class="modal-header">
				<h3>Crop Profile Picture</h3>
				<button type="button" onclick={closeImageCropper} class="modal-close" aria-label="Close">
					✕
				</button>
			</div>
			<ImageCropper imageUrl={tempImageUrl} aspectRatio={1} onCrop={handleImageCrop} />
		</div>
	</div>
{/if}

{#if showBannerCropper && tempBannerUrl}
	<div class="modal-overlay" onmousedown={handleBannerModalBackdropClick} role="presentation">
		<div class="modal-content" onmousedown={(e) => e.stopPropagation()} role="presentation">
			<div class="modal-header">
				<h3>Crop Banner</h3>
				<button type="button" onclick={closeBannerCropper} class="modal-close" aria-label="Close">
					✕
				</button>
			</div>
			<ImageCropper imageUrl={tempBannerUrl} aspectRatio={3} onCrop={handleBannerCrop} />
		</div>
	</div>
{/if}

<style>
	.settings-wrapper {
		min-height: 100vh;
		background: var(--bg-base);
		display: flex;
		flex-direction: column;
	}

	.header-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem;
		width: 100%;
	}

	.header-top {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		color: white;
		flex-shrink: 0;
	}

	.header-text {
		display: flex;
		flex-direction: column;
	}

	.page-title {
		font-size: 1.875rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
		letter-spacing: -0.02em;
	}

	.page-subtitle {
		color: var(--text-secondary);
		font-size: 0.875rem;
		margin: 0.25rem 0 0 0;
	}

	.toast {
		position: fixed;
		top: 2rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-radius: 8px;
		max-width: 500px;
		width: calc(100% - 2rem);
		animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		backdrop-filter: blur(10px);
		border: 1px solid;
		font-weight: 500;
	}

	.toast.success {
		background: rgba(34, 197, 94, 0.1);
		color: rgb(22, 163, 74);
		border-color: rgba(34, 197, 94, 0.3);
	}

	.toast.error {
		background: rgba(239, 68, 68, 0.1);
		color: rgb(220, 38, 38);
		border-color: rgba(239, 68, 68, 0.3);
	}

	.toast-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.25rem;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.tabs-bar {
		border-bottom: 1px solid var(--border-color);
		background: var(--bg-base);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.tabs-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		gap: 0.5rem;
	}

	.tab-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border: none;
		background: none;
		color: var(--text-secondary);
		font-size: 0.95rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		border-bottom: 2px solid transparent;
		white-space: nowrap;
		position: relative;
	}

	.tab-button:hover {
		color: var(--text-primary);
	}

	.tab-button.active {
		color: var(--text-secondary);
		border-color: var(--color-primary-500);
	}

	.tab-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		opacity: 0.8;
	}

	.tab-button.active .tab-icon {
		opacity: 1;
	}

	.tab-label {
		display: none;
	}

	@media (min-width: 640px) {
		.tab-label {
			display: inline;
		}
	}

	.settings-content {
		flex: 1;
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		width: 100%;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		padding: 6rem 2rem;
		color: var(--text-secondary);
	}

	.spinner {
		width: 2.5rem;
		height: 2.5rem;
		border: 3px solid rgba(var(--color-primary-400), 0.2);
		border-top-color: var(--color-primary-500);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.tab-wrapper {
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.tab-section {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.section-header {
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	.section-header h2 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 0.5rem 0;
	}

	.section-header p {
		color: var(--text-secondary);
		font-size: 0.9375rem;
		margin: 0;
	}

	.card-header {
		padding: 1.5rem;
		border-bottom: 1px solid var(--border-color);
	}

	.card-header h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 0.5rem 0;
	}

	.card-header p {
		color: var(--text-secondary);
		font-size: 0.875rem;
		margin: 0;
	}

	.card-content {
		padding: 1.5rem;
	}

	.form-input {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		background: var(--bg-base);
		color: var(--text-primary);
		font-size: 0.95rem;
		transition: all 0.2s ease;
	}

	.form-input:hover {
		border-color: var(--color-primary-400);
	}

	.form-input:focus {
		outline: none;
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 3px rgba(var(--color-primary-500), 0.1);
	}

	.form-input::placeholder {
		color: var(--text-secondary);
	}

	.input-group {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		background: none;
		border: none;
		outline: none;
	}

	.input-group .form-input {
		flex: 1;
		min-width: 200px;
	}

	button {
		appearance: none;
		--webkit-appearance: none;
		outline: none;
		border: none;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group label {
		color: var(--text-primary);
		font-weight: 500;
		font-size: 0.875rem;
	}

	.btn {
		padding: 0.75rem 1.25rem;
		border: none;
		border-radius: 6px;
		font-weight: 500;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		white-space: nowrap;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background-color: var(--theme-primary);
		color: white;
	}

	.btn-secondary {
		background: var(--bg-base);
		color: var(--text-primary);
		border: 1px solid var(--border-color);
	}

	.btn-danger {
		background: rgba(239, 68, 68, 0.1);
		color: rgb(220, 38, 38);
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.btn-danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.2);
	}

	.btn-full {
		width: 100%;
	}

	.upload-grid {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2rem;
		align-items: start;
	}

	@media (max-width: 640px) {
		.upload-grid {
			grid-template-columns: 1fr;
		}
	}

	.upload-area {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.upload-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem;
		border: 2px dashed var(--border-color);
		border-radius: 8px;
		background: var(--bg-base);
		color: var(--text-primary);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.upload-button:hover:not(:disabled) {
		border-color: var(--color-primary-500);
		background: rgba(var(--color-primary-500), 0.05);
	}

	.upload-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.file-info {
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin: 0;
	}

	.image-preview {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.preview-label {
		font-weight: 500;
		font-size: 0.875rem;
		color: var(--text-primary);
		margin: 0;
	}

	.preview-image {
		border: 1px solid var(--border-color);
		border-radius: 8px;
		object-fit: cover;
		background: var(--bg-base);
	}

	.profile-preview {
		width: 100px;
		height: 100px;
		border-radius: 50%;
	}

	.banner-preview-container {
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 1px solid var(--border-color);
	}

	.banner-preview {
		width: 100%;
		height: 200px;
	}

	.hidden {
		display: none !important;
	}

	.darkmode-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-radius: 8px;
		background: var(--bg-base);
		border: 1px solid var(--border-color);
	}

	.toggle-info {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.toggle-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 6px;
		background: rgba(var(--color-primary-500), 0.1);
		color: var(--color-primary-500);
	}

	.toggle-status {
		font-weight: 500;
		color: var(--text-primary);
	}

	.info-box {
		margin-top: 1.5rem;
		padding: 1rem;
		border-radius: 6px;
		background: rgba(var(--color-primary-500), 0.05);
		border-left: 3px solid var(--color-primary-500);
	}

	.info-box p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-primary);
	}

	.connection-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-radius: 8px;
		border: 1px solid var(--border-color);
	}

	.connection-status.connected {
		background: rgba(34, 197, 94, 0.05);
		border-color: rgba(34, 197, 94, 0.2);
	}

	.status-indicator {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		background: rgb(34, 197, 94);
		flex-shrink: 0;
	}

	.status-text {
		flex: 1;
		margin-left: 1rem;
	}

	.status-label {
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.status-value {
		font-weight: 600;
		color: var(--text-primary);
		margin: 0.25rem 0 0 0;
		font-size: 1rem;
	}

	.connection-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.discord-card {
		padding: 0 !important;
	}

	.discord-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		border-bottom: 1px solid var(--border-color);
	}

	.discord-icon {
		width: 3rem;
		height: 3rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: rgba(88, 101, 242, 0.1);
		color: #5865f2;
		flex-shrink: 0;
	}

	.discord-info {
		flex: 1;
	}

	.discord-label {
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
		font-size: 1rem;
	}

	.discord-status {
		color: var(--text-secondary);
		margin: 0.25rem 0 0 0;
		font-size: 0.875rem;
	}

	.discord-status .highlight {
		color: var(--color-primary-500);
		font-weight: 500;
	}

	.discord-action {
		display: flex;
		justify-content: flex-end;
		padding: 1.5rem;
	}

	.success-message {
		background: rgba(34, 197, 94, 0.05);
		border: 1px solid rgba(34, 197, 94, 0.2);
		border-radius: 8px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.success-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: rgb(22, 163, 74);
		font-weight: 600;
	}

	.success-message p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.9375rem;
		line-height: 1.5;
	}

	.success-message code {
		background: rgba(0, 0, 0, 0.1);
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: monospace;
		color: var(--text-primary);
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.2s ease-out;
	}

	.modal-content {
		background: var(--bg-base);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 2rem;
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	.modal-header h3 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.modal-close {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 1.5rem;
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s ease;
		font-weight: 300;
	}

	.modal-close:hover {
		color: var(--text-primary);
	}

	@media (max-width: 640px) {
		.settings-header {
			padding: 1.5rem 0;
		}

		.page-title {
			font-size: 1.5rem;
		}

		.settings-content {
			padding: 1.5rem 1rem;
		}

		.darkmode-toggle {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}

		.discord-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.discord-action {
			justify-content: stretch;
		}

		.discord-action .btn {
			width: 100%;
		}

		.connection-status {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}

		.input-group {
			flex-direction: column;
		}

		.input-group .btn {
			width: 100%;
		}
	}
</style>
