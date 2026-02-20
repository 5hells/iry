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

	const body = await request.json().catch(() => ({}));
	const subscriptionId = body?.subscriptionId;
	if (!subscriptionId) return error(400, 'subscriptionId required');

	try {
		const token = await getAccessToken();
		const resp = await fetch(`${getPayPalBase()}/v1/billing/subscriptions/${subscriptionId}`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!resp.ok) {
			const txt = await resp.text();
			throw new Error(`Failed to lookup subscription: ${txt}`);
		}
		const data = await resp.json();
		if (!data.status || !['ACTIVE', 'APPROVAL_PENDING', 'APPROVED'].includes(data.status)) {
			throw new Error('Subscription not active');
		}

		const selectedPerk = await db.query.perk.findFirst({ where: eq(perk.name, 'Pro Supporter') });
		if (!selectedPerk) throw new Error('Perk not found');

		const existing = await db.query.userPerk.findFirst({
			where: and(eq(userPerk.userId, locals.user.id), eq(userPerk.perkId, selectedPerk.id))
		});
		const cfg =
			existing && existing.customConfig
				? (() => {
						try {
							return JSON.parse(existing.customConfig as string);
						} catch {
							return {};
						}
					})()
				: {};
		cfg.subscriptionId = subscriptionId;

		if (!existing) {
			await db.insert(userPerk).values({
				userId: locals.user.id,
				perkId: selectedPerk.id,
				isActive: true,
				customConfig: JSON.stringify(cfg)
			});
		} else {
			await db
				.update(userPerk)
				.set({ isActive: true, customConfig: JSON.stringify(cfg) })
				.where(eq(userPerk.id, existing.id));
		}

		return json({ success: true, subscriptionId });
	} catch (err: any) {
		console.error('activate-subscription error', err);
		return error(500, err.message || 'Failed to activate subscription');
	}
};
