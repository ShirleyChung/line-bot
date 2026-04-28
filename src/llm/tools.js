/**
 * 提供給 OpenAI Responses API 的 tools 定義
 *
 * 這裡只描述：
 * - 工具名稱
 * - 工具用途
 * - 參數格式
 *
 * 真正執行邏輯不放在這裡。
 */

export const botTools = [
  {
    type: "function",
    name: "get_today_link",
    description: "查詢今天對應的聚會連結文字，不直接發送訊息。",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "reply_today_link",
    description: "在目前 LINE webhook 對話中，直接回覆今天連結給當前使用者。",
    parameters: {
      type: "object",
      properties: {
        includeZoomInfo: {
          type: "boolean",
          description: "是否在回覆內容中附上 Zoom 資訊",
        },
      },
      required: ["includeZoomInfo"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "push_today_link",
    description: "主動把今天連結推送到指定的 LINE userId、groupId 或 roomId。",
    parameters: {
      type: "object",
      properties: {
        targetId: {
          type: "string",
          description: "LINE userId、groupId 或 roomId",
        },
        includeZoomInfo: {
          type: "boolean",
          description: "是否附上 Zoom 資訊",
        },
      },
      required: ["targetId"],
      additionalProperties: false,
    },
    strict: true,
  },
];