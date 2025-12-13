/**
 * Health check endpoint for Cloud Run and monitoring
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const checks: {
    app: { status: 'ok' | 'error' };
    database: { status: 'ok' | 'error'; latency: number };
  } = {
    app: { status: 'ok' },
    database: { status: 'ok', latency: 0 },
  };

  let status: 'healthy' | 'degraded' = 'healthy';

  // Check database connection
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database.latency = Date.now() - dbStart;
  } catch {
    checks.database = {
      status: 'error',
      latency: Date.now() - dbStart,
    };
    status = 'degraded';
  }

  const response = {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    status: status === 'healthy' ? 200 : 503,
  });
}
