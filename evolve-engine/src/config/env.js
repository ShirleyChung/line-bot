export const env = {
  PORT: Number(process.env.PORT || 8090),
  FIRESTORE_PROJECT_ID:
    process.env.FIRESTORE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    "shirleylineagent",
  EVOLVE_ENGINE_SHARED_SECRET: process.env.EVOLVE_ENGINE_SHARED_SECRET || "",
  EVOLVE_REPORT_EMAIL: process.env.EVOLVE_REPORT_EMAIL || "joniesg@gmail.com",
  EVOLVE_AGENT_MODE: process.env.EVOLVE_AGENT_MODE || "manual",

  EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST || "",
  EMAIL_SMTP_PORT: Number(process.env.EMAIL_SMTP_PORT || 587),
  EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER || "",
  EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "",
};
