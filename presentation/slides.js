(function initPresentation() {
  'use strict';

  const DATA = window.DDOL_V2_DATA;
  const PRO = window.DDOL_PRO_ANALYSIS;
  const WELFARE = window.DDOL_WELFARE_DESTINATIONS;
  const WELFARE_COORDINATES = window.DDOL_WELFARE_COORDINATE_LAYERS;
  const WELFARE_DESTINATION_SENSITIVITY = window.DDOL_WELFARE_DESTINATION_SENSITIVITY;
  const BUS_NETWORK_EVIDENCE = window.DDOL_BUS_NETWORK_EVIDENCE;
  const GEO = window.DDOL_V2_BOUNDARIES;
  const slides = [...document.querySelectorAll('.slide')];
  const total = slides.length;
  let current = 0;
  let touchStartX = null;

  const C = Object.freeze({ navy: '#0b2e59', blue: '#0066cc', teal: '#0a7c78', orange: '#b6403a', red: '#b6403a', ink: '#1d2433', muted: '#5e6b7a', line: '#d9e1ea', paper: '#f5f7fa', white: '#ffffff' });
  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const fmt = (value, digits = 0) => Number(value).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const svg = (content, viewBox, label) => `<svg viewBox="${viewBox}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;

  function set(selector, content) {
    const node = $(selector);
    if (node) node.innerHTML = content;
  }

  function fallback(selector, message) {
    set(selector, `<div class="visual-fallback">${esc(message)}</div>`);
  }

  function hexMix(a, b, amount) {
    const parse = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
    const aa = parse(a); const bb = parse(b);
    return `#${aa.map((value, index) => Math.round(value + ((bb[index] - value) * amount)).toString(16).padStart(2, '0')).join('')}`;
  }

  function mapMarkup({ metric, transform = (value) => value, low = '#edf3f8', high = C.navy, labels = false, highlight = [], highlightStyle = 'fill', focus, dark = false } = {}) {
    const areaByCode = new Map(DATA.areas.map((area) => [area.code, area]));
    const values = metric ? DATA.areas.map((area) => transform(Number(area[metric]) || 0)) : [];
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const span = max - min || 1;
    const highlightSet = new Set(highlight);
    const paths = GEO.features.map((feature) => {
      const area = areaByCode.get(feature.code);
      const value = metric && area ? transform(Number(area[metric]) || 0) : 0;
      const t = clamp((value - min) / span, 0, 1);
      let fill = metric ? hexMix(low, high, t) : (dark ? '#244d73' : '#e7edf3');
      if (highlightSet.has(feature.dong) && highlightStyle === 'fill') fill = C.teal;
      if (feature.dong === focus) fill = C.orange;
      const active = highlightSet.has(feature.dong) || feature.dong === focus;
      const stroke = active && highlightStyle === 'outline'
        ? C.orange
        : (dark ? '#416785' : '#ffffff');
      return `<path d="${feature.path}" fill="${fill}" stroke="${stroke}" stroke-width="${active ? 3.8 : 1.25}" vector-effect="non-scaling-stroke"><title>${esc(feature.dong)}</title></path>`;
    }).join('');
    const labelSet = new Set([...highlight, focus].filter(Boolean));
    const text = labels ? GEO.features.filter((feature) => labelSet.has(feature.dong)).map((feature) => `<text x="${feature.labelX}" y="${feature.labelY}" text-anchor="middle" dominant-baseline="central" fill="${dark ? '#fff' : C.navy}" font-size="18" font-weight="800" stroke="${dark ? C.navy : '#fff'}" stroke-width="5" paint-order="stroke">${esc(feature.dong)}</text>`).join('') : '';
    return svg(`${paths}${text}`, GEO.metadata.viewBox || '0 0 900 660', '고양시 44개 행정동 GIS 지도');
  }

  function renderMaps() {
    set('#cover-map', mapMarkup({ highlight: PRO.dssAblation.stableCoreDongs, dark: false }));
    set('#demand-map', mapMarkup({ metric: 'single70', low: '#edf7f5', high: C.teal, highlight: PRO.dssAblation.stableCoreDongs, highlightStyle: 'outline', labels: true }));
    set('#facility-map', mapMarkup({ metric: 'nearestFacilityM', transform: Math.log1p, low: '#edf3fb', high: C.navy, highlight: PRO.dssAblation.stableCoreDongs, highlightStyle: 'outline', labels: true }));
    set('#candidate-map', mapMarkup({ highlight: PRO.baseline.candidateDongs, focus: '관산동', labels: true }));
    set('#drt-map', mapMarkup({ highlight: ['식사동', '고봉동', '대덕동', '화전동'], highlightStyle: 'outline', labels: true }));
    set('#closing-map', mapMarkup({ highlight: PRO.dssAblation.stableCoreDongs, labels: true, dark: true }));
  }

  function renderDependence() {
    const rows = PRO.dssComponentDependence.pairRows;
    const shortLabel = (row) => {
      const a = row.componentA === 'facility' ? '의료거리' : (row.componentA === 'bus' ? '버스 비효율' : 'CAG');
      const b = row.componentB === 'facility' ? '의료거리' : (row.componentB === 'bus' ? '버스 비효율' : 'CAG');
      return `${a} ↔ ${b}`;
    };
    const width = 680; const height = 410; const left = 225; const barW = 390;
    const content = [`<text x="${left}" y="35" class="svg-small">0</text><text x="${left + barW}" y="35" text-anchor="end" class="svg-small">1.0</text>`];
    rows.forEach((row, index) => {
      const y = 72 + index * 105;
      const value = Math.abs(row.spearmanRho);
      content.push(`<text x="${left - 18}" y="${y + 28}" text-anchor="end" class="svg-label">${esc(shortLabel(row))}</text>`);
      content.push(`<rect x="${left}" y="${y}" width="${barW}" height="42" fill="#dfe6ed"/><rect x="${left}" y="${y}" width="${value * barW}" height="42" fill="${value >= .8 ? C.orange : C.teal}"/>`);
      content.push(`<text x="${left + Math.max(55, value * barW - 12)}" y="${y + 29}" text-anchor="end" fill="${value > .25 ? '#fff' : C.navy}" font-size="17" font-weight="850">ρ ${value.toFixed(3)}</text>`);
      if (value >= .8) content.push(`<text x="${left + barW}" y="${y + 65}" text-anchor="end" fill="${C.orange}" font-size="13" font-weight="800">중복 경고 기준 |ρ|≥.8</text>`);
    });
    set('#dependence-chart', svg(content.join(''), `0 0 ${width} ${height}`, 'DSS 구성요소 Spearman 순위상관'));
  }

  function renderAblation() {
    const rows = PRO.dssAblation.scenarios;
    const width = 680; const height = 410; const left = 235; const barW = 360;
    const content = [`<text x="${left}" y="35" class="svg-small">교체 0곳</text><text x="${left + barW}" y="35" text-anchor="end" class="svg-small">교체 8곳</text>`];
    rows.forEach((row, index) => {
      const changed = 8 - row.intersectionCount;
      const y = 68 + index * 78;
      content.push(`<text x="${left - 18}" y="${y + 28}" text-anchor="end" class="svg-label">${esc(row.scenarioLabel)}</text>`);
      content.push(`<rect x="${left}" y="${y}" width="${barW}" height="38" fill="#dfe6ed"/><rect x="${left}" y="${y}" width="${changed / 8 * barW}" height="38" fill="${changed === 0 ? C.teal : C.orange}"/>`);
      content.push(`<text x="${left + Math.max(54, changed / 8 * barW - 10)}" y="${y + 27}" text-anchor="end" fill="${changed > 1 ? '#fff' : C.navy}" font-size="16" font-weight="850">${changed}곳</text>`);
    });
    content.push(`<text x="${left}" y="390" class="svg-small">안정 핵심: ${esc(PRO.dssAblation.stableCoreDongs.join(' · '))}</text>`);
    set('#ablation-chart', svg(content.join(''), `0 0 ${width} ${height}`, 'DSS 요소 제거에 따른 후보 교체 수'));
  }

  function renderVillage() {
    const rows = PRO.focusComparison.rows;
    const width = 980; const height = 500; const left = 160; const maxW = 720;
    const content = [`<text x="${left}" y="35" class="svg-small">0%</text><text x="${left + maxW}" y="35" text-anchor="end" class="svg-small">100%</text>`];
    rows.forEach((row, index) => {
      const y = 80 + index * 125; const share = row.villageServingStopShare;
      content.push(`<text x="${left - 20}" y="${y + 32}" text-anchor="end" class="svg-label">${esc(row.dong)}</text>`);
      content.push(`<rect x="${left}" y="${y}" width="${maxW}" height="46" fill="#dfe6ed"/><rect x="${left}" y="${y}" width="${share * maxW}" height="46" fill="${row.dong === '관산동' ? C.teal : C.blue}"/>`);
      content.push(`<text x="${left + share * maxW - 12}" y="${y + 31}" text-anchor="end" fill="#fff" font-size="17" font-weight="850">${fmt(share * 100, 1)}%</text>`);
      content.push(`<text x="${left}" y="${y + 75}" class="svg-small">마을노선 표기 정류장 ${row.villageServingStopCount}/${row.allStopCount} · 고유 노선명 ${row.uniqueVillageRouteCount}개</text>`);
    });
    set('#village-chart', svg(content.join(''), `0 0 ${width} ${height}`, '관산동 행주동 대화동 마을버스 정적 존재 비교'));
  }

  function renderWelfare() {
    const wanted = [
      ['partial_senior_centers', '경로당 · 부분'],
      ['full_senior_centers', '경로당 · 완전'],
      ['partial_senior_welfare_centers', '노인복지관 · 부분'],
      ['full_senior_welfare_centers', '노인복지관 · 완전'],
      ['partial_elder_care_providers', '돌봄기관 · 부분'],
      ['full_elder_care_providers', '돌봄기관 · 완전'],
    ];
    const byId = new Map((WELFARE_DESTINATION_SENSITIVITY?.scenarios || []).map((row) => [row.scenario_id, row]));
    const rows = wanted.map(([id, label]) => ({ ...byId.get(id), label })).filter((row) => row.scenario_id);
    const width = 820; const height = 410; const left = 205; const maxW = 505; const maxChange = 8;
    const content = [
      `<text x="${left}" y="28" class="svg-small">후보 교체 0곳</text>`,
      `<text x="${left + maxW}" y="28" text-anchor="end" class="svg-small">후보 교체 8곳</text>`,
    ];
    rows.forEach((row, index) => {
      const y = 48 + index * 55; const widthValue = row.replacement_count / maxChange * maxW;
      const color = row.replacement_scope === 'full_cag_and_facility_term' ? C.orange : C.teal;
      content.push(`<text x="${left - 16}" y="${y + 25}" text-anchor="end" class="svg-label">${esc(row.label)}</text>`);
      content.push(`<rect x="${left}" y="${y}" width="${maxW}" height="34" fill="#dfe6ed"/><rect x="${left}" y="${y}" width="${widthValue}" height="34" fill="${color}"/>`);
      content.push(`<text x="${left + Math.max(48, widthValue - 9)}" y="${y + 24}" text-anchor="end" fill="${row.replacement_count ? '#fff' : C.navy}" font-size="15" font-weight="850">${row.replacement_count}/8</text>`);
    });
    content.push(`<circle cx="${left}" cy="389" r="7" fill="${C.teal}"/><text x="${left + 14}" y="394" class="svg-small">시설거리 항만 치환</text><circle cx="${left + 190}" cy="389" r="7" fill="${C.orange}"/><text x="${left + 204}" y="394" class="svg-small">CAG와 시설거리 모두 치환</text>`);
    set('#welfare-chart', svg(content.join(''), `0 0 ${width} ${height}`, '복지 목적지 종류와 치환 범위에 따른 후보 Top8 교체 수'));
  }

  function renderTime() {
    const rows = PRO.accessibilityTimeScenarios.candidateRows.filter((row) => row.dong === '관산동');
    const ordered = rows.sort((a, b) => a.waitMinutes - b.waitMinutes);
    const reference = ordered[0]?.referenceMedianMinutes || 0;
    const breakEven = ordered[0]?.breakEvenWaitMedianMinutes || 0;
    const width = 980; const height = 480; const left = 150; const right = 850; const top = 55; const bottom = 375;
    const yMin = 10; const yMax = 26;
    const xForWait = (wait) => left + ((wait - 5) / 10) * (right - left);
    const yForTime = (minutes) => bottom - ((minutes - yMin) / (yMax - yMin)) * (bottom - top);
    const content = [];
    [10, 15, 20, 25].forEach((tick) => {
      const y = yForTime(tick);
      content.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#d9e1ea"/><text x="${left - 18}" y="${y + 5}" text-anchor="end" class="svg-small">${tick}분</text>`);
    });
    const referenceY = yForTime(reference);
    content.push(`<line x1="${left}" y1="${referenceY}" x2="${right}" y2="${referenceY}" stroke="${C.navy}" stroke-width="3" stroke-dasharray="10 8"/><text x="${right}" y="${referenceY - 12}" text-anchor="end" fill="${C.navy}" font-size="16" font-weight="850">보행 대리 중앙 ${fmt(reference, 1)}분</text>`);
    const breakEvenX = xForWait(breakEven);
    content.push(`<line x1="${breakEvenX}" y1="${top}" x2="${breakEvenX}" y2="${bottom}" stroke="${C.orange}" stroke-width="3" stroke-dasharray="7 7"/><text x="${breakEvenX + 12}" y="${top + 24}" fill="${C.orange}" font-size="16" font-weight="850">손익분기 대기 ${fmt(breakEven, 1)}분</text>`);
    const points = ordered.map((row) => `${xForWait(row.waitMinutes)},${yForTime(row.scenarioMedianMinutes)}`).join(' ');
    content.push(`<polyline points="${points}" fill="none" stroke="${C.teal}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`);
    ordered.forEach((row) => {
      const x = xForWait(row.waitMinutes); const y = yForTime(row.scenarioMedianMinutes);
      content.push(`<circle cx="${x}" cy="${y}" r="11" fill="${C.teal}" stroke="#fff" stroke-width="4"/><text x="${x}" y="${y - 24}" text-anchor="middle" fill="${C.teal}" font-size="19" font-weight="900">${fmt(row.scenarioMedianMinutes, 1)}분</text><text x="${x}" y="${bottom + 38}" text-anchor="middle" class="svg-label">대기 ${row.waitMinutes}분</text>`);
    });
    content.push(`<text x="${left}" y="455" class="svg-small">중앙 격자 일반화시간 · 운영성과가 아닌 공개 가정 시나리오</text>`);
    set('#time-chart', svg(content.join(''), `0 0 ${width} ${height}`, '관산동 대기시간별 중앙 일반화 이동시간과 손익분기 대기시간'));
  }

  function renderCandidateTable() {
    const rows = DATA.candidates;
    const body = rows.map((row) => `<tr class="${row.dong === '관산동' ? 'highlight' : ''}"><td><strong>${esc(row.dong)}</strong></td><td>${fmt(row.agingRate * 100, 1)}%</td><td>${fmt(row.single70)}세대</td><td>${fmt(row.stops)}개</td><td>${fmt(row.routesPerStop, 2)}</td><td>${fmt(row.nearestFacilityM / 1000, 2)}km</td><td><small>${row.dong === '관산동' ? '대표 현장확인' : '후보'}</small></td></tr>`).join('');
    set('#candidate-table', `<table><thead><tr><th>행정동</th><th>고령화율</th><th>70+ 1인세대</th><th>정류장</th><th>정류장당 노선</th><th>의료거리</th><th>해석</th></tr></thead><tbody>${body}</tbody></table>`);
  }

  function renderWeight() {
    const rows = PRO.baseline.candidateDongs.map((dong) => PRO.weightSensitivity.inclusionRows.find((row) => row.dong === dong));
    const width = 1350; const height = 560; const left = 190; const maxW = 1050;
    const content = [`<text x="${left}" y="28" class="svg-small">0</text><text x="${left + maxW}" y="28" text-anchor="end" class="svg-small">45개 조합</text>`];
    rows.forEach((row, index) => {
      const y = 48 + index * 61; const w = row.share * maxW;
      content.push(`<text x="${left - 20}" y="${y + 27}" text-anchor="end" class="svg-label">${esc(row.dong)}</text><rect x="${left}" y="${y}" width="${maxW}" height="38" fill="#dfe6ed"/><rect x="${left}" y="${y}" width="${w}" height="38" fill="${row.count === 45 ? C.teal : C.blue}"/><text x="${left + Math.max(58, w - 12)}" y="${y + 27}" text-anchor="end" fill="${w > 90 ? '#fff' : C.navy}" font-size="16" font-weight="850">${row.count}/45</text>`);
    });
    set('#weight-chart', svg(content.join(''), `0 0 ${width} ${height}`, '후보 8개 동의 제한 가중치 45개 조합 포함 수'));
  }

  function renderSpatial() {
    const rows = PRO.spatialWeights; const width = 1320; const height = 530; const cardW = 400;
    const titles = { queen: 'Queen 경계', symmetricKnn4: '대칭 kNN 4', symmetricKnn6: '대칭 kNN 6' };
    const content = [];
    rows.forEach((row, index) => {
      const x = 20 + index * 445; const barH = row.moranI / Math.max(...rows.map((r) => r.moranI)) * 190;
      content.push(`<rect x="${x}" y="20" width="${cardW}" height="470" fill="#f5f7fa" stroke="#d9e1ea"/><text x="${x + 28}" y="62" class="svg-title">${esc(titles[row.method] || row.method)}</text><text x="${x + 28}" y="92" class="svg-small">이웃 ${row.minNeighborCount}~${row.maxNeighborCount}개</text><rect x="${x + 48}" y="${355 - barH}" width="92" height="${barH}" fill="${C.blue}"/><text x="${x + 94}" y="390" text-anchor="middle" class="svg-title">I ${row.moranI.toFixed(3)}</text><text x="${x + 94}" y="417" text-anchor="middle" class="svg-small">p=${row.pValue.toFixed(4)}</text><text x="${x + 205}" y="175" class="svg-small">FDR 5% 유의 HH</text><text x="${x + 205}" y="242" fill="${row.significantHhDongs.length ? C.orange : C.muted}" font-size="48" font-weight="850">${row.significantHhDongs.length}</text><text x="${x + 205}" y="275" class="svg-small">${esc(row.significantHhDongs.join(' · ') || '없음')}</text>`);
    });
    set('#spatial-chart', svg(content.join(''), `0 0 ${width} ${height}`, '공간가중치 방법별 Moran 분석'));
  }

  function renderClaim() {
    const s = DATA.claimSummary; const totalClaims = s.total; const rows = [{ label: '재현·확인', value: s.confirmed, color: C.teal }, { label: '조건부', value: s.conditional, color: C.blue }, { label: '정정 필요', value: s.correction, color: C.orange }];
    const width = 850; const height = 420; const left = 190; const maxW = 570; const content = [];
    rows.forEach((row, index) => { const y = 65 + index * 105; const w = row.value / totalClaims * maxW; content.push(`<text x="${left - 18}" y="${y + 31}" text-anchor="end" class="svg-label">${row.label}</text><rect x="${left}" y="${y}" width="${maxW}" height="44" fill="#dfe6ed"/><rect x="${left}" y="${y}" width="${w}" height="44" fill="${row.color}"/><text x="${left + w - 12}" y="${y + 30}" text-anchor="end" fill="#fff" font-size="17" font-weight="850">${row.value}개</text>`); });
    set('#claim-chart', svg(content.join(''), `0 0 ${width} ${height}`, '포스터 주장 29개 재검증 상태'));
  }

  function renderAll() {
    if (!DATA || !PRO || !WELFARE || !WELFARE_DESTINATION_SENSITIVITY || !GEO) {
      ['#cover-map', '#demand-map', '#facility-map', '#candidate-map', '#drt-map', '#closing-map', '#dependence-chart', '#ablation-chart', '#village-chart', '#welfare-chart', '#time-chart', '#candidate-table', '#weight-chart', '#spatial-chart', '#claim-chart'].forEach((selector) => fallback(selector, '공개 분석 데이터를 불러오지 못했습니다.'));
      return;
    }
    renderMaps(); renderDependence(); renderAblation(); renderVillage(); renderWelfare(); renderTime(); renderCandidateTable(); renderWeight(); renderSpatial(); renderClaim();
  }

  function resizeDeck() {
    const viewport = $('#presentation-viewport'); const stage = $('#deck-stage');
    if (!viewport || !stage) return;
    const scale = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    viewport.style.width = `${1600 * scale}px`; viewport.style.height = `${900 * scale}px`;
    stage.style.transformOrigin = 'top left'; stage.style.transform = `scale(${scale})`;
  }

  function indexFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('presenter') === '1') document.body.classList.add('presenter-embed');
    if (params.get('capture') === '1') document.body.classList.add('capture');
    const requested = Number(params.get('slide'));
    return Number.isInteger(requested) && requested >= 1 && requested <= total ? requested - 1 : 0;
  }

  function show(index, updateUrl = true) {
    current = clamp(index, 0, total - 1);
    slides.forEach((slide, slideIndex) => { const active = slideIndex === current; slide.classList.toggle('is-active', active); slide.setAttribute('aria-hidden', String(!active)); });
    const counter = $('#slide-counter'); const progress = $('#progress-bar');
    if (counter) counter.textContent = `${current + 1} / ${total}`;
    if (progress) progress.style.width = `${(current + 1) / total * 100}%`;
    document.title = `${String(current + 1).padStart(2, '0')} · ${slides[current].querySelector('h1,h2')?.textContent?.trim() || '닿지 않는 돌봄'}`;
    if (updateUrl) { const url = new URL(location.href); url.searchParams.set('slide', String(current + 1)); history.replaceState({ slide: current + 1 }, '', url); }
    slides[current].focus({ preventScroll: true });
  }

  function bind() {
    $('#prev-slide')?.addEventListener('click', () => show(current - 1)); $('#next-slide')?.addEventListener('click', () => show(current + 1)); $('#print-deck')?.addEventListener('click', () => window.print());
    $('#fullscreen')?.addEventListener('click', async () => { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); });
    document.addEventListener('keydown', (event) => { if (event.altKey || event.ctrlKey || event.metaKey) return; if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); show(current + 1); } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(event.key)) { event.preventDefault(); show(current - 1); } else if (event.key === 'Home') show(0); else if (event.key === 'End') show(total - 1); else if (event.key.toLowerCase() === 'f') $('#fullscreen')?.click(); else if (event.key.toLowerCase() === 'p') window.print(); });
    document.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0]?.screenX ?? null; }, { passive: true });
    document.addEventListener('touchend', (event) => { if (touchStartX === null) return; const endX = event.changedTouches[0]?.screenX ?? touchStartX; const delta = endX - touchStartX; if (Math.abs(delta) > 60) show(current + (delta < 0 ? 1 : -1)); touchStartX = null; }, { passive: true });
    window.addEventListener('resize', resizeDeck); window.addEventListener('popstate', () => show(indexFromUrl(), false));
  }

  function assertContract() {
    const checks = { slideCount: total === 29, mainCount: slides.filter((slide) => !slide.classList.contains('appendix')).length === 17, appendixCount: slides.filter((slide) => slide.classList.contains('appendix')).length === 12, areaCount: DATA?.areas?.length === 44, candidateCount: PRO?.baseline?.candidateDongs?.length === 8, welfareLoaded: WELFARE?.metadata?.workbookRecordCount === 594, welfareCoordinatesLoaded: WELFARE_COORDINATES?.metadata?.counts?.seniorCenters === 591 && WELFARE_COORDINATES?.points?.filter((point) => point.serviceType === 'senior_center').length === 585, welfareSensitivityLoaded: WELFARE_DESTINATION_SENSITIVITY?.scenarios?.length === 12 && WELFARE_DESTINATION_SENSITIVITY?.candidateStability?.filter((row) => row.stable_all_scenarios).length === 4, busEvidenceLoaded: BUS_NETWORK_EVIDENCE?.headway?.officialRouteNumberCandidates === 82 && BUS_NETWORK_EVIDENCE?.headway?.uniqueOfficialRows === 72, dssAblation: PRO?.dssAblation?.scenarioCount === 4 };
    window.DDOL_PRESENTATION_CHECKS = Object.freeze(checks);
    const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key); if (failed.length) console.error('발표자료 계약 점검 실패', failed);
  }

  slides.forEach((slide) => { slide.tabIndex = -1; });
  renderAll(); bind(); resizeDeck(); show(indexFromUrl(), false); assertContract();
})();
