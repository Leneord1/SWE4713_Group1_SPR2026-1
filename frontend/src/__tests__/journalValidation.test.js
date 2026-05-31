import { describe, it, expect } from 'vitest';
import {
  validateHasDebitAndCredit,
  validateDebitsEqualCredits,
  validateLineAmounts,
  validateDebitBeforeCredit,
  validateJournalEntry,
} from '../utils/journalValidation';

describe('journalValidation', () => {
  const accounts = [
    { accountID: 1, active: true },
    { accountID: 2, active: true },
  ];

  const validLines = [
    { accountID: 1, debit: 100, credit: 0 },
    { accountID: 2, debit: 0, credit: 100 },
  ];

  it('accepts balanced debit and credit lines', () => {
    expect(validateHasDebitAndCredit(validLines).valid).toBe(true);
    expect(validateDebitsEqualCredits(validLines).valid).toBe(true);
    expect(validateLineAmounts(validLines).valid).toBe(true);
    expect(validateDebitBeforeCredit(validLines).valid).toBe(true);
    expect(validateJournalEntry(validLines, accounts).valid).toBe(true);
  });

  it('rejects missing debit line', () => {
    const result = validateHasDebitAndCredit([{ debit: 0, credit: 100 }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].errorID).toBe('1003');
  });

  it('rejects unbalanced totals', () => {
    const result = validateDebitsEqualCredits([
      { debit: 100, credit: 0 },
      { debit: 0, credit: 50 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].errorID).toBe('1005');
  });

  it('rejects debit after credit', () => {
    const result = validateDebitBeforeCredit([
      { debit: 0, credit: 50 },
      { debit: 50, credit: 0 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].errorID).toBe('1008');
  });
});
