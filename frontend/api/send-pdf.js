import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const PDF_DATA_URI_PREFIX = /^data:application\/pdf;base64,/;
const ATTACHMENT_DATA_URI_PREFIX = /^data:[^;]+;base64,/;

function ensureEnvLoaded() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"];
  const hasAll = required.every((key) => Boolean(process.env[key]));
  if (hasAll) return;

  const candidatePaths = [
    path.resolve(process.cwd(), "..", "..", ".env.local"),
    path.resolve(process.cwd(), ".env.local"),
  ];

  for (const envPath of candidatePaths) {
    try {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: false });
        break;
      }
    } catch {
      // ignore
    }
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function respondJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function badRequest(res, message) {
  respondJson(res, 400, { ok: false, error: message });
}

function extractBase64FromDataUri(dataUri, prefixPattern) {
  if (typeof dataUri !== "string") return "";
  return String(dataUri).replace(prefixPattern, "");
}

function resolveLegacyPdfBase64(pdfBase64, pdfDataUri) {
  if (typeof pdfBase64 === "string") return pdfBase64;
  return extractBase64FromDataUri(pdfDataUri, PDF_DATA_URI_PREFIX);
}

function resolveAttachmentBase64(attachmentBase64, attachmentDataUri, fallback) {
  if (typeof attachmentBase64 === "string") return attachmentBase64;
  if (typeof attachmentDataUri === "string") {
    return extractBase64FromDataUri(attachmentDataUri, ATTACHMENT_DATA_URI_PREFIX);
  }
  return fallback;
}

function resolveContentType(attachmentContentType, legacyPdfBase64) {
  if (typeof attachmentContentType === "string" && attachmentContentType.trim()) {
    return attachmentContentType.trim();
  }
  if (legacyPdfBase64) return "application/pdf";
  return "application/octet-stream";
}

function resolveTrimmedString(value, fallback) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

async function parseRequestPayload(req) {
  try {
    return { payload: await readJson(req) };
  } catch (err) {
    const message = String(err?.message || "Invalid request");
    if (message.toLowerCase().includes("payload too large")) {
      return { error: { status: 413, message: "Attachment payload too large for this endpoint." } };
    }
    return { error: { status: 400, message: "Invalid JSON body." } };
  }
}

function getSmtpTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
    return {
      error:
        "Missing server configuration. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM in Vercel env.",
    };
  }

  return {
    mailFrom: MAIL_FROM,
    transporter: nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_SECURE).toLowerCase() === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    }),
  };
}

function decodeAttachment(rawAttachmentBase64) {
  try {
    return { buffer: Buffer.from(rawAttachmentBase64, "base64") };
  } catch {
    return { error: "Invalid base64 attachment" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    return res.end("Method Not Allowed");
  }

  ensureEnvLoaded();

  const parsed = await parseRequestPayload(req);
  if (parsed.error) {
    return respondJson(res, parsed.error.status, { ok: false, error: parsed.error.message });
  }

  const {
    to,
    subject,
    text,
    filename,
    attachmentBase64,
    attachmentDataUri,
    attachmentContentType,
    pdfBase64,
    pdfDataUri,
  } = parsed.payload || {};

  if (!to || typeof to !== "string") return badRequest(res, "`to` is required");

  const legacyPdfBase64 = resolveLegacyPdfBase64(pdfBase64, pdfDataUri);
  const rawAttachmentBase64 = resolveAttachmentBase64(
    attachmentBase64,
    attachmentDataUri,
    legacyPdfBase64
  );

  if (!rawAttachmentBase64) {
    return badRequest(res, "Attachment is required (`attachmentBase64` or `attachmentDataUri`).");
  }

  const decoded = decodeAttachment(rawAttachmentBase64);
  if (decoded.error) return badRequest(res, decoded.error);

  const smtp = getSmtpTransporter();
  if (smtp.error) {
    return respondJson(res, 500, { ok: false, error: smtp.error });
  }

  try {
    const info = await smtp.transporter.sendMail({
      from: smtp.mailFrom,
      to,
      subject: resolveTrimmedString(subject, "Document"),
      text: typeof text === "string" ? text : "",
      attachments: [
        {
          filename: resolveTrimmedString(filename, "document"),
          content: decoded.buffer,
          contentType: resolveContentType(attachmentContentType, legacyPdfBase64),
        },
      ],
    });
    return respondJson(res, 200, { ok: true, messageId: info.messageId });
  } catch (err) {
    return respondJson(res, 500, { ok: false, error: err?.message || "Failed to send email" });
  }
}
