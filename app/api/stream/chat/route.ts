/**
 * API Route: Stream Chat
 *
 * GET: SSE endpoint for live chat messages. Polls every 2 seconds.
 * POST: Public endpoint to send chat messages. Rate-limited per IP.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// In-memory rate limiting: IP -> last message timestamp
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 2_000;
const MAX_NICKNAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 500;

// Clean stale rate limit entries every 60s
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, ts] of rateLimitMap) {
    if (ts < cutoff) rateLimitMap.delete(ip);
  }
}, 60_000);

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const session = await prisma.streamSession.findFirst({
        where: { status: { in: ['live', 'created'] } },
        orderBy: { createdAt: 'desc' },
      });

      if (!session) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: 'No active stream' })}\n\n`)
        );
        controller.close();
        return;
      }

      let lastCreatedAt = new Date(0);

      const poll = async () => {
        while (true) {
          try {
            const currentSession = await prisma.streamSession.findUnique({
              where: { id: session.id },
              select: { status: true },
            });

            if (!currentSession || currentSession.status === 'ended') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'stream_ended' })}\n\n`)
              );
              controller.close();
              return;
            }

            const messages = await prisma.chatMessage.findMany({
              where: {
                sessionId: session.id,
                createdAt: { gt: lastCreatedAt },
              },
              orderBy: { createdAt: 'asc' },
            });

            for (const msg of messages) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(msg)}\n\n`)
              );
              lastCreatedAt = msg.createdAt;
            }
          } catch (error) {
            console.error('[Stream Chat SSE] Poll error:', error);
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      };

      poll().catch((error) => {
        console.error('[Stream Chat SSE] Fatal error:', error);
        try {
          controller.close();
        } catch {
          // Controller may already be closed
        }
      });
    },
    cancel() {
      // Client disconnected
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    const now = Date.now();
    const lastMsg = rateLimitMap.get(ip);
    if (lastMsg && now - lastMsg < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: 'Too many messages. Please wait.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { nickname, message } = body as { nickname?: string; message?: string };

    if (!nickname || !message) {
      return NextResponse.json(
        { error: 'nickname and message are required' },
        { status: 400 }
      );
    }

    const trimmedNick = nickname.trim().slice(0, MAX_NICKNAME_LENGTH);
    const trimmedMsg = message.trim().slice(0, MAX_MESSAGE_LENGTH);

    if (!trimmedNick || !trimmedMsg) {
      return NextResponse.json(
        { error: 'nickname and message cannot be empty' },
        { status: 400 }
      );
    }

    // Find active session
    const session = await prisma.streamSession.findFirst({
      where: { status: { in: ['live', 'created'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'No active stream' },
        { status: 404 }
      );
    }

    const chatMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        nickname: trimmedNick,
        message: trimmedMsg,
      },
    });

    rateLimitMap.set(ip, now);

    return NextResponse.json(chatMessage, { status: 201 });
  } catch (error) {
    console.error('[Stream Chat POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
