const BASE_URL =
  "https://v3.football.api-sports.io";

async function request(
  endpoint,
  params = {},
  options = {}
) {

  const {
    key,
    cache,
    ttl = 300000,
    timeout = 12000
  } = options;

  if (!key) {

    return {
      available: false,
      reason:
        "API_FOOTBALL_KEY is not configured."
    };
  }

  const url =
    new URL(
      BASE_URL + endpoint
    );

  for (
    const [name, value]
    of Object.entries(params)
  ) {

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(
        name,
        value
      );
    }
  }

  const cacheKey =
    `api-football:${url.toString()}`;

  const now = Date.now();

  const cached =
    cache?.get(cacheKey);

  if (
    cached &&
    cached.expires > now
  ) {
    return cached.value;
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {

    const response =
      await fetch(
        url,
        {
          headers: {
            "x-apisports-key": key
          },
          signal:
            controller.signal
        }
      );

    const body =
      await response.json();

    if (!response.ok) {

      throw new Error(
        `API-Football HTTP ${response.status}`
      );
    }

    if (
      body.errors &&
      Object.keys(body.errors).length
    ) {

      throw new Error(
        JSON.stringify(body.errors)
      );
    }

    const value = {
      available: true,
      data:
        body.response || [],
      paging:
        body.paging || null
    };

    cache?.set(
      cacheKey,
      {
        expires: now + ttl,
        value
      }
    );

    return value;

  } finally {

    clearTimeout(timer);
  }
}

function parsePrediction(prediction) {

  if (!prediction) {
    return null;
  }

  const percent =
    prediction.percent || {};

  const home =
    parseFloat(
      String(
        percent.home || ""
      ).replace("%", "")
    );

  const draw =
    parseFloat(
      String(
        percent.draw || ""
      ).replace("%", "")
    );

  const away =
    parseFloat(
      String(
        percent.away || ""
      ).replace("%", "")
    );

  if (
    !Number.isFinite(home) ||
    !Number.isFinite(draw) ||
    !Number.isFinite(away)
  ) {
    return null;
  }

  return {
    name: "API-Football",

    probabilities: {
      home,
      draw,
      away
    },

    winner:
      prediction.predictions?.winner
        ?.name || null,

    advice:
      prediction.predictions
        ?.advice || null,

    goals:
      prediction.predictions
        ?.goals || null,

    score:
      prediction.predictions
        ?.score || null
  };
}

module.exports = {
  request,
  parsePrediction
};
