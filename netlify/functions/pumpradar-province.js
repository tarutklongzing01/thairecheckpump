"use strict";

const PUMPRADAR_API_BASE = "https://thaipumpradar.com/api/provinces";

exports.handler = async function handler(event) {
  if (String(event?.httpMethod || "").toUpperCase() === "OPTIONS") {
    return jsonResponse(204, "", event);
  }

  const province = String(event?.queryStringParameters?.province || "")
    .trim()
    .toLowerCase();

  if (!province) {
    return jsonResponse(400, {
      ok: false,
      detail: "Missing required query parameter: province",
    }, event);
  }

  try {
    const response = await fetch(`${PUMPRADAR_API_BASE}/${encodeURIComponent(province)}/stations`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Thairecheckpump Netlify Function",
      },
    });

    const rawText = await response.text();
    let payload = null;

    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      return jsonResponse(502, {
        ok: false,
        detail: payload?.detail || payload?.message || `PumpRadar responded with ${response.status}`,
      }, event);
    }

    if (!payload || !Array.isArray(payload.stations)) {
      return jsonResponse(502, {
        ok: false,
        detail: "PumpRadar returned an invalid province payload",
      }, event);
    }

    return jsonResponse(200, {
      ok: true,
      province: String(payload.province || province).trim(),
      provinceSlug: province,
      stations: payload.stations,
      fetchedAt: new Date().toISOString(),
    }, event);
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      detail: error instanceof Error ? error.message : "Failed to fetch PumpRadar province payload",
    }, event);
  }
};

function jsonResponse(statusCode, payload, event) {
  return {
    statusCode,
    headers: buildHeaders(event),
    body: statusCode === 204 ? "" : JSON.stringify(payload),
  };
}

function buildHeaders(event) {
  const requestOrigin = String(event?.headers?.origin || event?.headers?.Origin || "").trim();
  const origin = requestOrigin && requestOrigin !== "null" ? requestOrigin : "*";

  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}
