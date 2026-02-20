import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';

interface CropPosition {
	x: number;
	y: number;
	scale: number;
	widthFrac?: number;
	heightFrac?: number;

	leftPx?: number;
	topPx?: number;
	widthPx?: number;
	heightPx?: number;
}

interface ExtractArea {
	left: number;
	top: number;
	width: number;
	height: number;
}

async function normalizeImage(
	buffer: Buffer
): Promise<{ image: sharp.Sharp; width: number; height: number }> {
	const { data, info } = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });

	return {
		image: sharp(data),
		width: info.width,
		height: info.height
	};
}

function getSafeExtractArea(
	imageWidth: number,
	imageHeight: number,
	targetWidth: number,
	targetHeight: number,
	position: CropPosition
): ExtractArea | null {
	const posXFrac = Number.isFinite(position.x) ? Math.max(0, Math.min(1, position.x)) : 0;
	const posYFrac = Number.isFinite(position.y) ? Math.max(0, Math.min(1, position.y)) : 0;

	if (
		Number.isFinite(position.leftPx) &&
		Number.isFinite(position.topPx) &&
		Number.isFinite(position.widthPx) &&
		Number.isFinite(position.heightPx)
	) {
		const leftRaw = Math.max(0, Math.floor(position.leftPx!));
		const topRaw = Math.max(0, Math.floor(position.topPx!));
		const widthRaw = Math.max(1, Math.floor(position.widthPx!));
		const heightRaw = Math.max(1, Math.floor(position.heightPx!));

		const left = Math.max(0, Math.min(leftRaw, Math.max(0, imageWidth - widthRaw)));
		const top = Math.max(0, Math.min(topRaw, Math.max(0, imageHeight - heightRaw)));

		const width = Math.max(1, Math.min(widthRaw, imageWidth - left));
		const height = Math.max(1, Math.min(heightRaw, imageHeight - top));

		console.log('[extract-debug-px]', {
			imageWidth,
			imageHeight,
			leftRaw,
			topRaw,
			widthRaw,
			heightRaw,
			left,
			top,
			width,
			height
		});

		if (left + width > imageWidth || top + height > imageHeight) {
			console.warn('[extract-invalid-px]', { left, top, width, height, imageWidth, imageHeight });
			return null;
		}

		return { left, top, width, height };
	}

	const desiredWidth = Number.isFinite(position.widthFrac)
		? Math.max(1, Math.round(position.widthFrac! * imageWidth))
		: Math.max(1, Math.min(targetWidth, imageWidth));

	const desiredHeight = Number.isFinite(position.heightFrac)
		? Math.max(1, Math.round(position.heightFrac! * imageHeight))
		: Math.max(1, Math.min(targetHeight, imageHeight));

	const leftUnclamped = Math.floor(posXFrac * imageWidth);
	const topUnclamped = Math.floor(posYFrac * imageHeight);

	const left = Math.max(0, Math.min(leftUnclamped, Math.max(0, imageWidth - desiredWidth)));
	const top = Math.max(0, Math.min(topUnclamped, Math.max(0, imageHeight - desiredHeight)));

	const width = Math.max(1, Math.min(desiredWidth, imageWidth - left));
	const height = Math.max(1, Math.min(desiredHeight, imageHeight - top));

	console.log('[extract-debug]', {
		imageWidth,
		imageHeight,
		targetWidth,
		targetHeight,
		posXFrac,
		posYFrac,
		desiredWidth,
		desiredHeight,
		leftUnclamped,
		topUnclamped,
		left,
		top,
		width,
		height,
		leftPlusWidth: left + width,
		topPlusHeight: top + height,
		valid: left + width <= imageWidth && top + height <= imageHeight
	});

	if (left + width > imageWidth || top + height > imageHeight) {
		console.warn('[extract-invalid]', { left, top, width, height, imageWidth, imageHeight });
		return null;
	}

	return { left, top, width, height };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const contentType = request.headers.get('content-type') || '';

		if (contentType.includes('application/json')) {
			const body = await request.json();
			const position = body;

			const type = (body.type as string) || 'picture';

			if (type !== 'picture' && type !== 'banner') {
				return json({ error: 'type must be "picture" or "banner"' }, { status: 400 });
			}

			const existing = await db.select().from(user).where(eq(user.id, locals.user.id)).limit(1);
			const row = existing[0];
			if (!row) return json({ error: 'user not found' }, { status: 404 });

			const dataUri = type === 'picture' ? row.image : row.bannerUrl;
			if (!dataUri || !dataUri.startsWith('data:')) {
				return json({ error: 'No existing image to re-crop' }, { status: 400 });
			}

			const comma = dataUri.indexOf(',');
			if (comma === -1) return json({ error: 'Invalid data uri' }, { status: 400 });
			const b64 = dataUri.slice(comma + 1);
			const imageBuffer = Buffer.from(b64, 'base64');

			let processedBuffer: Buffer;
			if (type === 'picture') {
				processedBuffer = await processProfilePicture(imageBuffer, 400, position);
			} else {
				processedBuffer = await processBanner(imageBuffer, 1200, 400, position);
			}

			const base64 = processedBuffer.toString('base64');
			const newDataUri = `data:image/webp;base64,${base64}`;

			const updates: Record<string, any> = {};
			if (type === 'picture') updates.image = newDataUri;
			else updates.bannerUrl = newDataUri;

			const updated = await db
				.update(user)
				.set(updates)
				.where(eq(user.id, locals.user.id))
				.returning({
					id: user.id,
					name: user.name,
					image: user.image,
					bannerUrl: user.bannerUrl
				});

			return json({ success: true, user: updated[0], message: 'Image updated' });
		}

		const formData = await request.formData();
		const type = formData.get('type');
		const file = formData.get('file') as File | null;
		const positionStr = formData.get('position') as string | null;

		if (!type || !file || file.size === 0) {
			return json({ error: 'type and file are required' }, { status: 400 });
		}

		if (type !== 'picture' && type !== 'banner') {
			return json({ error: 'type must be "picture" or "banner"' }, { status: 400 });
		}

		if (!file.type.startsWith('image/')) {
			return json({ error: 'File must be an image' }, { status: 400 });
		}

		const maxSize = type === 'picture' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
		if (file.size > maxSize) {
			const maxMB = maxSize / (1024 * 1024);
			return json({ error: `File too large (max ${maxMB}MB)` }, { status: 400 });
		}

		const buffer = await file.arrayBuffer();
		const imageBuffer = Buffer.from(buffer);

		let cropPosition: CropPosition | null = null;
		if (positionStr) {
			try {
				cropPosition = JSON.parse(positionStr);
			} catch {
				console.warn('Failed to parse crop position');
			}
		}

		let processedBuffer: Buffer;

		if (type === 'picture') {
			const FINAL_SIZE = 400;
			processedBuffer = await processProfilePicture(imageBuffer, FINAL_SIZE, cropPosition);
		} else {
			const FINAL_WIDTH = 1200;
			const FINAL_HEIGHT = 400;
			processedBuffer = await processBanner(imageBuffer, FINAL_WIDTH, FINAL_HEIGHT, cropPosition);
		}

		const base64 = processedBuffer.toString('base64');
		const dataUri = `data:image/webp;base64,${base64}`;

		const updates: Record<string, any> = {};
		if (type === 'picture') {
			updates.image = dataUri;
		} else if (type === 'banner') {
			updates.bannerUrl = dataUri;
		}

		const updated = await db
			.update(user)
			.set(updates)
			.where(eq(user.id, locals.user.id))
			.returning({
				id: user.id,
				name: user.name,
				image: user.image,
				bannerUrl: user.bannerUrl
			});

		return json({
			success: true,
			user: updated[0],
			message: `${type === 'picture' ? 'Profile picture' : 'Banner'} updated!`
		});
	} catch (err) {
		console.error('Failed to upload:', err);
		return json({ error: 'Failed to upload file' }, { status: 500 });
	}
};

