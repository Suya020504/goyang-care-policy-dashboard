(function initAudienceDeck() {
  'use strict';

  const DATA = window.DDOL_V2_DATA;
  const PRO = window.DDOL_PRO_ANALYSIS;
  const GEO = window.DDOL_V2_BOUNDARIES;
  const slides = [...document.querySelectorAll('.slide')];
  const total = slides.length;
  let current = 0;
  let touchStartX = null;

  const palette = {
    ink: '#0b2134',
    muted: '#5c6f7c',
    line: '#cbd8da',
    teal: '#087b73',
    tealDark: '#055d58',
    tealSoft: '#dff3f0',
    blue: '#2568d8',
    coral: '#e45f47',
    amber: '#e5a126',
    navy: '#081c2c',
    paper: '#f7faf9',
    white: '#ffffff',
  };

  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const formatInt = (value) => new Intl.NumberFormat('ko-KR').format(Number(value));
  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function svg(content, viewBox, label) {
    return `<svg viewBox="${viewBox}" role="img" aria-label="${escapeHtml(label)}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
  }

  function line(x1, y1, x2, y2, attrs = '') {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
  }

  function setMarkup(selector, markup) {
    const node = typeof selector === 'string' ? $(selector) : selector;
    if (node) node.innerHTML = markup;
  }

  function setFallback(selector, message) {
    setMarkup(selector, `<div style="display:grid;place-items:center;width:100%;height:100%;color:#5c6f7c;font-size:22px;background:#fff">${escapeHtml(message)}</div>`);
  }

  function featureAreaMap() {
    return new Map(DATA.areas.map((area) => [area.code, area]));
  }

  function mapSvg(options = {}) {
    const {
      metric = null,
      metricTransform = (value) => value,
      colors = ['#edf5f3', '#70b7b0', '#075f5a'],
      labels = false,
      candidateLabels = false,
      dark = false,
      closing = false,
    } = options;
    const byCode = featureAreaMap();
    const rawValues = metric
      ? DATA.areas.map((area) => metricTransform(Number(area[metric]) || 0))
      : [];
    const min = rawValues.length ? Math.min(...rawValues) : 0;
    const max = rawValues.length ? Math.max(...rawValues) : 1;
    const range = max - min || 1;
    const boundedStable = new Set(PRO.weightSensitivity.stableDongs || []);
    const boundaryStable = new Set(PRO.weightSensitivity.boundaryAudit.stableDongs || []);

    const paths = GEO.features.map((feature) => {
      const area = byCode.get(feature.code);
      const transformed = metric && area ? metricTransform(Number(area[metric]) || 0) : 0;
      const t = clamp((transformed - min) / range, 0, 1);
      let fill = dark ? '#173d50' : '#e8f0ef';
      if (metric) fill = interpolateThree(colors, t);
      if (!metric && area?.candidate) fill = dark ? '#2b8f88' : '#7bc8c0';
      if (closing && area?.candidate) fill = boundaryStable.has(area.dong) ? '#69d5ca' : '#2a6c70';
      const stroke = area?.candidate ? (dark ? '#9ff1e8' : palette.coral) : (dark ? '#31596a' : '#ffffff');
      const strokeWidth = area?.candidate ? (closing ? 3.2 : 3.5) : 1.4;
      const opacity = closing && area?.candidate && boundedStable.has(area.dong) ? 1 : 0.94;
      return `<path d="${feature.path}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" vector-effect="non-scaling-stroke"><title>${escapeHtml(feature.dong)}${area?.candidate ? ' · 기준 후보' : ''}</title></path>`;
    }).join('');

    const labelNodes = labels
      ? GEO.features
          .filter((feature) => !candidateLabels || byCode.get(feature.code)?.candidate)
          .map((feature) => `<text x="${feature.labelX}" y="${feature.labelY}" text-anchor="middle" dominant-baseline="central" fill="${dark ? '#f1fbfa' : palette.ink}" font-size="${candidateLabels ? 19 : 12}" font-weight="800" style="paint-order:stroke;stroke:${dark ? palette.navy : '#fff'};stroke-width:${candidateLabels ? 5 : 3}px;stroke-linejoin:round">${escapeHtml(feature.dong)}</text>`)
          .join('')
      : '';

    return svg(`${paths}${labelNodes}`, GEO.metadata.viewBox || '0 0 900 660', '고양시 44개 행정동 GIS 지도');
  }

  function interpolateThree(colors, t) {
    if (t <= 0.5) return mixHex(colors[0], colors[1], t * 2);
    return mixHex(colors[1], colors[2], (t - 0.5) * 2);
  }

  function mixHex(a, b, t) {
    const parse = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
    const aa = parse(a);
    const bb = parse(b);
    const parts = aa.map((value, index) => Math.round(value + (bb[index] - value) * t));
    return `#${parts.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function renderMaps() {
    setMarkup('#title-map', mapSvg({ dark: true }));
    setMarkup('#single-map', mapSvg({
      metric: 'single70',
      colors: ['#edf6f4', '#78bcb5', '#075d59'],
      labels: true,
      candidateLabels: true,
    }));
    setMarkup('#distance-map', mapSvg({
      metric: 'nearestFacilityM',
      metricTransform: (value) => Math.log1p(value),
      colors: ['#eef2f8', '#7199d4', '#173c78'],
      labels: true,
      candidateLabels: true,
    }));
    setMarkup('#candidate-map', mapSvg({ labels: true, candidateLabels: true }));
    setMarkup('#closing-map', mapSvg({ dark: true, closing: true }));

    const list = $('#candidate-list');
    if (list) {
      list.innerHTML = PRO.baseline.candidateDongs
        .map((dong) => `<li>${escapeHtml(dong)}</li>`)
        .join('');
    }
  }

  function renderSnapshot() {
    const items = [
      { x: 160, date: '2025-08-25', title: '버스정류장', detail: '2,095개 경계 안', color: palette.amber, y: 125 },
      { x: 590, date: '2026-04-01', title: '행정동 경계', detail: '44개 동', color: palette.blue, y: 290 },
      { x: 950, date: '2026-06-30', title: '주민등록 인구', detail: '1,057,438명', color: palette.teal, y: 105 },
      { x: 1145, date: '2026-06-30', title: '70+ 1인세대', detail: '35,295세대', color: '#3a958d', y: 290 },
      { x: 1340, date: '2026-06-30', title: 'HIRA 시설', detail: '1,893개 계산행', color: palette.coral, y: 105 },
    ];
    const baseline = 215;
    const content = [
      `<rect x="30" y="25" width="1440" height="360" fill="#fff"/>`,
      line(90, baseline, 1410, baseline, `stroke="${palette.line}" stroke-width="5"`),
      `<text x="90" y="365" class="svg-small">혼합 스냅샷: 동일한 날짜의 단면이 아님</text>`,
      `<text x="1410" y="365" text-anchor="end" class="svg-small">재현 실행 2026-08-10</text>`,
      ...items.flatMap((item) => {
        const up = item.y < baseline;
        const cardY = item.y - 58;
        const stemY = up ? item.y + 80 : item.y - 10;
        return [
          line(item.x, baseline, item.x, stemY, `stroke="${item.color}" stroke-width="4"`),
          `<circle cx="${item.x}" cy="${baseline}" r="12" fill="${item.color}" stroke="#fff" stroke-width="5"/>`,
          `<rect x="${item.x - 120}" y="${cardY}" width="240" height="96" rx="4" fill="#f8fbfa" stroke="${item.color}" stroke-width="2"/>`,
          `<text x="${item.x}" y="${cardY + 28}" text-anchor="middle" class="svg-small">${item.date}</text>`,
          `<text x="${item.x}" y="${cardY + 55}" text-anchor="middle" class="svg-title">${item.title}</text>`,
          `<text x="${item.x}" y="${cardY + 79}" text-anchor="middle" class="svg-small">${item.detail}</text>`,
        ];
      }),
    ].flat().join('');
    setMarkup('#snapshot-visual', svg(content, '0 0 1500 410', '다섯 출처층의 기준일과 규모'));
  }

  function renderCandidateScatter() {
    const rows = DATA.candidates;
    const width = 1430;
    const height = 500;
    const margin = { left: 115, right: 70, top: 40, bottom: 70 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xMin = 1.5;
    const xMax = 5.0;
    const yMin = 0;
    const yMax = 4400;
    const x = (value) => margin.left + ((value - xMin) / (xMax - xMin)) * plotW;
    const y = (value) => margin.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH;
    const agingValues = rows.map((row) => row.agingRate);
    const agingMin = Math.min(...agingValues);
    const agingMax = Math.max(...agingValues);
    const radius = (single70) => 16 + Math.sqrt(single70 / Math.max(...rows.map((row) => row.single70))) * 21;
    const labelOffsets = {
      가좌동: [-12, -28], 고양동: [10, -25], 관산동: [10, 31], 능곡동: [12, -25],
      송포동: [12, 30], 주교동: [12, -24], 행주동: [12, 29], 효자동: [12, -24],
    };
    const content = [];

    [0, 1000, 2000, 3000, 4000].forEach((tick) => {
      const yy = y(tick);
      content.push(line(margin.left, yy, width - margin.right, yy, `stroke="#e0e8e8" stroke-width="1"`));
      content.push(`<text x="${margin.left - 20}" y="${yy + 6}" text-anchor="end" class="svg-axis">${formatInt(tick)}</text>`);
    });
    [2, 3, 4, 5].forEach((tick) => {
      const xx = x(tick);
      content.push(line(xx, margin.top, xx, margin.top + plotH, `stroke="#edf1f2" stroke-width="1"`));
      content.push(`<text x="${xx}" y="${height - 28}" text-anchor="middle" class="svg-axis">${tick.toFixed(1)}</text>`);
    });

    const cityX = x(DATA.city.routesPerStop);
    const cityY = y(DATA.city.nearestFacilityMeanM);
    content.push(line(cityX, margin.top, cityX, margin.top + plotH, `stroke="${palette.blue}" stroke-width="2" stroke-dasharray="8 7" opacity="0.7"`));
    content.push(line(margin.left, cityY, width - margin.right, cityY, `stroke="${palette.blue}" stroke-width="2" stroke-dasharray="8 7" opacity="0.7"`));
    content.push(`<text x="${cityX + 10}" y="${margin.top + 22}" fill="${palette.blue}" font-size="14">고양 평균 노선공급 ${DATA.city.routesPerStop.toFixed(2)}</text>`);
    content.push(`<text x="${margin.left + 10}" y="${cityY - 9}" text-anchor="start" fill="${palette.blue}" font-size="14">고양 격자 평균 거리 ${formatInt(Math.round(DATA.city.nearestFacilityMeanM))}m</text>`);

    rows.forEach((row) => {
      const cx = x(row.routesPerStop);
      const cy = y(row.nearestFacilityM);
      const r = radius(row.single70);
      const t = (row.agingRate - agingMin) / (agingMax - agingMin || 1);
      const fill = interpolateThree(['#6f9dd8', '#4fb4a9', '#e35e47'], t);
      const [dx, dy] = labelOffsets[row.dong] || [10, -20];
      content.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" fill-opacity="0.86" stroke="#fff" stroke-width="4"><title>${escapeHtml(row.dong)} · 노선/정류장 ${row.routesPerStop.toFixed(1)} · 시설거리 ${formatInt(Math.round(row.nearestFacilityM))}m · 70+ 1인세대 ${formatInt(row.single70)}세대</title></circle>`);
      content.push(`<text x="${cx + dx}" y="${cy + dy}" text-anchor="${dx < 0 ? 'end' : 'start'}" class="svg-label" style="paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round">${escapeHtml(row.dong)}</text>`);
    });

    content.push(`<text x="${margin.left + plotW / 2}" y="${height - 4}" text-anchor="middle" class="svg-label">정류장당 노선 수 · 높을수록 공급 많음</text>`);
    content.push(`<text x="24" y="${margin.top + plotH / 2}" transform="rotate(-90 24 ${margin.top + plotH / 2})" text-anchor="middle" class="svg-label">의료시설 최근접거리 (m)</text>`);
    setMarkup('#candidate-scatter', svg(content.join(''), `0 0 ${width} ${height}`, '후보 8개 동의 버스 노선공급과 의료시설 거리 산점도'));
  }

  function renderClaimLedger() {
    const summary = DATA.claimSummary;
    const totalClaims = summary.total;
    const segments = [
      { label: '재현·확인', count: summary.confirmed, color: palette.teal },
      { label: '조건부', count: summary.conditional, color: palette.amber },
      { label: '정정 필요', count: summary.correction, color: palette.coral },
    ];
    const width = 1400;
    const x0 = 35;
    const barW = 1330;
    let cursor = x0;
    const content = [`<text x="35" y="25" class="svg-title">포스터 주장 29개 재검증 상태</text>`];
    segments.forEach((segment) => {
      const w = (segment.count / totalClaims) * barW;
      content.push(`<rect x="${cursor}" y="48" width="${w}" height="62" fill="${segment.color}"/>`);
      content.push(`<text x="${cursor + w / 2}" y="76" text-anchor="middle" fill="#fff" font-size="21" font-weight="850">${segment.label}</text>`);
      content.push(`<text x="${cursor + w / 2}" y="100" text-anchor="middle" fill="#fff" font-size="17">${segment.count}개 · ${Math.round(segment.count / totalClaims * 100)}%</text>`);
      cursor += w;
    });
    content.push(`<text x="35" y="145" class="svg-small">A1 근거 수준 · 수치·정의·집계·순위 주장을 각각 분리</text>`);
    setMarkup('#claim-ledger', svg(content.join(''), '0 0 1400 155', '29개 포스터 주장 중 재현 확인 7개 조건부 9개 정정 13개'));

    const rankRows = DATA.rankComparisons.filter((row) => row.group === '후보 8동');
    const rankWidth = 1400;
    const rankHeight = 335;
    const left = 190;
    const right = 60;
    const plotW = rankWidth - left - right;
    const x = (rank) => left + ((rank - 1) / 8) * plotW;
    const rankContent = [
      `<text x="20" y="24" class="svg-title">표시 순위 이동</text>`,
      `<circle cx="1050" cy="18" r="7" fill="${palette.blue}"/><text x="1065" y="24" class="svg-small">포스터</text>`,
      `<circle cx="1160" cy="18" r="7" fill="${palette.coral}"/><text x="1175" y="24" class="svg-small">재현 대리순위</text>`,
    ];
    for (let tick = 1; tick <= 9; tick += 1) {
      const xx = x(tick);
      rankContent.push(line(xx, 42, xx, 314, `stroke="#e3e9ea" stroke-width="1"`));
      rankContent.push(`<text x="${xx}" y="54" text-anchor="middle" class="svg-axis">${tick}</text>`);
    }
    rankRows.forEach((row, index) => {
      const yy = 80 + index * 32;
      const x1 = x(row.posterRank);
      const x2 = x(row.reproducedProxyRank);
      rankContent.push(`<text x="155" y="${yy + 6}" text-anchor="end" class="svg-label">${escapeHtml(row.dong)}</text>`);
      rankContent.push(line(x1, yy, x2, yy, `stroke="#879ba3" stroke-width="4"`));
      rankContent.push(`<circle cx="${x1}" cy="${yy - 3}" r="9" fill="${palette.blue}" stroke="#fff" stroke-width="2"><title>포스터 ${row.posterRank}위</title></circle>`);
      rankContent.push(`<circle cx="${x2}" cy="${yy + 3}" r="9" fill="${palette.coral}" stroke="#fff" stroke-width="2"><title>재현 ${row.reproducedProxyRank}위</title></circle>`);
      rankContent.push(`<text x="1320" y="${yy + 6}" text-anchor="end" fill="${row.difference === 0 ? palette.teal : palette.coral}" font-size="15" font-weight="800">${row.difference === 0 ? '일치' : `${row.difference > 0 ? '+' : ''}${row.difference}`}</text>`);
    });
    setMarkup('#rank-shift', svg(rankContent.join(''), `0 0 ${rankWidth} ${rankHeight}`, '후보 8개 동의 포스터 순위와 재현 대리순위 변화'));
  }

  function renderBoundedBars() {
    const scenarioCount = PRO.weightSensitivity.scenarioCount;
    const byDong = new Map(PRO.weightSensitivity.inclusionRows.map((row) => [row.dong, row]));
    const rows = PRO.baseline.candidateDongs.map((dong) => byDong.get(dong));
    const width = 1080;
    const height = 510;
    const left = 155;
    const barW = 790;
    const content = [
      `<text x="${left}" y="29" class="svg-small">0</text>`,
      `<text x="${left + barW}" y="29" text-anchor="end" class="svg-small">45개 조합</text>`,
    ];
    rows.forEach((row, index) => {
      const y = 55 + index * 55;
      const w = row.share * barW;
      const stable = row.count === scenarioCount;
      content.push(`<text x="${left - 20}" y="${y + 24}" text-anchor="end" class="svg-label">${escapeHtml(row.dong)}</text>`);
      content.push(`<rect x="${left}" y="${y}" width="${barW}" height="31" fill="#e7eeef"/>`);
      content.push(`<rect x="${left}" y="${y}" width="${w}" height="31" fill="${stable ? palette.teal : palette.amber}"/>`);
      content.push(`<text x="${Math.min(left + w + 12, width - 75)}" y="${y + 23}" class="svg-value">${row.count}/45</text>`);
    });
    setMarkup('#bounded-bars', svg(content.join(''), `0 0 ${width} ${height}`, '후보 8개 동의 제한 가중치 45개 조합 포함수'));
  }

  function renderBoundaryCompare() {
    const boundedMap = new Map(PRO.weightSensitivity.inclusionRows.map((row) => [row.dong, row]));
    const boundary = PRO.weightSensitivity.boundaryAudit;
    const boundaryMap = new Map(boundary.inclusionRows.map((row) => [row.dong, row]));
    const names = PRO.baseline.candidateDongs;
    const width = 1400;
    const height = 460;
    const nameX = 140;
    const barX = 210;
    const halfW = 475;
    const gap = 115;
    const content = [
      `<text x="${barX + halfW / 2}" y="28" text-anchor="middle" class="svg-title">제한 45개</text>`,
      `<text x="${barX + halfW + gap + halfW / 2}" y="28" text-anchor="middle" class="svg-title">경계감사 231개</text>`,
      `<text x="${barX + halfW / 2}" y="51" text-anchor="middle" class="svg-small">명시 범위 안 포함비율</text>`,
      `<text x="${barX + halfW + gap + halfW / 2}" y="51" text-anchor="middle" class="svg-small">전체 비음수 simplex 포함비율</text>`,
    ];
    names.forEach((dong, index) => {
      const row45 = boundedMap.get(dong);
      const row231 = boundaryMap.get(dong);
      const y = 76 + index * 45;
      const w45 = row45.share * halfW;
      const w231 = row231.share * halfW;
      const boundaryStable = row231.count === boundary.scenarioCount;
      content.push(`<text x="${nameX}" y="${y + 22}" text-anchor="end" class="svg-label">${escapeHtml(dong)}</text>`);
      content.push(`<rect x="${barX}" y="${y}" width="${halfW}" height="28" fill="#e9eff0"/>`);
      content.push(`<rect x="${barX}" y="${y}" width="${w45}" height="28" fill="${row45.count === PRO.weightSensitivity.scenarioCount ? palette.teal : '#86bdb8'}"/>`);
      content.push(`<text x="${barX + Math.max(42, w45 - 8)}" y="${y + 20}" text-anchor="end" fill="${w45 > 80 ? '#fff' : palette.ink}" font-size="14" font-weight="800">${row45.count}/45</text>`);
      const bx = barX + halfW + gap;
      content.push(`<rect x="${bx}" y="${y}" width="${halfW}" height="28" fill="#e9eff0"/>`);
      content.push(`<rect x="${bx}" y="${y}" width="${w231}" height="28" fill="${boundaryStable ? palette.coral : palette.blue}" opacity="${boundaryStable ? 1 : 0.76}"/>`);
      content.push(`<text x="${bx + Math.max(54, w231 - 8)}" y="${y + 20}" text-anchor="end" fill="${w231 > 90 ? '#fff' : palette.ink}" font-size="14" font-weight="800">${row231.count}/231</text>`);
      if (boundaryStable) content.push(`<circle cx="${bx + halfW + 28}" cy="${y + 14}" r="9" fill="${palette.coral}"/><text x="${bx + halfW + 44}" y="${y + 20}" fill="${palette.coral}" font-size="15" font-weight="900">유일</text>`);
    });
    setMarkup('#boundary-compare', svg(content.join(''), `0 0 ${width} ${height}`, '후보 8개 동의 제한 45개 조합과 경계감사 231개 조합 포함비율 비교'));
  }

  function renderSpatialMethods() {
    const methods = PRO.spatialWeights;
    const width = 1400;
    const height = 420;
    const colW = 410;
    const gap = 50;
    const labels = {
      queen: ['Queen', '행정경계 공유꼭짓점'],
      symmetricKnn4: ['kNN 4', '중심점 최근접 4개 · 대칭'],
      symmetricKnn6: ['kNN 6', '중심점 최근접 6개 · 대칭'],
    };
    const maxI = Math.max(...methods.map((item) => item.moranI));
    const content = [];
    methods.forEach((item, index) => {
      const x = 25 + index * (colW + gap);
      const [title, rule] = labels[item.method] || [item.method, item.neighborRule];
      const hasHh = item.significantHhDongs.length > 0;
      const cardStroke = hasHh ? palette.coral : palette.line;
      const barH = (item.moranI / maxI) * 125;
      content.push(`<rect x="${x}" y="15" width="${colW}" height="365" fill="#fbfdfc" stroke="${cardStroke}" stroke-width="${hasHh ? 4 : 2}"/>`);
      content.push(`<text x="${x + 28}" y="55" class="svg-title">${escapeHtml(title)}</text>`);
      content.push(`<text x="${x + 28}" y="82" class="svg-small">${escapeHtml(rule)}</text>`);
      content.push(`<rect x="${x + 40}" y="${250 - barH}" width="80" height="${barH}" fill="${hasHh ? palette.coral : palette.blue}"/>`);
      content.push(`<text x="${x + 80}" y="275" text-anchor="middle" class="svg-small">Global I</text>`);
      content.push(`<text x="${x + 80}" y="305" text-anchor="middle" class="svg-title">${item.moranI.toFixed(3)}</text>`);
      content.push(`<text x="${x + 80}" y="328" text-anchor="middle" class="svg-small">p=${item.pValue.toFixed(4)}</text>`);
      content.push(`<text x="${x + 168}" y="144" class="svg-small">FDR 5% 유의 HH</text>`);
      content.push(`<text x="${x + 168}" y="203" fill="${hasHh ? palette.coral : palette.muted}" font-size="42" font-weight="900">${hasHh ? item.significantHhDongs.length : 0}</text>`);
      content.push(`<text x="${x + 168}" y="234" fill="${hasHh ? palette.coral : palette.muted}" font-size="19" font-weight="800">${hasHh ? escapeHtml(item.significantHhDongs.join(' · ')) : '없음'}</text>`);
      content.push(`<line x1="${x + 28}" y1="345" x2="${x + colW - 28}" y2="345" stroke="#d9e3e4"/>`);
      content.push(`<text x="${x + 28}" y="368" class="svg-small">이웃 수 ${item.minNeighborCount}–${item.maxNeighborCount}개</text>`);
    });
    setMarkup('#spatial-methods', svg(content.join(''), `0 0 ${width} ${height}`, 'Queen과 kNN 공간가중치 방식별 Moran 분석 결과'));
  }

  function renderAllVisuals() {
    if (!DATA || !PRO || !GEO) {
      ['#title-map', '#single-map', '#distance-map', '#candidate-map', '#closing-map', '#snapshot-visual', '#candidate-scatter', '#claim-ledger', '#rank-shift', '#bounded-bars', '#boundary-compare', '#spatial-methods']
        .forEach((selector) => setFallback(selector, '공개 분석 데이터가 로드되지 않았습니다.'));
      return;
    }
    renderMaps();
    renderSnapshot();
    renderCandidateScatter();
    renderClaimLedger();
    renderBoundedBars();
    renderBoundaryCompare();
    renderSpatialMethods();
  }

  function resizeDeck() {
    const viewport = $('#presentation-viewport');
    const stage = $('#deck-stage');
    if (!viewport || !stage) return;
    const scale = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    viewport.style.width = `${1600 * scale}px`;
    viewport.style.height = `${900 * scale}px`;
    viewport.style.transform = 'none';
    stage.style.transformOrigin = 'top left';
    stage.style.transform = `scale(${scale})`;
  }

  function slideFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const requested = Number(params.get('slide'));
    if (params.get('presenter') === '1') document.body.classList.add('presenter-embed');
    return Number.isFinite(requested) && requested >= 1 && requested <= total ? requested - 1 : 0;
  }

  function showSlide(index, updateUrl = true) {
    current = clamp(index, 0, total - 1);
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    const counter = $('#slide-counter');
    const progress = $('#progress-bar');
    if (counter) counter.textContent = `${current + 1} / ${total}`;
    if (progress) progress.style.width = `${((current + 1) / total) * 100}%`;
    document.title = `${String(current + 1).padStart(2, '0')} · ${slides[current].querySelector('h1,h2')?.textContent?.trim() || '닿지 않는 돌봄'}`;
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('slide', String(current + 1));
      history.replaceState({ slide: current + 1 }, '', url);
    }
    slides[current].focus({ preventScroll: true });
  }

  function move(delta) {
    showSlide(current + delta);
  }

  function bindControls() {
    $('#prev-slide')?.addEventListener('click', () => move(-1));
    $('#next-slide')?.addEventListener('click', () => move(1));
    $('#print-deck')?.addEventListener('click', () => window.print());
    $('#fullscreen')?.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch (error) {
        console.warn('전체 화면을 시작할 수 없습니다.', error);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key)) {
        event.preventDefault();
        move(1);
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(event.key)) {
        event.preventDefault();
        move(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        showSlide(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        showSlide(total - 1);
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        $('#fullscreen')?.click();
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        window.print();
      }
    });

    document.addEventListener('touchstart', (event) => {
      touchStartX = event.changedTouches[0]?.screenX ?? null;
    }, { passive: true });
    document.addEventListener('touchend', (event) => {
      if (touchStartX === null) return;
      const endX = event.changedTouches[0]?.screenX ?? touchStartX;
      const delta = endX - touchStartX;
      if (Math.abs(delta) > 60) move(delta < 0 ? 1 : -1);
      touchStartX = null;
    }, { passive: true });

    window.addEventListener('resize', resizeDeck);
    window.addEventListener('popstate', () => showSlide(slideFromUrl(), false));
  }

  function assertContract() {
    const checks = {
      slideCount: total === 15,
      areaCount: DATA?.areas?.length === 44,
      candidateCount: PRO?.baseline?.candidateDongs?.length === 8,
      claimCount: DATA?.claimSummary?.total === 29,
      boundedScenarioCount: PRO?.weightSensitivity?.scenarioCount === 45,
      boundaryScenarioCount: PRO?.weightSensitivity?.boundaryAudit?.scenarioCount === 231,
      boundaryStable: PRO?.weightSensitivity?.boundaryAudit?.stableDongs?.length === 1,
    };
    window.DDOL_PRESENTATION_CHECKS = Object.freeze(checks);
    const failed = Object.entries(checks).filter(([, passed]) => !passed);
    if (failed.length) console.error('발표자료 데이터 계약 점검 실패', failed.map(([name]) => name));
  }

  slides.forEach((slide) => {
    slide.tabIndex = -1;
  });
  renderAllVisuals();
  bindControls();
  resizeDeck();
  showSlide(slideFromUrl(), false);
  assertContract();
})();
