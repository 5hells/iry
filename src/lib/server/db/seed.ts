import { db } from '$lib/server/db';
import { perk } from '$lib/server/db/schema';

const defaultPerks = [
	{
		name: 'Bronze Badge',
		description: 'Unlock the Bronze Badge for your profile',
		type: 'badge',
		pointsRequired: 0,
		imageUrl: '/badges/bronze.png'
	},
	{
		name: 'Silver Badge',
		description: 'Unlock the Silver Badge for your profile',
		type: 'badge',
		pointsRequired: 100,
		imageUrl: '/badges/silver.png'
	},
	{
		name: 'Gold Badge',
		description: 'Unlock the Gold Badge for your profile',
		type: 'badge',
		pointsRequired: 300,
		imageUrl: '/badges/gold.png'
	},
	{
		name: 'Platinum Badge',
		description: 'Unlock the Platinum Badge for your profile',
		type: 'badge',
		pointsRequired: 1000,
		imageUrl: '/badges/platinum.png'
	},
	{
		name: 'Diamond Badge',
		description: 'Unlock the Diamond Badge for your profile',
		type: 'badge',
		pointsRequired: 3000,
		imageUrl: '/badges/diamond.png'
	},
	{
		name: 'Vinyl Banner',
		description: 'Classic vinyl record banner',
		type: 'banner',
		pointsRequired: 50,
		imageUrl: '/banners/vinyl.jpg'
	},
	{
		name: 'Neon Banner',
		description: 'Vibrant neon lights banner',
		type: 'banner',
		pointsRequired: 150,
		imageUrl: '/banners/neon.jpg'
	},
	{
		name: 'Concert Banner',
		description: 'Epic concert crowd banner',
		type: 'banner',
		pointsRequired: 250,
		imageUrl: '/banners/concert.jpg'
	},
	{
		name: 'Studio Banner',
		description: 'Professional recording studio banner',
		type: 'banner',
		pointsRequired: 500,
		imageUrl: '/banners/studio.jpg'
	},
	{
		name: 'Music Enthusiast',
		description: 'Special title for active reviewers',
		type: 'title',
		pointsRequired: 200,
		imageUrl: null
	},
	{
		name: 'Music Critic',
		description: 'Professional critic title',
		type: 'title',
		pointsRequired: 600,
		imageUrl: null
	},
	{
		name: 'Music Legend',
		description: 'Legendary reviewer title',
		type: 'title',
		pointsRequired: 2000,
		imageUrl: null
	}
];

export async function seedPerks() {
	console.log('Seeding perks...');

	const existingPerks = await db.query.perk.findMany();

	if (existingPerks.length > 0) {
		console.log('Perks already exist, skipping seed');
		return;
	}

	await db.insert(perk).values(defaultPerks);
	console.log(`Seeded ${defaultPerks.length} perks`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	seedPerks()
		.then(() => {
			console.log('Seed completed');
			process.exit(0);
		})
		.catch((error) => {
			console.error('Seed failed:', error);
			process.exit(1);
		});
}
