import {describe, it, expect, vi, beforeEach} from 'vitest';

// Build a chainable mock for supabase query
function createQueryChain(resolvedValue) {
    const promise = Promise.resolve(resolvedValue);
    const chain = {
        select: vi.fn(() => chain),
        order: vi.fn(() => chain),
        lt: vi.fn(() => chain),
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
    };

    Object.defineProperty(chain, 'then', {
        value: promise.then.bind(promise),
        writable: true,
        configurable: true,
    });
    Object.defineProperty(chain, 'catch', {
        value: promise.catch.bind(promise),
        writable: true,
        configurable: true,
    });

    return chain;
}

let latestChain;
vi.mock('../supabaseClient', () => {
    return {
        supabase: {
            from: vi.fn(() => {
                // latestChain gets overwritten per test
                return latestChain
            }),
            auth: {
                getUser: vi.fn(),
                onAuthStateChange: vi.fn(() => ({
                    data: { subscription: { unsubscribe: vi.fn() } },
                })),
            },
        },
    };
});

import { getAllUsers, getExpiredPasswords, suspendUser } from '../services/adminService';
import { supabase } from '../supabaseClient';

describe('adminService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

  // ══════════════════════════════════════════════
  // getAllUsers
  // ══════════════════════════════════════════════

    it('returns list of users on success', async () => {
      const users = [
        { userID: 1, fName: 'Alice', role: 'administrator' },
        { userID: 2, fName: 'Bob', role: 'accountant' },
      ];
      latestChain = createQueryChain({ data: users, error: null });

      const result = await getAllUsers();
      expect(result).toEqual(users);
      expect(supabase.from).toHaveBeenCalledWith('user');
    });

    it('throws on supabase error', async () => {
      latestChain = createQueryChain({ data: null, error: { message: 'connection error' } });
      await expect(getAllUsers()).rejects.toEqual({ message: 'connection error' });
    });

    it('returns empty array when no users exist', async () => {
      latestChain = createQueryChain({ data: [], error: null });
      const result = await getAllUsers();
      expect(result).toEqual([]);
    });

  // ══════════════════════════════════════════════
  // getExpiredPasswords
  // ══════════════════════════════════════════════

    describe('getExpiredPasswords', () => {
        it('returns expired password records', async () => {
        const expired = [
            { passwordID: 1, userID: 10, activeTill: '2025-01-01T00:00:00Z' },
        ];
        latestChain = createQueryChain({ data: expired, error: null });

        const result = await getExpiredPasswords();
        expect(result).toEqual(expired);
        expect(supabase.from).toHaveBeenCalledWith('userPasswords');
        });

        it('returns empty array when none expired', async () => {
        latestChain = createQueryChain({ data: [], error: null });
        const result = await getExpiredPasswords();
        expect(result).toEqual([]);
        });

        it('throws on error', async () => {
        latestChain = createQueryChain({ data: null, error: { message: 'query failed' } });
        await expect(getExpiredPasswords()).rejects.toEqual({ message: 'query failed' });
        });
    });

  // ══════════════════════════════════════════════
  // suspendUser
  // ══════════════════════════════════════════════

    describe('suspendUser', () => {
        it('suspends a user successfully', async () => {
        const updatedUser = [{ userID: 5, status: false, suspendedTill: '2026-04-01' }];
        latestChain = createQueryChain({ data: updatedUser, error: null });

        const result = await suspendUser(5, '2026-03-17', '2026-04-01');
        expect(result).toEqual(updatedUser);
        });

        it('throws when user not found (empty data)', async () => {
        latestChain = createQueryChain({ data: [], error: null });
        await expect(suspendUser(999, '2026-03-17', '2026-04-01')).rejects.toThrow(
            'User not found.'
        );
        });

        it('throws when data is null', async () => {
        latestChain = createQueryChain({ data: null, error: null });
        await expect(suspendUser(999, '2026-03-17', '2026-04-01')).rejects.toThrow(
            'User not found.'
        );
        });

        it('throws on supabase error', async () => {
        latestChain = createQueryChain({ data: null, error: { message: 'RLS error' } });
        await expect(suspendUser(5, '2026-03-17', '2026-04-01')).rejects.toEqual({
            message: 'RLS error',
        });
        });
    });
});


