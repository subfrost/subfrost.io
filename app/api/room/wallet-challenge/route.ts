/**
 * API Route: Generate wallet challenge for signature verification.
 * GET → returns { message, timestamp }
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateChallenge } from '@/lib/wallet-verify';

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action') || 'join';
  const challenge = generateChallenge(action);
  return NextResponse.json(challenge);
}
