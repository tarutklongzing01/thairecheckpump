"use strict";

const fs = require("fs/promises");
const path = require("path");

const KAPOOK_GAS_PRICE_URL = "https://gasprice.kapook.com/gasprice.php";
const KAPOOK_BASE_URL = "https://gasprice.kapook.com/";
const LOCAL_FALLBACK_FILE = path.join(process.cwd(), "fuel-prices.json");

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
  esso: "Esso",
};

const BRAND_PRIORITY = ["ptt", "bcp", "pt", "shell", "caltex", "susco", "esso", "irpc", "pure", "suscodealers"];

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
      redirect: "follow",
    });

    const rawHtml = await upstream.text();
    if (!upstream.ok) {
      const fallbackPayload = await buildFallbackPayload(`Kapook responded with ${upstream.status}`);
      res.status(200).json(fallbackPayload);
      return;
    }

    const parsed = parseKapookGasPricePage(rawHtml);
    if (!parsed.brands.length) {
      const fallbackPayload = await buildFallbackPayload("Kapook gas price page returned an unexpected format");
      res.status(200).json(fallbackPayload);
      return;
    }

    const fetchedAt = new Date().toISOString();
    res.status(200).json({
      ok: true,
      source: "kapook-gasprice",
      fetchedAt,
      updatedAt: fetchedAt,
      effectiveAt: parsed.updatedAt || fetchedAt,
      currency: "THB",
      unit: "บาท/ลิตร",
      defaultBrand: "ptt",
      note: parsed.updatedAt ? `อ้างอิงราคาจาก Kapook | ราคา ณ ${parsed.updatedAt}` : "อ้างอิงราคาจาก Kapook",
      brands: parsed.brands,
    });
  } catch (error) {
    const fallbackPayload = await buildFallbackPayload(error instanceof Error ? error.message : "Failed to fetch Kapook gas price page");
    res.status(200).json(fallbackPayload);
  }
};

async function buildFallbackPayload(reason) {
  const backup = await readLocalFallbackFile();
  const noteParts = [String(backup?.note || "").trim(), `Kapook ใช้งานไม่ได้ จึงใช้ไฟล์สำรอง (${reason})`].filter(Boolean);

  return {
    ok: true,
    source: "fuel-prices-fallback",
    fetchedAt: new Date().toISOString(),
    updatedAt: backup?.updatedAt || backup?.generatedAt || backup?.fetchedAt || new Date().toISOString(),
    effectiveAt: backup?.effectiveAt || backup?.effectiveDate || backup?.updatedAt || "",
    currency: String(backup?.currency || "THB").trim() || "THB",
    unit: String(backup?.unit || "บาท/ลิตร").trim() || "บาท/ลิตร",
    defaultBrand: String(backup?.defaultBrand || "ptt").trim() || "ptt",
    note: noteParts.join(" | "),
    items: Array.isArray(backup?.items) ? backup.items : [],
    brands: Array.isArray(backup?.brands) ? backup.brands : [],
  };
}

async function readLocalFallbackFile() {
  try {
    const raw = await fs.readFile(LOCAL_FALLBACK_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function parseKapookGasPricePage(rawHtml) {
  const updatedAt = extractUpdatedAt(rawHtml);
  const articlePattern = /<article class="gasprice\s+([a-z0-9]+)"[^>]*>([\s\S]*?)<\/article>/gi;
  const brands = [];
  let articleMatch;

  while ((articleMatch = articlePattern.exec(String(rawHtml || "")))) {
    const brandId = normalizeBrandId(articleMatch[1]);
    const articleHtml = articleMatch[2];
    const brand = parseKapookBrandArticle(brandId, articleHtml);
    if (brand && brand.items.length) {
      brands.push(brand);
    }
  }

  brands.sort((left, right) => getBrandSortIndex(left.id) - getBrandSortIndex(right.id));

  return {
    updatedAt,
    brands,
  };
}

function parseKapookBrandArticle(brandId, articleHtml) {
  const safeBrandId = normalizeBrandId(brandId);
  if (!safeBrandId) {
    return null;
  }

  const headerMatch = articleHtml.match(/<header>([\s\S]*?)<\/header>/i);
  const headerHtml = headerMatch ? headerMatch[1] : "";
  const titleMatch = headerHtml.match(/<h3>([\s\S]*?)<\/h3>/i);
  const logoMatch = headerHtml.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/i);
  const listMatch = articleHtml.match(/<ul>([\s\S]*?)<\/ul>/i);

  const seen = new Set();
  const items = [];
  const listHtml = listMatch ? listMatch[1] : "";
  const itemPattern = /<li>\s*<span>([\s\S]*?)<\/span>\s*<em>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/em>\s*<\/li>/gi;
  let itemMatch;

  while ((itemMatch = itemPattern.exec(listHtml))) {
    const fuelName = normalizeFuelName(itemMatch[1]);
    const fuelMeta = FUEL_NAME_MAP[fuelName];
    const price = Number(itemMatch[2]);

    if (!fuelMeta || !Number.isFinite(price) || seen.has(fuelMeta.id)) {
      continue;
    }

    seen.add(fuelMeta.id);
    items.push({
      id: fuelMeta.id,
      label: fuelMeta.label,
      price,
    });
  }

  const headerTitle = cleanText(titleMatch ? titleMatch[1] : "");
  const explicitLabel = headerTitle
    .replace(/^ราคาน้ำมัน\s*/i, "")
    .replace(/\s*\([^)]+\)\s*$/i, "")
    .trim();

  return {
    id: safeBrandId,
    label: explicitLabel || BRAND_LABELS[safeBrandId] || safeBrandId.toUpperCase(),
    logoUrl: logoMatch ? toAbsoluteKapookUrl(logoMatch[1]) : "",
    items,
  };
}

function extractUpdatedAt(rawHtml) {
  const subtitleMatch = String(rawHtml || "").match(/<h2 class="sub-title">([\s\S]*?)<\/h2>/i);
  if (!subtitleMatch) {
    return "";
  }

  const subtitle = cleanText(subtitleMatch[1]);
  return subtitle.replace(/^อัปเดตล่าสุด\s*/i, "").trim();
}

function normalizeFuelName(value) {
  const normalized = cleanText(value)
    .replace(/\s+/g, " ")
    .replace(/[‐‑‒–—-]/g, "-")
    .trim();

  if (FUEL_NAME_MAP[normalized]) {
    return normalized;
  }

  const compact = normalized.toLowerCase();
  const matched = Object.keys(FUEL_NAME_MAP).find((key) => key.toLowerCase() === compact);
  return matched || normalized;
}

function cleanText(value) {
  const decoded = decodeHtmlEntities(stripTags(String(value || "")));
  const repaired = repairMojibake(decoded);
  return repaired.replace(/\s+/g, " ").trim();
}

function stripTags(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
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

function repairMojibake(text) {
  const value = String(text || "").trim();
  if (!value || !/[à-ÿ]/.test(value)) {
    return value;
  }

  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8").trim();
    return /[\u0E00-\u0E7F]/.test(repaired) ? repaired : value;
  } catch (error) {
    return value;
  }
}

function normalizeBrandId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getBrandSortIndex(brandId) {
  const index = BRAND_PRIORITY.indexOf(brandId);
  return index >= 0 ? index : BRAND_PRIORITY.length + 1;
}

function toAbsoluteKapookUrl(value) {
  const url = String(value || "").trim();
  if (!url) {
    return "";
  }

  try {
    return new URL(url, KAPOOK_BASE_URL).toString();
  } catch (error) {
    return "";
  }
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
