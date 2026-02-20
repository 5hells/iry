import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

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
	const amount = Number(body?.amount || 0);
	if (!amount || amount <= 0) return error(400, 'Invalid amount');

	try {
		const token = await getAccessToken();
		const resp = await fetch(`${getPayPalBase()}/v2/checkout/orders`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				intent: 'CAPTURE',
				purchase_units: [{ amount: { currency_code: 'USD', value: amount.toFixed(2) } }],
				application_context: {
					user_action: 'PAY_NOW'
				}
			})
		});

		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`Create order failed: ${resp.status} ${text}`);
		}

		const data = await resp.json();
		const approve = (data.links || []).find((l: any) => l.rel === 'approve')?.href;

		return json({ id: data.id, approveUrl: approve });
	} catch (err: any) {
		console.error('PayPal create-order error', err);
		return error(500, err.message || 'Failed to create PayPal order');
	}
};
