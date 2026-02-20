import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { collection } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import https from 'https';

async function fetchImage(url: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		https
			.get(url, (response) => {
				const chunks: Buffer[] = [];
				response.on('data', (chunk) => chunks.push(chunk));
				response.on('end', () => resolve(Buffer.concat(chunks)));
				response.on('error', reject);
			})
			.on('error', reject);
	});
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const coll = await db.query.collection.findFirst({
			where: eq(collection.id, id),
			with: {
				tracks: {
					with: {
						track: {
							with: {
								album: {
									columns: { coverArtUrl: true }
								}
							}
						}
					}
				}
			}
		});

		if (!coll) {
			return json({ error: 'collection not found' }, { status: 404 });
		}

		if (coll.userId !== locals.user.id) {
			return json({ error: 'forbidden' }, { status: 403 });
		}

		const albumCovers: string[] = [];
		for (const ct of coll.tracks) {
			if (ct.track.album?.coverArtUrl) {
				albumCovers.push(ct.track.album.coverArtUrl);
			}
		}

		if (albumCovers.length === 0) {
			return json({ error: 'no album covers available in collection' }, { status: 400 });
		}

		const imagesToUse = albumCovers.slice(0, 4);
		const imageBuffers: Buffer[] = [];

		for (const url of imagesToUse) {
			try {
				const buffer = await fetchImage(url);
				imageBuffers.push(buffer);
			} catch (error) {
				console.error('Failed to fetch image:', url, error);
			}
		}

		if (imageBuffers.length === 0) {
			return json({ error: 'failed to fetch album covers' }, { status: 400 });
		}

		const coverSize = 180;
		const stackOffset = 15;
		const numCovers = Math.min(imageBuffers.length, 4);

		const canvasWidth = coverSize + (numCovers - 1) * stackOffset + 20;
		const canvasHeight = coverSize + (numCovers - 1) * stackOffset + 20;

		let compositeInput = sharp({
			create: {
				width: canvasWidth,
				height: canvasHeight,
				channels: 3,
				background: { r: 240, g: 240, b: 240 }
			}
		});

		const compositeOps: Array<{ input: Buffer; left: number; top: number }> = [];

		for (let i = 0; i < numCovers; i++) {
			const resized = await sharp(imageBuffers[i])
				.resize(coverSize, coverSize, {
					fit: 'cover',
					position: 'center'
				})
				.toBuffer();

			const topOffset = 10 + i * stackOffset;
			const leftOffset = 10 + i * stackOffset;

			compositeOps.push({
				input: resized,
				left: leftOffset,
				top: topOffset
			});
		}

		compositeInput = compositeInput.composite(compositeOps);

		const finalImage = await compositeInput.toBuffer();

		const uploadsDir = join(process.cwd(), 'static', 'uploads', 'images');
		if (!existsSync(uploadsDir)) {
			await mkdir(uploadsDir, { recursive: true });
		}

		const filename = `${locals.user.id}_collection_${id}_${Date.now()}.png`;
		const filepath = join(uploadsDir, filename);
		await writeFile(filepath, finalImage);

		const coverImageUrl = `/uploads/images/${filename}`;

		await db
			.update(collection)
			.set({
				coverImageUrl,
				coverImageType: 'auto',
				updatedAt: new Date()
			})
			.where(eq(collection.id, id));

		return json({ coverImageUrl, coverImageType: 'auto' });
	} catch (error) {
		console.error('Failed to generate cover:', error);
		return json({ error: 'failed to generate cover' }, { status: 500 });
	}
};
