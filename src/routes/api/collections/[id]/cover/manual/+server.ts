import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { collection } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const coll = await db.query.collection.findFirst({
			where: eq(collection.id, id)
		});

		if (!coll) {
			return json({ error: 'collection not found' }, { status: 404 });
		}

		if (coll.userId !== locals.user.id) {
			return json({ error: 'forbidden' }, { status: 403 });
		}

		const formData = await request.formData();
		const file = formData.get('image') as File;

		if (!file) {
			return json({ error: 'no image provided' }, { status: 400 });
		}

		if (!file.type.startsWith('image/')) {
			return json({ error: 'only image files are allowed' }, { status: 400 });
		}

		if (file.size > 5 * 1024 * 1024) {
			return json({ error: 'image too large (max 5MB)' }, { status: 400 });
		}

		const buffer = Buffer.from(await file.arrayBuffer());

		const optimized = await sharp(buffer)
			.resize(300, 300, {
				fit: 'cover',
				position: 'center'
			})
			.png({ quality: 80 })
			.toBuffer();

		const uploadsDir = join(process.cwd(), 'static', 'uploads', 'images');
		if (!existsSync(uploadsDir)) {
			await mkdir(uploadsDir, { recursive: true });
		}

		const ext = file.name.split('.').pop() || 'png';
		const filename = `${locals.user.id}_collection_${id}_${Date.now()}.${ext}`;
		const filepath = join(uploadsDir, filename);
		await writeFile(filepath, optimized);

		const coverImageUrl = `/uploads/images/${filename}`;

		await db
			.update(collection)
			.set({
				coverImageUrl,
				coverImageType: 'manual',
				updatedAt: new Date()
			})
			.where(eq(collection.id, id));

		return json({ coverImageUrl, coverImageType: 'manual' });
	} catch (error) {
		console.error('Failed to upload collection cover:', error);
		return json({ error: 'failed to upload cover' }, { status: 500 });
	}
};
