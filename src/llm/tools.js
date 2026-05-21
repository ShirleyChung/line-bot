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
    description: "建立提醒事項。可建立一般提醒，也可建立每日排程提醒天氣、單一股價、自選股股價、今日連結、arXiv 最新論文摘要。",
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
          enum: ["generic", "weather", "stock", "watch_prices", "today_link", "arxiv_papers"],
          description: "提醒內容類型。天氣用 weather；單一股票用 stock；使用者自選股用 watch_prices；每日課程連結用 today_link；最新 arXiv 論文摘要用 arxiv_papers；一般文字用 generic。",
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
        paperCount: {
          type: "number",
          description: "arXiv 論文摘要要挑選的篇數，建議 5 到 8；非論文提醒填 0。",
        },
      },
      required: ["target", "action", "time", "recurrence", "reminderType", "city", "symbol", "weatherTarget", "paperCount"],
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
          type: ["string", "null"],
          description: "提醒的 id，若提供則直接刪除該筆",
        },
        target: {
          type: ["string", "null"],
          description: "提醒對象，例如「媽媽」、「自己」",
        },
        action: {
          type: ["string", "null"],
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
    description: "從最近上傳的一批圖片中逐張擷取文字與結構化資料。",
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
    name: "get_latest_arxiv_papers",
    description: "抓取最新計算機科學與工程相關 arXiv 論文，篩選最值得看的 5 到 8 篇，並產生繁體中文短摘要。",
    parameters: {
      type: "object",
      properties: {
        max: {
          type: "number",
          description: "要挑選幾篇論文，範圍 5 到 8；未指定時填 6。",
        },
      },
      required: ["max"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "find_nearby_parking",
    description: "查詢某個地點附近的停車場，回傳停車場名稱、地址、距離與 Google Maps 連結。適合回答「某地附近是否有停車場」「好不好停車」「附近哪裡可以停車」。",
    parameters: {
      type: "object",
      properties: {
        locationQuery: {
          type: "string",
          description: "要查詢的地點名稱或地址，例如：台北101、信義威秀、台中火車站。",
        },
        radiusMeters: {
          type: "number",
          description: "查詢半徑，單位公尺。一般附近停車場填 1000。",
        },
        limit: {
          type: "number",
          description: "最多回傳幾個停車場。一般填 5。",
        },
      },
      required: ["locationQuery", "radiusMeters", "limit"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "find_nearby_facilities",
    description: "查詢某個地點附近的任意設施或店家類型，回傳名稱、地址、距離、評分與 Google Maps 連結。適合回答「[地點]附近有什麼[設施]」「[地點]附近的[設施]」「找[地點]附近的[設施]」。停車場也可使用，但停車場專問可沿用 find_nearby_parking。",
    parameters: {
      type: "object",
      properties: {
        locationQuery: {
          type: "string",
          description: "要查詢的地點名稱或地址，例如：淡江大橋、台北101、台中火車站。",
        },
        facilityQuery: {
          type: "string",
          description: "要查詢的設施、店家或地點類型，例如：餐廳、咖啡廳、便利商店、加油站、景點、藥局。",
        },
        radiusMeters: {
          type: "number",
          description: "查詢半徑，單位公尺。一般附近設施填 1000。",
        },
        limit: {
          type: "number",
          description: "最多回傳幾個結果。一般填 5。",
        },
      },
      required: ["locationQuery", "facilityQuery", "radiusMeters", "limit"],
      additionalProperties: false,
    },
    strict: true,
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
    "description": "查詢台灣縣市或鄉鎮市區的天氣。適合回答使用者詢問天氣、溫度、降雨機率、會不會下雨等問題。支援淡水、板橋、羅東、埔里等細地點；若使用者未提供地點，可留空 city，系統會嘗試使用使用者的預設天氣地點。",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string",
          "description": "台灣縣市或鄉鎮市區名稱，例如：台北、新北、淡水、板橋、羅東、埔里。若使用者沒有提供地點，可省略。"
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
      "required": ["city"],
    }
  },
  {
    "type": "function",
    "name": "set_default_weather_city",
    "description": "設定使用者的預設天氣地點。當使用者說「設定天氣地點 淡水」、「以後幫我查板橋天氣」時使用。",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string",
          "description": "台灣縣市或鄉鎮市區名稱，例如：台北、新北、淡水、板橋、羅東、埔里。"
        },
        "userId": {
          "type": "string",
          "description": "LINE 使用者 ID。"
        }
      },
      "required": [],
    }
  },
  {
    type: "function",
    name: "get_recovery_bible_verses",
    description: "查詢恢復本聖經經文。支援經節格式（例如：創 1:1、約 3:16-18）或關鍵字搜尋（例如：參孫）。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "經節或關鍵字，例如：創 1:1、約 3:16-18、參孫。",
        },
        maxResults: {
          type: "number",
          description: "關鍵字搜尋最多回傳幾筆，建議 3 到 8。",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_recovery_bible_notes",
    description: "查詢恢復本聖經註解。可查指定經節（例如：創 1:1）或關鍵字，也可留空沿用上一個聖經查詢。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "經節或關鍵字；若要承接上一輪可留空。",
        },
        maxResults: {
          type: "number",
          description: "最多回傳幾筆註解，建議 1 到 6。",
        },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_life_study_excerpt",
    description: "從水流職事站查詢生命讀經，依章節或關鍵字擷取最接近的一段內容。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "經節或查詢句子，例如：士 15:18 生命讀經；可留空沿用上一輪。",
        },
        keyword: {
          type: "string",
          description: "額外關鍵字，例如：參孫、拿細耳人。",
        },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_route_info",
    description: "查詢從 A 到 B 的路線資訊，包含預估時間、距離、建議路線。適合回答「從A到B要多久」「從A到B多遠」「怎麼去」等問題。",
    parameters: {
      type: "object",
      properties: {
        originQuery: {
          type: "string",
          description: "出發地名稱或地址，例如：台北101、信義威秀、台中火車站。",
        },
        destinationQuery: {
          type: "string",
          description: "目的地名稱或地址，例如：淡江大橋、板橋火車站。",
        },
        mode: {
          type: "string",
          enum: ["driving", "walking", "transit", "bicycling"],
          description: "交通方式。driving=開車（預設），walking=步行，transit=大眾運輸，bicycling=騎自行車。",
        },
      },
      required: ["originQuery", "destinationQuery", "mode"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "find_landmarks_along_route",
    description: "查詢從 A 到 B 的路線沿途會經過什麼地標或景點。適合回答「從A到B會經過什麼地標」「沿途有什麼景點」等問題。",
    parameters: {
      type: "object",
      properties: {
        originQuery: {
          type: "string",
          description: "出發地名稱或地址，例如：台北101、信義威秀。",
        },
        destinationQuery: {
          type: "string",
          description: "目的地名稱或地址，例如：淡水老街、板橋火車站。",
        },
        mode: {
          type: "string",
          enum: ["driving", "walking", "transit", "bicycling"],
          description: "交通方式。driving=開車（預設），walking=步行，transit=大眾運輸，bicycling=騎自行車。",
        },
        limit: {
          type: "number",
          description: "最多回傳幾個地標，一般填 5。",
        },
      },
      required: ["originQuery", "destinationQuery", "mode", "limit"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "find_facilities_along_route",
    description: "查詢從 A 到 B 的路線沿途是否有特定設施（例如加油站、便利商店、休息站等）。適合回答「從A到B會經過加油站嗎」「沿途有便利商店嗎」等問題。",
    parameters: {
      type: "object",
      properties: {
        originQuery: {
          type: "string",
          description: "出發地名稱或地址，例如：台北、桃園機場。",
        },
        destinationQuery: {
          type: "string",
          description: "目的地名稱或地址，例如：台中、高雄。",
        },
        facilityQuery: {
          type: "string",
          description: "要查詢的設施類型，例如：加油站、便利商店、休息站、餐廳、咖啡廳。",
        },
        mode: {
          type: "string",
          enum: ["driving", "walking", "transit", "bicycling"],
          description: "交通方式。driving=開車（預設），walking=步行，transit=大眾運輸，bicycling=騎自行車。",
        },
        limit: {
          type: "number",
          description: "最多回傳幾個設施，一般填 5。",
        },
      },
      required: ["originQuery", "destinationQuery", "facilityQuery", "mode", "limit"],
      additionalProperties: false,
    },
    strict: true,
  },
];
