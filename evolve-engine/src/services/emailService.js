import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

function getTransporter() {
  // nodemailer transporter 可重複使用，避免每封信都重新建立 SMTP 連線設定。
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
  // SMTP 未設定時不中斷主流程；evolveEngine 仍會完成需求入庫與排程。
  if (!env.EMAIL_SMTP_HOST || !env.EMAIL_SMTP_USER || !env.EMAIL_SMTP_PASS) {
    console.warn("[evolve-engine] email skipped; EMAIL_SMTP_* is not configured", {
      to,
      subject,
    });
    return { skipped: true };
  }

  // 沒有指定寄件者時使用 SMTP 帳號，減少部署環境需要設定的變數數量。
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
