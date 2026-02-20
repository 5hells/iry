import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { userPerk, perk } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

function getPayPalBase() {
	return env.PAYPAL_MODE === 'live'
		? 'https://api-m.paypal.com'
		: 'https://api-m.sandbox.paypal.com';
}

async function getAccessToken(): Promise<string> {
	const client = env.PAYPAL_CLIENT_ID;
	const secret = env.PAYPAL_SECRET;
	if (!client || !secret) throw new Error('PayPal credentials not configured');

	const tokenResp = await fetch(`${getPayPalBase()}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${client}:${secret}`).toString('base64')}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});

	if (!tokenResp.ok) {
		const txt = await tokenResp.text();
		throw new Error(`Failed to get PayPal token: ${tokenResp.status} ${txt}`);
	}

	const data = await tokenResp.json();
	return data.access_token;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || (locals.user as any).isGuest) return error(401, 'Authentication required');

	const body = await request.json();
	const orderId = body?.orderId;
	const requestedPerkId = body?.perkId;
	if (!orderId) return error(400, 'orderId required');

	try {
		const token = await getAccessToken();
		const resp = await fetch(`${getPayPalBase()}/v2/checkout/orders/${orderId}/capture`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		});

		if (!resp.ok) {
			const txt = await resp.text();
			throw new Error(`Capture failed: ${resp.status} ${txt}`);
		}

		const data = await resp.json();
		const status = data.status || data.purchase_units?.[0]?.payments?.captures?.[0]?.status;
		if (!status || status !== 'COMPLETED') {
			throw new Error('Payment not completed');
		}

		let selectedPerk = null;
		if (requestedPerkId) {
			selectedPerk = await db.query.perk.findFirst({ where: eq(perk.id, requestedPerkId) });
		}
		if (!selectedPerk) {
			selectedPerk = await db.query.perk.findFirst({ where: eq(perk.name, 'Pro Supporter') });
		}

		if (!selectedPerk) {
			throw new Error('Perk not found');
		}

		const existing = await db.query.userPerk.findFirst({
			where: and(eq(userPerk.userId, locals.user.id), eq(userPerk.perkId, selectedPerk.id))
		});
		if (!existing) {
			await db
				.insert(userPerk)
				.values({ userId: locals.user.id, perkId: selectedPerk.id, isActive: true });
		} else {
			await db.update(userPerk).set({ isActive: true }).where(eq(userPerk.id, existing.id));
		}

		return json({
			success: true,
			captured: true,
			perk: { id: selectedPerk.id, name: selectedPerk.name }
		});
	} catch (err: any) {
		console.error('PayPal capture error', err);
		return error(500, err.message || 'Failed to capture PayPal order');
	}
};
