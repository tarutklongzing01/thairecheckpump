"use strict";

const NETLIFY_API_BASE = "https://api.netlify.com/api/v1";

exports.handler = async function handler() {
  const apiToken = readEnv("NETLIFY_API_TOKEN");
  const accountId = readEnv("NETLIFY_ACCOUNT_ID");
  const warnPercent = parseThreshold(readEnv("NETLIFY_USAGE_WARN_PERCENT"), 75);
  const dangerPercent = parseThreshold(readEnv("NETLIFY_USAGE_DANGER_PERCENT"), 90);

  if (!apiToken || !accountId) {
    return jsonResponse(200, {
      ok: false,
      state: "missing-config",
      detail: "ยังไม่ได้ตั้ง NETLIFY_API_TOKEN และ NETLIFY_ACCOUNT_ID ใน Netlify environment variables",
      note: "ใช้ Netlify Function ดึง build minutes จาก API อย่างปลอดภัย โดยไม่เอา token ไปไว้หน้าเว็บ",
    });
  }

  try {
    const response = await fetch(`${NETLIFY_API_BASE}/${encodeURIComponent(accountId)}/builds/status`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });

    const payload = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(502, {
        ok: false,
        state: "upstream-error",
        detail: payload?.message || `Netlify API ตอบกลับ ${response.status}`,
      });
    }

    const status = Array.isArray(payload) ? payload[0] || {} : payload || {};
    const minutes = status.minutes || {};
    const usedMinutes = parseNumber(minutes.current);
    const includedMinutes = parseNumber(minutes.included_minutes_with_packs ?? minutes.included_minutes);
    const percentUsed = includedMinutes > 0 ? (usedMinutes / includedMinutes) * 100 : 0;
    const state =
      includedMinutes > 0 && percentUsed >= dangerPercent
        ? "danger"
        : includedMinutes > 0 && percentUsed >= warnPercent
          ? "warning"
          : "ok";

    return jsonResponse(200, {
      ok: true,
      state,
      currentMinutes: usedMinutes,
      includedMinutes,
      percentUsed,
      buildCount: parseNumber(status.build_count),
      active: parseNumber(status.active),
      enqueued: parseNumber(status.enqueued),
      pendingConcurrency: parseNumber(status.pending_concurrency),
      lastUpdatedAt: minutes.last_updated_at || "",
      periodStartDate: minutes.period_start_date || "",
      periodEndDate: minutes.period_end_date || "",
      periodLabel: formatPeriodLabel(minutes.period_start_date, minutes.period_end_date),
      note: "ตัวเลขนี้อิง build minutes ระดับทีมจาก Netlify API",
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      state: "request-failed",
      detail: error instanceof Error ? error.message : "ดึง Netlify usage ไม่สำเร็จ",
    });
  }
};

function readEnv(name) {
  const processValue =
    typeof process !== "undefined" && process?.env && Object.prototype.hasOwnProperty.call(process.env, name)
      ? process.env[name]
      : undefined;
  if (typeof processValue === "string" && processValue.trim()) {
    return processValue.trim();
  }

  const netlifyValue =
    typeof Netlify !== "undefined" && Netlify?.env && typeof Netlify.env.get === "function"
      ? Netlify.env.get(name)
      : undefined;
  return typeof netlifyValue === "string" ? netlifyValue.trim() : "";
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseThreshold(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function formatPeriodLabel(start, end) {
  if (!start && !end) {
    return "รอบบิลปัจจุบัน";
  }

  const startText = formatShortDate(start);
  const endText = formatShortDate(end);
  if (startText && endText) {
    return `รอบบิล ${startText} - ${endText}`;
  }
  return startText || endText || "รอบบิลปัจจุบัน";
}

function formatShortDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
}
