export const env = {
  // HTTP 與 Firestore 基本設定；Cloud Run 會透過 PORT 注入監聽埠。
  PORT: Number(process.env.PORT || 8090),
  FIRESTORE_PROJECT_ID:
    process.env.FIRESTORE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    "shirleylineagent",
  EVOLVE_ENGINE_SHARED_SECRET: process.env.EVOLVE_ENGINE_SHARED_SECRET || "",
  EVOLVE_REPORT_EMAIL: process.env.EVOLVE_REPORT_EMAIL || "joniesg@gmail.com",

  // agent 模式控制 evolveEngine 只排程、準備 Codex workflow，或交給未來 adapter。
  EVOLVE_AGENT_MODE: process.env.EVOLVE_AGENT_MODE || "manual",
  EVOLVE_REPO_FULL_NAME: process.env.EVOLVE_REPO_FULL_NAME || "ShirleyChung/line-bot",
  EVOLVE_REPO_BASE_BRANCH: process.env.EVOLVE_REPO_BASE_BRANCH || "master",
  EVOLVE_GITHUB_TOKEN: process.env.EVOLVE_GITHUB_TOKEN || "",
  EVOLVE_CODEX_TRIGGER_MODE: process.env.EVOLVE_CODEX_TRIGGER_MODE || "github_issue",

  // 通知信 SMTP 設定；缺少任一必要欄位時會跳過寄信。
  EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST || "",
  EMAIL_SMTP_PORT: Number(process.env.EMAIL_SMTP_PORT || 587),
  EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER || "",
  EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "",
};
