// Remove ToDesk macOS app home page banner and promo entries from the remote config.
// Keep connection, transfer, payment capability, and codec configs intact.
const removedConfigKeys = new Set([
  "advsDataBanner1",
  "advsDataBanner2",
  "filecenterAdvs",
  "WelfareCenterBtn",
  "ExplorationCenterBtn",
  "payment_retain_config",
]);

function stripTransferUpsell(item) {
  if (item?.key !== "speedLimits" || typeof item.value !== "string") {
    return item;
  }

  try {
    const speedLimits = JSON.parse(item.value);
    if (speedLimits && typeof speedLimits === "object") {
      delete speedLimits.docTransferAdv;
      return { ...item, value: JSON.stringify(speedLimits) };
    }
  } catch {
    return item;
  }

  return item;
}

try {
  const payload = JSON.parse($response.body || "{}");
  const configList = payload?.data?.configList;

  if (Array.isArray(configList)) {
    payload.data.configList = configList
      .filter((item) => !removedConfigKeys.has(item?.key))
      .map(stripTransferUpsell);
    $done({ body: JSON.stringify(payload) });
  } else {
    $done({});
  }
} catch {
  $done({});
}
