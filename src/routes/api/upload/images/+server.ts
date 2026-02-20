import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { NsfwApiClient } from '$lib/server/nsfw/client';

const nsfwClient = new NsfwApiClient();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const formData = await request.formData();
		const files = formData.getAll('images') as File[];

		if (!files || files.length === 0) {
			return json({ error: 'no images provided' }, { status: 400 });
		}

		if (files.length > 4) {
			return json({ error: 'maximum 4 images allowed' }, { status: 400 });
		}

		const uploadedUrls: string[] = [];
		const uploadsDir = join(process.cwd(), 'static', 'uploads', 'images');

		if (!existsSync(uploadsDir)) {
			await mkdir(uploadsDir, { recursive: true });
		}

		for (const file of files) {
			if (!file.type.startsWith('image/')) {
				return json({ error: 'only image files are allowed' }, { status: 400 });
			}

			if (file.size > 5 * 1024 * 1024) {
				return json({ error: 'image too large (max 5MB)' }, { status: 400 });
			}

			const buffer = Buffer.from(await file.arrayBuffer());
			const ext = file.name.split('.').pop();
			const filename = `${locals.user.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
			const filepath = join(uploadsDir, filename);

			try {
				const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
				const tempUrl = `${baseUrl}/uploads/images/${filename}`;

				await writeFile(filepath, buffer);

				try {
					const result = await nsfwClient.classifyUrl(tempUrl);

					if (result.score && result.score > 0.4) {
						await unlink(filepath).catch(() => undefined);
						return json(
							{
								error: 'image contains inappropriate content and cannot be uploaded',
								blocked: true
							},
							{ status: 400 }
						);
					}
				} catch (nsfwError) {
					console.warn('NSFW classification skipped (API unavailable):', nsfwError);
				}

				uploadedUrls.push(`/uploads/images/${filename}`);
			} catch (error) {
				console.error('Image upload processing error:', error);
				return json({ error: 'failed to process image' }, { status: 500 });
			}
		}

		return json({ urls: uploadedUrls });
	} catch (error) {
		console.error('Image upload error:', error);
		return json({ error: 'failed to upload images' }, { status: 500 });
	}
};
