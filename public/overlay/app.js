/** Renders the live SSE snapshots and events into the OBS browser source panels. */
(() => {
  const elements = {
    baseline: document.getElementById('baseline'),
    countdown: document.getElementById('countdown'),
    meter: document.getElementById('meter'),
    moments: document.getElementById('moments'),
    score: document.getElementById('score'),
    scoreSmall: document.getElementById('scoreSmall'),
    translations: document.getElementById('translations'),
    vote: document.getElementById('vote'),
    voteOptions: document.getElementById('voteOptions'),
    voteTitle: document.getElementById('voteTitle'),
  };
  const query = new URLSearchParams(window.location.search);
  const languageFlags = {
    en: '🇬🇧',
    es: '🇪🇸',
    fr: '🇫🇷',
    pcm: '🇳🇬',
    unknown: '🌐',
    yo: '🇳🇬',
  };
  let countdownInterval;

  if (query.has('bg')) {
    document.body.classList.add('preview');
  }

  function renderHype(hype) {
    const score = Number(hype.score ?? 0);
    const baseline = Number(hype.baseline ?? 0);
    const panel = document.querySelector('.hype-panel');

    elements.score.textContent = String(Math.round(score));
    elements.scoreSmall.textContent = score.toFixed(1);
    elements.baseline.textContent = baseline.toFixed(1);
    elements.meter.style.width = `${Math.min(100, score * 4)}%`;
    panel.classList.toggle('is-hot', score >= baseline * 2.4 && score >= 8);
  }

  function renderMoments(moments) {
    if (!moments.length) {
      elements.moments.innerHTML =
        '<p class="empty">Big moments will show up here.</p>';
      return;
    }

    elements.moments.innerHTML = moments
      .slice(0, 5)
      .map((moment, index) => {
        const clip =
          moment.status === 'ready' && moment.clipUrl
            ? `<a class="clip-link" href="${escapeAttribute(moment.clipUrl)}" target="_blank" rel="noreferrer">Clip ↗</a>`
            : escapeHtml(moment.status);
        const samples = (moment.peakMessages ?? [])
          .slice(0, 3)
          .map((message) => `${message.user}: ${message.text}`)
          .join(' · ');

        return `
          <article class="moment">
            <div class="moment-heading">
              <span>#${index + 1} · ${formatTime(moment.ts)}</span>
              <span class="moment-score">${Math.round(moment.score)} hype</span>
              <span>${clip}</span>
            </div>
            <p class="sample-chat">${escapeHtml(samples || 'Peak chat activity')}</p>
          </article>
        `;
      })
      .join('');
  }

  function renderTranslation(translation) {
    const confidenceClass =
      translation.confidence >= 0.75
        ? 'confidence-high'
        : translation.confidence >= 0.45
          ? 'confidence-medium'
          : 'confidence-low';
    const article = document.createElement('article');
    article.className = 'translation';
    article.innerHTML = `
      <div class="translation-meta">
        <span>${languageFlags[translation.lang] ?? '🌐'}</span>
        <span>${escapeHtml(translation.lang)} → EN</span>
        <span>·</span>
        <span>${escapeHtml(translation.provider)}</span>
        <span class="confidence ${confidenceClass}">${Math.round(translation.confidence * 100)}% confidence</span>
      </div>
      <p class="original-text">${escapeHtml(translation.original)}</p>
      <p class="translated-text">${escapeHtml(translation.translated)}</p>
    `;
    elements.translations.prepend(article);

    while (elements.translations.children.length > 6) {
      elements.translations.lastElementChild.remove();
    }
  }

  function renderTranslations(translations) {
    elements.translations.innerHTML = '';
    translations.slice(0, 6).forEach(renderTranslation);

    if (!translations.length) {
      elements.translations.innerHTML =
        '<p class="empty">Chat translations appear here.</p>';
    }
  }

  function renderVote(vote) {
    window.clearInterval(countdownInterval);

    if (!vote) {
      elements.vote.classList.add('hidden');
      return;
    }

    elements.vote.classList.remove('hidden');
    elements.voteTitle.textContent = vote.prompt;
    const counts = vote.counts ?? { a: 0, b: 0, c: 0 };
    const largestCount = Math.max(1, ...Object.values(counts));
    const labels = { a: 'Option A', b: 'Option B', c: 'Option C' };

    elements.voteOptions.innerHTML = (vote.options ?? ['a', 'b', 'c'])
      .map((option) => {
        const count = counts[option] ?? 0;
        const width = (count / largestCount) * 100;

        return `
          <div class="vote-option">
            <i style="width: ${width}%"></i>
            <span>${option}) ${labels[option] ?? option} · ${count} votes</span>
          </div>
        `;
      })
      .join('');

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((vote.endsAt - Date.now()) / 1000),
      );
      elements.countdown.textContent = `${remaining}s remaining`;
    };

    updateCountdown();
    countdownInterval = window.setInterval(updateCountdown, 250);
  }

  function renderState(state) {
    renderHype(state.hype ?? {});
    renderMoments(state.moments ?? []);
    renderTranslations(state.translations ?? []);
    renderVote(state.vote);
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function connectEvents() {
    const events = new EventSource('/events');

    events.addEventListener('state', (event) => {
      renderState(JSON.parse(event.data));
    });
    events.addEventListener('hype:score', (event) => {
      renderHype(JSON.parse(event.data));
    });

    for (const eventName of ['moment:new', 'moment:update']) {
      events.addEventListener(eventName, () => {
        fetch('/state')
          .then((response) => response.json())
          .then((state) => renderMoments(state.moments ?? []));
      });
    }

    events.addEventListener('translation:new', (event) => {
      renderTranslation(JSON.parse(event.data));
    });

    for (const eventName of ['vote:start', 'vote:update']) {
      events.addEventListener(eventName, (event) => {
        renderVote(JSON.parse(event.data));
      });
    }

    events.addEventListener('vote:end', () => renderVote(null));
    events.onerror = () => {
      events.close();
      window.setTimeout(connectEvents, 1500);
    };
  }

  function renderDemo() {
    renderState({
      hype: { score: 21.4, baseline: 4.2 },
      moments: [
        {
          ts: Date.now() - 42_000,
          score: 26,
          status: 'ready',
          clipUrl: 'https://clips.twitch.tv/',
          peakMessages: [
            { user: 'Nia', text: 'W W POG omo!' },
            { user: 'Kofi', text: 'e choke, clip it!' },
          ],
        },
        {
          ts: Date.now() - 183_000,
          score: 18,
          status: 'ready',
          clipUrl: 'https://clips.twitch.tv/',
          peakMessages: [{ user: 'Amara', text: 'Ẹ ṣé, ó dára gan-an!' }],
        },
        {
          ts: Date.now() - 330_000,
          score: 12,
          status: 'creating',
          peakMessages: [{ user: 'Léa', text: 'Incroyable, bien joué!' }],
        },
      ],
      translations: [
        {
          lang: 'pcm',
          original: 'Omo, e choke! una too much.',
          translated: "Wow, it's amazing! You're excellent.",
          provider: 'Pidgin phrases',
          confidence: 0.9,
        },
        {
          lang: 'yo',
          original: 'Ẹ káàrọ̀, ẹ ṣé fún eré náà.',
          translated: 'Good morning, thank you for the game.',
          provider: 'Yoruba glossary',
          confidence: 0.3,
        },
        {
          lang: 'fr',
          original: 'Merci à tous, c’était incroyable!',
          translated: 'Thank you all, that was incredible!',
          provider: 'LibreTranslate',
          confidence: 0.7,
        },
        {
          lang: 'es',
          original: '¡Qué buena jugada!',
          translated: 'What a great play!',
          provider: 'LibreTranslate',
          confidence: 0.7,
        },
      ],
      vote: {
        prompt: 'Next challenge? no-scope, speedrun, or chat picks?',
        options: ['a', 'b', 'c'],
        counts: { a: 4, b: 9, c: 6 },
        endsAt: Date.now() + 18_000,
      },
    });
  }

  if (query.has('demo')) {
    renderDemo();
  } else {
    connectEvents();
  }
})();
