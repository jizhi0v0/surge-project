const STORE_KEY = "qweather-alert-state-v1";

const DEFAULTS = {
  API_HOST: "",
  API_KEY: "",
  BEARER_TOKEN: "",
  LOCATION: "",
  COORDINATE: "",
  CITY_NAME: "Local",
  LANG: "zh",
  UNIT: "m",
  LOOKAHEAD_HOURS: "6",
  RAIN_POP_THRESHOLD: "50",
  RAIN_PRECIP_THRESHOLD: "0.1",
  MINUTELY_ENABLED: "true",
  MINUTELY_LOOKAHEAD_MINUTES: "120",
  MINUTELY_PRECIP_THRESHOLD: "0.01",
  WARNING_ENABLED: "true",
  COOLDOWN_MINUTES: "120",
  DRY_RESET_MINUTES: "90",
};

const PLACEHOLDER_VALUES = new Set([
  "your_api_host.qweatherapi.com",
  "your_api_key",
  "your_bearer_token",
  "your_location",
  "optional",
]);

function parseArguments(raw) {
  const args = {};
  if (!raw) {
    return args;
  }

  raw.split("&").forEach((part) => {
    const index = part.indexOf("=");
    const rawKey = index >= 0 ? part.slice(0, index) : part;
    const rawValue = index >= 0 ? part.slice(index + 1) : "";
    const key = decodeValue(rawKey).trim();

    if (key) {
      args[key] = decodeValue(rawValue).trim();
    }
  });

  return args;
}

function decodeValue(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, "%20"));
  } catch {
    return String(value);
  }
}

function arg(args, name) {
  return args[name] || DEFAULTS[name] || "";
}

function cleanArgValue(value) {
  const trimmed = String(value || "").trim();

  if (
    !trimmed ||
    PLACEHOLDER_VALUES.has(trimmed.toLowerCase()) ||
    /^\{\{\{[A-Z0-9_]+\}\}\}$/.test(trimmed) ||
    /^%[A-Z0-9_]+%$/.test(trimmed)
  ) {
    return "";
  }

  return trimmed;
}

function toBool(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  return /^(1|true|yes|on)$/i.test(String(value));
}

function toInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function toNumber(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function normalizeHost(value) {
  return String(value || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();
}

function normalizeCoordinate(value) {
  const parsed = parseCoordinate(value);

  if (!parsed) {
    return "";
  }

  return `${parsed.lon},${parsed.lat}`;
}

function parseCoordinate(value) {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim());

  if (parts.length !== 2) {
    return null;
  }

  const lon = Number.parseFloat(parts[0]);
  const lat = Number.parseFloat(parts[1]);

  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lon < -180 ||
    lon > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return null;
  }

  return { lon, lat };
}

