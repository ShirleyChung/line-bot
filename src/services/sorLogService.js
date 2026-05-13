import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { lineBlobClient } from "../line/client.js";
import { db } from "./firestore.js";

const execFileAsync = promisify(execFile);
const COLLECTION = "session_state";
const MAX_LOG_BYTES = Number(process.env.SOR_LOG_MAX_BYTES || 50 * 1024 * 1024);
const PARSER_TIMEOUT_MS = Number(process.env.SOR_LOG_PARSER_TIMEOUT_MS || 30_000);
const RESPONSE_LIMIT = 4_700;

const FIELD_TABLES = {
  SorRID: ["TwfNew", "TwfChg", "FrfNew", "FrfChg", "TwsNew", "TwsChg"],
  OrdNo: ["TwfOrd", "FrfOrd", "TwsOrd"],
};

const FIELD_ALIASES = [
  { pattern: /\bSorRID\b|網路單號/i, field: "SorRID" },
  { pattern: /\bOrdNo\b|委託書號/i, field: "OrdNo" },
];

function sessionDigest(sessionKey) {
  return crypto.createHash("sha256").update(sessionKey || "unknown").digest("hex").slice(0, 24);
}

function sanitizeFileName(fileName) {
  const safeName = String(fileName || "SorReqOrd.log").replace(/[^\w.-]/g, "_");
  return safeName || "SorReqOrd.log";
}

function getParserPath() {
  const candidates = [
    process.env.SOR_LOG_PARSER_PATH,
    path.resolve(process.cwd(), "bin/sor_logparser"),
    path.resolve(process.cwd(), "sorlogparser_rust/target/release/sor_logparser"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates.at(-1);
}

function getStateDoc(sessionKey) {
  return db.collection(COLLECTION).doc(sessionKey);
}

export function isSorLogFileEvent(event) {
  return event?.type === "message" && event.message?.type === "file";
}

export async function saveSorLogFile(event, sessionKey) {
  if (!sessionKey || !event?.message?.id) {
    throw new Error("缺少 sessionKey 或 message id，無法儲存 SorReqOrd.log");
  }

  const fileName = sanitizeFileName(event.message.fileName);
  const dir = path.join(os.tmpdir(), "line-bot-sorlogs", sessionDigest(sessionKey));
  const filePath = path.join(dir, `${Date.now()}-${event.message.id}-${fileName}`);

  await fsp.mkdir(dir, { recursive: true });

  let totalBytes = 0;
  const limitStream = new Transform({
    transform(chunk, _encoding, callback) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_LOG_BYTES) {
        callback(new Error(`log 檔超過上限 ${Math.round(MAX_LOG_BYTES / 1024 / 1024)} MB`));
        return;
      }
      callback(null, chunk);
    },
  });

  const contentStream = await lineBlobClient.getMessageContent(event.message.id);
  await pipeline(contentStream, limitStream, fs.createWriteStream(filePath));

  await getStateDoc(sessionKey).set(
    {
      sorLog: {
        filePath,
        fileName,
        messageId: event.message.id,
        sizeBytes: totalBytes,
        uploadedAt: new Date().toISOString(),
      },
    },
    { merge: true }
  );

  return { filePath, fileName, sizeBytes: totalBytes };
}

export async function getLatestSorLog(sessionKey) {
  if (!sessionKey) return null;

  const snapshot = await getStateDoc(sessionKey).get();
  if (!snapshot.exists) return null;

  const sorLog = snapshot.data()?.sorLog || null;
  if (!sorLog?.filePath) return null;

  try {
    await fsp.access(sorLog.filePath, fs.constants.R_OK);
    return sorLog;
  } catch {
    return { ...sorLog, missing: true };
  }
}

function stripParentheses(text) {
  return text.replace(/[（(][^）)]*[）)]/g, " ");
}

function buildConditionFromFieldValue(field, value) {
  const tables = FIELD_TABLES[field];
  if (!tables || !value) return null;
  return tables.map((table) => `${table}:${field}:${value}`).join("|");
}

function extractValueAfterPattern(text, pattern) {
  const normalized = stripParentheses(text);
  const match = normalized.match(new RegExp(`(?:${pattern.source})\\s*(?:是|為|=|:|：)?\\s*([A-Za-z0-9_.-]+)`, pattern.flags));
  return match?.[1] || null;
}

export function parseSorLogQuery(text) {
  const userText = String(text || "").trim();
  if (!userText) return null;

  const explicitCondition = userText.match(
    /\b[A-Za-z][A-Za-z0-9]*:[A-Za-z][A-Za-z0-9]*:[^\s,|，。]+(?:\s*[,|]\s*[A-Za-z][A-Za-z0-9]*:[A-Za-z][A-Za-z0-9]*:[^\s,|，。]+)*/
  )?.[0];
  if (explicitCondition) {
    const condition = explicitCondition.replace(/\s+/g, "");
    return {
      condition,
      description: condition,
    };
  }

  const tableFieldMatch = stripParentheses(userText).match(
    /\b([A-Za-z][A-Za-z0-9]*):([A-Za-z][A-Za-z0-9]*)\s*(?:是|為|=|:|：)?\s*([A-Za-z0-9_.-]+)/
  );
  if (tableFieldMatch) {
    const [, table, field, value] = tableFieldMatch;
    return {
      condition: `${table}:${field}:${value}`,
      description: `${table}:${field}:${value}`,
    };
  }

  for (const alias of FIELD_ALIASES) {
    const value = extractValueAfterPattern(userText, alias.pattern);
    const condition = buildConditionFromFieldValue(alias.field, value);
    if (condition) {
      return {
        condition,
        description: `${alias.field}:${value}`,
      };
    }
  }

  return null;
}

function formatParserOutput(output, conditionDescription) {
  const body = output.trim() || "parser 沒有輸出結果。";
  const text = `查詢條件：${conditionDescription}\n\n${body}`;

  if (text.length <= RESPONSE_LIMIT) return text;

  return `${text.slice(0, RESPONSE_LIMIT)}\n\n...結果過長，已截斷。請改用更精確的條件查詢。`;
}

export async function runSorLogQuery(sessionKey, query) {
  const sorLog = await getLatestSorLog(sessionKey);
  if (!sorLog) {
    return "請先上傳 SorReqOrd.log，再輸入查詢條件，例如：SorRID 000001 或 TwfOrd:OrdNo 12345。";
  }

  if (sorLog.missing) {
    return "先前上傳的 SorReqOrd.log 暫存檔已不存在，請重新上傳後再查詢。";
  }

  const parserPath = getParserPath();
  const args = [sorLog.filePath, "-f", query.condition];

  try {
    const { stdout, stderr } = await execFileAsync(parserPath, args, {
      timeout: PARSER_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
      windowsHide: true,
    });

    return formatParserOutput([stdout, stderr].filter(Boolean).join("\n"), query.description);
  } catch (error) {
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim();
    console.error("sor_logparser failed:", { parserPath, args, detail });
    return `解析 SorReqOrd.log 失敗。\n${detail.slice(0, 1500)}`;
  }
}
