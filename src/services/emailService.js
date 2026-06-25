import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { normalizeEmailRecipients } from "../utils/emailRecipients.js";

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

/**
 * 寄送電子郵件
 * @param {object} opts
 * @param {string|string[]} opts.to - 收件人 email 地址；多個地址可用逗號、空白、中文及/和/與分隔，或傳入陣列
 * @param {string} opts.subject - 郵件主旨
 * @param {string} opts.body - 郵件正文
 */
export async function sendEmail({ to, subject, body }) {
  if (!env.EMAIL_SMTP_HOST || !env.EMAIL_SMTP_USER) {
    throw new Error("Email 功能未設定，請先設定 EMAIL_SMTP_* 環境變數");
  }

  const normalizedTo = normalizeEmailRecipients(to);
  if (!normalizedTo) {
    throw new Error("Email 缺少有效收件人");
  }

  const from = env.EMAIL_FROM || env.EMAIL_SMTP_USER;

  const info = await getTransporter().sendMail({
    from,
    to: normalizedTo,
    subject,
    text: body,
  });

  console.log("[email] sent:", { to: normalizedTo, subject, messageId: info.messageId });
  return info;
}
