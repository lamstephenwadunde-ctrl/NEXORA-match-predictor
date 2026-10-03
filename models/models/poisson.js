function factorial(n) {
  let result = 1;

  for (let i = 2; i <= n; i++) {
    result *= i;
  }

  return result;
}

function poissonProbability(goals, expectedGoals) {
  const lambda = Math.max(0, Number(expectedGoals) || 0);

  return (
    Math.exp(-lambda) *
    Math.pow(lambda, goals) /
    factorial(goals)
  );
}

function createScoreMatrix(
  homeExpectedGoals,
  awayExpectedGoals,
  maxGoals = 7
) {
  const matrix = [];

  let totalProbability = 0;

  for (let home = 0; home <= maxGoals; home++) {
    for (let away = 0; away <= maxGoals; away++) {

      const probability =
        poissonProbability(home, homeExpectedGoals) *
        poissonProbability(away, awayExpectedGoals);

      matrix.push({
        home,
        away,
        probability
      });

      totalProbability += probability;
    }
  }

  return matrix.map(item => ({
    ...item,
    probability:
      totalProbability > 0
        ? item.probability / totalProbability
        : 0
  }));
}

function sum(matrix, condition) {
  return matrix.reduce(
    (total, item) =>
      total + (condition(item) ? item.probability : 0),
    0
  );
}

function calculateMarkets(matrix) {

  const home =
    sum(matrix, x => x.home > x.away);

  const draw =
    sum(matrix, x => x.home === x.away);

  const away =
    sum(matrix, x => x.home < x.away);

  const bttsYes =
    sum(matrix, x => x.home > 0 && x.away > 0);

  const bttsNo = 1 - bttsYes;

  const totals = {};

  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {

    const over =
      sum(
        matrix,
        x => x.home + x.away > line
      );

    totals[line] = {
      over,
      under: 1 - over
    };
  }

  return {
    result: {
      home,
      draw,
      away
    },

    btts: {
      yes: bttsYes,
      no: bttsNo
    },

    overUnder: totals
  };
}

function getTopCorrectScores(matrix, limit = 10) {

  return [...matrix]
    .sort(
      (a, b) =>
        b.probability - a.probability
    )
    .slice(0, limit);
}

module.exports = {
  poissonProbability,
  createScoreMatrix,
  calculateMarkets,
  getTopCorrectScores
};
