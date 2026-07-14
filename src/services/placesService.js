import { env } from "../config/env.js";

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const AMAP_GEOCODING_URL = "https://restapi.amap.com/v3/geocode/geo";
const AMAP_PLACE_AROUND_URL = "https://restapi.amap.com/v3/place/around";
const DEFAULT_RADIUS_METERS = 1000;
const DEFAULT_LIMIT = 5;
const LODGING_RADIUS_METERS = 2000;
const DEFAULT_ROUTE_SEARCH_RADIUS = 2000;
const ROUTE_SAMPLE_POINTS = 10;
const LODGING_WORDS = /(住宿|飯店|酒店|旅館|旅店|旅社|民宿|hotel|lodging)/i;
const PRIVATE_PARKING_WORDS = /(私人|私有|住戶|住客|住戶專用|社區|大樓|月租|長租|員工|會員|特約|專用|reserved|private|residents?|monthly)/i;
const FLAT_PARKING_WORDS = /(平面|露天|戶外|地面|surface|open[- ]?air)/i;

function getGoogleMapsApiKey() {
  const apiKey = env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error("缺少 GOOGLE_MAPS_API_KEY 環境變數");
  }

  return apiKey;
}

function getAmapApiKey() {
  const apiKey = env.AMAP_API_KEY;

  if (!apiKey) {
    throw new Error("大陸地區地點查詢需要設定 AMAP_API_KEY 環境變數");
  }

  return apiKey;
}

function hasAmapApiKey() {
  return Boolean(env.AMAP_API_KEY);
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

async function fetchAmapJson(url) {
  const json = await fetchJson(url);

  if (json.status !== "1") {
    throw new Error(`高德地圖 API 查詢失敗：${json.info || "未知錯誤"}`);
  }

  return json;
}

function parseAmapLocation(location) {
  const [lngText, latText] = String(location || "").split(",");
  const lng = Number(lngText);
  const lat = Number(latText);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function normalizeAmapText(value) {
  return String(value || "")
    .replace(/臺/g, "台")
    .replace(/體/g, "体")
    .replace(/館/g, "馆")
    .replace(/場/g, "场")
    .replace(/園/g, "园")
    .replace(/區/g, "区")
    .replace(/縣/g, "县")
    .replace(/鄉/g, "乡")
    .replace(/鎮/g, "镇")
    .replace(/廣/g, "广")
    .replace(/連/g, "连")
    .replace(/陽/g, "阳")
    .replace(/飯店/g, "酒店")
    .replace(/旅館/g, "旅馆")
    .replace(/餐廳/g, "餐厅")
    .replace(/停車/g, "停车")
    .trim();
}

function buildAmapMarkerUri(place) {
  if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lng)) return "";
  const position = `${place.lng},${place.lat}`;
  const name = encodeURIComponent(place.name || "地點");
  return `https://uri.amap.com/marker?position=${position}&name=${name}`;
}

function buildAmapFacilityKeyword(facility) {
  const text = normalizeAmapText(facility);

  if (/(住宿|酒店|宾馆|旅馆|旅店|旅社|民宿|hotel|lodging)/i.test(text)) return "酒店";
  if (/(停车场|停车位|停车|parking)/i.test(text)) return "停车场";

  return text;
}

function isMainlandChinaGoogleResult(result) {
  const components = result?.address_components || [];
  const country = components.find((component) => component.types?.includes("country"));
  const countryCode = country?.short_name || "";

  if (countryCode !== "CN") return false;

  const formatted = result?.formatted_address || "";
  const adminText = components
    .map((component) => component.long_name || component.short_name || "")
    .join(" ");

  return !/(香港|Hong Kong|澳門|澳门|Macau|臺灣|台灣|Taiwan)/i.test(
    `${formatted} ${adminText}`
  );
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
    provider: "google",
    isMainlandChina: isMainlandChinaGoogleResult(result),
  };
}

