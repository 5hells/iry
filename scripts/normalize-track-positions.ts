import { db } from '../src/lib/server/db';
import { track } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

function normalizePosition(pos: unknown) {
    if (pos === null || pos === undefined) return { normalized: null, prefix: null, num: null, sub: null };
    let s = String(pos).trim();
    if (!s) return { normalized: null, prefix: null, num: null, sub: null };
    s = s.replace(/^(side|disc|track)\s*/i, '');
    s = s.replace(/[-—–]/g, '.');
    s = s.replace(/\s*[:\-]\s*/g, '.');
    s = s.replace(/\s+/g, '');
    s = s.toUpperCase();
    const m1 = s.match(/^([A-Z]+)(\d+)(?:\.(\d+))?$/);
    if (m1) {
        const prefix = m1[1];
        const num = parseInt(m1[2], 10);
        const sub = m1[3] ? parseInt(m1[3], 10) : null;
        const normalized = sub ? `${prefix}${num}.${sub}` : `${prefix}${num}`;
        return { normalized, prefix, num, sub };
    }
    const m2 = s.match(/^(\d+)(?:\.(\d+))?$/);
    if (m2) {
        const num = parseInt(m2[1], 10);
        const sub = m2[2] ? parseInt(m2[2], 10) : null;
        const normalized = sub ? `${num}.${sub}` : `${num}`;
        return { normalized, prefix: null, num, sub };
    }
    const letters = (s.match(/^[A-Z]+/) || [null])[0];
    const numMatch = s.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : null;
    const prefix = letters || null;
    const normalized = prefix && num ? `${prefix}${num}` : num ? `${num}` : s;
    return { normalized, prefix, num, sub: null };
}

async function main() {
    console.log('Loading tracks...');
    const tracks = await db.query.track.findMany();
    const updates: any[] = [];
    for (const t of tracks) {
        const raw = t.position;
        const norm = normalizePosition(raw);
        const newPos = norm.normalized;
        const newTrackNumber = norm.num ?? t.trackNumber;
        const needsUpdate = (newPos !== (raw || null)) || (newTrackNumber !== t.trackNumber);
        if (needsUpdate) {
            updates.push({ id: t.id, position: newPos, trackNumber: newTrackNumber });
        }
    }

    console.log(`Found ${updates.length} tracks needing normalization`);
    for (const u of updates) {
        try {
            await db.update(track).set({ position: u.position, trackNumber: u.trackNumber }).where(eq(track.id, u.id));
        } catch (e) {
            console.error('Failed to update track', u.id, e);
        }
    }

    console.log('Normalization complete');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
