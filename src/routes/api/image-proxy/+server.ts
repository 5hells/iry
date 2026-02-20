import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_HOSTS = [
	'i.discogs.com',
	'coverartarchive.org',
	'images.unsplash.com',
	'upload.wikimedia.org',
	'commons.wikimedia.org',
	'i.scdn.co',
	'images-na.ssl-images-amazon.com',
	'www.gravatar.com',
	'avatars.githubusercontent.com'
];
const CACHE_DIR = path.join(process.cwd(), 'static', 'external-cache');

function extFromContentType(ct: string | null) {
	if (!ct) return '';
	if (ct.includes('jpeg')) return '.jpg';
	if (ct.includes('png')) return '.png';
	if (ct.includes('gif')) return '.gif';
	if (ct.includes('webp')) return '.webp';
	if (ct.includes('svg')) return '.svg';
	return '';
}

async function ensureCacheDir() {
	try {
		await fs.mkdir(CACHE_DIR, { recursive: true });
	} catch {
	}
}

function normalizeProxySourceUrl(parsed: URL): URL {
	if (parsed.hostname === 'commons.wikimedia.org') {
		const wikiFilePrefix = '/wiki/File:';
		if (parsed.pathname.startsWith(wikiFilePrefix)) {
			const fileName = decodeURIComponent(parsed.pathname.slice(wikiFilePrefix.length));
			return new URL(
				`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`
			);
		}
	}

	return parsed;
}

export const GET: RequestHandler = async ({ url }) => {
	const u = url.searchParams.get('u');
	if (!u) return json({ error: 'missing url' }, { status: 400 });

	let parsed: URL;
	try {
		parsed = new URL(u);
	} catch (e) {
		return json({ error: 'invalid url' }, { status: 400 });
	}

	if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
		return json({ error: 'host not allowed' }, { status: 403 });
	}

	parsed = normalizeProxySourceUrl(parsed);

	await ensureCacheDir();

	const hash = crypto.createHash('sha256').update(parsed.toString()).digest('hex');
	
	const pathExt = path.extname(parsed.pathname || '').split('?')[0] || '';
	let filename = hash + (pathExt || '');
	let filepath = path.join(CACHE_DIR, filename);

	try {
		const stat = await fs.stat(filepath).catch(() => null);
		if (stat && stat.isFile()) {
			const data = await fs.readFile(filepath);
			const ext = path.extname(filepath).toLowerCase();
			const ct = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
			return new Response(data, { status: 200, headers: { 'content-type': ct, 'cache-control': 'public, max-age=86400' } });
		}
	} catch (err) {
		console.error('cache read error', err);
	}

	
	try {
		const resp = await fetch(parsed.toString());
		if (!resp.ok) return json({ error: 'failed to fetch' }, { status: 502 });

		const arrayBuffer = await resp.arrayBuffer();
		const buf = Buffer.from(arrayBuffer);
		const contentType = resp.headers.get('content-type');

		
		if (!pathExt) {
			const ext = extFromContentType(contentType);
			if (ext) {
				filename = hash + ext;
				filepath = path.join(CACHE_DIR, filename);
			}
		}

		
		await fs.writeFile(filepath, buf).catch(async (err) => {
			console.error('failed to write cache file', err);
		});

		const headers: Record<string, string> = {};
		if (contentType) headers['content-type'] = contentType;
		headers['cache-control'] = resp.headers.get('cache-control') || 'public, max-age=86400';

		return new Response(buf, { status: 200, headers });
	} catch (err) {
		console.error('image-proxy error', err);
		return json({ error: 'proxy error' }, { status: 500 });
	}
};