async function geocodeAmapPlace(query) {
  const apiKey = getAmapApiKey();
  const url = new URL(AMAP_GEOCODING_URL);

  url.searchParams.set("address", normalizeAmapText(query));
  url.searchParams.set("key", apiKey);

  const json = await fetchAmapJson(url);
  const geocode = json.geocodes?.[0];
  const location = parseAmapLocation(geocode?.location);

  if (!location) {
    return null;
  }

  return {
    name: geocode.formatted_address || query,
    lat: location.lat,
    lng: location.lng,
    provider: "amap",
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

async function searchNearbyParkingByText({ locationQuery, lat, lng, radiusMeters, limit }) {
  const apiKey = getGoogleMapsApiKey();

  const json = await fetchJson(PLACES_TEXT_SEARCH_URL, {
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
      textQuery: `${locationQuery} 附近 平面停車場 公共停車場`,
      maxResultCount: limit,
      languageCode: "zh-TW",
      regionCode: "TW",
      locationBias: {
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

async function searchNearbyByText({ locationQuery, facilityQuery, lat, lng, radiusMeters, limit }) {
  const apiKey = getGoogleMapsApiKey();

  const json = await fetchJson(PLACES_TEXT_SEARCH_URL, {
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
        "places.rating",
        "places.userRatingCount",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `${locationQuery} 附近 ${facilityQuery}`,
      maxResultCount: limit,
      languageCode: "zh-TW",
      regionCode: "TW",
      locationBias: {
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

function isLodgingFacilityQuery(facilityQuery) {
  return LODGING_WORDS.test(String(facilityQuery || ""));
}

function isProbablyPrivateParking(place) {
  const text = `${place.name || ""} ${place.address || ""}`;
  return PRIVATE_PARKING_WORDS.test(text);
}

function parkingPreferenceScore(place) {
  if (isProbablyPrivateParking(place)) return 2;
  if (FLAT_PARKING_WORDS.test(`${place.name || ""} ${place.address || ""}`)) return 0;
  return 1;
}

function normalizeParkingPlaces(places, origin, radiusMeters, limit) {
  return places
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
        mapProvider: "google",
        mapUri: place.googleMapsUri || "",
        googleMapsUri: place.googleMapsUri || "",
        businessStatus: place.businessStatus || "",
      };
    })
    .filter((place) => place.businessStatus !== "CLOSED_PERMANENTLY")
    .filter((place) => {
      const distance = place.distanceMeters ?? Infinity;
      return distance <= radiusMeters && !isProbablyPrivateParking(place);
    })
    .sort((a, b) => {
      const preferenceDiff = parkingPreferenceScore(a) - parkingPreferenceScore(b);
      if (preferenceDiff !== 0) return preferenceDiff;
      return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
    })
    .slice(0, limit);
}

async function searchAmapNearby({ origin, keywords, radiusMeters, limit }) {
  const apiKey = getAmapApiKey();
  const url = new URL(AMAP_PLACE_AROUND_URL);

  url.searchParams.set("key", apiKey);
  url.searchParams.set("location", `${origin.lng},${origin.lat}`);
  url.searchParams.set("keywords", normalizeAmapText(keywords));
  url.searchParams.set("radius", String(radiusMeters));
  url.searchParams.set("offset", String(Math.min(Math.max(limit, 1), 25)));
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "all");

  const json = await fetchAmapJson(url);
  return json.pois || [];
}

function normalizeAmapPlaces(places, origin, radiusMeters, limit, fallbackName) {
  return places
    .map((place) => {
      const location = parseAmapLocation(place.location);
      const distance = Number(place.distance);
      const address = Array.isArray(place.address) ? "" : place.address;
      const normalized = {
        name: place.name || `未命名${fallbackName}`,
        address: address || "地址未提供",
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        distanceMeters: Number.isFinite(distance)
          ? distance
          : location
            ? distanceMeters(origin, location)
            : null,
        mapProvider: "amap",
        businessStatus: "",
        rating: Number.isFinite(Number(place.biz_ext?.rating)) ? Number(place.biz_ext.rating) : null,
        userRatingCount: null,
      };

      return {
        ...normalized,
        mapUri: buildAmapMarkerUri(normalized),
        googleMapsUri: "",
      };
    })
    .filter((place) => (place.distanceMeters ?? Infinity) <= radiusMeters)
    .slice(0, limit);
}

async function findNearbyParkingWithAmap(locationQuery, googleOrigin, options) {
  const radiusMeters = options.radiusMeters || DEFAULT_RADIUS_METERS;
  const limit = options.limit || DEFAULT_LIMIT;
  const origin = await geocodeAmapPlace(locationQuery);

  if (!origin) {
    return {
      ok: false,
      reason: "location_not_found",
      message: `找不到「${locationQuery}」的位置，請提供更完整的地點或地址。`,
    };
  }

  const places = await searchAmapNearby({
    origin,
    keywords: "停车场",
    radiusMeters,
    limit: Math.min(Math.max(limit * 2, 5), 20),
  });

  const parkingLots = normalizeAmapPlaces(places, origin, radiusMeters, limit, "停車場")
    .filter((place) => !isProbablyPrivateParking(place))
    .sort((a, b) => {
      const preferenceDiff = parkingPreferenceScore(a) - parkingPreferenceScore(b);
      if (preferenceDiff !== 0) return preferenceDiff;
      return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
    })
    .slice(0, limit);

  return {
    ok: true,
    origin: {
      ...origin,
      detectedByGoogle: googleOrigin,
    },
    radiusMeters,
    mapProvider: "amap",
    parkingLots,
  };
}

async function findNearbyFacilitiesWithAmap(locationQuery, facility, googleOrigin, options) {
  const isLodging = isLodgingFacilityQuery(facility);
  const requestedRadiusMeters = Number(options.radiusMeters) || 0;
  const radiusMeters = isLodging
    ? Math.max(requestedRadiusMeters || LODGING_RADIUS_METERS, LODGING_RADIUS_METERS)
    : requestedRadiusMeters || DEFAULT_RADIUS_METERS;
  const limit = options.limit || DEFAULT_LIMIT;
  const origin = await geocodeAmapPlace(locationQuery);

  if (!origin) {
    return {
      ok: false,
      reason: "location_not_found",
      message: `找不到「${locationQuery}」的位置，請提供更完整的地點或地址。`,
    };
  }

  const places = await searchAmapNearby({
    origin,
    keywords: buildAmapFacilityKeyword(facility),
    radiusMeters,
    limit: isLodging ? Math.min(Math.max(limit * 3, 10), 20) : limit,
  });

  const facilities = normalizeAmapPlaces(places, origin, radiusMeters, limit, facility)
    .sort((a, b) => compareFacilities(a, b, isLodging))
    .slice(0, limit);

  return {
    ok: true,
    origin: {
      ...origin,
      detectedByGoogle: googleOrigin,
    },
    radiusMeters,
    facility,
    mapProvider: "amap",
    facilities,
  };
}

function compareFacilities(a, b, isLodging) {
  if (isLodging) {
    const ratingDiff = (b.rating ?? -1) - (a.rating ?? -1);
    if (ratingDiff !== 0) return ratingDiff;

    const ratingCountDiff = (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
    if (ratingCountDiff !== 0) return ratingCountDiff;
  }

  return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
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

  if (origin.isMainlandChina && hasAmapApiKey()) {
    return findNearbyParkingWithAmap(locationQuery, origin, { radiusMeters, limit });
  }

  const textPlaces = await searchNearbyParkingByText({
    locationQuery,
    lat: origin.lat,
    lng: origin.lng,
    radiusMeters,
    limit: Math.min(Math.max(limit * 2, 5), 20),
  });

  let parkingLots = normalizeParkingPlaces(textPlaces, origin, radiusMeters, limit);

  if (!parkingLots.length) {
    const nearbyPlaces = await searchNearbyParking({
      lat: origin.lat,
      lng: origin.lng,
      radiusMeters,
      limit: Math.min(Math.max(limit * 2, 5), 20),
    });
    parkingLots = normalizeParkingPlaces(nearbyPlaces, origin, radiusMeters, limit);
  }

  return {
    ok: true,
    origin,
    radiusMeters,
    parkingLots,
  };
}

export async function findNearbyFacilities(locationQuery, facilityQuery, options = {}) {
  const facility = String(facilityQuery || "").trim();
  const isLodging = isLodgingFacilityQuery(facility);
  const requestedRadiusMeters = Number(options.radiusMeters) || 0;
  const radiusMeters = isLodging
    ? Math.max(requestedRadiusMeters || LODGING_RADIUS_METERS, LODGING_RADIUS_METERS)
    : requestedRadiusMeters || DEFAULT_RADIUS_METERS;
  const limit = options.limit || DEFAULT_LIMIT;
  const origin = await geocodePlace(locationQuery);

  if (!facility) {
    throw new Error("缺少要查詢的設施類型");
  }

  if (!origin) {
    return {
      ok: false,
      reason: "location_not_found",
      message: `找不到「${locationQuery}」的位置，請提供更完整的地點或地址。`,
    };
  }

  if (origin.isMainlandChina && hasAmapApiKey()) {
    return findNearbyFacilitiesWithAmap(locationQuery, facility, origin, {
      radiusMeters,
      limit,
    });
  }

  const places = await searchNearbyByText({
    locationQuery,
    facilityQuery: facility,
    lat: origin.lat,
    lng: origin.lng,
    radiusMeters,
    limit: isLodging ? Math.min(Math.max(limit * 3, 10), 20) : limit,
  });

  const facilities = places
    .map((place) => {
      const placeLocation = place.location;
      const lat = placeLocation?.latitude;
      const lng = placeLocation?.longitude;
      const distance =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? distanceMeters(origin, { lat, lng })
          : null;

      return {
        name: place.displayName?.text || `未命名${facility}`,
        address: place.formattedAddress || "地址未提供",
        distanceMeters: distance,
        mapProvider: "google",
        mapUri: place.googleMapsUri || "",
        googleMapsUri: place.googleMapsUri || "",
        businessStatus: place.businessStatus || "",
        rating: Number.isFinite(place.rating) ? place.rating : null,
        userRatingCount: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
      };
    })
    .filter((place) => place.businessStatus !== "CLOSED_PERMANENTLY")
    .filter((place) => (place.distanceMeters ?? Infinity) <= radiusMeters)
    .sort((a, b) => compareFacilities(a, b, isLodging))
    .slice(0, limit);

  return {
    ok: true,
    origin,
    radiusMeters,
    facility,
    facilities,
  };
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "距離未知";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} 公里`;
  return `${Math.round(meters)} 公尺`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "時間未知";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return minutes > 0 ? `${hours} 小時 ${minutes} 分鐘` : `${hours} 小時`;
  }
  
  return `${minutes} 分鐘`;
}

async function getDirections({ origin, destination, mode = "driving" }) {
  const apiKey = getGoogleMapsApiKey();
  const url = new URL(DIRECTIONS_URL);
  
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("mode", mode);
  url.searchParams.set("language", "zh-TW");
  url.searchParams.set("region", "tw");
  url.searchParams.set("key", apiKey);
  
  const json = await fetchJson(url);
  
  if (json.status !== "OK" || !json.routes?.length) {
    return null;
  }
  
  return json.routes[0];
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  
  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    
    shift = 0;
    result = 0;
    
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    
    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }
  
  return points;
}

async function searchAlongRoute(routePoints, facilityQuery, limit = 5) {
  if (!routePoints || routePoints.length === 0) return [];
  
  const apiKey = getGoogleMapsApiKey();
  const sampleInterval = Math.max(1, Math.floor(routePoints.length / ROUTE_SAMPLE_POINTS));
  const sampledPoints = routePoints.filter((_, index) => index % sampleInterval === 0);
  
  const allPlaces = [];
  const seenPlaceIds = new Set();
  
  for (const point of sampledPoints) {
    if (allPlaces.length >= limit) break;

    const json = await fetchJson(PLACES_TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.businessStatus",
          "places.googleMapsUri",
          "places.rating",
          "places.userRatingCount",
          "places.types",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: facilityQuery,
        maxResultCount: 5,
        languageCode: "zh-TW",
        regionCode: "TW",
        locationBias: {
          circle: {
            center: {
              latitude: point.lat,
              longitude: point.lng,
            },
            radius: DEFAULT_ROUTE_SEARCH_RADIUS,
          },
        },
      }),
    });

    const places = json.places || [];

    for (const place of places) {
      if (allPlaces.length >= limit) break;

      if (place.id && !seenPlaceIds.has(place.id)) {
        seenPlaceIds.add(place.id);

        const placeLocation = place.location;
        const lat = placeLocation?.latitude;
        const lng = placeLocation?.longitude;

        allPlaces.push({
          name: place.displayName?.text || `未命名${facilityQuery}`,
          address: place.formattedAddress || "地址未提供",
          location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
          googleMapsUri: place.googleMapsUri || "",
          businessStatus: place.businessStatus || "",
          rating: Number.isFinite(place.rating) ? place.rating : null,
          userRatingCount: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
          types: place.types || [],
        });
      }
    }
  }
  
  return allPlaces.filter((place) => place.businessStatus !== "CLOSED_PERMANENTLY");
}

export async function getRouteInfo(originQuery, destinationQuery, mode = "driving") {
  const origin = await geocodePlace(originQuery);
  const destination = await geocodePlace(destinationQuery);
  
  if (!origin) {
    return {
      ok: false,
      reason: "origin_not_found",
      message: `找不到出發地「${originQuery}」的位置，請提供更完整的地點或地址。`,
    };
  }
  
  if (!destination) {
    return {
      ok: false,
      reason: "destination_not_found",
      message: `找不到目的地「${destinationQuery}」的位置，請提供更完整的地點或地址。`,
    };
  }
  
  const route = await getDirections({
    origin: originQuery,
    destination: destinationQuery,
    mode,
  });
  
  if (!route) {
    return {
      ok: false,
      reason: "route_not_found",
      message: `無法規劃從「${originQuery}」到「${destinationQuery}」的路線。`,
    };
  }
  
  const leg = route.legs?.[0];
  
  if (!leg) {
    return {
      ok: false,
      reason: "route_data_incomplete",
      message: "路線資料不完整。",
    };
  }
  
  const polyline = route.overview_polyline?.points;
  const routePoints = polyline ? decodePolyline(polyline) : [];
  
  return {
    ok: true,
    origin: {
      name: origin.name,
      lat: origin.lat,
      lng: origin.lng,
    },
    destination: {
      name: destination.name,
      lat: destination.lat,
      lng: destination.lng,
    },
    distance: leg.distance?.value || 0,
    duration: leg.duration?.value || 0,
    distanceText: leg.distance?.text || formatDistance(leg.distance?.value),
    durationText: leg.duration?.text || formatDuration(leg.duration?.value),
    routePoints,
    mode,
  };
}

export async function findLandmarksAlongRoute(originQuery, destinationQuery, options = {}) {
  const mode = options.mode || "driving";
  const limit = options.limit || DEFAULT_LIMIT;
  
  const routeInfo = await getRouteInfo(originQuery, destinationQuery, mode);
  
  if (!routeInfo.ok) {
    return routeInfo;
  }
  
  const landmarks = await searchAlongRoute(routeInfo.routePoints, "景點 地標", limit);
  
  return {
    ...routeInfo,
    landmarks,
  };
}

export async function findFacilitiesAlongRoute(originQuery, destinationQuery, facilityQuery, options = {}) {
  const mode = options.mode || "driving";
  const limit = options.limit || DEFAULT_LIMIT;
  
  const routeInfo = await getRouteInfo(originQuery, destinationQuery, mode);
  
  if (!routeInfo.ok) {
    return routeInfo;
  }
  
  const facilities = await searchAlongRoute(routeInfo.routePoints, facilityQuery, limit);
  
  return {
    ...routeInfo,
    facilityQuery,
    facilities,
    hasFacilities: facilities.length > 0,
  };
}
