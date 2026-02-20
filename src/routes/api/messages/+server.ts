import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { directMessage, directMessageLike, notification, blockedUser } from '$lib/server/db/schema';
import { desc, eq, or, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot access messages' }, { status: 403 });
	}

	try {
		const otherUserId = url.searchParams.get('userId');

		if (otherUserId) {
			const blockCheck = await db.query.blockedUser.findFirst({
				where: or(
					and(eq(blockedUser.userId, locals.user.id), eq(blockedUser.blockedUserId, otherUserId)),
					and(eq(blockedUser.userId, otherUserId), eq(blockedUser.blockedUserId, locals.user.id))
				)
			});

			if (blockCheck) {
				return json({ error: 'cannot message blocked user' }, { status: 403 });
			}

			const messages = await db.query.directMessage.findMany({
				where: or(
					and(
						eq(directMessage.senderId, locals.user.id),
						eq(directMessage.recipientId, otherUserId)
					),
					and(
						eq(directMessage.senderId, otherUserId),
						eq(directMessage.recipientId, locals.user.id)
					)
				),
				orderBy: [desc(directMessage.createdAt)],
				limit: 50,
				with: {
					sender: {
						columns: {
							id: true,
							name: true,
							image: true
						}
					},
					likes:
						locals.user && !(locals.user as any).isGuest
							? {
									where: eq(directMessageLike.userId, locals.user.id)
								}
							: undefined
				}
			});

			await db
				.update(directMessage)
				.set({ isRead: true })
				.where(
					and(
						eq(directMessage.recipientId, locals.user.id),
						eq(directMessage.senderId, otherUserId),
						eq(directMessage.isRead, false)
					)
				);

			return json({
				messages: messages
					.map((msg) => ({
						...msg,
						createdAt:
							typeof msg.createdAt === 'number' ? msg.createdAt : (msg.createdAt as any).getTime(),
						imageUrls: msg.imageUrls ? JSON.parse(msg.imageUrls) : [],
						isLiked: msg.likes && msg.likes.length > 0
					}))
					.reverse()
			});
		} else {
			const sent = await db.query.directMessage.findMany({
				where: eq(directMessage.senderId, locals.user.id),
				orderBy: [desc(directMessage.createdAt)],
				with: {
					recipient: {
						columns: {
							id: true,
							name: true,
							image: true
						}
					}
				}
			});

			const received = await db.query.directMessage.findMany({
				where: eq(directMessage.recipientId, locals.user.id),
				orderBy: [desc(directMessage.createdAt)],
				with: {
					sender: {
						columns: {
							id: true,
							name: true,
							image: true
						}
					}
				}
			});

			const conversationMap = new Map();

			sent.forEach((msg) => {
				if (msg.recipient) {
					conversationMap.set(msg.recipient.id, {
						user: msg.recipient,
						lastMessage: msg,
						unreadCount: 0
					});
				}
			});

			function toTs(v: any) {
				return typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Number(new Date(v));
			}

			received.forEach((msg) => {
				if (msg.sender) {
					const existing = conversationMap.get(msg.sender.id);
					const msgTime = toTs(msg.createdAt);
					const existingTime = existing ? toTs(existing.lastMessage.createdAt) : 0;

					if (!existing || msgTime > existingTime) {
						conversationMap.set(msg.sender.id, {
							user: msg.sender,
							lastMessage: msg,
							unreadCount: (existing?.unreadCount || 0) + (msg.isRead ? 0 : 1)
						});
					} else if (!msg.isRead) {
						existing.unreadCount++;
					}
				}
			});

			return json({
				conversations: Array.from(conversationMap.values()).map((conv) => ({
					...conv,
					lastMessage: {
						...conv.lastMessage,
						createdAt:
							typeof conv.lastMessage.createdAt === 'number'
								? conv.lastMessage.createdAt
								: (conv.lastMessage.createdAt as any).getTime(),
						imageUrls: conv.lastMessage.imageUrls ? JSON.parse(conv.lastMessage.imageUrls) : []
					}
				}))
			});
		}
	} catch (error) {
		console.error('Failed to fetch messages:', error);
		return json({ error: 'failed to load messages' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot send messages' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { recipientId, content, imageUrls } = body;
		const trimmedContent = typeof content === 'string' ? content.trim() : '';
		const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;

		if (!recipientId || (!trimmedContent && !hasImages)) {
			return json({ error: 'recipient and content or attachments are required' }, { status: 400 });
		}

		if (trimmedContent.length > 1000) {
			return json({ error: 'message too long (max 1000 characters)' }, { status: 400 });
		}

		const blockCheck = await db.query.blockedUser.findFirst({
			where: or(
				and(eq(blockedUser.userId, locals.user.id), eq(blockedUser.blockedUserId, recipientId)),
				and(eq(blockedUser.userId, recipientId), eq(blockedUser.blockedUserId, locals.user.id))
			)
		});

		if (blockCheck) {
			return json({ error: 'cannot message blocked user' }, { status: 403 });
		}

		const newMessage = await db
			.insert(directMessage)
			.values({
				senderId: locals.user.id,
				recipientId,
				content: trimmedContent,
				imageUrls: hasImages ? JSON.stringify(imageUrls) : null
			})
			.returning();

		await db.insert(notification).values({
			userId: recipientId,
			type: 'message',
			title: 'New message',
			message: trimmedContent
				? `You received a message: "${trimmedContent.substring(0, 50)}${trimmedContent.length > 50 ? '...' : ''}"`
				: 'You received an attachment.',
			linkUrl: '/messages',
			fromUserId: locals.user.id,
			isRead: false
		});

		return json(
			{
				message: {
					...newMessage[0],
					createdAt:
						typeof newMessage[0].createdAt === 'number'
							? newMessage[0].createdAt
							: (newMessage[0].createdAt as any).getTime()
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Failed to send message:', error);
		return json({ error: 'failed to send message' }, { status: 500 });
	}
};
