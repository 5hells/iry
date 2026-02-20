export type NsfwClassification = {
	score: number;
};

export type NsfwClassificationResponse = {
	score: number;
	url: string;
	error_code?: number;
	error_reason?: string;
};

export type NsfwBatchRequest = {
	images: Array<{ url: string; [key: string]: unknown }>;
};

export type NsfwBatchResponse = {
	predictions: Array<{
		score?: number;
		url: string;
		error_code?: number;
		error_reason?: string;
		[key: string]: unknown;
	}>;
};

const DEFAULT_NSFW_API_URL = process.env.NSFW_API_URL || 'http://localhost:5000';
const DEFAULT_NSFW_SAMPLE_URL =
	'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';

let hasAttemptedAutoSetup = false;

async function sleep(ms: number) {
	return await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startNsfwApiDocker(apiUrl: string) {
	const { spawnSync } = await import('node:child_process');

	const parsed = new URL(apiUrl);
	if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
		return;
	}

	const requestedPort = parsed.port || '5000';
	spawnSync(
		'docker',
		[
			'run',
			'-d',
			'--rm',
			'--name',
			'iry-nsfw-api',
			'-p',
			`${requestedPort}:5000`,
			'-e',
			'PORT=5000',
			'eugencepoi/nsfw_api:latest'
		],
		{ stdio: 'ignore' }
	);
}

async function isNsfwApiReachable(apiUrl: string): Promise<boolean> {
	try {
		const probe = new URL(apiUrl);
		probe.searchParams.set('url', DEFAULT_NSFW_SAMPLE_URL);
		const response = await fetch(probe.toString(), {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		});
		return response.ok;
	} catch {
		return false;
	}
}

export class NsfwApiClient {
	private apiUrl: string;

	constructor(apiUrl: string = DEFAULT_NSFW_API_URL) {
		this.apiUrl = apiUrl;
	}

	private async ensureReady() {
		if (await isNsfwApiReachable(this.apiUrl)) {
			return;
		}

		if (hasAttemptedAutoSetup) {
			return;
		}

		hasAttemptedAutoSetup = true;
		const autoSetupEnabled = (process.env.NSFW_API_AUTO_SETUP || 'true').toLowerCase() !== 'false';
		if (!autoSetupEnabled) {
			return;
		}

		try {
			await startNsfwApiDocker(this.apiUrl);
		} catch {
			return;
		}

		for (let index = 0; index < 18; index++) {
			if (await isNsfwApiReachable(this.apiUrl)) {
				return;
			}
			await sleep(5000);
		}
	}

	/**
	 * Classify a single image by URL for NSFW content.
	 * Returns probability score between 0 and 1 (1 = NSFW, 0 = SFW).
	 */
	async classifyUrl(imageUrl: string): Promise<NsfwClassificationResponse> {
		await this.ensureReady();

		const url = new URL(this.apiUrl);
		url.searchParams.append('url', imageUrl);

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`NSFW API error: ${response.status} ${response.statusText}`);
		}

		return await response.json();
	}

	/**
	 * Batch classify multiple images by URL.
	 * Response is streamed and parsed as JSON.
	 */
	async classifyBatch(imageUrls: string[]): Promise<NsfwBatchResponse> {
		await this.ensureReady();

		const payload: NsfwBatchRequest = {
			images: imageUrls.map((url) => ({ url }))
		};

		const response = await fetch(`${this.apiUrl}/batch-classify`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			throw new Error(`NSFW API error: ${response.status} ${response.statusText}`);
		}

		return await response.json();
	}
}
