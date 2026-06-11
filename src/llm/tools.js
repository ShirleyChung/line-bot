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
    description: "建立提醒事項。可建立一般提醒，也可建立每日排程提醒天氣、單一股價、期貨行情、自選股股價、今日連結、arXiv 最新論文摘要、CNN 頭條新聞、指定關鍵字的最新新聞、每日經節。",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "提醒對象或主題。天氣提醒填城市，例如「臺北市」；股價提醒填股票代碼；期貨提醒可填「大台指」這類商品名稱；今日連結可填「今日連結」；經節提醒可填「聖經」。",
        },
        action: {
          type: "string",
          description: "提醒文字或查詢目標。股價提醒填股票代碼；期貨提醒可填「大台指行情」；今日連結填「今日連結」；經節提醒可填「隨機聖經經節」。",
        },
        time: {
          type: "string",
          description: "ISO 8601 格式，例如 2026-05-01T06:00:00+08:00。+08:00 是 Asia/Taipei 當地時間，不要先轉成 UTC 再寫回 +08:00；若 recurrence 是 daily 且今天該時刻已過，請填下一次會發生的日期時間。",
        },
        recurrence: {
          type: "string",
          enum: ["none", "daily"],
          description: "none 表示一次性提醒；daily 表示每天同一時間重複提醒。",
        },
        reminderType: {
          type: "string",
          enum: ["generic", "weather", "stock", "futures", "watch_prices", "today_link", "arxiv_papers", "cnn_news", "top_headlines", "general_news", "bible_verse", "bible_outline"],
          description: "提醒內容類型。天氣用 weather；單一股票用 stock；台股期貨/大台小台等行情用 futures；使用者自選股用 watch_prices；每日課程連結用 today_link；最新 arXiv 論文摘要用 arxiv_papers；CNN 頭條新聞用 cnn_news；未指定來源的綜合頭條/今日頭條/重點新聞（不需關鍵字）用 top_headlines；指定關鍵字（公司/產業/人物/事件）的最新新聞用 general_news；每日隨機經節用 bible_verse；依綱目循序讀某書卷用 bible_outline（需同時填 bibleBookName）；一般文字用 generic。",
        },
        city: {
          type: "string",
          description: "天氣提醒的台灣縣市。非天氣提醒請填空字串。",
        },
        symbol: {
          type: "string",
          description: "股價提醒的股票代碼，例如 2330、NVDA。非股價提醒請填空字串。",
        },
        commodity: {
          type: "string",
          description: "期貨提醒的商品名稱或代碼，例如 大台指、台指期、TXF、小台、TXFF6。非期貨提醒請填空字串。",
        },
        contract: {
          type: "string",
          description: "期貨提醒的契約月份，可填 近月、次月、YYYYMM，或留空讓系統用預設契約。非期貨提醒請填空字串。",
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
        headlineCount: {
          type: "number",
          description: "CNN 頭條（cnn_news）或綜合頭條（top_headlines）要回傳的則數，建議 1 到 10；cnn_news 未指定時填 3，top_headlines 未指定時填 5。非頭條提醒填 0。",
        },
        newsQuery: {
          type: "string",
          description: "general_news 提醒的新聞搜尋關鍵字，例如：台積電、聯發科、AI 伺服器、美元匯率。非新聞提醒請填空字串。",
        },
        newsCount: {
          type: "number",
          description: "general_news 提醒要回傳的新聞則數，建議 1 到 10；未指定時填 5。非新聞提醒填 0。",
        },
        bibleBookName: {
          type: "string",
          description: "bible_outline 提醒的聖經書卷名稱，例如「加拉太書」、「詩篇」、「約翰福音」。非 bible_outline 提醒請填空字串。",
        },
      },
      required: ["target", "action", "time", "recurrence", "reminderType", "city", "symbol", "commodity", "contract", "weatherTarget", "paperCount", "headlineCount", "newsQuery", "newsCount", "bibleBookName"],
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
    name: "get_cnn_top_headlines",
    description: "抓取 CNN Top Stories 頭條新聞，並直接根據頭條連結產生繁體中文摘要。",
    parameters: {
      type: "object",
      properties: {
        max: {
          type: "number",
          description: "最多回傳幾則頭條，範圍 1 到 10；未指定時預設 3。",
        },
      },
      required: ["max"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "summarize_article_url",
    description: "抓取指定超連結所指向的文章或網頁內容，並以繁體中文摘要回覆。",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "要摘要的 http 或 https 網址。",
        },
      },
      required: ["url"],
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
    description: "查詢單一股票的最近收盤或即時資訊，並附基本資料（EPS、殖利率、本益比等），不需要加入自選股。支援台股股票/ETF（例如 2330、2454、00981A）與美股（例如 NVDA、QCOM、AAPL）。期貨請改用 get_futures_price。",
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
    name: "get_etf_constituents",
    description: "查詢台股 ETF（含主動式 ETF，例如 00981A、00982A、0050、00878）的前十大成分股與權重。非 ETF（如 2330、2454 等個股）會直接回覆「不是ETF」。",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "台股 ETF 代碼，例如 00981A、00982A、0050、00878。"
        }
      },
      required: ["symbol"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "get_futures_price",
    description: "查詢台股期貨報價（含夜盤），會自動回傳最近一段交易資料。支援大台指期(TX)、小型台指(MTX)、微型台指(TMF)、電子期(TE)、金融期(TF)、非金電(XIF)、櫃買期(GTF)。",
    parameters: {
      type: "object",
      properties: {
        commodity: {
          type: "string",
          description: "商品名稱或代碼。可填中文（台指期、小台、微台、電子期、金融期、非金電、櫃買期），或 TAIFEX 代碼（TXF、MXF、TMF、TE、TF），也可直接填完整契約代碼（TXFF6、TXF202606、WTXM6 等）。"
        },
        contract: {
          type: "string",
          description: "（選填）契約月份。可填「近月」、「次月」、YYYYMM（如 202606）、YYMM（如 2606），或月份字母+年末碼（如 M6）。若 commodity 已包含完整契約代碼則省略，未指定時預設近月。"
        }
      },
      required: ["commodity"],
      additionalProperties: false
    },
    strict: false
  },
  {
    type: "function",
    name: "web_search",
    description: "使用網路搜尋查詢一般性資料。適合查詢百科知識、定義、教學、官方資訊、人物資料、產品規格、近期事件等。回傳搜尋結果（標題、摘要、網址），請依此整理回覆。新聞請改用 searchNews；摘要使用者貼的網址請改用 summarize_article_url。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜尋關鍵字，盡量用精準的詞組。例如：『黃仁勳 維基』、『Next.js 15 release notes』、『台北市垃圾車路線』。",
        },
        count: {
          type: "number",
          description: "想取得的結果筆數，1-10，預設 5。",
        },
        freshness: {
          type: "string",
          enum: ["pd", "pw", "pm", "py", ""],
          description: "時效篩選：pd=過去一天、pw=一週、pm=一個月、py=一年；不限時請傳空字串。",
        },
        country: {
          type: "string",
          description: "地區代碼，預設 tw。例如 us、jp、hk。",
        },
        lang: {
          type: "string",
          description: "語系，預設 zh-hant。其他例如 en、ja。",
        },
      },
      required: ["query", "count", "freshness", "country", "lang"],
      additionalProperties: false,
    },
    strict: true,
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
    name: "get_random_bible_verse",
    description: "隨機挑選一節恢復本聖經經文，適合回答「今天經節」「今日經文」「來一節聖經」等請求。",
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
          type: ["number", "null"],
          description: "關鍵字搜尋最多回傳幾筆，建議 3 到 8；不指定時傳 null。",
        },
      },
      required: ["query", "maxResults"],
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
          type: ["string", "null"],
          description: "經節或關鍵字；若要承接上一輪可傳 null。",
        },
        maxResults: {
          type: ["number", "null"],
          description: "最多回傳幾筆註解，建議 1 到 6；不指定時傳 null。",
        },
      },
      required: ["query", "maxResults"],
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
          type: ["string", "null"],
          description: "經節或查詢句子，例如：士 15:18 生命讀經；可傳 null 沿用上一輪。",
        },
        keyword: {
          type: ["string", "null"],
          description: "額外關鍵字，例如：參孫、拿細耳人；不指定時傳 null。",
        },
      },
      required: ["query", "keyword"],
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
  {
    type: "function",
    name: "get_house_price",
    description: "查詢內政部實價登錄的房價，回傳指定縣市/鄉鎮市區（可再指定路名）在一段時間內的平均單價、最新成交價與一年內最高成交價。適合回答「查某地房價」「某路平均房價」「某區近半個月/近一年房價」。找不到指定範圍的資料時，會自動回退到最近一筆成交。",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "縣市，例如：台北市、新北市、台中市、高雄市。必填。",
        },
        district: {
          type: "string",
          description: "鄉鎮市區，例如：大安區、淡水區、北屯區。必填。",
        },
        road: {
          type: "string",
          description: "路/街名，可精細到門牌號，例如：紅樹林路、忠孝東路四段、紅樹林路169號。只查整個行政區時填空字串。",
        },
        rangeMonths: {
          type: "number",
          description: "平均房價的時間範圍，往前幾個月。一般填 12（近一年）；近半個月填 0.5；近一個月填 1；近三個月填 3。",
        },
      },
      required: ["city", "district", "road", "rangeMonths"],
      additionalProperties: false,
    },
    strict: true,
  },
];
