import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveLegacyPdfBase64,
  resolveAttachmentBase64,
  resolveContentType,
  resolveTrimmedString,
  decodeAttachment,
  getSmtpTransporter,
  createSendPdfHandler,
  PDF_DATA_URI_PREFIX,
} from '../lib/sendPdfHandler.js';

describe('send-pdf-lib', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveLegacyPdfBase64', () => {
    it('returns raw base64 when provided', () => {
      expect(resolveLegacyPdfBase64('abc123', null)).toBe('abc123');
    });

    it('extracts base64 from pdf data uri', () => {
      expect(resolveLegacyPdfBase64(null, 'data:application/pdf;base64,abc123')).toBe('abc123');
    });

    it('returns empty string when neither provided', () => {
      expect(resolveLegacyPdfBase64(null, null)).toBe('');
    });
  });

  describe('resolveAttachmentBase64', () => {
    it('prefers attachmentBase64', () => {
      expect(resolveAttachmentBase64('raw', 'data:text/plain;base64,uri', 'fallback')).toBe('raw');
    });

    it('extracts from attachment data uri', () => {
      expect(resolveAttachmentBase64(null, 'data:image/png;base64,imgdata', '')).toBe('imgdata');
    });

    it('falls back to legacy pdf base64', () => {
      expect(resolveAttachmentBase64(null, null, 'legacy')).toBe('legacy');
    });
  });

  describe('resolveContentType', () => {
    it('uses explicit content type when set', () => {
      expect(resolveContentType(' image/jpeg ', '')).toBe('image/jpeg');
    });

    it('defaults to pdf when legacy pdf present', () => {
      expect(resolveContentType('', 'pdfdata')).toBe('application/pdf');
    });

    it('defaults to octet-stream otherwise', () => {
      expect(resolveContentType('', '')).toBe('application/octet-stream');
    });
  });

  describe('resolveTrimmedString', () => {
    it('returns trimmed value or fallback', () => {
      expect(resolveTrimmedString('  hi  ', 'x')).toBe('hi');
      expect(resolveTrimmedString('   ', 'fallback')).toBe('fallback');
    });
  });

  describe('decodeAttachment', () => {
    it('decodes valid base64', () => {
      const result = decodeAttachment(Buffer.from('hello').toString('base64'));
      expect(result.buffer.toString()).toBe('hello');
    });
  });

  describe('getSmtpTransporter', () => {
    it('returns error when env is incomplete', () => {
      expect(getSmtpTransporter({}).error).toContain('Missing server configuration');
    });

    it('returns transporter when env is complete', () => {
      const result = getSmtpTransporter({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        MAIL_FROM: 'from@example.com',
        SMTP_SECURE: 'false',
      });
      expect(result.transporter).toBeDefined();
      expect(result.mailFrom).toBe('from@example.com');
    });
  });

  describe('createSendPdfHandler', () => {
    it('rejects non-POST requests', async () => {
      const handler = createSendPdfHandler();
      const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
      await handler({ method: 'GET' }, res);
      expect(res.statusCode).toBe(405);
    });

    it('requires to field in payload', async () => {
      const respond = vi.fn();
      const handler = createSendPdfHandler({ respond });
      const req = {
        method: 'POST',
        on: vi.fn((event, cb) => {
          if (event === 'end') cb();
        }),
      };
      await handler(req, {});
      expect(respond).toHaveBeenCalledWith({}, 400, expect.objectContaining({ error: '`to` is required' }));
    });
  });

  it('exports pdf data uri prefix', () => {
    expect(PDF_DATA_URI_PREFIX.test('data:application/pdf;base64,x')).toBe(true);
  });
});
