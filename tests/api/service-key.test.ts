import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { requireApiKey, requireAdminSecret } from '@/lib/api/service-key';

/**
 * 7-24 audit regression guard.
 *
 * `requireAdminSecret` is the shared, constant-time guard the `/api/admin/*`
 * and `/api/pager/*` routes now route through. Before the audit each of those
 * routes inlined its own `request.headers.get('x-admin-secret') !== secret`
 * comparison, which is not constant-time and drifted in behaviour between
 * routes (clear-all reported an unset ADMIN_SECRET as 401 rather than 503).
 *
 * These tests pin the contract both guards share: 503 when unconfigured, 401
 * on a missing/wrong/near-miss secret, null when it matches.
 */

const ADMIN_SECRET = 'admin-secret-value';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://subfrost.io/api/pager/repeat', { method: 'POST', headers });
}

const originalAdminSecret = process.env.ADMIN_SECRET;

beforeEach(() => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;
});

afterEach(() => {
  if (originalAdminSecret === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = originalAdminSecret;
});

describe('requireAdminSecret', () => {
  it('authorizes an exact match', () => {
    expect(requireAdminSecret(req({ 'x-admin-secret': ADMIN_SECRET }))).toBeNull();
  });

  it('rejects a missing header with 401', () => {
    expect(requireAdminSecret(req())?.status).toBe(401);
  });

  it('rejects a wrong secret with 401', () => {
    expect(requireAdminSecret(req({ 'x-admin-secret': 'nope' }))?.status).toBe(401);
  });

  it('rejects a same-length near miss with 401', () => {
    // Same length as the real secret so the length pre-check cannot be what
    // rejects it — this exercises the timingSafeEqual path itself.
    const nearMiss = `${ADMIN_SECRET.slice(0, -1)}X`;
    expect(nearMiss.length).toBe(ADMIN_SECRET.length);
    expect(requireAdminSecret(req({ 'x-admin-secret': nearMiss }))?.status).toBe(401);
  });

  it('rejects a prefix of the real secret with 401', () => {
    expect(requireAdminSecret(req({ 'x-admin-secret': ADMIN_SECRET.slice(0, 4) }))?.status).toBe(401);
  });

  it('reports an unset ADMIN_SECRET as 503, not 401', () => {
    delete process.env.ADMIN_SECRET;
    expect(requireAdminSecret(req({ 'x-admin-secret': 'anything' }))?.status).toBe(503);
  });

  it('reports an empty ADMIN_SECRET as 503 and never authorizes an empty header', () => {
    process.env.ADMIN_SECRET = '';
    expect(requireAdminSecret(req({ 'x-admin-secret': '' }))?.status).toBe(503);
  });
});

describe('requireApiKey', () => {
  it('authorizes an exact match and rejects a same-length near miss', () => {
    const key = 'pay-api-key-value';
    expect(requireApiKey(req({ 'x-api-key': key }), key, 'PAY_API_KEY')).toBeNull();
    expect(requireApiKey(req({ 'x-api-key': `${key.slice(0, -1)}X` }), key, 'PAY_API_KEY')?.status).toBe(401);
  });

  it('reports an unset key as 503', () => {
    expect(requireApiKey(req(), undefined, 'PAY_API_KEY')?.status).toBe(503);
  });
});
