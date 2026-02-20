import {
	Client,
	GatewayIntentBits,
	REST,
	Routes,
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	EmbedBuilder,
	type APIApplicationCommand
} from 'discord.js';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { createPgNativeClient } from '$lib/server/db/pg';
import * as schema from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserNowPlaying, updateNowPlaying } from '$lib/server/music/lastfm';
import { calculateReviewPoints, updateUserPoints } from '$lib/server/points';
import 'dotenv/config';

const { user, album, albumReview, userPoints } = schema;

const env = process.env as Record<string, string | undefined>;
if (!env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set');
}

const nativeClient = createPgNativeClient(env.DATABASE_URL);
export const db = drizzle(
	async (sql, params) => {
		const rows = await nativeClient.query(sql, params ?? []);
		return { rows };
	},
	{ schema }
);

type DiscordEnv = {
	token?: string;
	clientId?: string;
	publicBaseUrl?: string;
};

async function getDiscordEnv(): Promise<DiscordEnv> {
	const env = process.env as Record<string, string | undefined>;

	return {
		token: env.DISCORD_BOT_TOKEN,
		clientId: env.DISCORD_BOT_CLIENT_ID,
		publicBaseUrl: env.PUBLIC_BASE_URL
	};
}

const commands = [
	new SlashCommandBuilder()
		.setName('review')
		.setDescription('Review your currently playing track (via LastFM)')
		.addNumberOption((option) =>
			option
				.setName('rating')
				.setDescription('Rating from 0-10')
				.setRequired(true)
				.setMinValue(0)
				.setMaxValue(10)
		)
		.addStringOption((option) =>
			option.setName('text').setDescription('Review text').setRequired(false)
		),
	new SlashCommandBuilder().setName('profile').setDescription('Show your profile stats')
].map((command) => command.toJSON());

export async function registerCommands() {
	const { token, clientId } = await getDiscordEnv();
	if (!token || !clientId) {
		throw new Error(
			'Discord credentials not configured. Please set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID in .env'
		);
	}

	const rest = new REST({ version: '10' }).setToken(token);

	try {
		console.log(`📝 Registering ${commands.length} Discord slash commands...`);
		const result: APIApplicationCommand[] = (await rest.put(Routes.applicationCommands(clientId), {
			body: commands
		})) as APIApplicationCommand[];
		console.log(`✅ Successfully registered ${result.length} slash commands:`);
		result.forEach((cmd) => console.log(`   - /${cmd.name}`));
	} catch (error) {
		console.error('❌ Error registering Discord commands:', error);
		throw error;
	}
}

async function findOrCreateUser(discordId: string, discordUsername: string) {
	let dbUser = await db.query.user.findFirst({
		where: eq(user.discordId, discordId)
	});

	if (!dbUser) {
		const [newUser] = await db
			.insert(user)
			.values({
				id: crypto.randomUUID(),
				discordId,
				name: discordUsername,
				email: `${discordId}@discord.temp`, 
				emailVerified: false
			})
			.returning();
		dbUser = newUser;
	}

	return dbUser;
}

async function handleReview(interaction: ChatInputCommandInteraction) {
	const rating = interaction.options.getNumber('rating', true);
	const reviewText = interaction.options.getString('text');
	const discordId = interaction.user.id;

	const dbUser = await findOrCreateUser(discordId, interaction.user.username);

	if (!dbUser.lastfmUsername) {
		await interaction.reply({
			content: '❌ Please set your LastFM username in your profile first',
			ephemeral: true
		});
		return;
	}

	await updateNowPlaying(dbUser.id, dbUser.lastfmUsername);
	const nowPlaying = await getUserNowPlaying(dbUser.id);

	if (!nowPlaying) {
		await interaction.reply({
			content: '❌ No track currently playing. Please start playing something on LastFM first!',
			ephemeral: true
		});
		return;
	}

	let dbAlbum = await db.query.album.findFirst({
		where: and(
			eq(album.title, nowPlaying.album || nowPlaying.track),
			eq(album.artist, nowPlaying.artist)
		)
	});

	if (!dbAlbum) {
		const [newAlbum] = await db
			.insert(album)
			.values({
				title: nowPlaying.album || nowPlaying.track,
				artist: nowPlaying.artist,
				coverArtUrl: nowPlaying.albumArtUrl
			})
			.returning();
		dbAlbum = newAlbum;
	}

	const points = await calculateReviewPoints(reviewText, 0, 0);

	const [newReview] = await db
		.insert(albumReview)
		.values({
			userId: dbUser.id,
			albumId: dbAlbum!.id,
			rating,
			reviewText,
			pointsAwarded: points
		})
		.returning();

	await updateUserPoints(dbUser.id);

	const { publicBaseUrl } = await getDiscordEnv();
	const reviewUrl = publicBaseUrl
		? `${publicBaseUrl}/review/${newReview.id}`
		: `https://iry.hellings.cc/review/${newReview.id}`;

	const embed = new EmbedBuilder()
		.setTitle('✅ Review Submitted!')
		.setDescription(`**${nowPlaying.track}** by ${nowPlaying.artist}`)
		.addFields(
			{ name: 'Rating', value: `${rating}/10`, inline: true },
			{ name: 'Points Earned', value: `+${points}`, inline: true }
		)
		.setURL(reviewUrl)
		.setColor(0x00ff00);

	if (nowPlaying.albumArtUrl) {
		embed.setThumbnail(nowPlaying.albumArtUrl);
	}

	await interaction.reply({
		embeds: [embed],
		content: `View your review: ${reviewUrl}`
	});
}

async function handleProfile(interaction: ChatInputCommandInteraction) {
	const discordId = interaction.user.id;
	const dbUser = await findOrCreateUser(discordId, interaction.user.username);

	const userPointsData = await db.query.userPoints.findFirst({
		where: eq(userPoints.userId, dbUser.id)
	});

	const embed = new EmbedBuilder().setTitle(`👤 ${dbUser.name}'s Profile`).setColor(0x0099ff);

	if (dbUser.lastfmUsername) {
		embed.addFields({ name: 'LastFM', value: dbUser.lastfmUsername, inline: true });
	}

	if (userPointsData) {
		embed.addFields(
			{ name: 'Level', value: `${userPointsData.level}`, inline: true },
			{ name: 'Total Points', value: `${userPointsData.totalPoints}`, inline: true },
			{ name: 'Reviews', value: `${userPointsData.reviewCount}`, inline: true }
		);
	}

	await interaction.reply({ embeds: [embed] });
}

export function startBot() {
	const client = new Client({
		intents: [GatewayIntentBits.Guilds]
	});

	client.on('ready', () => {
		console.log(`✅ Discord bot logged in as ${client.user?.tag}`);
		console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
	});

	client.on('error', (error) => {
		console.error('❌ Discord client error:', error);
	});

	client.on('interactionCreate', async (interaction) => {
		if (!interaction.isChatInputCommand()) return;

		try {
			switch (interaction.commandName) {
				case 'review':
					await handleReview(interaction);
					break;
				case 'profile':
					await handleProfile(interaction);
					break;
			}
		} catch (error) {
			console.error('Command error:', error);
			const reply = {
				content: '❌ An error occurred processing your command.',
				ephemeral: true
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(reply);
			} else {
				await interaction.reply(reply);
			}
		}
	});

	(async () => {
		const { token } = await getDiscordEnv();
		if (!token) {
			console.error('Discord bot token not configured');
			return;
		}
		client.login(token);
	})();

	return client;
}
