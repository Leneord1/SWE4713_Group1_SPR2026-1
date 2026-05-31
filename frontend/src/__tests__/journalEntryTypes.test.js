import { describe, it, expect } from 'vitest';
import { getJournalEntryTypeLabel } from '../utils/journalEntryTypes';

describe('journalEntryTypes', () => {
  it('maps known entry types', () => {
    expect(getJournalEntryTypeLabel(1)).toBe('Regular');
    expect(getJournalEntryTypeLabel(2)).toBe('Adjusting');
    expect(getJournalEntryTypeLabel(3)).toBe('Closing');
  });

  it('returns empty label for missing values', () => {
    expect(getJournalEntryTypeLabel(null)).toBe('—');
    expect(getJournalEntryTypeLabel(undefined, { emptyLabel: 'N/A' })).toBe('N/A');
  });

  it('returns stringified unknown values', () => {
    expect(getJournalEntryTypeLabel('Custom')).toBe('Custom');
  });
});
