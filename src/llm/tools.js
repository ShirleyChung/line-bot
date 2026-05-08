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
    description: "建立提醒事項。可建立一般提醒，也可建立每日排程提醒天氣、單一股價、自選股股價、今日連結。",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "提醒對象或主題。天氣提醒填城市，例如「臺北市」；股價提醒填股票代碼；今日連結可填「今日連結」。",
        },
        action: {
          type: "string",
          description: "提醒文字或查詢目標。股價提醒填股票代碼；今日連結填「今日連結」。",
        },
        time: {
          type: "string",
          description: "ISO 8601 格式，例如 2026-05-01T06:00:00+08:00",
        },
        recurrence: {
          type: "string",
          enum: ["none", "daily"],
          description: "none 表示一次性提醒；daily 表示每天同一時間重複提醒。",
        },
        reminderType: {
          type: "string",
          enum: ["generic", "weather", "stock", "watch_prices", "today_link"],
          description: "提醒內容類型。天氣用 weather；單一股票用 stock；使用者自選股用 watch_prices；每日課程連結用 today_link；一般文字用 generic。",
        },
        city: {
          type: "string",
          description: "天氣提醒的台灣縣市。非天氣提醒請填空字串。",
        },
        symbol: {
          type: "string",
          description: "股價提醒的股票代碼，例如 2330、NVDA。非股價提醒請填空字串。",
        },
        weatherTarget: {
          type: "string",
          enum: ["now", "tomorrow", ""],
          description: "天氣查詢時段。通常每日早上提醒用 now；非天氣提醒填空字串。",
        },
      },
      required: ["target", "action", "time", "recurrence", "reminderType", "city", "symbol", "weatherTarget"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_reminders",
    description: "列出使用者目前的所有提醒事項",
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
    name: "delete_reminder",
    description: "刪除提醒事項。可以指定 id 刪除特定提醒，或用 target/action 刪除符合條件的提醒",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "提醒的 id，若提供則直接刪除該筆",
        },
        target: {
          type: "string",
          description: "提醒對象，例如「媽媽」、「自己」",
        },
        action: {
          type: "string",
          description: "提醒動作，例如「吃藥」、「開會」",
        },
      },
      required: ["id", "target", "action"],
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
    description: "將股票代碼加入使用者的自選股清單。支援台股（例如 2330, 2454, 006208）與美股（例如 NVDA, QCOM, AAPL）",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "股票代碼，台股例如 2330, 2454, 006208；美股例如 NVDA, QCOM, AAPL"
        }
      },
      required: ["symbol"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "remove_watch_stock",
    description: "從使用者的自選股清單移除指定股票代碼。支援台股與美股",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "股票代碼，台股例如 2330；美股例如 NVDA"
        }
      },
      required: ["symbol"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "list_watch_stocks",
    description: "列出使用者目前儲存的自選股清單（包含台股與美股）",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_watch_prices",
    description: "查詢使用者自選股的目前或最近股價與基本資料（EPS、殖利率、本益比等；包含台股與美股）",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
  type: "function",
    name: "get_stock_price",
    description: "查詢單一股票的最近收盤或即時資訊，並附基本資料（EPS、殖利率、本益比等），不需要加入自選股。支援台股股票/ETF（例如 2330、2454、00981A）與美股（例如 NVDA、QCOM、AAPL）。",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "股票代碼，台股例如 2330、2454、2887、00981A；美股例如 NVDA、QCOM、AAPL。"
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
  {
    "type": "function",
    "name": "get_weather",
    "description": "查詢台灣縣市的今明 36 小時天氣。適合回答使用者詢問天氣、溫度、降雨機率、會不會下雨等問題。若使用者未提供城市，可留空 city，系統會嘗試使用使用者的預設天氣地點。",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string",
          "description": "台灣縣市名稱，例如：台北、新北、桃園、新竹、台中、台南、高雄。若使用者沒有提供地點，可省略。"
        },
        "target": {
          "type": "string",
          "enum": ["now", "tomorrow", "later"],
          "description": "查詢時間。now 表示最近時段，tomorrow 表示下一個預報時段，later 表示更後面的預報時段。"
        },
        "userId": {
          "type": "string",
          "description": "LINE 使用者 ID，用於讀取使用者預設天氣地點。"
        }
      },
      "required": [],
    }
  },
  {
    "type": "function",
    "name": "set_default_weather_city",
    "description": "設定使用者的預設天氣地點。當使用者說「設定天氣地點 新北」、「以後幫我查台中天氣」時使用。",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string",
          "description": "台灣縣市名稱，例如：台北、新北、桃園、台中、高雄。"
        },
        "userId": {
          "type": "string",
          "description": "LINE 使用者 ID。"
        }
      },
      "required": [],
    }
  },
];
