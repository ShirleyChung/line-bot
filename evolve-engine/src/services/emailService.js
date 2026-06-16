import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_SMTP_HOST,
      port: env.EMAIL_SMTP_PORT,
      secure: env.EMAIL_SMTP_PORT === 465,
      auth: {
        user: env.EMAIL_SMTP_USER,
        pass: env.EMAIL_SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendEmail({ to, subject, body }) {
  if (!env.EMAIL_SMTP_HOST || !env.EMAIL_SMTP_USER || !env.EMAIL_SMTP_PASS) {
    console.warn("[evolve-engine] email skipped; EMAIL_SMTP_* is not configured", {
      to,
      subject,
    });
    return { skipped: true };
  }

  const from = env.EMAIL_FROM || env.EMAIL_SMTP_USER;
  const info = await getTransporter().sendMail({
    from,
    to,
    subject,
    text: body,
  });

  console.log("[evolve-engine] email sent", {
    to,
    subject,
    messageId: info.messageId,
  });

  return info;
}
