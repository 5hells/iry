import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { perk } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

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

async function ensureProPlanId(token: string, price: number): Promise<string> {
	const proPerk = await db.query.perk.findFirst({ where: eq(perk.name, 'Pro Supporter') });
	if (!proPerk) {
		throw new Error('Pro Supporter perk not found. Seed perks first.');
	}

	let perkConfig: Record<string, any> = {};
	if (proPerk.config) {
		try {
			perkConfig = JSON.parse(proPerk.config);
		} catch {
			perkConfig = {};
		}
	}

	if (typeof perkConfig.paypalPlanId === 'string' && perkConfig.paypalPlanId.length > 0) {
		return perkConfig.paypalPlanId;
	}

	let productId = perkConfig.paypalProductId as string | undefined;

	if (!productId) {
		const prodResp = await fetch(`${getPayPalBase()}/v1/catalogs/products`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'Iry Pro Supporter',
				description: 'Recurring monthly Pro supporter subscription',
				type: 'SERVICE'
			})
		});
		if (!prodResp.ok) {
			const txt = await prodResp.text();
			throw new Error(`Failed to create PayPal product: ${txt}`);
		}
		const product = await prodResp.json();
		productId = product.id;
	}

	const planResp = await fetch(`${getPayPalBase()}/v1/billing/plans`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			product_id: productId,
			name: 'Iry Pro Monthly $5',
			billing_cycles: [
				{
					frequency: { interval_unit: 'MONTH', interval_count: 1 },
					tenure_type: 'REGULAR',
					sequence: 1,
					total_cycles: 0,
					pricing_scheme: { fixed_price: { value: price.toFixed(2), currency_code: 'USD' } }
				}
			],
			payment_preferences: {
				auto_bill_outstanding: true,
				setup_fee: { value: '0', currency_code: 'USD' },
				setup_fee_failure_action: 'CONTINUE',
				payment_failure_threshold: 3
			}
		})
	});
	if (!planResp.ok) {
		const txt = await planResp.text();
		throw new Error(`Failed to create plan: ${txt}`);
	}
	const plan = await planResp.json();

	perkConfig.paypalProductId = productId;
	perkConfig.paypalPlanId = plan.id;
	await db
		.update(perk)
		.set({ config: JSON.stringify(perkConfig) })
		.where(eq(perk.id, proPerk.id));

	return plan.id;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || (locals.user as any).isGuest) return error(401, 'Authentication required');

	const body = await request.json().catch(() => ({}));
	const price = Number(body?.price || 5);
	const returnUrl = body?.returnUrl;
	if (!returnUrl) return error(400, 'returnUrl required');

	try {
		const token = await getAccessToken();

		const planId = await ensureProPlanId(token, price);

		const subResp = await fetch(`${getPayPalBase()}/v1/billing/subscriptions`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				plan_id: planId,
				application_context: { brand_name: 'Iry', return_url: returnUrl, cancel_url: returnUrl }
			})
		});
		if (!subResp.ok) {
			const txt = await subResp.text();
			throw new Error(`Failed to create subscription: ${txt}`);
		}
		const subscription = await subResp.json();
		const approve = (subscription.links || []).find((l: any) => l.rel === 'approve')?.href;

		return json({ id: subscription.id, approveUrl: approve });
	} catch (err: any) {
		console.error('create-subscription error', err);
		return error(500, err.message || 'Failed to create subscription');
	}
};
