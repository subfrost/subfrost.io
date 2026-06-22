import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be declared before any imports that trigger module resolution.
vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/cms/session-store', () => ({ revokeAllUserSessions: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }));

// Prisma mock — only the tables used by actions/cms/users.ts.
vi.mock('@/lib/prisma', () => {
  const user = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };
  const article = { count: vi.fn() };
  const apiKey = { deleteMany: vi.fn() };
  const revision = { updateMany: vi.fn() };
  const client = {
    user,
    article,
    apiKey,
    revision,
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  return { prisma: client, default: client };
});

import { createUser, updateUser, resetPassword, deleteUser } from '@/actions/cms/users';
import { currentUser } from '@/lib/cms/authz';
import { revokeAllUserSessions } from '@/lib/cms/session-store';
import prisma from '@/lib/prisma';

// Typed shorthand to the mocked user table.
const db = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

/**
 * Build a minimal CmsUser-shaped object.
 * `id` defaults to 'me' so Task 8 tests can pass distinct ids.
 */
const asUser = (role: string, privileges: string[], id = 'me') =>
  ({ id, email: 'me@b.io', name: null, role, privileges }) as never;

/**
 * Build a minimal target User row returned by prisma.user.findUnique.
 * Role must be below the actor's role for canManageRole() to pass.
 */
const targetRow = (id = 't1', role = 'EDITOR') => ({
  id,
  email: 'target@b.io',
  name: null,
  role,
  active: true,
  privileges: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  passwordHash: 'x',
  tokenVersion: 0,
  bio: null,
  twitter: null,
  avatarUrl: null,
  status: null,
  lastSeenAt: null,
  totpEnabled: false,
  totpSecret: null,
  totpBackupCodes: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Authorization guards — USERS_EDIT required for all mutating actions
// ---------------------------------------------------------------------------
describe('createUser — authorization', () => {
  it('rejects when unauthenticated', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null);
    const res = await createUser({ email: 'a@b.io', password: 'password1' });
    expect(res).toEqual({ ok: false, error: 'Not authenticated' });
    expect(db.create).not.toHaveBeenCalled();
  });

  it('rejects without USERS_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', []));
    const res = await createUser({ email: 'a@b.io', password: 'password1' });
    expect(res).toEqual({ ok: false, error: 'Insufficient privileges' });
    expect(db.create).not.toHaveBeenCalled();
  });

  it('allows a caller with USERS_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', ['USERS_EDIT']));
    db.findUnique.mockResolvedValueOnce(null); // email not taken
    db.create.mockResolvedValueOnce({ id: 'new', email: 'a@b.io', role: 'AUTHOR', privileges: [] });
    const res = await createUser({ email: 'a@b.io', password: 'password1', role: 'AUTHOR' });
    expect(res).toEqual({ ok: true });
    expect(db.create).toHaveBeenCalled();
  });
});

describe('updateUser — authorization', () => {
  it('rejects without USERS_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', []));
    const res = await updateUser('t1', { name: 'Alice' });
    expect(res).toEqual({ ok: false, error: 'Insufficient privileges' });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('allows name/active change with only USERS_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', ['USERS_EDIT']));
    db.findUnique.mockResolvedValueOnce(targetRow());
    db.update.mockResolvedValueOnce({});
    const res = await updateUser('t1', { name: 'Alice' });
    expect(res).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalled();
  });

  it('rejects role change without MANAGE_ROLES (even with USERS_EDIT)', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', ['USERS_EDIT']));
    db.findUnique.mockResolvedValueOnce(targetRow());
    const res = await updateUser('t1', { role: 'AUTHOR' });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('MANAGE_ROLES') });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects privileges change without MANAGE_ROLES (even with USERS_EDIT)', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', ['USERS_EDIT']));
    db.findUnique.mockResolvedValueOnce(targetRow());
    const res = await updateUser('t1', { privileges: [] });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('MANAGE_ROLES') });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('allows role + privileges change when actor has USERS_EDIT + MANAGE_ROLES', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(
      asUser('ADMIN', ['USERS_EDIT', 'MANAGE_ROLES']),
    );
    db.findUnique.mockResolvedValueOnce(targetRow());
    db.update.mockResolvedValueOnce({});
    const res = await updateUser('t1', { role: 'AUTHOR' });
    expect(res).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalled();
    // Role change → sessions revoked.
    expect(revokeAllUserSessions).toHaveBeenCalledWith('t1');
  });
});

