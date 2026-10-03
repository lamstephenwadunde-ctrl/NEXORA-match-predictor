'use strict';

const homeInput =
  document.getElementById('homeTeam');

const awayInput =
  document.getElementById('awayTeam');

const dateInput =
  document.getElementById('matchDate');

const analyzeBtn =
  document.getElementById('analyzeBtn');

const loading =
  document.getElementById('loading');

const results =
  document.getElementById('results');

const errorBox =
  document.getElementById('errorBox');

const statusText =
  document.getElementById('statusText');

const statusDot =
  document.getElementById('statusDot');


function today() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      now.getDate()
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


dateInput.value = today();


function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function showLoading(value) {
  loading.classList.toggle(
    'hidden',
    !value
  );

  analyzeBtn.disabled = value;

  analyzeBtn.textContent =
    value
      ? 'Analyzing...'
      : 'Analyze Match';
}


function showError(message) {
  errorBox.textContent = message;

  errorBox.classList.remove(
    'hidden'
  );
}


function clearError() {
  errorBox.textContent = '';

  errorBox.classList.add(
    'hidden'
  );
}


function setStatus(
  text,
  online = true
) {
  statusText.textContent = text;

  statusDot.style.background =
    online
      ? '#8cff00'
      : '#ff5d6c';
}


function setText(
  id,
  value
) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent =
      value ?? '—';
  }
}


function renderForm(
  containerId,
  form
) {
  const container =
    document.getElementById(
      containerId
    );

  if (!form) {
    container.innerHTML =
      '<p>No form data available.</p>';

    return;
  }

  container.innerHTML = `

    <div class="stat-line">
      <span>Matches</span>
      <strong>${form.matches}</strong>
    </div>

    <div class="stat-line">
      <span>Wins</span>
      <strong>${form.wins}</strong>
    </div>

    <div class="stat-line">
      <span>Draws</span>
      <strong>${form.draws}</strong>
    </div>

    <div class="stat-line">
      <span>Losses</span>
      <strong>${form.losses}</strong>
    </div>

    <div class="stat-line">
      <span>Points/Game</span>
      <strong>
        ${Number(
          form.pointsPerGame || 0
        ).toFixed(2)}
      </strong>
    </div>

    <div class="stat-line">
      <span>Goals For/Game</span>
      <strong>
        ${Number(
          form.goalsForPerGame || 0
        ).toFixed(2)}
      </strong>
    </div>

    <div class="stat-line">
      <span>Goals Against/Game</span>
      <strong>
        ${Number(
          form.goalsAgainstPerGame || 0
        ).toFixed(2)}
      </strong>
    </div>

    <div class="stat-line">
      <span>Clean Sheets</span>
      <strong>
        ${form.cleanSheets || 0}
      </strong>
    </div>

    <div class="stat-line">
      <span>Recent Form</span>
      <strong>
        ${escapeHTML(
          form.formString || '—'
        )}
      </strong>
    </div>
  `;
}


function renderScores(scores) {
  const container =
    document.getElementById(
      'scores'
    );

  if (!scores?.length) {
    container.innerHTML =
      '<p>No score matrix available.</p>';

    return;
  }

  container.innerHTML =
    scores
      .map(
        item => `
          <div class="score">

            <strong>
              ${escapeHTML(
                item.score
              )}
            </strong>

            <span>
              ${escapeHTML(
                item.probability
              )}
            </span>

          </div>
        `
      )
      .join('');
}


function renderModels(data) {
  const models =
    data.models || {};

  const rows = [];

  rows.push(`
    <div class="model-row">
      <div>Model</div>
      <div>Home</div>
      <div>Draw</div>
      <div>Away</div>
    </div>
  `);

  for (const [name, value]
    of Object.entries(models)) {

    rows.push(`
      <div class="model-row">

        <div>
          ${escapeHTML(
            name.toUpperCase()
          )}
        </div>

        <div>
          ${escapeHTML(
            value.home
          )}
        </div>

        <div>
          ${escapeHTML(
            value.draw
          )}
        </div>

        <div>
          ${escapeHTML(
            value.away
          )}
        </div>

      </div>
    `);
  }

  rows.push(`
    <div class="model-row">

      <div>
        ENSEMBLE
      </div>

      <div>
        ${escapeHTML(
          data.prediction.formatted.home
        )}
      </div>

      <div>
        ${escapeHTML(
          data.prediction.formatted.draw
        )}
      </div>

      <div>
        ${escapeHTML(
          data.prediction.formatted.away
        )}
      </div>

    </div>
  `);

  document.getElementById(
    'models'
  ).innerHTML =
    rows.join('');
}


