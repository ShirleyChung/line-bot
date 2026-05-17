import { env } from "../config/env.js";

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const DEFAULT_RADIUS_METERS = 1000;
const DEFAULT_LIMIT = 5;
const DEFAULT_ROUTE_SEARCH_RADIUS = 2000;
const ROUTE_SAMPLE_POINTS = 10;

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

export async function findNearbyFacilities(locationQuery, facilityQuery, options = {}) {
  const radiusMeters = options.radiusMeters || DEFAULT_RADIUS_METERS;
  const limit = options.limit || DEFAULT_LIMIT;
  const facility = String(facilityQuery || "").trim();
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

  const places = await searchNearbyByText({
    locationQuery,
    facilityQuery: facility,
    lat: origin.lat,
    lng: origin.lng,
    radiusMeters,
    limit,
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
        googleMapsUri: place.googleMapsUri || "",
        businessStatus: place.businessStatus || "",
        rating: Number.isFinite(place.rating) ? place.rating : null,
        userRatingCount: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
      };
    })
    .filter((place) => place.businessStatus !== "CLOSED_PERMANENTLY")
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
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
