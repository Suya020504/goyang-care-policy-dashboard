(function () {
  'use strict';

  const content = window.GOYANG_PRESENTER_SCRIPT;
  if (!content || !Array.isArray(content.slides) || content.slides.length === 0) {
    document.body.innerHTML = '<p style="padding:2rem">발표자 대본 데이터를 불러오지 못했습니다.</p>';
    return;
  }

  const { metadata, slides } = content;
  const elements = {
    iframe: document.getElementById('slide-preview'),
    previewStage: document.getElementById('preview-stage'),
    previewStatus: document.getElementById('preview-status-text'),
    slidePicker: document.getElementById('slide-picker'),
    progressBar: document.getElementById('session-progress-bar'),
    runTrack: document.getElementById('run-track'),
    runTotal: document.getElementById('run-total'),
    slideNumber: document.getElementById('slide-number'),
    segmentBadge: document.getElementById('segment-badge'),
    heading: document.getElementById('notes-heading'),
    claim: document.getElementById('slide-claim'),
    duration: document.getElementById('slide-duration'),
    talkElapsed: document.getElementById('talk-elapsed'),
    eventElapsed: document.getElementById('event-elapsed'),
    talkRemaining: document.getElementById('talk-remaining'),
    scriptCopy: document.getElementById('script-copy'),
    evidenceList: document.getElementById('evidence-list'),
    caution: document.getElementById('caution-copy'),
    transition: document.getElementById('transition-copy'),
    demoCue: document.getElementById('demo-cue'),
    demoSteps: document.getElementById('demo-steps'),
    demoReturn: document.getElementById('demo-return'),
    previousButton: document.getElementById('previous-button'),
    nextButton: document.getElementById('next-button'),
    previousLabel: document.getElementById('previous-label'),
    nextLabel: document.getElementById('next-label'),
    openDeckButton: document.getElementById('open-deck-button'),
    openMvpButton: document.getElementById('open-mvp-button'),
    demoOpenButton: document.getElementById('demo-open-button'),
    fullscreenButton: document.getElementById('fullscreen-button'),
    copyScriptButton: document.getElementById('copy-script-button'),
    toast: document.getElementById('toast'),
  };

  const state = {
    index: readInitialSlideIndex(),
    toastTimer: null,
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function readInitialSlideIndex() {
    const raw = Number(new URLSearchParams(window.location.search).get('slide'));
    return Number.isFinite(raw) ? clamp(Math.round(raw) - 1, 0, slides.length - 1) : 0;
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  function talkElapsedAt(index) {
    return slides.slice(0, index + 1).reduce((total, slide) => total + slide.durationSeconds, 0);
  }

  function eventElapsedAt(index) {
    const talk = talkElapsedAt(index);
    const extras = index + 1 > metadata.insertAfterSlide
      ? metadata.transitionSeconds + metadata.demoSeconds
      : 0;
    return talk + extras;
  }

  function deckUrl(slideNumber) {
    const url = new URL(metadata.deckPath, window.location.href);
    url.searchParams.set('slide', String(slideNumber));
    url.searchParams.set('presenter', '1');
    return url.href;
  }

  function publicDeckUrl(slideNumber) {
    const url = new URL(metadata.deckPath, window.location.href);
    url.searchParams.set('slide', String(slideNumber));
    return url.href;
  }

  function mvpUrl() {
    const url = new URL(metadata.mvpPath, window.location.href);
    url.searchParams.set('from', 'presentation');
    return url.href;
  }

  function openInNewWindow(url, name) {
    const opened = window.open(url, name, 'noopener,noreferrer');
    if (!opened) showToast('팝업이 차단되었습니다. 브라우저에서 새 창을 허용해 주세요.');
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2400);
  }

  function buildStaticControls() {
    slides.forEach((slide) => {
      const option = document.createElement('option');
      option.value = String(slide.id);
      option.textContent = `${String(slide.id).padStart(2, '0')} · ${slide.shortTitle}`;
      elements.slidePicker.append(option);
    });

    const segments = [
      { label: '본 발표', seconds: metadata.talkSeconds, kind: 'talk' },
      { label: '화면 전환', seconds: metadata.transitionSeconds, kind: 'transition' },
      { label: 'MVP 시연', seconds: metadata.demoSeconds, kind: 'demo' },
    ];

    segments.forEach((segment) => {
      const item = document.createElement('li');
      item.className = `run-segment run-${segment.kind}`;
      item.innerHTML = `<span>${segment.label}</span><strong>${formatTime(segment.seconds)}</strong>`;
      elements.runTrack.append(item);
    });
    elements.runTotal.textContent = `총 ${formatTime(metadata.eventSeconds)}`;
  }

  function renderParagraphs(text) {
    elements.scriptCopy.replaceChildren();
    text.split(/\n\s*\n/).forEach((paragraph) => {
      const element = document.createElement('p');
      element.textContent = paragraph.trim();
      elements.scriptCopy.append(element);
    });
  }

  function renderEvidence(items) {
    elements.evidenceList.replaceChildren();
    items.forEach((item) => {
      const element = document.createElement('li');
      element.textContent = item;
      elements.evidenceList.append(element);
    });
  }

  function renderDemoCue(slide) {
    const hasDemo = Array.isArray(slide.demoSteps) && slide.demoSteps.length > 0;
    elements.demoCue.hidden = !hasDemo;
    if (!hasDemo) return;

    elements.demoSteps.replaceChildren();
    slide.demoSteps.forEach((step) => {
      const item = document.createElement('li');
      const time = document.createElement('strong');
      const copy = document.createElement('div');
      const label = document.createElement('b');
      const cue = document.createElement('p');
      time.textContent = step.at;
      label.textContent = step.label;
      cue.textContent = step.cue;
      copy.append(label, cue);
      item.append(time, copy);
      elements.demoSteps.append(item);
    });
    elements.demoReturn.textContent = slide.demoReturn || '';
  }

  function renderNavigation(index) {
    const previous = slides[index - 1];
    const next = slides[index + 1];
    elements.previousButton.disabled = !previous;
    elements.nextButton.disabled = !next;
    elements.previousLabel.textContent = previous ? previous.shortTitle : '처음입니다';
    elements.nextLabel.textContent = next ? next.shortTitle : '마지막입니다';
  }

  function updateIframe(slideNumber) {
    const nextUrl = deckUrl(slideNumber);
    if (elements.iframe.src !== nextUrl) elements.iframe.src = nextUrl;
    elements.iframe.title = `관객용 슬라이드 ${slideNumber}: ${slides[slideNumber - 1].shortTitle}`;
  }

  function updateUrl(slideNumber) {
    const url = new URL(window.location.href);
    url.searchParams.set('slide', String(slideNumber));
    window.history.replaceState({ slide: slideNumber }, '', url);
  }

  function syncFromIframe() {
    try {
      const search = elements.iframe.contentWindow?.location?.search;
      if (!search) return;
      const slideNumber = Number(new URLSearchParams(search).get('slide'));
      if (Number.isFinite(slideNumber) && slideNumber - 1 !== state.index) {
        goTo(slideNumber - 1);
      }
    } catch (_error) {
      // 배포 환경에서 관객 덱과 발표자 화면이 같은 출처가 아닐 때는 URL 계약만 사용합니다.
    }
  }

  function render() {
    const slide = slides[state.index];
    const slideNumber = state.index + 1;
    const talkElapsed = talkElapsedAt(state.index);
    const eventElapsed = eventElapsedAt(state.index);
    const isDemoGate = slideNumber === metadata.insertAfterSlide;

    elements.slideNumber.textContent = `SLIDE ${String(slideNumber).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    elements.segmentBadge.textContent = isDemoGate ? '본 발표 → 시연' : '본 발표';
    elements.segmentBadge.classList.toggle('is-demo-gate', isDemoGate);
    elements.heading.textContent = slide.title;
    elements.claim.textContent = slide.claim;
    elements.duration.textContent = formatTime(slide.durationSeconds);
    elements.talkElapsed.textContent = formatTime(talkElapsed);
    elements.eventElapsed.textContent = formatTime(eventElapsed);
    elements.talkRemaining.textContent = formatTime(metadata.talkSeconds - talkElapsed);
    elements.caution.textContent = slide.caution;
    elements.transition.textContent = slide.transition;
    elements.slidePicker.value = String(slideNumber);
    elements.previewStatus.textContent = `슬라이드 ${slideNumber}와 대본을 대조 중`;
    elements.progressBar.style.width = `${(eventElapsed / metadata.eventSeconds) * 100}%`;

    renderParagraphs(slide.script);
    renderEvidence(slide.evidence);
    renderDemoCue(slide);
    renderNavigation(state.index);
    updateIframe(slideNumber);
    updateUrl(slideNumber);
  }

  function goTo(index) {
    const nextIndex = clamp(index, 0, slides.length - 1);
    if (nextIndex === state.index) return;
    state.index = nextIndex;
    render();
    document.querySelector('.notes-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function copyCurrentScript() {
    const slide = slides[state.index];
    const text = [
      `[슬라이드 ${slide.id}] ${slide.title}`,
      `예상 시간 ${formatTime(slide.durationSeconds)}`,
      '',
      slide.script,
      '',
      `전환 큐: ${slide.transition}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      showToast('현재 슬라이드 대본을 복사했습니다.');
    } catch (_error) {
      showToast('복사 권한이 없습니다. HTTPS 또는 localhost에서 다시 시도해 주세요.');
    }
  }

  function isTypingTarget(target) {
    return target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || target?.isContentEditable;
  }

  elements.previousButton.addEventListener('click', () => goTo(state.index - 1));
  elements.nextButton.addEventListener('click', () => goTo(state.index + 1));
  elements.slidePicker.addEventListener('change', (event) => goTo(Number(event.target.value) - 1));
  elements.openDeckButton.addEventListener('click', () => openInNewWindow(publicDeckUrl(state.index + 1), 'goyang-audience-deck'));
  elements.openMvpButton.addEventListener('click', () => openInNewWindow(mvpUrl(), 'goyang-policy-mvp'));
  elements.demoOpenButton.addEventListener('click', () => openInNewWindow(mvpUrl(), 'goyang-policy-mvp'));
  elements.copyScriptButton.addEventListener('click', copyCurrentScript);
  elements.iframe.addEventListener('load', syncFromIframe);
  elements.fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await elements.previewStage.requestFullscreen();
    } catch (_error) {
      showToast('이 브라우저에서는 전체화면을 시작할 수 없습니다.');
    }
  });

  window.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target)) return;
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      goTo(state.index - 1);
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goTo(state.index + 1);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      goTo(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      goTo(slides.length - 1);
    }
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const slideNumber = Number(event.data?.slide);
    if (event.data?.type === 'presentation:slidechange' && Number.isFinite(slideNumber)) {
      goTo(slideNumber - 1);
    }
  });

  window.setInterval(syncFromIframe, 300);

  buildStaticControls();
  render();
})();
