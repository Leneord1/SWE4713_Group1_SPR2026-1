import { describe, it, expect } from 'vitest';
import {
  uniqueLinesByAccount,
  partitionLinesByDebitCredit,
} from '../utils/journalLinePartition';

describe('journalLinePartition', () => {
  const sampleLines = [
    { accountID: 1, accountName: 'Cash', accountNumber: '10000001', debit: 100, credit: 0 },
    { accountID: 2, accountName: 'Revenue', accountNumber: '40000001', debit: 0, credit: 100 },
    { accountID: 1, accountName: 'Cash', accountNumber: '10000001', debit: 50, credit: 0 },
  ];

  it('deduplicates lines by account id', () => {
    const unique = uniqueLinesByAccount(sampleLines);
    expect(unique).toHaveLength(2);
    expect(unique.map((l) => l.accountID)).toEqual([1, 2]);
  });

  it('partitions debit and credit lines', () => {
    const { debitLines, creditLines } = partitionLinesByDebitCredit(sampleLines);
    expect(debitLines).toHaveLength(1);
    expect(creditLines).toHaveLength(1);
    expect(debitLines[0].accountName).toBe('Cash');
    expect(creditLines[0].accountName).toBe('Revenue');
  });

  it('handles empty input', () => {
    expect(partitionLinesByDebitCredit([])).toEqual({ debitLines: [], creditLines: [] });
  });
});