async function processProfilePicture(
	buffer: Buffer,
	finalSize: number,
	position: CropPosition | null
): Promise<Buffer> {
	const normalized = await normalizeImage(buffer);
	let image = normalized.image;
	const origWidth = normalized.width;
	const origHeight = normalized.height;

	console.log('[profile-pic]', { origWidth, origHeight, finalSize, position });

	if (position) {
		const extractArea = getSafeExtractArea(origWidth, origHeight, finalSize, finalSize, position);

		if (extractArea) {
			console.log('[profile-crop-original]', extractArea);
			image = image.extract(extractArea);
		}
	}

	return image
		.resize(finalSize, finalSize, {
			fit: 'cover'
		})
		.webp({ quality: 80 })
		.toBuffer();
}

async function processBanner(
	buffer: Buffer,
	finalWidth: number,
	finalHeight: number,
	position: CropPosition | null
): Promise<Buffer> {
	const normalized = await normalizeImage(buffer);
	let image = normalized.image;
	const origWidth = normalized.width;
	const origHeight = normalized.height;

	console.log('[banner]', { origWidth, origHeight, finalWidth, finalHeight, position });

	if (position) {
		const extractArea = getSafeExtractArea(
			origWidth,
			origHeight,
			finalWidth,
			finalHeight,
			position
		);

		if (extractArea) {
			console.log('[banner-crop-original]', extractArea);
			image = image.extract(extractArea);
		}
	}

	return image
		.resize(finalWidth, finalHeight, {
			fit: 'cover'
		})
		.webp({ quality: 80 })
		.toBuffer();
}
