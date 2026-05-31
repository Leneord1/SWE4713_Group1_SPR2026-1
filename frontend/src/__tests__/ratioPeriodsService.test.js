import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import {
  currentQuarterWeekLabels,
  ledgerDateBoundsFromRows,
  buildRatioPeriodLabelsFromRows,
} from '../services/ratioPeriodsService';

describe('ratioPeriodsService', () => {
  describe('currentQuarterWeekLabels', () => {
    it('returns weekly end labels within the current quarter', () => {
      const labels = currentQuarterWeekLabels(new Date(2026, 1, 15));
      expect(labels.length).toBeGreaterThan(0);
      expect(labels[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(labels).toContain('2026-02-15');
    });

    it('returns one label when anchor is the first day of a quarter', () => {
      const labels = currentQuarterWeekLabels(new Date(2026, 0, 1));
      expect(labels).toEqual(['2026-01-01']);
    });
  });

  describe('ledgerDateBoundsFromRows', () => {
    it('returns null bounds for empty input', () => {
      expect(ledgerDateBoundsFromRows([])).toEqual({ min: null, max: null });
    });

    it('returns sorted min and max dates', () => {
      const rows = [
        { entryDate: '2026-03-01' },
        { entryDate: '2026-01-15' },
        { entryDate: '2026-02-20' },
      ];
      expect(ledgerDateBoundsFromRows(rows)).toEqual({
        min: '2026-01-15',
        max: '2026-03-01',
      });
    });
  });

  describe('buildRatioPeriodLabelsFromRows', () => {
    it('delegates to currentQuarterWeekLabels', () => {
      const anchor = new Date(2026, 3, 10);
      expect(buildRatioPeriodLabelsFromRows([], anchor)).toEqual(currentQuarterWeekLabels(anchor));
    });
  });
});
