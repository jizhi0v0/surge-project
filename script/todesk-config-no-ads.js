const adConfigKeys = new Set(["advsDataBanner1", "advsDataBanner2"]);

try {
  const payload = JSON.parse($response.body || "{}");
  const configList = payload?.data?.configList;

  if (Array.isArray(configList)) {
    payload.data.configList = configList.filter((item) => !adConfigKeys.has(item?.key));
    $done({ body: JSON.stringify(payload) });
  } else {
    $done({});
  }
} catch {
  $done({});
}
