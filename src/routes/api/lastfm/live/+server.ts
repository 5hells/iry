import type { RequestHandler } from './$types';
import { subscribe } from '$lib/server/music/lastfm-poller';

export const GET: RequestHandler = async () => {
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

			const unsubscribe = subscribe((data) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch (err) {
					console.error('Error sending SSE message:', err);
				}
			});

			const interval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					clearInterval(interval);
				}
			}, 30000);

			return () => {
				clearInterval(interval);
				unsubscribe();
			};
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