describe('resetPassword — authorization', () => {
  it('rejects without USERS_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', []));
    const res = await resetPassword('t1', 'newpass1');
    expect(res).toEqual({ ok: false, error: 'Insufficient privileges' });
  });

  it('allows reset with USERS_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', ['USERS_EDIT']));
    db.findUnique.mockResolvedValueOnce(targetRow());
    db.update.mockResolvedValueOnce({});
    const res = await resetPassword('t1', 'newpass1');
    expect(res).toEqual({ ok: true });
    expect(revokeAllUserSessions).toHaveBeenCalledWith('t1');
  });
});

describe('deleteUser — authorization', () => {
  it('rejects without USERS_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', []));
    const res = await deleteUser('t1');
    expect(res).toEqual({ ok: false, error: 'Insufficient privileges' });
  });

  it('deletes with USERS_EDIT when user has no articles', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', ['USERS_EDIT']));
    db.findUnique.mockResolvedValueOnce(targetRow());
    (prisma.article as unknown as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValueOnce(0);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const res = await deleteUser('t1');
    expect(res).toEqual({ ok: true });
  });

  it('refuses deletion when user has articles', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser('ADMIN', ['USERS_EDIT']));
    db.findUnique.mockResolvedValueOnce(targetRow());
    (prisma.article as unknown as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValueOnce(3);
    const res = await deleteUser('t1');
    expect(res).toEqual({ ok: false, error: expect.stringContaining('3 article') });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Task 8: ADMIN-par gerenciamento + guarda anti-lockout
// ---------------------------------------------------------------------------
describe('Task 8 — ADMIN gerencia par ADMIN (trim)', () => {
  it('ADMIN pode rebaixar OUTRO ADMIN quando há ≥2 admins ativos', async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser('ADMIN', ['USERS_EDIT', 'MANAGE_ROLES'], 'me'));
    db.findUnique.mockResolvedValue({ ...targetRow('t1', 'ADMIN') });
    db.count.mockResolvedValue(2); // dois admins ativos — trim é seguro
    db.update.mockResolvedValue({});
    const res = await updateUser('t1', { role: 'STAFF' });
    expect(res).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalled();
  });

  it('ADMIN NÃO pode se auto-gerenciar via updateUser', async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser('ADMIN', ['USERS_EDIT', 'MANAGE_ROLES'], 'me'));
    const res = await updateUser('me', { role: 'STAFF' });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('own profile') });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('bloqueia rebaixar o último admin ativo', async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser('ADMIN', ['USERS_EDIT', 'MANAGE_ROLES'], 'me'));
    db.findUnique.mockResolvedValue({ ...targetRow('t1', 'ADMIN') });
    db.count.mockResolvedValue(1); // único admin ativo
    const res = await updateUser('t1', { role: 'STAFF' });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('last active admin') });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('bloqueia desativar o último admin ativo', async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser('ADMIN', ['USERS_EDIT', 'MANAGE_ROLES'], 'me'));
    db.findUnique.mockResolvedValue({ ...targetRow('t1', 'ADMIN') });
    db.count.mockResolvedValue(1); // único admin ativo
    const res = await updateUser('t1', { active: false });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('last active admin') });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('bloqueia deletar o último admin ativo', async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser('ADMIN', ['USERS_EDIT'], 'me'));
    db.findUnique.mockResolvedValue({ ...targetRow('t1', 'ADMIN') });
    db.count.mockResolvedValue(1); // único admin ativo
    (prisma.article as unknown as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValue(0);
    const res = await deleteUser('t1');
    expect(res).toEqual({ ok: false, error: expect.stringContaining('last active admin') });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
