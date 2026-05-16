import { replyText } from "../platform/reply.js";
import {
  findNearbyFacilities,
  findNearbyParking,
  formatDistance,
} from "../services/placesService.js";

const PARKING_WORDS = /(停車場|停車位|停車|parking)/i;
const NEARBY_WORDS = /(附近|旁邊|周邊|一帶|附近有沒有|附近是否有|near|around)/i;
const QUERY_PREFIX = /^(請問|幫我|幫忙|查詢|查|找|搜尋|我想知道|想知道|一下)+/;

export function isParkingIntent(text) {
  const value = String(text || "").trim();
  return PARKING_WORDS.test(value) && NEARBY_WORDS.test(value);
}

export function parseParkingLocation(text) {
  const value = String(text || "")
    .trim()
    .replace(/[？?！!。,.，]/g, " ")
    .replace(/\s+/g, " ");

  const patterns = [
    /(?:請問|幫我|幫忙|查詢|查|找|搜尋)?\s*(.+?)\s*(?:附近|旁邊|周邊|一帶).*?(?:停車場|停車位|停車|parking)/i,
    /(?:停車場|停車位|停車|parking).*?(?:在|靠近|近|near|around)\s*(.+)$/i,
    /(.+?)\s*(?:有沒有|是否有|有|有嗎).*?(?:停車場|停車位|停車|parking)/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const location = cleanupLocation(match?.[1]);
    if (location) return location;
  }

  return "";
}

function cleanupLocation(location) {
  return String(location || "")
    .replace(QUERY_PREFIX, "")
    .replace(/(附近|旁邊|周邊|一帶|的)$/g, "")
    .trim();
}

function cleanupFacility(facility) {
  return String(facility || "")
    .replace(/[？?！!。,.，]/g, " ")
    .replace(/^(有什麼|有哪些|有沒有|是否有|哪裡有|的|可以|可)?/g, "")
    .replace(/(嗎|呢|推薦|可以推薦|可以嗎|有哪些|有什麼)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNearbyFacilityIntent(text) {
  const value = String(text || "").trim();
  return NEARBY_WORDS.test(value) && Boolean(parseNearbyFacilityQuery(value));
}

export function parseNearbyFacilityQuery(text) {
  const value = String(text || "")
    .trim()
    .replace(/[？?！!。,.，]/g, " ")
    .replace(/\s+/g, " ");

  const patterns = [
    /(?:請問|幫我|幫忙|查詢|查|找|搜尋|我想知道|想知道)?\s*(.+?)\s*(?:附近|旁邊|周邊|一帶)\s*(?:有什麼|有哪些|有沒有|是否有|哪裡有)?\s*(.+)$/i,
    /(?:請問|幫我|幫忙|查詢|查|找|搜尋|我想知道|想知道)?\s*(.+?)\s*(?:附近|旁邊|周邊|一帶)\s*的\s*(.+)$/i,
    /(?:有什麼|有哪些|找|搜尋|查詢|查)\s*(.+?)\s*(?:在|靠近|近|near|around)\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const first = cleanupLocation(match[1]);
    const second = cleanupFacility(match[2]);

    if (pattern === patterns[2]) {
      const facility = cleanupFacility(match[1]);
      const location = cleanupLocation(match[2]);
      if (location && facility) return { location, facility };
      continue;
    }

    if (first && second) return { location: first, facility: second };
  }

  return null;
}

export function formatParkingReply(locationQuery, result) {
  if (!result.ok) return result.message;

  if (!result.parkingLots.length) {
    return `「${locationQuery}」附近 ${result.radiusMeters} 公尺內查不到停車場。`;
  }

  const lines = [
    `「${locationQuery}」附近停車場：`,
    `定位：${result.origin.name}`,
    "",
  ];

  for (const [index, place] of result.parkingLots.entries()) {
    lines.push(
      `${index + 1}. ${place.name}`,
      `地址：${place.address}`,
      `距離：約 ${formatDistance(place.distanceMeters)}`
    );

    if (place.googleMapsUri) {
      lines.push(`地圖：${place.googleMapsUri}`);
    }

    if (index !== result.parkingLots.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function formatNearbyFacilityReply(locationQuery, facilityQuery, result) {
  if (!result.ok) return result.message;

  if (!result.facilities.length) {
    return `「${locationQuery}」附近 ${result.radiusMeters} 公尺內查不到${facilityQuery}。`;
  }

  const lines = [
    `「${locationQuery}」附近${facilityQuery}：`,
    `定位：${result.origin.name}`,
    "",
  ];

  for (const [index, place] of result.facilities.entries()) {
    lines.push(
      `${index + 1}. ${place.name}`,
      `地址：${place.address}`,
      `距離：約 ${formatDistance(place.distanceMeters)}`
    );

    if (place.rating) {
      const count = place.userRatingCount ? `（${place.userRatingCount} 則）` : "";
      lines.push(`評分：${place.rating}${count}`);
    }

    if (place.googleMapsUri) {
      lines.push(`地圖：${place.googleMapsUri}`);
    }

    if (index !== result.facilities.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function handleNearbyFacilityMessage(event, text) {
  const query = parseNearbyFacilityQuery(text);
  if (!query) return false;

  try {
    if (PARKING_WORDS.test(query.facility)) {
      const result = await findNearbyParking(query.location);
      await replyText(event, formatParkingReply(query.location, result));
      return true;
    }

    const result = await findNearbyFacilities(query.location, query.facility);
    await replyText(event, formatNearbyFacilityReply(query.location, query.facility, result));
  } catch (error) {
    console.error("handleNearbyFacilityMessage error:", error);
    await replyText(event, `附近設施查詢失敗：${error.message}`);
  }

  return true;
}

export async function handleParkingMessage(event, text) {
  if (!isParkingIntent(text)) return false;

  const location = parseParkingLocation(text);

  if (!location) {
    await replyText(event, "請提供要查詢的地點，例如：台北101附近有停車場嗎？");
    return true;
  }

  try {
    const result = await findNearbyParking(location);
    await replyText(event, formatParkingReply(location, result));
  } catch (error) {
    console.error("handleParkingMessage error:", error);
    await replyText(event, `停車場查詢失敗：${error.message}`);
  }

  return true;
}
