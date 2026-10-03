'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE =
  process.env.API_FOOTBALL_BASE ||
  'https://v3.football.api-sports.io';

if (!API_KEY) {
  console.warn(
    'WARNING: API_FOOTBALL_KEY is missing. Add it to your .env file.'
  );
}

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: '1mb'
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(express.static(path.join(__dirname, 'public')));

/* =========================================================
   SIMPLE CACHE
========================================================= */

const cache = new Map();

function cacheGet(key) {
  const item = cache.get(key);

  if (!item) return null;

  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

function cacheSet(key, value, ttl = 10 * 60 * 1000) {
  cache.set(key, {
    value,
    expires: Date.now() + ttl
  });
}

/* =========================================================
   API FOOTBALL REQUEST
========================================================= */

async function apiFootball(endpoint, params = {}, ttl = 10 * 60 * 1000) {
  if (!API_KEY) {
    throw new Error('API_FOOTBALL_KEY is not configured.');
  }

  const url = new URL(`${API_BASE}/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      url.searchParams.set(key, value);
    }
  }

  const cacheKey = url.toString();

  const cached = cacheGet(cacheKey);

  if (cached) {
    return cached;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-apisports-key': API_KEY,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `API-Football HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(
      JSON.stringify(data.errors)
    );
  }

  cacheSet(cacheKey, data, ttl);

  return data;
}

/* =========================================================
   HELPERS
========================================================= */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function normalizeProbabilities(values) {
  const total =
    values.home +
    values.draw +
    values.away;

  if (!total) {
    return {
      home: 0.3333,
      draw: 0.3333,
      away: 0.3334
    };
  }

  return {
    home: values.home / total,
    draw: values.draw / total,
    away: values.away / total
  };
}

function percent(value) {
  return `${round(value * 100, 1)}%`;
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/* =========================================================
   TEAM SEARCH
========================================================= */

async function searchTeam(name) {
  const data = await apiFootball(
    'teams',
    {
      search: name
    },
    60 * 60 * 1000
  );

  if (!data.response || data.response.length === 0) {
    throw new Error(
      `Team not found: ${name}`
    );
  }

  const exact = data.response.find(
    item =>
      item.team &&
      item.team.name &&
      item.team.name.toLowerCase() ===
        name.toLowerCase()
  );

  const selected = exact || data.response[0];

  return selected.team;
}

/* =========================================================
   FIXTURE SEARCH
========================================================= */

async function findFixture(homeId, awayId, date) {
  const data = await apiFootball(
    'fixtures',
    {
      date
    },
    5 * 60 * 1000
  );

  const fixtures = data.response || [];

  return (
    fixtures.find(f => {
      const h = f.teams?.home?.id;
      const a = f.teams?.away?.id;

      return (
        Number(h) === Number(homeId) &&
        Number(a) === Number(awayId)
      );
    }) ||
    fixtures.find(f => {
      const h = f.teams?.home?.id;
      const a = f.teams?.away?.id;

      return (
        Number(h) === Number(awayId) &&
        Number(a) === Number(homeId)
      );
    }) ||
    null
  );
}

/* =========================================================
   RECENT FIXTURES
========================================================= */

async function getRecentFixtures(teamId, count = 10) {
  const data = await apiFootball(
    'fixtures',
    {
      team: teamId,
      last: count
    },
    10 * 60 * 1000
  );

  return data.response || [];
}

/* =========================================================
   H2H
========================================================= */

async function getH2H(homeId, awayId) {
  const data = await apiFootball(
    'fixtures/headtohead',
    {
      h2h: `${homeId}-${awayId`,
      last: 20
    },
    60 * 60 * 1000
  );

  return data.response || [];
}

/* =========================================================
   FIXTURE DATA EXTRACTION
========================================================= */

function extractGoals(fixture) {
  const homeGoals =
    fixture.goals?.home;

  const awayGoals =
    fixture.goals?.away;

  if (
    typeof homeGoals !== 'number' ||
    typeof awayGoals !== 'number'
  ) {
    return null;
  }

  return {
    home: homeGoals,
    away: awayGoals
  };
}

function teamResult(fixture, teamId) {
  const goals = extractGoals(fixture);

  if (!goals) return null;

  const homeId = fixture.teams?.home?.id;
  const awayId = fixture.teams?.away?.id;

  if (
    Number(teamId) !== Number(homeId) &&
    Number(teamId) !== Number(awayId)
  ) {
    return null;
  }

  const isHome =
    Number(teamId) === Number(homeId);

  const gf = isHome
    ? goals.home
    : goals.away;

  const ga = isHome
    ? goals.away
    : goals.home;

  let result = 'D';

  if (gf > ga) result = 'W';
  if (gf < ga) result = 'L';

  return {
    result,
    gf,
    ga,
    isHome
  };
}

/* =========================================================
   TEAM FORM
========================================================= */

function calculateForm(fixtures, teamId) {
  const usable = [];

  for (const fixture of fixtures) {
    const result = teamResult(
      fixture,
      teamId
    );

    if (result) {
      usable.push({
        ...result,
        date:
          fixture.fixture?.date ||
          null
      });
    }
  }

  usable.sort(
    (a, b) =>
      new Date(b.date) -
      new Date(a.date)
  );

  const recent = usable.slice(0, 10);

  if (recent.length === 0) {
    return {
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      pointsPerGame: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalsForPerGame: 0,
      goalsAgainstPerGame: 0,
      cleanSheets: 0,
      failedToScore: 0,
      formString: ''
    };
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  let failedToScore = 0;

  for (const match of recent) {
    if (match.result === 'W') {
      wins++;
      points += 3;
    } else if (match.result === 'D') {
      draws++;
      points += 1;
    } else {
      losses++;
    }

    goalsFor += match.gf;
    goalsAgainst += match.ga;

    if (match.ga === 0) {
      cleanSheets++;
    }

    if (match.gf === 0) {
      failedToScore++;
    }
  }

  return {
    matches: recent.length,
    wins,
    draws,
    losses,
    points,
    pointsPerGame:
      points / recent.length,
    goalsFor,
    goalsAgainst,
    goalsForPerGame:
      goalsFor / recent.length,
    goalsAgainstPerGame:
      goalsAgainst / recent.length,
    cleanSheets,
    failedToScore,
    formString: recent
      .map(x => x.result)
      .join('')
  };
}

/* =========================================================
   HOME / AWAY FORM
========================================================= */

function calculateVenueForm(
  fixtures,
  teamId,
  desiredVenue
) {
  const filtered = [];

  for (const fixture of fixtures) {
    const result = teamResult(
      fixture,
      teamId
    );

    if (
      result &&
      result.isHome === desiredVenue
    ) {
      filtered.push(result);
    }
  }

  if (!filtered.length) {
    return {
      matches: 0,
      goalsForPerGame: 0,
      goalsAgainstPerGame: 0,
      pointsPerGame: 0
    };
  }

  let gf = 0;
  let ga = 0;
  let points = 0;

  for (const match of filtered) {
    gf += match.gf;
    ga += match.ga;

    if (match.result === 'W') {
      points += 3;
    } else if (match.result === 'D') {
      points += 1;
    }
  }

  return {
    matches: filtered.length,
    goalsForPerGame:
      gf / filtered.length,
    goalsAgainstPerGame:
      ga / filtered.length,
    pointsPerGame:
      points / filtered.length
  };
}

/* =========================================================
   H2H MODEL
========================================================= */

function calculateH2H(
  h2h,
  homeId,
  awayId
) {
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (const fixture of h2h) {
    const goals = extractGoals(fixture);

    if (!goals) continue;

    const fixtureHome =
      fixture.teams?.home?.id;

    const fixtureAway =
      fixture.teams?.away?.id;

    let homeScore = goals.home;
    let awayScore = goals.away;

    if (
      Number(fixtureHome) === Number(awayId) &&
      Number(fixtureAway) === Number(homeId)
    ) {
      homeScore = goals.away;
      awayScore = goals.home;
    }

    if (homeScore > awayScore) {
      homeWins++;
    } else if (homeScore < awayScore) {
      awayWins++;
    } else {
      draws++;
    }
  }

  const total =
    homeWins +
    draws +
    awayWins;

  if (!total) {
    return {
      matches: 0,
      home: 0.3333,
      draw: 0.3333,
      away: 0.3334
    };
  }

  return {
    matches: total,
    home: homeWins / total,
    draw: draws / total,
    away: awayWins / total
  };
}

/* =========================================================
   POISSON
========================================================= */

function factorial(n) {
  if (n <= 1) return 1;

  let result = 1;

  for (let i = 2; i <= n; i++) {
    result *= i;
  }

  return result;
}

function poissonProbability(
  goals,
  lambda
) {
  return (
    Math.exp(-lambda) *
    Math.pow(lambda, goals) /
    factorial(goals)
  );
}

function poissonMatrix(
  homeLambda,
  awayLambda,
  maxGoals = 7
) {
  const matrix = [];

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const probability =
        poissonProbability(
          h,
          homeLambda
        ) *
        poissonProbability(
          a,
          awayLambda
        );

      matrix.push({
        home: h,
        away: a,
        probability
      });
    }
  }

  return matrix;
}

function poissonOutcomeProbabilities(
  matrix
) {
  let home = 0;
  let draw = 0;
  let away = 0;

  for (const item of matrix) {
    if (item.home > item.away) {
      home += item.probability;
    } else if (
      item.home === item.away
    ) {
      draw += item.probability;
    } else {
      away += item.probability;
    }
  }

  return normalizeProbabilities({
    home,
    draw,
    away
  });
}

/* =========================================================
   GOAL MARKETS
========================================================= */

function calculateGoalMarkets(
  matrix,
  homeLambda,
  awayLambda
) {
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let bttsYes = 0;

  for (const item of matrix) {
    const total =
      item.home + item.away;

    if (total >= 2) {
      over15 += item.probability;
    }

    if (total >= 3) {
      over25 += item.probability;
    }

    if (total >= 4) {
      over35 += item.probability;
    }

    if (
      item.home >= 1 &&
      item.away >= 1
    ) {
      bttsYes += item.probability;
    }
  }

  return {
    over15,
    over25,
    under25: 1 - over25,
    over35,
    under35: 1 - over35,
    bttsYes,
    bttsNo: 1 - bttsYes,
    expectedGoals:
      homeLambda + awayLambda
  };
}

/* =========================================================
   EXACT SCORES
========================================================= */

function topScores(matrix, limit = 8) {
  return [...matrix]
    .sort(
      (a, b) =>
        b.probability -
        a.probability
    )
    .slice(0, limit)
    .map(item => ({
      score: `${item.home}-${item.away}`,
      home: item.home,
      away: item.away,
      probability:
        item.probability
    }));
}

/* =========================================================
   MODEL EXPECTED GOALS
========================================================= */

function calculateExpectedGoals(
  homeForm,
  awayForm,
  homeVenue,
  awayVenue
) {
  const homeAttack =
    homeVenue.matches > 0
      ? homeVenue.goalsForPerGame
      : homeForm.goalsForPerGame;

  const homeDefense =
    homeVenue.matches > 0
      ? homeVenue.goalsAgainstPerGame
      : homeForm.goalsAgainstPerGame;

  const awayAttack =
    awayVenue.matches > 0
      ? awayVenue.goalsForPerGame
      : awayForm.goalsForPerGame;

  const awayDefense =
    awayVenue.matches > 0
      ? awayVenue.goalsAgainstPerGame
      : awayForm.goalsAgainstPerGame;

  /*
    Attack + opposing defence.

    The square-root/geometric approach prevents
    one extreme statistic from completely dominating.
  */

  let homeLambda =
    Math.sqrt(
      Math.max(0.05, homeAttack) *
      Math.max(0.05, awayDefense)
    );

  let awayLambda =
    Math.sqrt(
      Math.max(0.05, awayAttack) *
      Math.max(0.05, homeDefense)
    );

  /*
    Small form adjustment.
  */

  const homeFormStrength =
    homeForm.pointsPerGame / 3;

  const awayFormStrength =
    awayForm.pointsPerGame / 3;

  homeLambda *=
    0.90 +
    0.20 * clamp(
      homeFormStrength,
      0,
      1
    );

  awayLambda *=
    0.90 +
    0.20 * clamp(
      awayFormStrength,
      0,
      1
    );

  /*
    Home advantage.
  */

  homeLambda *= 1.08;

  homeLambda = clamp(
    homeLambda,
    0.20,
    4.50
  );

  awayLambda = clamp(
    awayLambda,
    0.20,
    4.50
  );

  return {
    home: homeLambda,
    away: awayLambda
  };
}

/* =========================================================
   FORM MODEL
========================================================= */

function formProbabilities(
  homeForm,
  awayForm
) {
  const homeStrength =
    homeForm.pointsPerGame / 3;

  const awayStrength =
    awayForm.pointsPerGame / 3;

  const homeGoalDiff =
    homeForm.goalsForPerGame -
    homeForm.goalsAgainstPerGame;

  const awayGoalDiff =
    awayForm.goalsForPerGame -
    awayForm.goalsAgainstPerGame;

  let home =
    0.33 +
    (homeStrength - awayStrength) *
      0.38 +
    (homeGoalDiff - awayGoalDiff) *
      0.025;

  let away =
    0.33 +
    (awayStrength - homeStrength) *
      0.38 +
    (awayGoalDiff - homeGoalDiff) *
      0.025;

  let draw =
    1 -
    home -
    away;

  home = clamp(home, 0.05, 0.85);
  away = clamp(away, 0.05, 0.85);
  draw = clamp(draw, 0.08, 0.50);

  return normalizeProbabilities({
    home,
    draw,
    away
  });
}

/* =========================================================
   API PREDICTION
========================================================= */

function extractApiPrediction(data) {
  const prediction =
    data?.response?.[0]?.predictions;

  if (!prediction) {
    return null;
  }

  const percentData =
    prediction.percent || {};

  function parsePercent(value) {
    if (typeof value === 'number') {
      return value / 100;
    }

    if (typeof value === 'string') {
      return (
        parseFloat(
          value.replace('%', '')
        ) / 100
      );
    }

    return 0;
  }

  return normalizeProbabilities({
    home: parsePercent(
      percentData.home
    ),
    draw: parsePercent(
      percentData.draw
    ),
    away: parsePercent(
      percentData.away
    )
  });
}

/* =========================================================
   ENSEMBLE
========================================================= */

function ensembleModel({
  poisson,
  form,
  h2h,
  external
}) {
  /*
    Our independent model is dominant.

    Poisson: 50%
    Form:    25%
    H2H:     10%
    API:     15%

    The external API prediction is kept separate
    and only contributes a limited amount.
  */

  const result = {
    home:
      poisson.home * 0.50 +
      form.home * 0.25 +
      h2h.home * 0.10 +
      (external?.home ?? poisson.home) *
        0.15,

    draw:
      poisson.draw * 0.50 +
      form.draw * 0.25 +
      h2h.draw * 0.10 +
      (external?.draw ?? poisson.draw) *
        0.15,

    away:
      poisson.away * 0.50 +
      form.away * 0.25 +
      h2h.away * 0.10 +
      (external?.away ?? poisson.away) *
        0.15
  };

  return normalizeProbabilities(
    result
  );
}

/* =========================================================
   AGREEMENT
========================================================= */

function calculateAgreement(
  model,
  external,
  bookmaker
) {
  const sources = [];

  sources.push({
    name: 'Our model',
    probabilities: model
  });

  if (external) {
    sources.push({
      name: 'API model',
      probabilities: external
    });
  }

  if (bookmaker) {
    sources.push({
      name: 'Market',
      probabilities: bookmaker
    });
  }

  const distances = [];

  for (let i = 0; i < sources.length; i++) {
    for (
      let j = i + 1;
      j < sources.length;
      j++
    ) {
      const a =
        sources[i].probabilities;

      const b =
        sources[j].probabilities;

      const distance =
        Math.abs(a.home - b.home) +
        Math.abs(a.draw - b.draw) +
        Math.abs(a.away - b.away);

      distances.push(distance);
    }
  }

  const averageDistance =
    distances.length
      ? distances.reduce(
          (a, b) => a + b,
          0
        ) / distances.length
      : 0;

  let level = 'HIGH';

  if (averageDistance > 0.30) {
    level = 'LOW';
  } else if (
    averageDistance > 0.18
  ) {
    level = 'MEDIUM';
  }

  return {
    level,
    averageDistance,
    sources
  };
}

/* =========================================================
   BOOKMAKER ODDS
========================================================= */

function extractBookmakerProbabilities(
  oddsData
) {
  const response =
    oddsData?.response || [];

  if (!response.length) {
    return null;
  }

  const bookmakers =
    response[0]?.bookmakers || [];

  if (!bookmakers.length) {
    return null;
  }

  /*
    Look for a standard Match Winner market.
  */

  for (const bookmaker of bookmakers) {
    const bets =
      bookmaker.bets || [];

    const market =
      bets.find(
        bet =>
          String(bet.name)
            .toLowerCase()
            .includes('match winner')
      );

    if (!market) continue;

    let homeOdds = null;
    let drawOdds = null;
    let awayOdds = null;

    for (const value of market.values || []) {
      const label =
        String(value.value)
          .toLowerCase();

      const odd =
        Number(value.odd);

      if (!Number.isFinite(odd) || odd <= 1) {
        continue;
      }

      if (
        label === 'home'
      ) {
        homeOdds = odd;
      }

      if (
        label === 'draw'
      ) {
        drawOdds = odd;
      }

      if (
        label === 'away'
      ) {
        awayOdds = odd;
      }
    }

    if (
      homeOdds &&
      drawOdds &&
      awayOdds
    ) {
      return normalizeProbabilities({
        home: 1 / homeOdds,
        draw: 1 / drawOdds,
        away: 1 / awayOdds
      });
    }
  }

  return null;
}

/* =========================================================
   MAIN ANALYSIS
========================================================= */

async function analyzeMatch({
  homeName,
  awayName,
  date
}) {
  if (!homeName || !awayName) {
    throw new Error(
      'Both home and away team names are required.'
    );
  }

  const analysisDate =
    date ||
    dateOnly(new Date());

  const [homeTeam, awayTeam] =
    await Promise.all([
      searchTeam(homeName),
      searchTeam(awayName)
    ]);

  const [
    fixture,
    homeFixtures,
    awayFixtures,
    h2h
  ] = await Promise.all([
    findFixture(
      homeTeam.id,
      awayTeam.id,
      analysisDate
    ),
    getRecentFixtures(
      homeTeam.id,
      10
    ),
    getRecentFixtures(
      awayTeam.id,
      10
    ),
    getH2H(
      homeTeam.id,
      awayTeam.id
    )
  ]);

  const homeForm =
    calculateForm(
      homeFixtures,
      homeTeam.id
    );

  const awayForm =
    calculateForm(
      awayFixtures,
      awayTeam.id
    );

  const homeVenue =
    calculateVenueForm(
      homeFixtures,
      homeTeam.id,
      true
    );

  const awayVenue =
    calculateVenueForm(
      awayFixtures,
      awayTeam.id,
      false
    );

  const expectedGoals =
    calculateExpectedGoals(
      homeForm,
      awayForm,
      homeVenue,
      awayVenue
    );

  const matrix =
    poissonMatrix(
      expectedGoals.home,
      expectedGoals.away,
      7
    );

  const poisson =
    poissonOutcomeProbabilities(
      matrix
    );

  const form =
    formProbabilities(
      homeForm,
      awayForm
    );

  const h2hModel =
    calculateH2H(
      h2h,
      homeTeam.id,
      awayTeam.id
    );

  let external = null;
  let bookmaker = null;

  if (fixture?.fixture?.id) {
    try {
      const predictionData =
        await apiFootball(
          'predictions',
          {
            fixture:
              fixture.fixture.id
          },
          10 * 60 * 1000
        );

      external =
        extractApiPrediction(
          predictionData
        );
    } catch (error) {
      console.warn(
        'Prediction endpoint failed:',
        error.message
      );
    }

    try {
      const oddsData =
        await apiFootball(
          'odds',
          {
            fixture:
              fixture.fixture.id
          },
          5 * 60 * 1000
        );

      bookmaker =
        extractBookmakerProbabilities(
          oddsData
        );
    } catch (error) {
      console.warn(
        'Odds endpoint failed:',
        error.message
      );
    }
  }

  const ensemble =
    ensembleModel({
      poisson,
      form,
      h2h: h2hModel,
      external
    });

  const goals =
    calculateGoalMarkets(
      matrix,
      expectedGoals.home,
      expectedGoals.away
    );

  const scores =
    topScores(matrix);

  const agreement =
    calculateAgreement(
      ensemble,
      external,
      bookmaker
    );

  let predictedResult = 'DRAW';

  if (
    ensemble.home >
    ensemble.draw &&
    ensemble.home >
    ensemble.away
  ) {
    predictedResult = 'HOME';
  }

  if (
    ensemble.away >
    ensemble.home &&
    ensemble.away >
    ensemble.draw
  ) {
    predictedResult = 'AWAY';
  }

  return {
    generatedAt:
      new Date().toISOString(),

    requestedDate: analysisDate,

    fixture: fixture
      ? {
          id: fixture.fixture.id,
          date:
            fixture.fixture.date,
          status:
            fixture.fixture.status,
          venue:
            fixture.fixture.venue
        }
      : null,

    teams: {
      home: {
        id: homeTeam.id,
        name: homeTeam.name,
        logo: homeTeam.logo
      },

      away: {
        id: awayTeam.id,
        name: awayTeam.name,
        logo: awayTeam.logo
      }
    },

    prediction: {
      result: predictedResult,

      home: ensemble.home,
      draw: ensemble.draw,
      away: ensemble.away,

      formatted: {
        home: percent(
          ensemble.home
        ),
        draw: percent(
          ensemble.draw
        ),
        away: percent(
          ensemble.away
        )
      }
    },

    expectedGoals: {
      home: round(
        expectedGoals.home,
        2
      ),
      away: round(
        expectedGoals.away,
        2
      ),
      total: round(
        expectedGoals.home +
          expectedGoals.away,
        2
      )
    },

    goalMarkets: {
      over15: percent(
        goals.over15
      ),
      over25: percent(
        goals.over25
      ),
      under25: percent(
        goals.under25
      ),
      over35: percent(
        goals.over35
      ),
      under35: percent(
        goals.under35
      ),
      bttsYes: percent(
        goals.bttsYes
      ),
      bttsNo: percent(
        goals.bttsNo
      )
    },

    exactScores: scores.map(
      item => ({
        score: item.score,
        probability:
          percent(
            item.probability
          )
      })
    ),

    form: {
      home: homeForm,
      away: awayForm
    },

    venueForm: {
      home: homeVenue,
      away: awayVenue
    },

    h2h: {
      matches:
        h2hModel.matches,
      home:
        percent(h2hModel.home),
      draw:
        percent(h2hModel.draw),
      away:
        percent(h2hModel.away)
    },

    externalModel: external
      ? {
          home:
            percent(external.home),
          draw:
            percent(external.draw),
          away:
            percent(external.away)
        }
      : null,

    marketModel: bookmaker
      ? {
          home:
            percent(bookmaker.home),
          draw:
            percent(bookmaker.draw),
          away:
            percent(bookmaker.away)
        }
      : null,

    agreement,

    models: {
      poisson: {
        home:
          percent(poisson.home),
        draw:
          percent(poisson.draw),
        away:
          percent(poisson.away)
      },

      form: {
        home:
          percent(form.home),
        draw:
          percent(form.draw),
        away:
          percent(form.away)
      },

      h2h: {
        home:
          percent(h2hModel.home),
        draw:
          percent(h2hModel.draw),
        away:
          percent(h2hModel.away)
      }
    }
  };
}

/* =========================================================
   ROUTES
========================================================= */

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'football-predictor',
    time: new Date().toISOString()
  });
});

app.get('/api/search-team', async (req, res) => {
  try {
    const name =
      String(req.query.name || '')
        .trim();

    if (!name) {
      return res.status(400).json({
        error: 'Team name is required.'
      });
    }

    const team =
      await searchTeam(name);

    res.json({
      success: true,
      team
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/analyze', async (req, res) => {
  try {
    const home =
      String(req.query.home || '')
        .trim();

    const away =
      String(req.query.away || '')
        .trim();

    const date =
      String(
        req.query.date ||
        dateOnly(new Date())
      ).trim();

    if (!home || !away) {
      return res.status(400).json({
        success: false,
        error:
          'Use ?home=TEAM&away=TEAM&date=YYYY-MM-DD'
      });
    }

    const result =
      await analyzeMatch({
        homeName: home,
        awayName: away,
        date
      });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error(
      'Analysis error:',
      error
    );

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================================================
   SPA FALLBACK
========================================================= */

app.get('*', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );
});

/* =========================================================
   START
========================================================= */

app.listen(PORT, () => {
  console.log(
    `Football Predictor running on port ${PORT}`
  );
});
