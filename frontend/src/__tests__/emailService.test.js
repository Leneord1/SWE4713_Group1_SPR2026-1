import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock emailjs
const mockSend = vi.fn();
vi.mock('@emailjs/browser', () => ({
  default: { send: (...args) => mockSend(...args) },
}));

// Mock supabase (needed because emailService imports GoTrueClient)
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

import { sendNewAccountRequest, sendAdminEmail, sendReportEmail } from '../services/emailService';

describe('emailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  // ══════════════════════════════════════════════
  // sendNewAccountRequest
  // ══════════════════════════════════════════════
  describe('sendNewAccountRequest', () => {
    it('calls emailjs.send with correct service and template', async () => {
      mockSend.mockResolvedValue({ status: 200 });

      await sendNewAccountRequest('John Doe');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(
        'service_h5dzete',
        'template_rot6eaf',
        expect.objectContaining({
          email: 'betterfinance3@gmail.com',
          name: 'John Doe',
        })
      );
    });

    it('passes the full name to the template params', async () => {
      mockSend.mockResolvedValue({ status: 200 });

      await sendNewAccountRequest('Jane Smith');
      const templateParams = mockSend.mock.calls[0][2];
      expect(templateParams.name).toBe('Jane Smith');
    });

    it('handles empty name string', async () => {
      mockSend.mockResolvedValue({ status: 200 });

      await sendNewAccountRequest('');
      const templateParams = mockSend.mock.calls[0][2];
      expect(templateParams.name).toBe('');
    });
  });

  // ══════════════════════════════════════════════
  // sendAdminEmail
  // ══════════════════════════════════════════════
  describe('sendAdminEmail', () => {
    it('sends an admin email with correct params', async () => {
      mockSend.mockResolvedValue({ status: 200 });

      const result = await sendAdminEmail(
        'user@example.com',
        'Alice',
        'Account Update',
        'Your role has been changed.'
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        'service_h5dzete',
        'template_admin_email',
        expect.objectContaining({
          from_email: 'betterfinance3@gmail.com',
          to_email: 'user@example.com',
          to_name: 'Alice',
          subject: 'Account Update',
          message: 'Your role has been changed.',
        })
      );
    });

    it('throws on emailjs failure', async () => {
      mockSend.mockRejectedValue(new Error('SMTP error'));

      await expect(
        sendAdminEmail('user@example.com', 'Alice', 'Test', 'Body')
      ).rejects.toThrow('SMTP error');
    });

    it('returns true on success', async () => {
      mockSend.mockResolvedValue({ status: 200 });

      const result = await sendAdminEmail('a@b.com', 'Bob', 'Hi', 'Hello');
      expect(result).toBe(true);
    });
  });

  describe('sendReportEmail', () => {
    it('sends report email via /api/send-pdf with attachment', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn(async () => ''),
      });

      const result = await sendReportEmail({
        recipientEmail: 'recipient@example.com',
        subject: 'Income Statement - Report Image',
        filename: 'income-statement.jpg',
        contentType: 'image/jpeg',
        attachmentBase64: 'base64jpegdata...',
      });

      expect(result).toEqual({ sent: true, attachmentIncluded: true });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/send-pdf',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('throws when recipient email is missing', async () => {
      await expect(
        sendReportEmail({
          recipientEmail: '   ',
          reportTitle: 'Trial Balance',
          reportHtml: '<p>Report</p>',
        })
      ).rejects.toThrow('Recipient email is required.');
    });

    it('throws when attachment is missing', async () => {
      await expect(
        sendReportEmail({
          recipientEmail: 'recipient@example.com',
          subject: 'Report Image',
          filename: 'report.jpg',
          contentType: 'image/jpeg',
          attachmentBase64: '   ',
        })
      ).rejects.toThrow('Unable to generate the attachment.');
    });
  });
});
