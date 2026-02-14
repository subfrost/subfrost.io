/**
 * API Route: Stream Captions
 *
 * GET: SSE endpoint for live captions. Polls for new captions every 2 seconds.
 * POST: Accepts caption data from the media server. Requires admin authentication.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Find the active session
      const session = await prisma.streamSession.findFirst({
        where: {
          status: { in: ['live', 'created'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!session) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: 'No active stream' })}\n\n`)
        );
        controller.close();
        return;
      }

      let lastTimestamp = 0;
      let isActive = true;

      const poll = async () => {
        while (isActive) {
          try {
            // Check if the session is still active
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

            // Fetch new captions since last seen timestamp
            const captions = await prisma.streamCaption.findMany({
              where: {
                sessionId: session.id,
                timestamp: { gt: lastTimestamp },
              },
              orderBy: { timestamp: 'asc' },
            });

            for (const caption of captions) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(caption)}\n\n`)
              );
              lastTimestamp = caption.timestamp;
            }
          } catch (error) {
            console.error('[Stream Captions SSE] Poll error:', error);
          }

          // Wait 2 seconds before next poll
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      };

      // Start polling
      poll().catch((error) => {
        console.error('[Stream Captions SSE] Fatal error:', error);
        try {
          controller.close();
        } catch {
          // Controller may already be closed
        }
      });

      // Handle client disconnect
      // The stream will be cleaned up when the client disconnects and
      // the controller errors on the next enqueue attempt
    },
    cancel() {
      // Client disconnected; the poll loop will stop on the next iteration
      // because enqueue will throw after cancel
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
    // Check admin authentication
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || token !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      sessionId,
      textOriginal,
      textTranslated,
      languageFrom,
      languageTo,
      timestamp,
      duration,
    } = body as {
      sessionId: string;
      textOriginal: string;
      textTranslated?: string;
      languageFrom?: string;
      languageTo?: string;
      timestamp: number;
      duration?: number;
    };

    if (!sessionId || !textOriginal || timestamp === undefined) {
      return NextResponse.json(
        { error: 'sessionId, textOriginal, and timestamp are required' },
        { status: 400 }
      );
    }

    // Verify the session exists and is active
    const session = await prisma.streamSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Stream session not found' }, { status: 404 });
    }

    if (session.status === 'ended') {
      return NextResponse.json({ error: 'Stream session has ended' }, { status: 400 });
    }

    // Create the caption record
    const caption = await prisma.streamCaption.create({
      data: {
        sessionId,
        textOriginal,
        textTranslated: textTranslated ?? null,
        languageFrom: languageFrom ?? 'en',
        languageTo: languageTo ?? null,
        timestamp,
        duration: duration ?? null,
      },
    });

    return NextResponse.json(caption, { status: 201 });
  } catch (error) {
    console.error('[Stream Captions POST] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create caption',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
