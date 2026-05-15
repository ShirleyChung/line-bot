import { replyText } from "../platform/reply.js";
import { findNearbyParking, formatDistance } from "../services/placesService.js";

const PARKING_WORDS = /(停車場|停車位|停車|parking)/i;
const NEARBY_WORDS = /(附近|旁邊|周邊|一帶|附近有沒有|附近是否有|near|around)/i;

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
    .replace(/^(請問|幫我|幫忙|查詢|查|找|搜尋|一下|我想知道)+/g, "")
    .replace(/(附近|旁邊|周邊|一帶|的)$/g, "")
    .trim();
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

