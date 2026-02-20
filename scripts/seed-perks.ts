import { drizzle } from 'drizzle-orm/pg-proxy';
import { createPgNativeClient } from '../src/lib/server/db/pg';
import * as schema from '../src/lib/server/db/schema';
import 'dotenv/config';

const { perk } = schema;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const nativeClient = createPgNativeClient(process.env.DATABASE_URL);
const db = drizzle(
	async (sql, params) => {
		const rows = await nativeClient.query(sql, params ?? []);
		return { rows };
	},
	{ schema }
);

async function seedPerks() {
	console.log('Seeding perks...');

	const perks = [
		
		{
			name: 'Custom Banner',
			description: 'Upload a custom banner for your profile',
			type: 'banner',
			pointsRequired: 450,
			config: JSON.stringify({ maxSizeKB: 5000, dimensions: '1200x300' })
		},

		
		{
			name: 'Gradient Names',
			description: 'Customize your name with beautiful gradients',
			type: 'gradient',
			pointsRequired: 600,
			config: JSON.stringify({
				presets: [
					{ name: 'Sunset', colors: ['#ff6b6b', '#feca57'] },
					{ name: 'Ocean', colors: ['#48dbfb', '#0abde3'] },
					{ name: 'Forest', colors: ['#00d2d3', '#1dd1a1'] },
					{ name: 'Purple Haze', colors: ['#a29bfe', '#6c5ce7'] },
					{ name: 'Fire', colors: ['#ff9ff3', '#feca57', '#ff6348'] }
				],
				customEnabled: true
			})
		},

		
		{
			name: 'Custom Fonts',
			description: 'Choose from hundreds of Google Fonts for your profile',
			type: 'font',
			pointsRequired: 700,
			config: JSON.stringify({
				fonts: [
					'Roboto',
					'Open Sans',
					'Lato',
					'Montserrat',
					'Oswald',
					'Raleway',
					'Poppins',
					'Merriweather',
					'Dancing Script',
					'Pacifico',
					'Permanent Marker',
					'Bebas Neue',
					'Indie Flower',
					'Righteous',
					'Satisfy'
				],
				searchEnabled: true
			})
		},

		
		{
			name: 'Matrix Effect',
			description: 'Add a Matrix-style digital rain effect to your profile',
			type: 'effect',
			pointsRequired: 800,
			config: JSON.stringify({ effect: 'matrix', customizable: false })
		},
		{
			name: 'Sparkles Effect',
			description: 'Add magical sparkles floating around your profile',
			type: 'effect',
			pointsRequired: 800,
			config: JSON.stringify({ effect: 'sparkles', customizable: true })
		},
		{
			name: 'Rain Effect',
			description: 'Add a peaceful rain effect to your profile background',
			type: 'effect',
			pointsRequired: 800,
			config: JSON.stringify({ effect: 'rain', customizable: true })
		},

		
		{
			name: 'Pro Supporter',
			description: 'Support the project and get a Pro tag + prioritized comments',
			type: 'support',
			pointsRequired: 0,
			config: JSON.stringify({ proTag: true, commentPriority: 10 })
		}
	];

	for (const perkData of perks) {
		try {
			await db.insert(perk).values(perkData);
			console.log(`Created perk: ${perkData.name}`);
		} catch {
			console.log(`Perk already exists: ${perkData.name}`);
		}
	}

	console.log('Perks seeded successfully!');
}

seedPerks()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('Error seeding perks:', error);
		process.exit(1);
	});
