(function initCharts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DdolCharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCharts() {
  'use strict';

  const COLORS = {
    blue: '#0c56e8',
    blueSoft: '#dce9ff',
    teal: '#058b87',
    tealSoft: '#d8f1ef',
    sky: '#63b7e6',
    skySoft: '#dff2fc',
    amber: '#ee9b0b',
    red: '#e34334',
    ink: '#09214a',
    gray: '#dce2eb',
    slate: '#65748b',
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function numeric(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
    const ratio = (numeric(value) - domainMin) / (domainMax - domainMin || 1);
    return rangeMin + clamp(ratio, 0, 1) * (rangeMax - rangeMin);
  }

  function mixColor(start, end, ratio) {
    const normalize = (hex) => hex.replace('#', '').match(/.{2}/g).map((part) => Number.parseInt(part, 16));
    const [sr, sg, sb] = normalize(start);
    const [er, eg, eb] = normalize(end);
    const t = clamp(ratio, 0, 1);
    const channel = (a, b) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
    return `#${channel(sr, er)}${channel(sg, eg)}${channel(sb, eb)}`;
  }

  function statusStack(summary) {
    const confirmed = numeric(summary.confirmed ?? summary.reproduced ?? summary['재현/확인']);
    const conditional = numeric(summary.conditional ?? summary['조건부']);
    const correction = numeric(summary.correction ?? summary.needsCorrection ?? summary['수정·명세 보완']);
    const total = numeric(summary.total, confirmed + conditional + correction) || 1;
    const values = [
      { label: '재현 확인', value: confirmed, color: COLORS.teal },
      { label: '조건부', value: conditional, color: COLORS.amber },
      { label: '수정 필요', value: correction, color: COLORS.red },
    ];
    let x = 0;
    const segments = values.map((item) => {
      const width = (item.value / total) * 760;
      const segment = `<rect x="${x}" y="20" width="${width}" height="34" fill="${item.color}" />`;
      x += width;
      return segment;
    }).join('');
    return `
      <svg class="status-stack" viewBox="0 0 760 92" role="img" aria-label="총 ${total}개 주장 중 재현 확인 ${confirmed}, 조건부 ${conditional}, 수정 필요 ${correction}">
        <defs><clipPath id="status-round"><rect x="0" y="20" width="760" height="34" rx="10" /></clipPath></defs>
        <g clip-path="url(#status-round)">${segments}</g>
        ${values.map((item, index) => `<g transform="translate(${index * 248},72)"><circle r="5" fill="${item.color}"/><text x="12" y="5">${item.label} ${item.value}</text></g>`).join('')}
      </svg>`;
  }

  function cityComposition(city) {
    const population = numeric(city.population, 1057438);
    const elderly = numeric(city.elderly65, 204878);
    const rate = population ? elderly / population : 0;
    const younger = population - elderly;
    const circumference = 2 * Math.PI * 66;
    const elderlyArc = circumference * rate;
    const format = (value) => new Intl.NumberFormat('ko-KR').format(Math.round(value));
    return `
      <svg class="composition-chart" viewBox="0 0 560 260" role="img" aria-label="고양시 주민등록인구 중 65세 이상 204,878명, 19.4퍼센트">
        <g transform="translate(126 130) rotate(-90)">
          <circle r="66" fill="none" stroke="#e5eaf1" stroke-width="24" />
          <circle r="66" fill="none" stroke="${COLORS.blue}" stroke-width="24" stroke-linecap="round" stroke-dasharray="${elderlyArc} ${circumference - elderlyArc}" />
        </g>
        <text class="donut-value" x="126" y="126" text-anchor="middle">${(rate * 100).toFixed(1)}%</text>
        <text class="donut-label" x="126" y="150" text-anchor="middle">65세 이상</text>
        <g transform="translate(245 52)">
          <text class="chart-title" x="0" y="0">연령구성</text>
          <circle cx="6" cy="34" r="6" fill="${COLORS.blue}"/><text class="legend-label" x="22" y="39">65세 이상</text><text class="legend-value" x="286" y="39" text-anchor="end">${format(elderly)}명</text>
          <circle cx="6" cy="72" r="6" fill="#d8dee8"/><text class="legend-label" x="22" y="77">65세 미만</text><text class="legend-value" x="286" y="77" text-anchor="end">${format(younger)}명</text>
          <line x1="0" y1="100" x2="286" y2="100" stroke="#e2e7ee" />
          <text class="legend-label" x="0" y="129">전체 주민등록인구</text><text class="total-value" x="286" y="132" text-anchor="end">${format(population)}명</text>
          <text class="chart-note-text" x="0" y="166">2026-06-30 · 고양시 44개 행정동</text>
        </g>
      </svg>`;
  }

  function administrativeMap(boundaryData, areas, selectedCode, options = {}) {
    if (typeof options === 'string') options = { metric: options };
    const metric = options.metric || 'agingRate';
    const selectedDistrict = options.district || '전체';
    const showBus = Boolean(options.showBus);
    const showFacilities = Boolean(options.showFacilities);
    const features = boundaryData?.features || [];
    const areaByCode = new Map(areas.map((area) => [String(area.code), area]));
    const definitions = {
      agingRate: {
        label: '고령화율',
        value: (area) => numeric(area.agingRate),
        format: (value) => `${(value * 100).toFixed(1)}%`,
        low: '#eaf2ff',
        high: '#0c56e8',
        direction: '높을수록 진한 파랑',
      },
      single70: {
        label: '70세 이상 1인세대',
        value: (area) => numeric(area.single70),
        format: (value) => `${Math.round(value).toLocaleString('ko-KR')}명`,
        low: '#eef4ff',
        high: '#5744c7',
        direction: '많을수록 진한 보라',
      },
      demandIndex: {
        label: '고령수요 대리지수',
        value: (area) => numeric(area.demandIndex),
        format: (value) => value.toFixed(2),
        low: '#3f72ca',
        mid: '#f4f7fa',
        high: '#d9483b',
        diverging: true,
        direction: '0 중심 · 파랑은 낮음, 빨강은 높음',
      },
      routesPerStop: {
        label: '정류장당 경유노선',
        value: (area) => numeric(area.routesPerStop),
        format: (value) => `${value.toFixed(2)}개`,
        low: '#fff0ec',
        high: '#d43f34',
        reverse: true,
        direction: '적을수록 진한 빨강',
      },
      nearestFacilityM: {
        label: '의료시설 평균 최근접거리',
        value: (area) => numeric(area.nearestFacilityM),
        format: (value) => `${(value / 1000).toFixed(2)}km`,
        low: '#e5f5f3',
        high: '#d9483b',
        direction: '멀수록 진한 빨강',
      },
      candidate: {
        label: '후보 8개 집합',
        value: (area) => area.candidate ? 1 : 0,
        format: (value) => value ? '우선검토 후보' : '비후보',
        low: '#edf1f6',
        high: '#0c56e8',
        direction: '파랑은 후보 8개 집합',
      },
      currentDrt: {
        label: '현행 DRT 비교 행정동',
        value: (area) => area.currentDrt ? 1 : 0,
        format: (value) => value ? '현행 비교 동' : '비교 동 매핑 없음',
        low: '#edf1f6',
        high: '#058b87',
        direction: '청록은 4개 운영권역을 매핑한 3개 동',
      },
    };
    const definition = definitions[metric] || definitions.agingRate;
    const rows = features
      .map((feature) => ({ feature, area: areaByCode.get(String(feature.code)) }))
      .filter((row) => row.area);
    if (!rows.length) return '<div class="map-empty">행정동 경계 데이터를 연결하지 못했습니다.</div>';

    const visibleRows = selectedDistrict === '전체'
      ? rows
      : rows.filter((row) => row.area.district === selectedDistrict);
    const values = rows.map((row) => definition.value(row.area));
    let minimum = Math.min(...values);
    let maximum = Math.max(...values);
    if (definition.diverging) {
      const maxAbs = Math.max(Math.abs(minimum), Math.abs(maximum));
      minimum = -maxAbs;
      maximum = maxAbs;
    }
    const colorFor = (value) => {
      let ratio = (value - minimum) / (maximum - minimum || 1);
      if (definition.reverse) ratio = 1 - ratio;
      if (definition.diverging) {
        return ratio <= 0.5
          ? mixColor(definition.low, definition.mid, ratio * 2)
          : mixColor(definition.mid, definition.high, (ratio - 0.5) * 2);
      }
      return mixColor(definition.low, definition.high, ratio);
    };
    const districtNames = {
      '고양시 덕양구': '덕양구',
      '고양시 일산동구': '일산동구',
      '고양시 일산서구': '일산서구',
    };
    const districts = new Map();
    rows.forEach(({ feature, area }) => {
      const points = districts.get(area.district) || [];
      points.push([numeric(feature.labelX), numeric(feature.labelY)]);
      districts.set(area.district, points);
    });
    const districtLabels = [...districts.entries()].filter(([district]) => (
      selectedDistrict === '전체' || district === selectedDistrict
    )).map(([district, points]) => {
      const x = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      const y = points.reduce((sum, point) => sum + point[1], 0) / points.length;
      return `<text class="map-district-label" x="${x}" y="${y}">${escapeHtml(districtNames[district] || district)}</text>`;
    }).join('');
    const paths = rows.map(({ feature, area }) => {
      const value = definition.value(area);
      const selected = String(feature.code) === String(selectedCode);
      const outsideDistrict = selectedDistrict !== '전체' && area.district !== selectedDistrict;
      return `
        <path class="map-path ${selected ? 'is-selected' : ''} ${area.candidate ? 'is-candidate' : ''} ${outsideDistrict ? 'is-outside-district' : ''}" data-map-code="${escapeHtml(feature.code)}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${escapeHtml(area.dong)} 선택" d="${escapeHtml(feature.path)}" fill="${colorFor(value)}" fill-rule="evenodd">
          <title>${escapeHtml(area.dong)} · ${escapeHtml(definition.label)} ${escapeHtml(definition.format(value))}${area.candidate ? ' · 우선검토 후보' : ''}</title>
        </path>`;
    }).join('');
    const candidateMarkers = visibleRows.filter((row) => row.area.candidate).map(({ feature }) => `
      <circle class="map-candidate-marker" cx="${feature.labelX}" cy="${feature.labelY}" r="5.5" />`).join('');
    const candidateLabels = visibleRows.filter((row) => (
      row.area.candidate && String(row.feature.code) !== String(selectedCode)
    )).map(({ feature, area }) => `
      <text class="map-candidate-label" x="${feature.labelX}" y="${numeric(feature.labelY) - 10}" text-anchor="middle">${escapeHtml(area.dong)}</text>`).join('');
    const currentDrtMarkers = visibleRows.filter((row) => row.area.currentDrt).map(({ feature }) => `
      <path class="map-drt-marker" d="M${feature.labelX},${feature.labelY - 9}l8,14h-16Z" />`).join('');
    const selected = visibleRows.find((row) => String(row.feature.code) === String(selectedCode)) || visibleRows[0] || rows[0];
    const selectedLabel = `
      <g class="map-selected-label" transform="translate(${selected.feature.labelX} ${selected.feature.labelY})">
        <circle r="13"></circle><text y="-18" text-anchor="middle">${escapeHtml(selected.area.dong)}</text>
      </g>`;
    const legendSteps = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = minimum + ratio * (maximum - minimum);
      return `<i style="background:${colorFor(value)}"></i>`;
    }).join('');
    const isCategorical = metric === 'candidate' || metric === 'currentDrt';
    const legendScale = isCategorical
      ? `<div class="map-category-scale"><span><i style="background:${definition.low}"></i>${escapeHtml(definition.format(0))}</span><span><i style="background:${definition.high}"></i>${escapeHtml(definition.format(1))}</span></div>`
      : `<div class="map-legend-scale"><span>${escapeHtml(definition.format(minimum))}</span><div>${legendSteps}</div><span>${escapeHtml(definition.format(maximum))}</span></div>`;

    const districtBboxes = visibleRows.map((row) => row.feature.bbox).filter((bbox) => Array.isArray(bbox) && bbox.length === 4);
    let viewBox = boundaryData.metadata?.viewBox || '0 0 900 660';
    if (selectedDistrict !== '전체' && districtBboxes.length) {
      const minX = Math.min(...districtBboxes.map((bbox) => numeric(bbox[0])));
      const minY = Math.min(...districtBboxes.map((bbox) => numeric(bbox[1])));
      const maxX = Math.max(...districtBboxes.map((bbox) => numeric(bbox[2])));
      const maxY = Math.max(...districtBboxes.map((bbox) => numeric(bbox[3])));
      const padding = 24;
      viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;
    }

    const pointInDistrict = () => true;
    const busPoints = showBus
      ? (boundaryData.layers?.busStops?.points || []).filter(pointInDistrict).map((point) => (
        `<circle class="map-supply-point is-bus" cx="${numeric(point[0])}" cy="${numeric(point[1])}" r="1.7" />`
      )).join('')
      : '';
    const medicalPoints = showFacilities
      ? (boundaryData.layers?.medicalFacilities?.points || []).filter(pointInDistrict).map((point) => (
        `<circle class="map-supply-point is-medical" cx="${numeric(point[0])}" cy="${numeric(point[1])}" r="1.75" />`
      )).join('')
      : '';
    const pharmacyPoints = showFacilities
      ? (boundaryData.layers?.pharmacies?.points || []).filter(pointInDistrict).map((point) => (
        `<rect class="map-supply-point is-pharmacy" x="${numeric(point[0]) - 1.55}" y="${numeric(point[1]) - 1.55}" width="3.1" height="3.1" rx=".45" />`
      )).join('')
      : '';
    const overlayLegend = [
      showBus ? '<span><i class="legend-dot bus"></i>전체 레이어 정류장 2,095</span>' : '',
      showFacilities ? '<span><i class="legend-dot medical"></i>전체 레이어 병·의원 등 1,397</span><span><i class="legend-dot pharmacy"></i>약국 495</span>' : '',
      '<span><i class="legend-dot candidate"></i>후보 8개 동 표식</span>',
      '<span><i class="legend-dot drt"></i>현행 비교 3동 표식</span>',
    ].filter(Boolean).join('');
    const displayClipPaths = visibleRows.map(({ feature }) => `<path d="${escapeHtml(feature.path)}" fill-rule="evenodd" />`).join('');

    return `
      <div class="gis-visual">
        <svg class="administrative-map" viewBox="${escapeHtml(viewBox)}" role="group" aria-label="고양시 44개 행정동 ${escapeHtml(definition.label)} 등치지역도">
          <defs><clipPath id="map-display-boundary">${displayClipPaths}</clipPath></defs>
          <rect x="-50" y="-50" width="1000" height="760" rx="24" fill="#f5f8fc" />
          <g class="map-features">${paths}</g>
          <g class="map-point-layer" clip-path="url(#map-display-boundary)" aria-hidden="true">${busPoints}${medicalPoints}${pharmacyPoints}</g>
          <g class="map-districts">${districtLabels}</g>
          <g aria-hidden="true">${candidateMarkers}${currentDrtMarkers}${candidateLabels}${selectedLabel}</g>
        </svg>
        <div class="map-legend" aria-label="${escapeHtml(definition.label)} 범례">
          <div><strong>${escapeHtml(definition.label)}</strong><span>${escapeHtml(definition.direction)}</span></div>
          ${legendScale}
          <small class="map-overlay-legend">${overlayLegend}</small>
          <small>진한 외곽선은 선택 동 · 공개 공급점은 동일 좌표에서 겹칠 수 있으며 개인·서비스 이용 위치가 아닙니다.</small>
        </div>
      </div>`;
  }

  function candidateProfiles(candidates, selectedDong, benchmarks = {}) {
    const rows = [...candidates].sort((a, b) => String(a.dong).localeCompare(String(b.dong), 'ko'));
    const agingBenchmark = numeric(benchmarks.agingRate, 0.193749) * 100;
    const routesBenchmark = numeric(benchmarks.routesPerStop, 3.7718);
    const distanceBenchmark = numeric(benchmarks.nearestFacilityM) / 1000;
    const startY = 92;
    const rowGap = 46;
    const trackStarts = [172, 430, 686];
    const trackWidth = 150;
    const labelX = 18;
    const columnTitles = [
      ['고령화율', '%', 0, 40, agingBenchmark],
      ['정류장당 경유노선', '개', 0, 5, routesBenchmark],
      ['의료시설 평균 최근접거리', 'km', 0, 4.5, distanceBenchmark],
    ];

    const headers = columnTitles.map((item, index) => {
      const [title, unit, min, max, benchmark] = item;
      const x = trackStarts[index];
      const benchmarkX = scale(benchmark, min, max, x, x + trackWidth);
      return `
        <text class="chart-title" x="${x}" y="25">${title} (${unit})</text>
        <text class="axis-text" x="${x}" y="49">${min}</text>
        <text class="axis-text" x="${x + trackWidth}" y="49" text-anchor="end">${max}</text>
        <line x1="${benchmarkX}" y1="58" x2="${benchmarkX}" y2="${startY + rows.length * rowGap - 20}" stroke="#9ea9b8" stroke-dasharray="4 4" />
        <text class="benchmark-label" x="${benchmarkX}" y="70" text-anchor="middle">고양시</text>`;
    }).join('');

    const body = rows.map((item, rowIndex) => {
      const y = startY + rowIndex * rowGap;
      const selected = item.dong === selectedDong;
      const aging = numeric(item.agingRate) * 100;
      const routes = numeric(item.routesPerStop);
      const distance = numeric(item.nearestFacilityM) / 1000;
      const values = [aging, routes, distance];
      const colors = [COLORS.blue, COLORS.teal, COLORS.sky];
      const domains = [[0, 40], [0, 5], [0, 4.5]];
      const formats = [`${aging.toFixed(1)}%`, `${routes.toFixed(2)}개`, `${distance.toFixed(2)}km`];
      const tracks = values.map((value, colIndex) => {
        const x = trackStarts[colIndex];
        const pointX = scale(value, domains[colIndex][0], domains[colIndex][1], x, x + trackWidth);
        return `
          <line x1="${x}" y1="${y}" x2="${x + trackWidth}" y2="${y}" stroke="#e5e9ef" stroke-width="7" stroke-linecap="round" />
          <line x1="${x}" y1="${y}" x2="${pointX}" y2="${y}" stroke="${colors[colIndex]}" stroke-width="7" stroke-linecap="round" />
          <circle cx="${pointX}" cy="${y}" r="7" fill="${colors[colIndex]}" stroke="#fff" stroke-width="2" />
          <text class="value-text" x="${x + trackWidth + 10}" y="${y + 5}">${formats[colIndex]}</text>`;
      }).join('');
      return `
        ${selected ? `<rect x="5" y="${y - 19}" width="928" height="38" rx="8" fill="#edf4ff" />` : ''}
        <text class="row-label ${selected ? 'is-selected' : ''}" x="${labelX}" y="${y + 6}">${escapeHtml(item.dong)}</text>
        ${tracks}`;
    }).join('');

    const height = startY + rows.length * rowGap + 16;
    return `
      <svg class="candidate-chart" viewBox="0 0 940 ${height}" role="img" aria-label="후보 8개 동의 고령화율, 정류장당 경유노선, 의료시설 평균 최근접거리 비교">
        ${headers}${body}
      </svg>`;
  }

  function candidateQuadrant(candidates, selectedDong, benchmarks = {}) {
    const rows = [...candidates];
    const xMin = 1.4;
    const xMax = 5.0;
    const yMin = 0.1;
    const yMax = 0.32;
    const x0 = 78;
    const y0 = 34;
    const width = 650;
    const height = 350;
    const cityRoutes = numeric(benchmarks.routesPerStop, 3.7718);
    const cityAging = numeric(benchmarks.agingRate, 0.193749);
    const xScale = (value) => scale(value, xMin, xMax, x0, x0 + width);
    const yScale = (value) => scale(value, yMin, yMax, y0 + height, y0);
    const bubbleRadius = (value) => scale(Math.sqrt(numeric(value)), Math.sqrt(400), Math.sqrt(2000), 8, 22);
    const distanceColor = (meters) => meters >= 2500 ? COLORS.red : meters >= 1300 ? COLORS.amber : COLORS.teal;
    const grid = [0.1, 0.15, 0.2, 0.25, 0.3].map((tick) => `
      <line x1="${x0}" y1="${yScale(tick)}" x2="${x0 + width}" y2="${yScale(tick)}" stroke="#e6ebf1" />
      <text class="axis-text" x="${x0 - 12}" y="${yScale(tick) + 4}" text-anchor="end">${Math.round(tick * 100)}%</text>`).join('');
    const points = rows.map((item) => {
      const x = xScale(item.routesPerStop);
      const y = yScale(item.agingRate);
      const selected = item.dong === selectedDong;
      const r = bubbleRadius(item.single70);
      const labelY = y - r - 8;
      return `
        <g class="quadrant-point ${selected ? 'is-selected' : ''}">
          <circle cx="${x}" cy="${y}" r="${r}" fill="${distanceColor(item.nearestFacilityM)}" fill-opacity="${selected ? 0.95 : 0.68}" stroke="${selected ? COLORS.ink : '#fff'}" stroke-width="${selected ? 3 : 2}"><title>${escapeHtml(item.dong)} · 고령화율 ${(item.agingRate * 100).toFixed(1)}% · 노선 ${item.routesPerStop.toFixed(2)}개 · 70+ 1인세대 ${item.single70}명 · 시설거리 ${(item.nearestFacilityM / 1000).toFixed(2)}km</title></circle>
          <text class="point-label" x="${x}" y="${labelY}" text-anchor="middle">${escapeHtml(item.dong)}</text>
        </g>`;
    }).join('');
    return `
      <svg class="quadrant-chart" viewBox="0 0 790 440" role="img" aria-label="후보 8개 동의 고령화율과 정류장당 경유노선 산점도. 원 크기는 70세 이상 1인세대, 색은 의료시설 거리를 나타냄">
        <rect x="${x0}" y="${y0}" width="${xScale(cityRoutes) - x0}" height="${yScale(cityAging) - y0}" fill="#fff4f1" />
        ${grid}
        <line x1="${xScale(cityRoutes)}" y1="${y0}" x2="${xScale(cityRoutes)}" y2="${y0 + height}" stroke="#8794a8" stroke-dasharray="5 5" />
        <line x1="${x0}" y1="${yScale(cityAging)}" x2="${x0 + width}" y2="${yScale(cityAging)}" stroke="#8794a8" stroke-dasharray="5 5" />
        <text class="benchmark-label" x="${xScale(cityRoutes) + 6}" y="${y0 + height - 7}">고양시 ${cityRoutes.toFixed(2)}개</text>
        <text class="benchmark-label" x="${x0 + 5}" y="${yScale(cityAging) - 7}">고양시 ${(cityAging * 100).toFixed(1)}%</text>
        ${points}
        <text class="axis-title" x="${x0 + width / 2}" y="425" text-anchor="middle">정류장당 경유노선 → 많음</text>
        <text class="axis-title" transform="translate(18 ${y0 + height / 2}) rotate(-90)" text-anchor="middle">고령화율 → 높음</text>
        <g transform="translate(500 14)"><circle r="5" fill="${COLORS.teal}"/><text class="legend-label" x="10" y="4">시설 ≤1.3km</text><circle cx="94" r="5" fill="${COLORS.amber}"/><text class="legend-label" x="104" y="4">1.3~2.5km</text><circle cx="190" r="5" fill="${COLORS.red}"/><text class="legend-label" x="200" y="4">≥2.5km</text></g>
      </svg>`;
  }

  function dssDumbbell(rows) {
    const items = [...rows]
      .filter((item) => item.dong || item.dongName || item.dong_name)
      .sort((a, b) => String(a.dong ?? a.dongName ?? a.dong_name).localeCompare(String(b.dong ?? b.dongName ?? b.dong_name), 'ko'));
    const yStart = 64;
    const gap = 42;
    const xStart = 126;
    const xEnd = 610;
    const body = items.map((item, index) => {
      const dong = item.dong ?? item.dongName ?? item.dong_name;
      const poster = numeric(item.posterDss ?? item.dssPoster ?? item.dss_poster);
      const reproduced = numeric(item.reproducedDss ?? item.dssReproduced ?? item.dss_01);
      const y = yStart + index * gap;
      const x1 = scale(poster, 0, 1, xStart, xEnd);
      const x2 = scale(reproduced, 0, 1, xStart, xEnd);
      return `
        <text class="row-label" x="12" y="${y + 5}">${escapeHtml(dong)}</text>
        <line x1="${Math.min(x1, x2)}" y1="${y}" x2="${Math.max(x1, x2)}" y2="${y}" stroke="#bdc7d5" stroke-width="4" />
        <circle cx="${x1}" cy="${y}" r="7" fill="${COLORS.slate}" />
        <circle cx="${x2}" cy="${y}" r="8" fill="${COLORS.blue}" stroke="#fff" stroke-width="2" />
        <text class="value-text" x="${xEnd + 18}" y="${y + 5}">${poster.toFixed(2)} → ${reproduced.toFixed(2)}</text>`;
    }).join('');
    const height = yStart + items.length * gap + 24;
    return `
      <svg class="dumbbell-chart" viewBox="0 0 750 ${height}" role="img" aria-label="후보 8개 동의 포스터 DSS와 재현 DSS 비교">
        <text class="axis-text" x="${xStart}" y="25">0</text><text class="axis-text" x="${xEnd}" y="25" text-anchor="end">1</text>
        <line x1="${xStart}" y1="35" x2="${xEnd}" y2="35" stroke="#dce2eb" />
        <g transform="translate(420,18)"><circle r="5" fill="${COLORS.slate}"/><text x="10" y="4">포스터</text><circle cx="78" r="5" fill="${COLORS.blue}"/><text x="88" y="4">재현</text></g>
        ${body}
      </svg>`;
  }

  function moranScatter(rows) {
    const items = rows.map((item) => ({
      dong: item.dong ?? item.dongName ?? item.dong_name,
      z: numeric(item.zScore ?? item.z_score),
      lag: numeric(item.spatialLag ?? item.spatial_lag),
      quadrant: item.quadrant,
      q: numeric(item.qFdr ?? item.q_fdr, 1),
      significant: Boolean(item.significant ?? item.significantFdr ?? item.significantFdr05 ?? String(item.significant_fdr_0_05).toLowerCase() === 'true'),
    }));
    const maxAbs = Math.max(2.2, ...items.flatMap((item) => [Math.abs(item.z), Math.abs(item.lag)]));
    const x0 = 64;
    const y0 = 28;
    const width = 590;
    const height = 350;
    const xScale = (value) => scale(value, -maxAbs, maxAbs, x0, x0 + width);
    const yScale = (value) => scale(value, -maxAbs, maxAbs, y0 + height, y0);
    const colors = { HH: COLORS.red, LL: COLORS.blue, HL: COLORS.amber, LH: COLORS.teal };
    const points = items.map((item) => {
      const x = xScale(item.z);
      const y = yScale(item.lag);
      const label = item.significant
        ? `<text class="point-label" x="${x + 8}" y="${y - 8}">${escapeHtml(item.dong)}${item.quadrant === 'HH' ? ' · HH' : ''}</text>`
        : '';
      return `<g><circle cx="${x}" cy="${y}" r="${item.significant ? 7 : 4}" fill="${colors[item.quadrant] || COLORS.slate}" fill-opacity="${item.significant ? 0.95 : 0.42}" stroke="${item.significant ? '#fff' : 'none'}" stroke-width="2"><title>${escapeHtml(item.dong)} · ${escapeHtml(item.quadrant)} · q=${item.q.toFixed(4)}</title></circle>${label}</g>`;
    }).join('');
    return `
      <svg class="moran-chart" viewBox="0 0 730 430" role="img" aria-label="44개 행정동의 국지 Moran 산점도. FDR 유의한 고고 군집은 관산동 한 곳">
        <rect x="${x0}" y="${y0}" width="${width / 2}" height="${height / 2}" fill="#f4fbfa" />
        <rect x="${x0 + width / 2}" y="${y0}" width="${width / 2}" height="${height / 2}" fill="#fff4f2" />
        <rect x="${x0}" y="${y0 + height / 2}" width="${width / 2}" height="${height / 2}" fill="#f2f6ff" />
        <rect x="${x0 + width / 2}" y="${y0 + height / 2}" width="${width / 2}" height="${height / 2}" fill="#fff9ee" />
        <line x1="${xScale(0)}" y1="${y0}" x2="${xScale(0)}" y2="${y0 + height}" stroke="#8592a6" />
        <line x1="${x0}" y1="${yScale(0)}" x2="${x0 + width}" y2="${yScale(0)}" stroke="#8592a6" />
        <text class="quadrant-label" x="${x0 + width - 12}" y="${y0 + 22}" text-anchor="end">HH</text>
        <text class="quadrant-label" x="${x0 + 12}" y="${y0 + 22}">LH</text>
        <text class="quadrant-label" x="${x0 + 12}" y="${y0 + height - 10}">LL</text>
        <text class="quadrant-label" x="${x0 + width - 12}" y="${y0 + height - 10}" text-anchor="end">HL</text>
        ${points}
        <text class="axis-title" x="${x0 + width / 2}" y="418" text-anchor="middle">동별 DSS 표준화값</text>
        <text class="axis-title" transform="translate(17 ${y0 + height / 2}) rotate(-90)" text-anchor="middle">이웃 동의 평균</text>
      </svg>`;
  }

  function modelBars(rows) {
    const labels = {
      B1_demand_only: '수요만',
      B2_nearest_facility: '시설거리만',
      B3_bus_inefficiency: '버스만',
      poster_proxy_v1: '결합 대리모형',
    };
    return rows.map((item) => {
      const model = item.model;
      const precision = numeric(item.precisionAtK ?? item.precision_at_k);
      const recall = numeric(item.recallAtK ?? item.recall_at_k);
      const jaccard = numeric(item.posterCandidateJaccard ?? item.posterCandidateJaccardTop8 ?? item.poster_candidate_jaccard_top8);
      return `
        <div class="model-row">
          <strong>${escapeHtml(labels[model] || model)}</strong>
          <div class="model-metric"><span>현행 3동 중 포착</span><i style="--value:${precision * 100}%"></i><b>${Math.round(precision * 3)}/3</b></div>
          <div class="model-metric"><span>포스터 후보집합</span><i style="--value:${jaccard * 100}%"></i><b>${Math.round(jaccard * 100)}%</b></div>
          <small>Precision@3 ${precision.toFixed(2)} · Recall@3 ${recall.toFixed(2)}</small>
        </div>`;
    }).join('');
  }

  function weightStability(rows, scenarioCount = 45) {
    const items = [...(rows || [])]
      .filter((item) => Boolean(item.baselineCandidate) || numeric(item.count) > 0)
      .sort((a, b) => Number(Boolean(b.baselineCandidate)) - Number(Boolean(a.baselineCandidate)) || numeric(b.count) - numeric(a.count) || String(a.dong).localeCompare(String(b.dong), 'ko'));
    const rowHeight = 32;
    const height = 58 + items.length * rowHeight;
    const xStart = 126;
    const xEnd = 680;
    const body = items.map((item, index) => {
      const y = 48 + index * rowHeight;
      const count = numeric(item.count);
      const width = scale(count, 0, scenarioCount, 0, xEnd - xStart);
      const stable = count === scenarioCount;
      const fill = stable ? COLORS.teal : item.baselineCandidate ? COLORS.blue : COLORS.amber;
      return `<g>
        <text class="row-label" x="8" y="${y + 5}">${escapeHtml(item.dong)}</text>
        <rect x="${xStart}" y="${y - 8}" width="${xEnd - xStart}" height="16" rx="8" fill="#edf1f6" />
        <rect x="${xStart}" y="${y - 8}" width="${width}" height="16" rx="8" fill="${fill}" />
        <text class="value-text" x="${xEnd + 10}" y="${y + 5}">${count}/${scenarioCount}</text>
        <title>${escapeHtml(item.dong)} · ${scenarioCount}개 가중치 조합 중 ${count}개 포함${item.baselineCandidate ? ' · 기준 후보' : ' · 대안에서 등장'}</title>
      </g>`;
    }).join('');
    return `
      <svg class="pro-weight-chart" viewBox="0 0 760 ${height}" role="img" aria-label="${scenarioCount}개 가중치 조합에서 행정동별 상위 8 집합 포함 횟수. 포함비율은 선정확률이 아님">
        <text class="axis-text" x="${xStart}" y="20">0</text><text class="axis-text" x="${xEnd}" y="20" text-anchor="end">${scenarioCount}개 조합</text>
        <line x1="${xStart}" y1="28" x2="${xEnd}" y2="28" stroke="#dce2eb" />
        ${body}
      </svg>`;
  }

  function facilityCoverage(coverage) {
    const thresholds = coverage?.thresholdMinutes || [5, 10, 15, 30];
    const readSeries = (source) => thresholds.map((minute) => numeric(source?.[`coverage${minute}`] ?? source?.[minute]));
    const candidate = readSeries(coverage?.candidateMedian);
    const others = readSeries(coverage?.nonCandidateMedian);
    const x0 = 72;
    const y0 = 24;
    const width = 580;
    const height = 270;
    const x = (index) => x0 + (index / Math.max(1, thresholds.length - 1)) * width;
    const y = (value) => y0 + height - clamp(value, 0, 1) * height;
    const line = (values, color) => values.map((value, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(value)}`).join(' ');
    const dots = (values, color, label) => values.map((value, index) => `<g><circle cx="${x(index)}" cy="${y(value)}" r="6" fill="${color}" stroke="#fff" stroke-width="2"/><text class="point-label" x="${x(index)}" y="${y(value) - 12}" text-anchor="middle">${(value * 100).toFixed(1)}%</text><title>${label} · ${thresholds[index]}분 이내 면적격자 ${Math.round(value * 1000) / 10}%</title></g>`).join('');
    return `
      <svg class="pro-coverage-chart" viewBox="0 0 730 350" role="img" aria-label="5분, 10분, 15분, 30분 직선보행 거리 안에 의료시설이 있는 100미터 면적격자 비율의 후보와 비후보 중앙값 비교">
        ${[0, .25, .5, .75, 1].map((tick) => `<line x1="${x0}" y1="${y(tick)}" x2="${x0 + width}" y2="${y(tick)}" stroke="#e5eaf1"/><text class="axis-text" x="${x0 - 10}" y="${y(tick) + 4}" text-anchor="end">${Math.round(tick * 100)}%</text>`).join('')}
        <path d="${line(others, COLORS.slate)}" fill="none" stroke="${COLORS.slate}" stroke-width="4" />
        <path d="${line(candidate, COLORS.red)}" fill="none" stroke="${COLORS.red}" stroke-width="5" />
        ${dots(others, COLORS.slate, '비후보 36개 동 중앙값')}${dots(candidate, COLORS.red, '기준 후보 8개 동 중앙값')}
        ${thresholds.map((minute, index) => `<text class="axis-text" x="${x(index)}" y="${y0 + height + 26}" text-anchor="middle">${minute}분</text>`).join('')}
        <g transform="translate(390 335)"><circle r="5" fill="${COLORS.red}"/><text x="10" y="4">후보 8개 중앙값</text><circle cx="128" r="5" fill="${COLORS.slate}"/><text x="138" y="4">비후보 36개 중앙값</text></g>
      </svg>`;
  }

  function spatialWeightComparison(rows) {
    const items = rows || [];
    const maxI = Math.max(.35, ...items.map((item) => numeric(item.moranI)));
    const methodLabels = { queen: 'Queen 인접', symmetricKnn4: '최근접 4개', symmetricKnn6: '최근접 6개' };
    return `
      <div class="spatial-weight-chart" role="img" aria-label="Queen과 최근접 이웃 공간가중치별 전역 Moran I와 FDR 유의 HH 지역 비교">
        ${items.map((item) => {
          const value = numeric(item.moranI);
          const width = (value / maxI) * 100;
          const hh = item.significantHhDongs || [];
          return `<div class="spatial-weight-row">
            <div><strong>${escapeHtml(methodLabels[item.method] || item.method)}</strong><small>${escapeHtml(item.neighborRule || '')}</small></div>
            <span><i style="--value:${width}%"></i></span>
            <b>I=${value.toFixed(3)}</b>
            <em>${hh.length ? `HH ${escapeHtml(hh.join(' · '))}` : 'FDR 유의 HH 없음'}</em>
          </div>`;
        }).join('')}
      </div>`;
  }

  function overlapNull(data) {
    const distribution = data?.distribution || [];
    const maxProbability = Math.max(.01, ...distribution.map((item) => numeric(item.probability ?? item.p)));
    const x0 = 84;
    const y0 = 24;
    const width = 540;
    const height = 220;
    const gap = width / Math.max(1, distribution.length);
    return `
      <svg class="overlap-null-chart" viewBox="0 0 710 310" role="img" aria-label="44개 동에서 3곳을 무작위로 고를 때 현행 3동과 겹치는 수의 정확분포. 관측 겹침은 ${numeric(data?.observedOverlap)}곳">
        <line x1="${x0}" y1="${y0 + height}" x2="${x0 + width}" y2="${y0 + height}" stroke="#9aa7b9" />
        ${distribution.map((item, index) => {
          const overlap = numeric(item.overlap ?? item.k);
          const probability = numeric(item.probability ?? item.p);
          const barHeight = (probability / maxProbability) * height;
          const x = x0 + index * gap + gap * .2;
          const observed = overlap === numeric(data?.observedOverlap);
          return `<g><rect x="${x}" y="${y0 + height - barHeight}" width="${gap * .6}" height="${barHeight}" rx="6" fill="${observed ? COLORS.blue : COLORS.gray}"/><text class="value-text" x="${x + gap * .3}" y="${y0 + height - barHeight - 8}" text-anchor="middle">${(probability * 100).toFixed(1)}%</text><text class="axis-text" x="${x + gap * .3}" y="${y0 + height + 24}" text-anchor="middle">${overlap}곳</text></g>`;
        }).join('')}
        <text class="axis-title" x="${x0 + width / 2}" y="300" text-anchor="middle">무작위 후보 3곳과 현행 3동의 겹침 수</text>
      </svg>`;
  }

  function policyScoreBars(options) {
    const topScore = Math.max(...options.map((option) => numeric(option.score)));
    return options.map((option, index) => `
      <div class="policy-score-row ${numeric(option.score) === topScore ? 'is-first' : ''}">
        <span class="policy-order">${numeric(option.score) === topScore ? '=' : index + 1}</span>
        <strong>${escapeHtml(option.name)}</strong>
        <div class="policy-score-track"><i style="--value:${option.score * 10}%"></i></div>
        <b>${option.score}<small>/10</small></b>
        <span class="policy-fit">${escapeHtml(option.fit)}</span>
      </div>`).join('');
  }

  return {
    COLORS,
    administrativeMap,
    candidateQuadrant,
    candidateProfiles,
    cityComposition,
    dssDumbbell,
    escapeHtml,
    facilityCoverage,
    modelBars,
    moranScatter,
    numeric,
    overlapNull,
    policyScoreBars,
    scale,
    spatialWeightComparison,
    statusStack,
    weightStability,
  };
});
