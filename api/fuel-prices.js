"use strict";

const KAPOOK_GAS_PRICE_URL = "https://gasprice.kapook.com/gasprice.php";
const BRAND_PATTERN = /\((ptt|bcp|shell|caltex|irpc|pt|susco|pure|suscodealers)\)$/i;

const BRAND_LABELS = {
  ptt: "PTT",
  bcp: "Bangchak",
  shell: "Shell",
  caltex: "Caltex",
  irpc: "IRPC",
  pt: "PT",
  susco: "SUSCO",
  pure: "Pure",
  suscodealers: "SUSCO Dealers",
};

const FUEL_NAME_MAP = {
  "แก๊สโซฮอล์ 95": { id: "gas95", label: "แก๊สโซฮอล์ 95" },
  "แก๊สโซฮอล์ 95 พรีเมียม": { id: "gas95premium", label: "แก๊สโซฮอล์ 95 พรีเมียม" },
  "แก๊สโซฮอล์ 97 พรีเมียม": { id: "gas97premium", label: "แก๊สโซฮอล์ 97 พรีเมียม" },
  "เชลล์ วี-เพาเวอร์ แก๊สโซฮอล์ 95": { id: "gas95premium", label: "เชลล์ วี-เพาเวอร์ แก๊สโซฮอล์ 95" },
  "ซูเปอร์พาวเวอร์ แก๊สโซฮอล์ 95": { id: "gas95premium", label: "ซูเปอร์พาวเวอร์ แก๊สโซฮอล์ 95" },
  "แก๊สโซฮอล์ E20": { id: "e20", label: "E20" },
  "แก๊สโซฮอล์ E85": { id: "e85", label: "E85" },
  "แก๊สโซฮอล์ 91": { id: "gas91", label: "แก๊สโซฮอล์ 91" },
  "เบนซิน 95": { id: "benzine95", label: "เบนซิน 95" },
  "แก๊ส NGV": { id: "ngv", label: "NGV" },
  "ดีเซล B7": { id: "diesel", label: "ดีเซล B7" },
  "ดีเซล": { id: "diesel_plain", label: "ดีเซล" },
  "ดีเซลพรีเมียม": { id: "diesel_premium", label: "ดีเซลพรีเมียม" },
  "เชลล์ ฟิวเซฟ ดีเซล": { id: "diesel_plain", label: "เชลล์ ฟิวเซฟ ดีเซล" },
  "เชลล์ วี-เพาเวอร์ ดีเซล": { id: "diesel_premium", label: "เชลล์ วี-เพาเวอร์ ดีเซล" },
};

module.exports = async function handler(req, res) {
  applyCors(req, res);

  if (String(req.method || "").toUpperCase() === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const upstream = await fetch(KAPOOK_GAS_PRICE_URL, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Thairecheckpump Vercel Function",
      },
    });

    const rawHtml = await upstream.text();
    if (!upstream.ok) {
      res.status(502).json({
        ok: false,
        detail: `Kapook responded with ${upstream.status}`,
      });
      return;
    }

    const parsed = parseKapookGasPricePage(rawHtml);
    if (!parsed.brands.length) {
      res.status(502).json({
        ok: false,
        detail: "Kapook gas price page returned an unexpected format",
      });
      return;
    }

    const fetchedAt = new Date().toISOString();

    res.status(200).json({
      ok: true,
      source: "kapook-gasprice",
      fetchedAt,
      updatedAt: fetchedAt,
      effectiveAt: parsed.updatedAt,
      currency: "THB",
      unit: "บาท/ลิตร",
      defaultBrand: "ptt",
      note: parsed.updatedAt ? `อ้างอิงราคาจาก Kapook | ราคา ณ ${parsed.updatedAt}` : "อ้างอิงราคาจาก Kapook",
      brands: parsed.brands,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      detail: error instanceof Error ? error.message : "Failed to fetch Kapook gas price page",
    });
  }
};

function parseKapookGasPricePage(rawHtml) {
  const lines = htmlToLines(rawHtml);
  const updatedAt = extractUpdatedAt(lines);
  const brands = [];
  let currentBrand = null;

  lines.forEach((line) => {
    const brandMatch = line.match(BRAND_PATTERN);
    if (brandMatch) {
      const brandId = brandMatch[1].toLowerCase();
      currentBrand = {
        id: brandId,
        label: BRAND_LABELS[brandId] || brandId.toUpperCase(),
        seen: new Set(),
        items: [],
      };
      brands.push(currentBrand);
      return;
    }

    if (!currentBrand) {
      return;
    }

    const priceMatch = line.match(/^(.+?)\s+([0-9]+(?:\.[0-9]+)?)$/);
    if (!priceMatch) {
      return;
    }

    const fuelName = normalizeText(priceMatch[1]);
    const price = Number(priceMatch[2]);
    const fuelMeta = FUEL_NAME_MAP[fuelName];

    if (!fuelMeta || !Number.isFinite(price) || currentBrand.seen.has(fuelMeta.id)) {
      return;
    }

    currentBrand.seen.add(fuelMeta.id);
    currentBrand.items.push({
      id: fuelMeta.id,
      label: fuelMeta.label,
      price,
    });
  });

  return {
    updatedAt,
    brands: brands
      .filter((brand) => brand.items.length)
      .map(({ id, label, items }) => ({
        id,
        label,
        items,
      })),
  };
}

function htmlToLines(rawHtml) {
  return decodeHtmlEntities(
    String(rawHtml || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h1|h2|h3|h4|section|article|tr|td)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function extractUpdatedAt(lines) {
  const line = lines.find((entry) => entry.startsWith("อัปเดตล่าสุด "));
  return line ? line.replace("อัปเดตล่าสุด ", "").trim() : "";
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return normalizeWhitespace(value);
}

function applyCors(req, res) {
  const requestOrigin = String(req.headers.origin || "").trim();
  const origin = requestOrigin && requestOrigin !== "null" ? requestOrigin : "*";

  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("vary", "origin");
}
