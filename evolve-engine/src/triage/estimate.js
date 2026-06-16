const LARGE_WORK_PATTERNS = [
  /部署|deploy|cloud run|github actions|ci\/cd/i,
  /資料庫|schema|migration|權限|auth|oauth/i,
  /串接|整合|api|webhook|爬蟲|crawler|scraper/i,
  /前端|ui|頁面|dashboard|管理介面/i,
  /排程|queue|worker|cron|background/i,
  /測試|test|mock|重構|refactor/i,
  /多平台|telegram|facebook|instagram|teams/i,
];

const SMALL_WORK_PATTERNS = [
  /改文案|文字|回覆格式|format/i,
  /新增指令|簡單查詢|固定連結|固定資料/i,
  /調整半徑|預設|排序|欄位/i,
];

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

export function estimateEngineeringSize(input = {}) {
  const text = [
    input.userText,
    input.reason,
    input.missingCapability,
    input.expectedBehavior,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  const largeSignals = countMatches(text, LARGE_WORK_PATTERNS);
  const smallSignals = countMatches(text, SMALL_WORK_PATTERNS);
  const lengthSignal = Math.ceil(text.length / 180);
  const ambiguityPenalty = input.expectedBehavior ? 0 : 2;

  const estimatedMinutes = Math.max(
    5,
    5 + largeSignals * 5 + lengthSignal * 2 + ambiguityPenalty - smallSignals * 2
  );

  const shouldDefer = estimatedMinutes > 10;
  const size = shouldDefer ? (estimatedMinutes >= 25 ? "large" : "medium") : "small";
  const confidence = text.length < 20 ? "low" : largeSignals > 0 ? "medium" : "medium";

  const reasons = [];
  if (largeSignals) reasons.push(`偵測到 ${largeSignals} 個可能超過 10 分鐘的工程訊號`);
  if (smallSignals) reasons.push(`偵測到 ${smallSignals} 個偏小型修改訊號`);
  if (ambiguityPenalty) reasons.push("缺少明確 expectedBehavior，估算保守上調");
  if (!reasons.length) reasons.push("需求描述看起來可先以小型工具變更評估");

  return {
    estimatedMinutes,
    thresholdMinutes: 10,
    shouldDefer,
    size,
    confidence,
    reasons,
  };
}
