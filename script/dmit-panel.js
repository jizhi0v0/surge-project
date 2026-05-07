const DEFAULT_SERVICE_ID = "172635";
const COOKIE_STORE_KEY = "dmit_cookie";
const SERVICE_ID_STORE_KEY = "dmit_service_id";

function parseArgument(argument) {
  const result = {};
  if (!argument) return result;

  argument.split("&").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) return;

    const key = decodeURIComponent(part.slice(0, index));
    const value = decodeURIComponent(part.slice(index + 1));
    result[key] = value;
  });

  return result;
}

function finish(payload) {
  $done({
    title: payload.title,
    content: payload.content,
    icon: payload.icon || "server.rack",
    "icon-color": payload.color || "#4b9cff",
  });
}

function finishError(message) {
  finish({
    title: "DMIT VPS",
    content: message,
    icon: "exclamationmark.triangle",
    color: "#ff9f0a",
  });
}

function formatResetRule(rule) {
  if (!rule) return "Reset: no rule data";

  const state = rule.allowed ? "allowed" : "not allowed";
  const price = rule.price ? ` • ${rule.price} ${rule.currency_id === 1 ? "USD" : ""}` : "";
  const reason = rule.reason ? `\n${rule.reason}` : "";
  return `${rule.name || "Reset"}: ${state}${price}${reason}`;
}

function formatPanel(body) {
  if (!body || body.code !== 0 || !body.data) {
    const message = body && body.message ? body.message : "Unexpected API response";
    return finishError(message);
  }

  const traffic = body.data.traffic_info || {};
  const resetRule = body.data.rules && body.data.rules[0];
  const percentage = typeof traffic.usage_percentage === "number"
    ? traffic.usage_percentage.toFixed(2)
    : "--";

  const used = traffic.bwusage_formatted || "--";
  const limit = traffic.is_unlimited ? "Unlimited" : (traffic.bwlimit_formatted || "--");
  const inbound = traffic.bwusage_in_formatted || "--";
  const outbound = traffic.bwusage_out_formatted || "--";

  finish({
    title: `DMIT VPS ${percentage}%`,
    content: [
      `Used: ${used} / ${limit}`,
      `In: ${inbound}   Out: ${outbound}`,
      formatResetRule(resetRule),
    ].join("\n"),
    icon: resetRule && resetRule.allowed ? "arrow.clockwise.circle" : "server.rack",
    color: resetRule && resetRule.allowed ? "#34c759" : "#4b9cff",
  });
}

const args = parseArgument(typeof $argument === "string" ? $argument : "");
const serviceId = args.service_id
  || $persistentStore.read(SERVICE_ID_STORE_KEY)
  || DEFAULT_SERVICE_ID;
const cookie = args.cookie || $persistentStore.read(COOKIE_STORE_KEY);

if (!cookie) {
  finishError(`Missing cookie. Save the DMIT cookie to persistent store key: ${COOKIE_STORE_KEY}`);
} else {
  const url = `https://www.dmit.io/index.php?m=reset_traffic&modaction=get_rules&service_id=${encodeURIComponent(serviceId)}`;

  $httpClient.get({
    url,
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      "Cookie": cookie,
      "Referer": `https://www.dmit.io/clientarea.php?action=productdetails&id=${encodeURIComponent(serviceId)}`,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    },
  }, (error, response, data) => {
    if (error) {
      finishError(`Request failed: ${error}`);
      return;
    }

    if (!response || response.status !== 200) {
      finishError(`HTTP ${response ? response.status : "unknown"}`);
      return;
    }

    if (!data || data.trim().startsWith("<!DOCTYPE html") || data.includes("Just a moment")) {
      finishError("DMIT returned Cloudflare challenge. Refresh dmit_cookie from a logged-in browser session.");
      return;
    }

    try {
      formatPanel(JSON.parse(data));
    } catch (parseError) {
      finishError(`JSON parse failed: ${parseError.message}`);
    }
  });
}
