const BASE_URL =
  "https://api.sportmonks.com/v3/football";

async function request(
  endpoint,
  params = {},
  options = {}
) {

  const {
    token,
    cache,
    ttl = 300000,
    timeout = 12000
  } = options;

  if (!token) {

    return {
      available: false,
      reason:
        "SPORTMONKS_TOKEN is not configured."
    };
  }

  const url =
    new URL(
      BASE_URL + endpoint
    );

  url.searchParams.set(
    "api_token",
    token
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
    `sportmonks:${url.toString()}`;

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
          signal:
            controller.signal
        }
      );

    const body =
      await response.json();

    if (!response.ok) {

      throw new Error(
        `Sportmonks HTTP ${response.status}`
      );
    }

    const value = {
      available: true,
      data:
        body.data || [],
      meta:
        body.meta || null
    };

    cache?.set(
      cacheKey,
      {
        expires:
          now + ttl,
        value
      }
    );

    return value;

  } finally {

    clearTimeout(timer);
  }
}

function parseProbabilities(data) {

  const records =
    Array.isArray(data)
      ? data
      : [data];

  for (
    const record
    of records
  ) {

    const prediction =
      record?.predictions ||
      record?.prediction ||
      record;

    const home =
      Number(
        prediction?.home
      );

    const draw =
      Number(
        prediction?.draw
      );

    const away =
      Number(
        prediction?.away
      );

    if (
      Number.isFinite(home) &&
      Number.isFinite(draw) &&
      Number.isFinite(away)
    ) {

      return {
        home,
        draw,
        away
      };
    }
  }

  return null;
}

module.exports = {
  request,
  parseProbabilities
};
