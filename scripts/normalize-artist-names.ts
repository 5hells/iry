import { db } from '../src/lib/server/db';
import { artist, album } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import * as discogs from '../src/lib/server/music/discogs';

async function main() {
    console.log('loading artists...');
    const artists = await db.query.artist.findMany();
    const updates: Array<{id: string; oldName: string; newName: string}> = [];

    for (const a of artists) {
        const oldName = a.name || '';
        const cleaned = discogs.cleanDiscogsArtistName(oldName);
        if (cleaned && cleaned !== oldName) {
            updates.push({ id: a.id, oldName, newName: cleaned });
        }
    }

    console.log(`found ${updates.length} artists to normalize`);
    for (const u of updates) {
        try {
            await db.update(artist).set({ name: u.newName }).where(eq(artist.id, u.id));
            await db.update(album).set({ artist: u.newName }).where(eq(album.artist, u.oldName));
        } catch (err) {
            console.error('failed to update artist', u.id, err);
        }
    }

    console.log('artist name normalization complete');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
