/**
 * 統一呼叫 Responses API，並記錄每次成功回應的 token usage。
 * purpose 用來區分一般聊天、OCR、摘要等流量來源，方便在 Cloud Run logs 彙整。
 */
export async function createResponseWithUsage(client, params, { purpose = "unknown" } = {}) {
  const startedAt = Date.now();
  const response = await client.responses.create(params);

  const usage = response?.usage || {};
  // Cloud Run 會將單行 JSON 解析為 jsonPayload，方便直接篩選欄位及建立 metrics。
  console.log(JSON.stringify({
    severity: "INFO",
    message: "OpenAI Responses API usage",
    event: "openai_responses_usage",
    purpose,
    response_id: response?.id || null,
    model: response?.model || params?.model || null,
    status: response?.status || null,
    duration_ms: Date.now() - startedAt,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    usage,
  }));

  return response;
}
