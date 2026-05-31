import {describe, it, expect, vi, beforeEach} from 'vitest';

function buildFromBuilder(result) {
    const resolved = Promise.resolve(result);
    const afterEq = { select: vi.fn(() => resolved) };
    const afterSelect = {
        order: vi.fn(() => resolved),
        lt: vi.fn(() => resolved),
        eq: vi.fn(() => afterEq),
    };
    return {
        select: vi.fn(() => afterSelect),
        update: vi.fn(() => ({ eq: vi.fn(() => afterEq) })),
    };
}

let queryResult = { data: null, error: null };

vi.mock('../supabaseClient', () => {
    return {
        supabase: {
            from: vi.fn(() => buildFromBuilder(queryResult)),
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
        queryResult = { data: null, error: null };
    });

    it('returns list of users on success', async () => {
      const users = [
        { userID: 1, fName: 'Alice', role: 'administrator' },
        { userID: 2, fName: 'Bob', role: 'accountant' },
      ];
      queryResult = { data: users, error: null };

      const result = await getAllUsers();
      expect(result).toEqual(users);
      expect(supabase.from).toHaveBeenCalledWith('user');
    });

    it('throws on supabase error', async () => {
      queryResult = { data: null, error: { message: 'connection error' } };
      await expect(getAllUsers()).rejects.toEqual({ message: 'connection error' });
    });

    it('returns empty array when no users exist', async () => {
      queryResult = { data: [], error: null };
      const result = await getAllUsers();
      expect(result).toEqual([]);
    });

    describe('getExpiredPasswords', () => {
        it('returns expired password records', async () => {
        const expired = [
            { passwordID: 1, userID: 10, activeTill: '2025-01-01T00:00:00Z' },
        ];
        queryResult = { data: expired, error: null };

        const result = await getExpiredPasswords();
        expect(result).toEqual(expired);
        expect(supabase.from).toHaveBeenCalledWith('userPasswords');
        });

        it('returns empty array when none expired', async () => {
        queryResult = { data: [], error: null };
        const result = await getExpiredPasswords();
        expect(result).toEqual([]);
        });

        it('throws on error', async () => {
        queryResult = { data: null, error: { message: 'query failed' } };
        await expect(getExpiredPasswords()).rejects.toEqual({ message: 'query failed' });
        });
    });

    describe('suspendUser', () => {
        it('suspends a user successfully', async () => {
        const updatedUser = [{ userID: 5, status: false, suspendedTill: '2026-04-01' }];
        queryResult = { data: updatedUser, error: null };

        const result = await suspendUser(5, '2026-03-17', '2026-04-01');
        expect(result).toEqual(updatedUser);
        });

        it('throws when user not found (empty data)', async () => {
        queryResult = { data: [], error: null };
        await expect(suspendUser(999, '2026-03-17', '2026-04-01')).rejects.toThrow(
            'User not found.'
        );
        });

        it('throws when data is null', async () => {
        queryResult = { data: null, error: null };
        await expect(suspendUser(999, '2026-03-17', '2026-04-01')).rejects.toThrow(
            'User not found.'
        );
        });

        it('throws on supabase error', async () => {
        queryResult = { data: null, error: { message: 'RLS error' } };
        await expect(suspendUser(5, '2026-03-17', '2026-04-01')).rejects.toEqual({
            message: 'RLS error',
        });
        });
    });
});