function readState() {
  try {
    return JSON.parse($persistentStore.read(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    $persistentStore.write(JSON.stringify(state), STORE_KEY);
  } catch (error) {
    console.log(`Failed to write QWeather state: ${error}`);
  }
}

function buildConfig() {
  const args = parseArguments(typeof $argument === "string" ? $argument : "");
  const coordinate = normalizeCoordinate(cleanArgValue(arg(args, "COORDINATE")));
  const location = cleanArgValue(arg(args, "LOCATION")) || coordinate;

  return {
    apiHost: normalizeHost(cleanArgValue(arg(args, "API_HOST"))),
    apiKey: cleanArgValue(arg(args, "API_KEY")),
    bearerToken: cleanArgValue(arg(args, "BEARER_TOKEN")),
    location,
    coordinate,
    cityName: arg(args, "CITY_NAME") || "Local",
    lang: arg(args, "LANG") || "zh",
    unit: arg(args, "UNIT") || "m",
    lookaheadHours: toInt(arg(args, "LOOKAHEAD_HOURS"), 6, 1, 24),
    rainPopThreshold: toInt(arg(args, "RAIN_POP_THRESHOLD"), 50, 0, 100),
    rainPrecipThreshold: toNumber(arg(args, "RAIN_PRECIP_THRESHOLD"), 0.1, 0, 100),
    minutelyEnabled: toBool(arg(args, "MINUTELY_ENABLED"), true),
    minutelyLookaheadMinutes: toInt(arg(args, "MINUTELY_LOOKAHEAD_MINUTES"), 120, 5, 120),
    minutelyPrecipThreshold: toNumber(arg(args, "MINUTELY_PRECIP_THRESHOLD"), 0.01, 0, 100),
    warningEnabled: toBool(arg(args, "WARNING_ENABLED"), true),
    cooldownMinutes: toInt(arg(args, "COOLDOWN_MINUTES"), 120, 15, 1440),
    dryResetMinutes: toInt(arg(args, "DRY_RESET_MINUTES"), 90, 15, 1440),
  };
}

function validateConfig(config) {
  const missing = [];

  if (!config.apiHost) {
    missing.push("API_HOST");
  }

  if (!config.apiKey && !config.bearerToken) {
    missing.push("API_KEY or BEARER_TOKEN");
  }

  if (!config.location) {
    missing.push("LOCATION or COORDINATE");
  }

  return missing;
}

function queryString(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

function requestJson(config, path, params) {
  const query = queryString(params || {});
  const url = `https://${config.apiHost}${path}${query ? `?${query}` : ""}`;
  const headers = {
    Accept: "application/json",
  };

  if (config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  } else {
    headers["X-QW-Api-Key"] = config.apiKey;
  }

  return new Promise((resolve) => {
    $httpClient.get(
      {
        url,
        headers,
        timeout: 15,
      },
      (error, response, data) => {
        const status = response && response.status;

        if (error) {
          resolve({ ok: false, source: path, error: String(error) });
          return;
        }

        if (status === 204) {
          resolve({ ok: true, source: path, data: {} });
          return;
        }

        let json;

        try {
          json = JSON.parse(data || "{}");
        } catch (parseError) {
          resolve({ ok: false, source: path, error: `Invalid JSON: ${parseError}` });
          return;
        }

        if (isNoDataResponse(json)) {
          resolve({ ok: true, source: path, data: json });
          return;
        }

        if (status && (status < 200 || status >= 300)) {
          resolve({ ok: false, source: path, error: responseError(status, json) });
          return;
        }

        if (json.code && json.code !== "200") {
          resolve({ ok: false, source: path, error: `QWeather code ${json.code}` });
          return;
        }

        resolve({ ok: true, source: path, data: json });
      }
    );
  });
}

function isNoDataResponse(json) {
  if (json?.code === "204") {
    return true;
  }

  const errorText = [json?.error?.type, json?.error?.title, json?.error?.detail]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return errorText.includes("data not available") || errorText.includes("data-not-available");
}

function responseError(status, json) {
  const error = json?.error;

  if (error?.title || error?.detail) {
    return `HTTP ${status}: ${error.title || error.detail}`;
  }

  return `HTTP ${status}`;
}

function qweatherRequests(config) {
  const requests = [
    requestJson(config, "/v7/weather/24h", {
      location: config.location,
      lang: config.lang,
      unit: config.unit,
    }).then((result) => ({ ...result, kind: "hourly" })),
  ];

  if (config.minutelyEnabled && config.coordinate) {
    requests.push(
      requestJson(config, "/v7/minutely/5m", {
        location: config.coordinate,
        lang: config.lang,
      }).then((result) => ({ ...result, kind: "minutely" }))
    );
  }

  if (config.warningEnabled && config.coordinate) {
    const coordinate = parseCoordinate(config.coordinate);
    requests.push(
      requestJson(config, `/weatheralert/v1/current/${coordinate.lat}/${coordinate.lon}`, {
        localTime: "true",
        lang: config.lang,
      }).then((result) => ({ ...result, kind: "warning" }))
    );
  }

  return requests;
}

function getResult(results, kind) {
  return results.find((result) => result.kind === kind && result.ok)?.data;
}

function notify(title, subtitle, body, url) {
  const options = {
    sound: true,
    "auto-dismiss": false,
  };

  if (url) {
    options.action = "open-url";
    options.url = url;
  }

  $notification.post(title, subtitle, body, options);
}

function notifyOperationalIssue(state, key, title, body, intervalMinutes) {
  const now = Date.now();
  const notices = state.notices || {};
  const last = notices[key] || 0;

  if (now - last >= intervalMinutes * 60 * 1000) {
    notify(title, "QWeather Alert", body);
    notices[key] = now;
    state.notices = notices;
  }
}

function isRainText(text) {
  return /(rain|shower|storm|snow|sleet|drizzle|thunder|雨|雪|雷|雹|冻雨|阵雨)/i.test(
    String(text || "")
  );
}

function parseFxTime(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "unknown time";
  }

  const date = new Date(timestamp);
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());

  return `${month}-${day} ${hour}:${minute}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function minutesAway(timestamp) {
  if (!timestamp) {
    return "";
  }

  const minutes = Math.max(0, Math.round((timestamp - Date.now()) / 60000));

  if (minutes === 0) {
    return "now";
  }

  return `in about ${minutes} min`;
}

function summarizeHourly(entry) {
  const pieces = [formatTime(parseFxTime(entry.fxTime)), entry.text || "weather change"];

  if (entry.pop !== undefined && entry.pop !== "") {
    pieces.push(`POP ${entry.pop}%`);
  }

  if (entry.precip !== undefined && entry.precip !== "") {
    pieces.push(`${entry.precip}mm`);
  }

  return pieces.join(" ");
}

function findMinutelyRain(minutely, config) {
  const items = Array.isArray(minutely?.minutely) ? minutely.minutely : [];
  const now = Date.now();
  const until = now + config.minutelyLookaheadMinutes * 60 * 1000;
  const matches = items
    .map((entry) => ({
      ...entry,
      timestamp: parseFxTime(entry.fxTime),
      precipValue: Number.parseFloat(entry.precip || "0"),
    }))
    .filter(
      (entry) =>
        entry.timestamp >= now - 5 * 60 * 1000 &&
        entry.timestamp <= until &&
        entry.precipValue >= config.minutelyPrecipThreshold
    );

  if (!matches.length) {
    return null;
  }

  const first = matches[0];
  const peak = matches.reduce((max, entry) => (entry.precipValue > max.precipValue ? entry : max), first);
  const summary = minutely.summary || "Minute-level precipitation is expected.";

  return {
    source: "minutely",
    title: "Weather Change Alert",
    subtitle: `${config.cityName}: precipitation ${minutesAway(first.timestamp)}`,
    body: [
      summary,
      `Start: ${formatTime(first.timestamp)}; peak 5-min precip: ${peak.precip || "0"}mm.`,
      "Source: QWeather minutely forecast.",
    ].join("\n"),
    url: minutely.fxLink,
  };
}

function findHourlyRain(hourly, config) {
  const items = Array.isArray(hourly?.hourly) ? hourly.hourly : [];
  const now = Date.now();
  const until = now + config.lookaheadHours * 60 * 60 * 1000;
  const matches = items
    .map((entry) => ({
      ...entry,
      timestamp: parseFxTime(entry.fxTime),
      popValue: Number.parseFloat(entry.pop || "0"),
      precipValue: Number.parseFloat(entry.precip || "0"),
    }))
    .filter(
      (entry) =>
        entry.timestamp >= now - 30 * 60 * 1000 &&
        entry.timestamp <= until &&
        (isRainText(entry.text) ||
          entry.popValue >= config.rainPopThreshold ||
          entry.precipValue >= config.rainPrecipThreshold)
    );

  if (!matches.length) {
    return null;
  }

  const first = matches[0];
  const preview = matches.slice(0, 3).map(summarizeHourly).join("\n");

  return {
    source: "hourly",
    title: "Weather Change Alert",
    subtitle: `${config.cityName}: precipitation ${minutesAway(first.timestamp)}`,
    body: [
      `${first.text || "Precipitation"} expected at ${formatTime(first.timestamp)}.`,
      preview,
      "Source: QWeather hourly forecast.",
    ].join("\n"),
    url: hourly.fxLink,
  };
}

function handleRainEvent(state, event, config) {
  const now = Date.now();
  const rain = state.rain || {};

  if (event) {
    const shouldNotify =
      !rain.active || now - (rain.lastNotifyAt || 0) >= config.cooldownMinutes * 60 * 1000;

    rain.active = true;
    rain.lastSeenAt = now;
    rain.lastSource = event.source;

    if (shouldNotify) {
      notify(event.title, event.subtitle, event.body, event.url);
      rain.lastNotifyAt = now;
    }
  } else if (rain.active) {
    const lastSeenAt = rain.lastSeenAt || 0;

    if (now - lastSeenAt >= config.dryResetMinutes * 60 * 1000) {
      rain.active = false;
    }
  }

  state.rain = rain;
}

function severityRank(alert) {
  const value = String(alert?.severity || "").toLowerCase();

  if (value === "extreme") return 5;
  if (value === "severe") return 4;
  if (value === "moderate") return 3;
  if (value === "minor") return 2;
  if (value === "unknown") return 1;
  return 0;
}

function alertKey(alert) {
  return [alert.id || "", alert.headline || "", alert.eventType?.name || ""].join("|");
}

function handleWarnings(state, warning, config) {
  const alerts = Array.isArray(warning?.alerts) ? warning.alerts : [];
  const activeAlerts = alerts
    .filter((alert) => alert?.messageType?.code !== "cancel")
    .sort((a, b) => severityRank(b) - severityRank(a));
  const now = Date.now();
  const seen = state.warningSeen || {};
  const currentKeys = new Set();
  const newAlerts = [];

  activeAlerts.forEach((alert) => {
    const key = alertKey(alert);
    currentKeys.add(key);

    if (!seen[key]) {
      newAlerts.push(alert);
    }

    seen[key] = now;
  });

  Object.keys(seen).forEach((key) => {
    if (!currentKeys.has(key) && now - seen[key] > 7 * 24 * 60 * 60 * 1000) {
      delete seen[key];
    }
  });

  if (newAlerts.length) {
    const first = newAlerts[0];
    const more = newAlerts.length > 1 ? ` (+${newAlerts.length - 1} more)` : "";
    const headline = first.headline || first.eventType?.name || "Official weather alert";
    const details = [
      `Severity: ${first.severity || "unknown"}; certainty: ${first.certainty || "unknown"}.`,
      truncate(first.description || first.instruction || "See QWeather for details.", 220),
    ];

    notify(
      "QWeather Official Alert",
      `${config.cityName}: ${headline}${more}`,
      details.join("\n"),
      warning.fxLink
    );
  }

  state.warningSeen = seen;
}

function truncate(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

function finish(state) {
  writeState(state);
  $done();
}

(async () => {
  const state = readState();

  try {
    const config = buildConfig();
    const missing = validateConfig(config);

    if (missing.length) {
      notifyOperationalIssue(
        state,
        "config",
        "QWeather Alert Setup Required",
        `Missing module argument: ${missing.join(", ")}.`,
        720
      );
      finish(state);
      return;
    }

    const results = await Promise.all(qweatherRequests(config));
    const errors = results.filter((result) => !result.ok);

    if (errors.length) {
      notifyOperationalIssue(
        state,
        "api-error",
        "QWeather Alert API Error",
        `${errors[0].kind}: ${errors[0].error}`,
        360
      );
    }

    const minutely = getResult(results, "minutely");
    const hourly = getResult(results, "hourly");
    const warning = getResult(results, "warning");
    const rainEvent = findMinutelyRain(minutely, config) || findHourlyRain(hourly, config);

    handleRainEvent(state, rainEvent, config);

    if (warning) {
      handleWarnings(state, warning, config);
    }

    finish(state);
  } catch (error) {
    notifyOperationalIssue(
      state,
      "runtime-error",
      "QWeather Alert Runtime Error",
      String(error),
      360
    );
    finish(state);
  }
})();
