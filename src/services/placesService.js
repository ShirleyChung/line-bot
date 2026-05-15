import { env } from "../config/env.js";

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const DEFAULT_RADIUS_METERS = 1000;
const DEFAULT_LIMIT = 5;

function getGoogleMapsApiKey() {
  const apiKey = env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error("缺少 GOOGLE_MAPS_API_KEY 環境變數");
  }

  return apiKey;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Google Maps API failed: HTTP ${res.status}, body=${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Google Maps API 回傳內容不是 JSON：${text.slice(0, 300)}`);
  }
}

async function geocodePlace(query) {
  const apiKey = getGoogleMapsApiKey();
  const url = new URL(GEOCODING_URL);

  url.searchParams.set("address", query);
  url.searchParams.set("language", "zh-TW");
  url.searchParams.set("region", "tw");
  url.searchParams.set("key", apiKey);

  const json = await fetchJson(url);

  if (json.status !== "OK" || !json.results?.length) {
    return null;
  }

  const result = json.results[0];
  const location = result.geometry?.location;

  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) {
    return null;
  }

  return {
    name: result.formatted_address || query,
    lat: location.lat,
    lng: location.lng,
  };
}

async function searchNearbyParking({ lat, lng, radiusMeters, limit }) {
  const apiKey = getGoogleMapsApiKey();

  const json = await fetchJson(PLACES_NEARBY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.businessStatus",
        "places.googleMapsUri",
      ].join(","),
    },
    body: JSON.stringify({
      includedTypes: ["parking"],
      maxResultCount: limit,
      languageCode: "zh-TW",
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng,
          },
          radius: radiusMeters,
        },
      },
    }),
  });

  return json.places || [];
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

export async function findNearbyParking(locationQuery, options = {}) {
  const radiusMeters = options.radiusMeters || DEFAULT_RADIUS_METERS;
  const limit = options.limit || DEFAULT_LIMIT;
  const origin = await geocodePlace(locationQuery);

  if (!origin) {
    return {
      ok: false,
      reason: "location_not_found",
      message: `找不到「${locationQuery}」的位置，請提供更完整的地點或地址。`,
    };
  }

  const places = await searchNearbyParking({
    lat: origin.lat,
    lng: origin.lng,
    radiusMeters,
    limit,
  });

  const parkingLots = places
    .map((place) => {
      const placeLocation = place.location;
      const lat = placeLocation?.latitude;
      const lng = placeLocation?.longitude;
      const distance =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? distanceMeters(origin, { lat, lng })
          : null;

      return {
        name: place.displayName?.text || "未命名停車場",
        address: place.formattedAddress || "地址未提供",
        distanceMeters: distance,
        googleMapsUri: place.googleMapsUri || "",
        businessStatus: place.businessStatus || "",
      };
    })
    .filter((place) => place.businessStatus !== "CLOSED_PERMANENTLY")
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));

  return {
    ok: true,
    origin,
    radiusMeters,
    parkingLots,
  };
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "距離未知";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} 公里`;
  return `${Math.round(meters)} 公尺`;
}

