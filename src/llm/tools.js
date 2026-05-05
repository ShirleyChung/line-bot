/**
 * 提供給 OpenAI Responses API 的 tools 定義
 *
 * 這裡只描述：
 * - 工具名稱
 * - 工具功能
 * - 參數格式
 *
 * 工具的執行邏輯不在這裡。
 */

export const botTools = [
  {
    type: "function",
    name: "get_today_link",
    description: "查詢今日課程的上課會議連結網址，並將結果回傳確認。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "reply_today_link",
    description: "在當前 LINE webhook 回應中，直接回覆今日連結給使用者。",
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
    description: "主動推送今日連結給指定的 LINE userId、groupId 或 roomId。",
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
      required: ["targetId", "includeZoomInfo"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "create_reminder",
    description: "建立提醒事項，例如提醒某人在某時間做某事",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string" },
        action: { type: "string" },
        time: {
          type: "string",
          description: "ISO 8601 格式，例如 2026-05-01T06:00:00+08:00",
        },
      },
      required: ["target", "action", "time"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "extract_image_data",
    description: "從最近上傳的圖片中擷取文字與結構化資料。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "json_to_csv",
    description: "將表格資料依照指定欄位轉成 CSV。rows 每一列的順序要對應 fields。",
    parameters: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          description: "CSV 欄位名稱，例如 ['股票代碼', '名稱', '股價']",
          items: {
            type: "string"
          }
        },
        rows: {
          type: "array",
          description: "CSV 資料列。每一列是一個陣列，順序對應 fields。",
          items: {
            type: "array",
            items: {
              type: "string"
            }
          }
        }
      },
      required: ["fields", "rows"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "add_watch_stock",
    description: "將股票代碼加入使用者的自選股清單",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "台股股票代碼，例如 2330, 2454, 006208"
        }
      },
      required: ["symbol"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "remove_watch_stock",
    description: "從使用者的自選股清單移除指定股票代碼",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "台股股票代碼，例如 2330"
        }
      },
      required: ["symbol"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "list_watch_stocks",
    description: "列出使用者目前儲存的自選股清單",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_watch_prices",
    description: "查詢使用者自選股的目前或最近股價",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
  type: "function",
    name: "get_stock_price",
    description: "查詢單一台股股票或 ETF 的最近收盤資訊，不需要加入自選股。",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "台股股票代碼或 ETF 代碼，例如 2330、2454、2887、00981A。"
        }
      },
      required: ["symbol"],
      additionalProperties: false
      },
    strict: true
  },
  {
    type: "function",
    name: "searchNews",
    description: "查詢最新新聞。適合使用者詢問某公司、股票、產業、人物或事件的最新消息。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "新聞搜尋關鍵字，例如：聯發科、台積電、AI伺服器、美元匯率",
        },
        lang: {
          type: "string",
          description: "語言，例如 zh 或 en",
          default: "zh",
        },
        country: {
          type: "string",
          description: "國家/地區，例如 tw、us",
          default: "tw",
        },
        max: {
          type: "number",
          description: "最多回傳幾則新聞",
          default: 5,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];