function renderExternal(data) {
  const container =
    document.getElementById(
      'externalComparison'
    );

  const boxes = [];

  boxes.push(`
    <div class="compare-box">

      <h4>Our Model</h4>

      <p>
        Home:
        ${data.prediction.formatted.home}
      </p>

      <p>
        Draw:
        ${data.prediction.formatted.draw}
      </p>

      <p>
        Away:
        ${data.prediction.formatted.away}
      </p>

    </div>
  `);

  if (data.externalModel) {

    boxes.push(`
      <div class="compare-box">

        <h4>API Model</h4>

        <p>
          Home:
          ${escapeHTML(
            data.externalModel.home
          )}
        </p>

        <p>
          Draw:
          ${escapeHTML(
            data.externalModel.draw
          )}
        </p>

        <p>
          Away:
          ${escapeHTML(
            data.externalModel.away
          )}
        </p>

      </div>
    `);

  } else {

    boxes.push(`
      <div class="compare-box">

        <h4>API Model</h4>

        <p>
          No prediction data available
          for this fixture.
        </p>

      </div>
    `);
  }

  if (data.marketModel) {

    boxes.push(`
      <div class="compare-box">

        <h4>Market</h4>

        <p>
          Home:
          ${escapeHTML(
            data.marketModel.home
          )}
        </p>

        <p>
          Draw:
          ${escapeHTML(
            data.marketModel.draw
          )}
        </p>

        <p>
          Away:
          ${escapeHTML(
            data.marketModel.away
          )}
        </p>

      </div>
    `);

  } else {

    boxes.push(`
      <div class="compare-box">

        <h4>Market</h4>

        <p>
          No current odds available.
        </p>

      </div>
    `);
  }

  container.innerHTML =
    boxes.join('');
}


function render(data) {

  results.classList.remove(
    'hidden'
  );

  setText(
    'homeName',
    data.teams.home.name
  );

  setText(
    'awayName',
    data.teams.away.name
  );

  const homeLogo =
    document.getElementById(
      'homeLogo'
    );

  const awayLogo =
    document.getElementById(
      'awayLogo'
    );

  homeLogo.src =
    data.teams.home.logo || '';

  awayLogo.src =
    data.teams.away.logo || '';

  setText(
    'homeProb',
    data.prediction.formatted.home
  );

  setText(
    'drawProb',
    data.prediction.formatted.draw
  );

  setText(
    'awayProb',
    data.prediction.formatted.away
  );

  setText(
    'resultText',
    data.prediction.result
  );

  setText(
    'homeXg',
    data.expectedGoals.home
  );

  setText(
    'awayXg',
    data.expectedGoals.away
  );

  setText(
    'totalXg',
    data.expectedGoals.total
  );

  setText(
    'over15',
    data.goalMarkets.over15
  );

  setText(
    'over25',
    data.goalMarkets.over25
  );

  setText(
    'under25',
    data.goalMarkets.under25
  );

  setText(
    'btts',
    data.goalMarkets.bttsYes
  );

  setText(
    'agreementBadge',
    data.agreement.level
  );

  setText(
    'agreementDistance',
    Number(
      data.agreement.averageDistance
    ).toFixed(3)
  );

  setText(
    'formHomeTitle',
    data.teams.home.name
  );

  setText(
    'formAwayTitle',
    data.teams.away.name
  );

  renderScores(
    data.exactScores
  );

  renderModels(data);

  renderForm(
    'homeForm',
    data.form.home
  );

  renderForm(
    'awayForm',
    data.form.away
  );

  renderExternal(data);
}


async function analyze() {

  clearError();

  results.classList.add(
    'hidden'
  );

  const home =
    homeInput.value.trim();

  const away =
    awayInput.value.trim();

  const date =
    dateInput.value;

  if (!home || !away) {

    showError(
      'Enter both teams.'
    );

    return;
  }

  if (!date) {

    showError(
      'Select the match date.'
    );

    return;
  }

  showLoading(true);

  setStatus(
    'Analyzing',
    true
  );

  try {

    const params =
      new URLSearchParams({
        home,
        away,
        date
      });

    const response =
      await fetch(
        `/api/analyze?${params}`
      );

    const json =
      await response.json();

    if (!response.ok ||
        !json.success) {

      throw new Error(
        json.error ||
        'Unable to analyze match.'
      );
    }

    render(json.data);

    setStatus(
      'Analysis complete',
      true
    );

    window.scrollTo({
      top: results.offsetTop - 20,
      behavior: 'smooth'
    });

  } catch (error) {

    console.error(error);

    showError(
      error.message
    );

    setStatus(
      'Error',
      false
    );

  } finally {

    showLoading(false);
  }
}


analyzeBtn.addEventListener(
  'click',
  analyze
);


homeInput.addEventListener(
  'keydown',
  event => {
    if (event.key === 'Enter') {
      analyze();
    }
  }
);


awayInput.addEventListener(
  'keydown',
  event => {
    if (event.key === 'Enter') {
      analyze();
    }
  }
);
