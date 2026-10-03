function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

/*
  Builds expected goals from available real statistics.

  IMPORTANT:
  Missing information is not invented.
  Missing components simply contribute no adjustment.
*/

function estimateExpectedGoals(data = {}) {

  let homeXg = 1.25;
  let awayXg = 1.05;

  const home = data.home || {};
  const away = data.away || {};

  if (home.homeGoalsFor != null) {

    homeXg =
      0.75 * homeXg +
      0.25 *
        clamp(
          safeNumber(home.homeGoalsFor),
          0.2,
          4
        );
  }

  if (away.awayGoalsAgainst != null) {

    homeXg =
      0.75 * homeXg +
      0.25 *
        clamp(
          safeNumber(away.awayGoalsAgainst),
          0.2,
          4
        );
  }

  if (away.awayGoalsFor != null) {

    awayXg =
      0.75 * awayXg +
      0.25 *
        clamp(
          safeNumber(away.awayGoalsFor),
          0.2,
          4
        );
  }

  if (home.homeGoalsAgainst != null) {

    awayXg =
      0.75 * awayXg +
      0.25 *
        clamp(
          safeNumber(home.homeGoalsAgainst),
          0.2,
          4
        );
  }

  /*
    xG data gets priority when genuinely available.
  */

  if (home.xg != null) {

    homeXg =
      0.65 * homeXg +
      0.35 *
        clamp(
          safeNumber(home.xg),
          0.2,
          4
        );
  }

  if (away.xg != null) {

    awayXg =
      0.65 * awayXg +
      0.35 *
        clamp(
          safeNumber(away.xg),
          0.2,
          4
        );
  }

  /*
    Home advantage is a model adjustment,
    not fake match information.
  */

  homeXg *= 1.04;

  return {
    home: Number(
      clamp(homeXg, 0.2, 4).toFixed(3)
    ),

    away: Number(
      clamp(awayXg, 0.2, 4).toFixed(3)
    )
  };
}

module.exports = {
  estimateExpectedGoals
};
