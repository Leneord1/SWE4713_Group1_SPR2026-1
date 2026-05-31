import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAppError,
  ERROR_FALLBACK,
  ERROR_IDS,
  getErrorMessage,
} from '../services/errorMessages';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { message: 'From database' }, error: null })),
        })),
      })),
    })),
  },
}));

describe('errorMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates app errors with error ids', () => {
    const err = createAppError(ERROR_IDS.JOURNAL_NOT_FOUND, new Error('root'));
    expect(err.errorID).toBe(1013);
    expect(err.message).toBe('E1013');
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('returns fallback messages for known ids', async () => {
    const message = await getErrorMessage(1005);
    expect(message).toBeTruthy();
    expect(typeof message).toBe('string');
  });

  it('exposes fallback catalog entries', () => {
    expect(ERROR_FALLBACK[1001]).toBe('No account selected.');
  });
});
