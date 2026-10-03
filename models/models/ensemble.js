function normalizeProbabilities(probabilities) {

  if (!probabilities) {
    return null;
  }

  const home = Number(probabilities.home) || 0;
  const draw = Number(probabilities.draw) || 0;
  const away = Number(probabilities.away) || 0;

  const total = home + draw + away;

  if (total <= 0) {
    return null;
  }

  return {
    home: home / total,
    draw: draw / total,
    away: away / total
  };
}

function weightedConsensus(sources) {

  const usable = sources
    .map(source => ({
      ...source,
      probabilities:
        normalizeProbabilities(
          source.probabilities
        )
    }))
    .filter(source => source.probabilities);

  if (!usable.length) {
    return null;
  }

  let home = 0;
  let draw = 0;
  let away = 0;
  let totalWeight = 0;

  for (const source of usable) {

    const weight =
      Number(source.weight) > 0
        ? Number(source.weight)
        : 1;

    home += source.probabilities.home * weight;
    draw += source.probabilities.draw * weight;
    away += source.probabilities.away * weight;

    totalWeight += weight;
  }

  return {
    home: home / totalWeight,
    draw: draw / totalWeight,
    away: away / totalWeight,

    sourcesUsed:
      usable.map(source => source.name)
  };
}

function calculateAgreement(sources) {

  const probabilities = sources
    .map(source =>
      normalizeProbabilities(
        source.probabilities
      )
    )
    .filter(Boolean);

  if (probabilities.length < 2) {

    return {
      score: null,
      label: "Limited",
      explanation:
        "Only one usable prediction source is available."
    };
  }

  const average = {
    home:
      probabilities.reduce(
        (sum, x) => sum + x.home,
        0
      ) / probabilities.length,

    draw:
      probabilities.reduce(
        (sum, x) => sum + x.draw,
        0
      ) / probabilities.length,

    away:
      probabilities.reduce(
        (sum, x) => sum + x.away,
        0
      ) / probabilities.length
  };

  let variance = 0;

  for (const p of probabilities) {

    variance +=
      Math.pow(p.home - average.home, 2) +
      Math.pow(p.draw - average.draw, 2) +
      Math.pow(p.away - average.away, 2);
  }

  variance /= probabilities.length;

  const score =
    Math.max(
      0,
      Math.min(
        1,
        1 - Math.sqrt(variance) * 2
      )
    );

  let label = "Low";

  if (score >= 0.75) {
    label = "High";
  } else if (score >= 0.5) {
    label = "Moderate";
  }

  return {
    score,
    label
  };
}

function calculateConfidence({
  consensus,
  agreementScore,
  dataCompleteness,
  modelSupport
}) {

  const strongest =
    Math.max(
      consensus.home,
      consensus.draw,
      consensus.away
    );

  const agreement =
    agreementScore == null
      ? 0.45
      : agreementScore;

  const completeness =
    dataCompleteness == null
      ? 0.5
      : dataCompleteness;

  const support =
    modelSupport == null
      ? 0.5
      : modelSupport;

  const value =
    (
      strongest * 0.40 +
      agreement * 0.25 +
      completeness * 0.20 +
      support * 0.15
    ) * 100;

  const rounded =
    Math.round(
      Math.max(
        0,
        Math.min(100, value)
      )
    );

  let label = "Low";

  if (rounded >= 70) {
    label = "High";
  } else if (rounded >= 55) {
    label = "Moderate";
  }

  return {
    value: rounded,
    label
  };
}

module.exports = {
  normalizeProbabilities,
  weightedConsensus,
  calculateAgreement,
  calculateConfidence
};
