(function attachGuidedView(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DDOL_GUIDED_VIEW = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGuidedView() {
  'use strict';

  const STEPS = [
    { id: 1, label: '판단 질문', short: '질문' },
    { id: 2, label: '지역 신호', short: '신호' },
    { id: 3, label: '근거 확실성', short: '근거' },
    { id: 4, label: '확인할 빈칸', short: '빈칸' },
    { id: 5, label: '대안별 조사', short: '대안' },
    { id: 6, label: '체크리스트 저장', short: '저장' },
  ];

  const DEFAULT_FIELD_CHECKS = [
    { id: 'aggregate-target-demand', label: '실제 대상자 규모와 서비스별 이동수요', hint: '비식별 집계 단위로 대상자 수와 미충족 수요를 확인합니다.' },
    { id: 'service-location-capacity', label: '62개 서비스의 실제 제공 위치와 수용력', hint: '목록 수가 아닌 제공기관 위치·운영시간·정원을 확인합니다.' },
    { id: 'village-bus-operation', label: '마을버스 배차·운행시간·방향·목적지', hint: '정적 노선 존재를 넘어 실제 운행과 돌봄 목적지 연결을 확인합니다.' },
    { id: 'operational-boundary-od', label: '운영경계·OD·보행·환승 조건', hint: '행정동 경계가 아닌 실제 이동권과 환승 부담을 확인합니다.' },
    { id: 'access-support', label: '앱·전화·승하차·동행지원 접근성', hint: '호출수단과 휠체어·보호자·돌봄인력 지원을 확인합니다.' },
    { id: 'alternative-capacity-cost', label: '대안별 운영자원·비용과 방문서비스 대체성', hint: '차량·인력·대기·비용과 제공기관 수용력을 확인합니다.' },
  ];

  const DEFAULT_POLICY_QUESTIONS = [
    { id: 'visitSubstitution', text: '이동 대신 방문서비스로 제공할 수 있나요?', note: '제공기관의 서비스 범위와 수용력을 함께 확인합니다.' },
    { id: 'demandConcentration', text: '수요가 특정 시간대와 방향에 모이나요?', note: '집중 수요는 고정노선이나 복지셔틀 검토 근거가 됩니다.' },
    { id: 'phoneReservation', text: '앱 호출이 어려워 전화예약이 필요한가요?', note: '디지털 접근성과 상담원 연결 조건을 확인합니다.' },
    { id: 'irregularDemand', text: '수요가 적고 시간·목적지가 분산되어 있나요?', note: '실제 호출과 이동패턴을 확보한 뒤 판단합니다.' },
    { id: 'accessibleVehicle', text: '휠체어·승하차·동행지원 차량이 필요한가요?', note: '필요 차량과 돌봄 인력 조건이 사업 대안을 가릅니다.' },
  ];

  const DEFAULT_ALTERNATIVES = [
    '방문서비스 강화',
    '고정노선·복지셔틀',
    '전화예약형 이동지원',
    '택시·바우처',
    'DRT 파일럿 조사',
  ];

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || min));
  }

  function asList(value, fallback = []) {
    return Array.isArray(value) && value.length ? value : fallback;
  }

  function display(value, fallback = '자료 연결 후 표시') {
    return value === undefined || value === null || value === '' ? fallback : String(value);
  }

  function selectedArea(model) {
    const area = model.area || model.selectedArea || {};
    return {
      code: display(area.code || area.id, ''),
      dong: display(area.dong || area.name, '관산동'),
      district: display(area.district || area.gu, '덕양구'),
    };
  }

  function stateIncludes(state, key, id) {
    const source = state[key] ?? state.checks;
    if (Array.isArray(source)) return source.includes(id);
    if (source && typeof source === 'object') return Boolean(source[id]);
    return false;
  }

  function checkedAttribute(checked) {
    return checked ? ' checked' : '';
  }

  function stepRail(activeStep, state) {
    const completed = new Set(asList(state.completedSteps));
    const visitedStep = clamp(state.visitedStep ?? activeStep, 1, STEPS.length);
    return `
      <nav class="guided-rail" aria-label="현장조사 준비 단계">
        <p class="guided-rail-title">현장조사 준비</p>
        <ol class="guided-step-list">
          ${STEPS.map((item) => {
            const status = item.id === activeStep ? 'is-current' : item.id <= visitedStep || completed.has(item.id) ? 'is-done' : 'is-upcoming';
            const disabled = item.id > visitedStep + 1;
            return `<li class="guided-step ${status}">
              <button class="guided-step-button" type="button" data-action="guided-go-step" data-guided-step="${item.id}" aria-label="${item.id}단계 ${esc(item.label)}${disabled ? ' — 아직 열리지 않았습니다' : ''}" ${disabled ? 'disabled' : ''} ${item.id === activeStep ? 'aria-current="step"' : ''}>
                <span class="guided-step-number" aria-hidden="true">${item.id}</span>
                <span class="guided-step-label">${esc(item.label)}</span>
                <span class="guided-step-short">${esc(item.short)}</span>
              </button>
            </li>`;
          }).join('')}
        </ol>
      </nav>`;
  }

  function header(model) {
    return `
      <header class="guided-header">
        <div class="guided-brand">
          <strong>${esc(model.productName || '닿지 않는 돌봄')}</strong>
          <span>${esc(model.productSubtitle || '고양시 교통·복지 현장조사 지원')}</span>
        </div>
        <button class="guided-detail-link" type="button" data-action="guided-reset" aria-label="검토를 처음부터 다시 시작합니다">처음부터 다시</button>
        <button class="guided-detail-link" type="button" data-action="open-analysis" aria-label="분석 상세 화면을 엽니다">분석 상세 <span aria-hidden="true">↗</span></button>
      </header>`;
  }

  function eyebrow(step, text) {
    return `<p class="guided-eyebrow"><span>STEP ${step}</span>${esc(text)}</p>`;
  }

  function actionBar({ action = 'guided-next', step, label, previousStep, disabled = false, rule = '' }) {
    // 오류 슬롯은 항상 자리를 차지한다. 비어 있어도 지우지 않는다 —
    // 화면 전체를 다시 그리지 않고 이 노드의 textContent만 바꿔 포커스를 지킨다.
    return `
      ${rule ? `<p class="guided-rule-line" id="guided-rule-${step}">${esc(rule)}</p>` : ''}
      <p class="guided-error-slot" role="status" aria-live="polite"></p>
      <div class="guided-action-bar">
        ${previousStep ? `<button class="guided-back-link" type="button" data-action="guided-prev" data-guided-step="${previousStep}" aria-label="이전 화면으로 돌아갑니다"><span aria-hidden="true">←</span> 이전 단계</button>` : '<span></span>'}
        <button class="guided-primary-action" type="button" data-action="${esc(action)}" data-guided-step="${step}" aria-label="${esc(label)}"${disabled ? ' aria-disabled="true"' : ''}${rule ? ` aria-describedby="guided-rule-${step}"` : ''}>
          <span>${esc(label)}</span><span aria-hidden="true">→</span>
        </button>
      </div>`;
  }

  function renderAreaSelect(model, state, area) {
    const candidates = asList(model.candidates);
    if (!candidates.length) {
      return `<div class="guided-area-static"><span>검토 지역</span><strong>${esc(area.dong)} · ${esc(area.district)}</strong></div>`;
    }
    return `
      <label class="guided-area-select">
        <span>검토 지역</span>
        <select data-action="guided-area-change" data-guided-field="selectedCode">
          ${candidates.map((candidate) => {
            const code = String(candidate.code || candidate.id || candidate.dong || candidate.name || '');
            const name = candidate.dong || candidate.name || code;
            const district = candidate.district || candidate.gu || '';
            const selected = String(state.selectedCode || area.code || area.dong) === code || area.dong === name;
            return `<option value="${esc(code)}"${selected ? ' selected' : ''}>${esc(name)}${district ? ` · ${esc(district)}` : ''}</option>`;
          }).join('')}
        </select>
      </label>`;
  }

  // 후보가 아닌 동을 고르면 usedFallback이 켜지지만 화면에는 한 번도 쓰이지 않아,
  // 사용자는 자기 선택이 무시된 사실을 알 수 없었다.
  function renderFallbackNotice(model, area) {
    if (!model || !model.usedFallback) return '';
    return `
      <p class="guided-notice" role="status">
        요청하신 동은 후보 ${esc(display(model.candidateCount, '8'))}곳에 들지 않아
        <strong>${esc(area.dong)}</strong>을 대신 보고 있습니다.
      </p>`;
  }

  function renderStepOne(model, state) {
    const area = selectedArea(model);
    const areaCount = display(model.areaCount, '44');
    const eligibleAreaCount = display(model.eligibleAreaCount, '41');
    const candidateCount = display(model.candidateCount, '8');
    return `
      <section class="guided-page guided-page-intro" aria-labelledby="guided-title">
        ${eyebrow(1, '이 서비스가 하는 일을 먼저 설명합니다')}
        ${renderFallbackNotice(model, area)}
        <h1 id="guided-title">돌봄이 필요한 곳, 이동부터 확인합니다.</h1>
        <p class="guided-lead">고령 수요·의료시설 거리·버스 공급을 함께 보고, 정책을 확정하기 전에 <strong>어디부터 현장조사할지</strong> 정합니다.</p>

        <div class="guided-funnel" aria-label="검토 범위: 고양시 행정동, 제출 후보, ${esc(area.dong)} 순서">
          <div class="guided-funnel-node"><span>공개자료 비교</span><strong>고양시 ${esc(areaCount)}개 동</strong></div>
          <span class="guided-funnel-arrow" aria-hidden="true">→</span>
          <div class="guided-funnel-node"><span>제출 당시 선정 규칙</span><strong>${esc(eligibleAreaCount)}개 동 중 ${esc(candidateCount)}곳</strong></div>
          <span class="guided-funnel-arrow" aria-hidden="true">→</span>
          <div class="guided-funnel-node is-selected"><span>오늘 확인</span><strong>${esc(area.dong)}</strong></div>
        </div>

        <div class="guided-scope-lines">
          <div><span class="guided-scope-icon is-do" aria-hidden="true">1</span><p><strong>문제</strong><span>돌봄 수요와 실제 이동 가능성은 서로 다른 자료로 관리됩니다.</span></p></div>
          <div><span class="guided-scope-icon is-do" aria-hidden="true">2</span><p><strong>분석</strong><span>고양시 44개 동의 인구·의료·버스 공개데이터를 같은 지역 단위로 비교합니다.</span></p></div>
          <div><span class="guided-scope-icon is-do" aria-hidden="true">3</span><p><strong>행동</strong><span>자동 도입 추천 대신 자료요청과 현장조사 체크리스트를 남깁니다.</span></p></div>
        </div>

        <p class="guided-boundary-note">현재는 병·의원·약국까지의 <strong>의료 접근성 대리진단</strong>입니다. 41개 동은 과거 팀이 똑버스 사후 대리매핑 3개 동을 제외한 제출 당시 규칙이며, 공식 운영권역 정확도가 아닙니다. 실제 고양온돌 대상자 위치와 62개 서비스 제공 위치는 사용하지 않았습니다.</p>

        ${renderAreaSelect(model, state, area)}
        ${actionBar({ step: 2, label: `${area.dong} 사례로 시작` })}
      </section>`;
  }

  function metricValue(metric, side) {
    const value = side === 'area'
      ? metric.areaDisplay ?? metric.areaValue ?? metric.area ?? metric.display ?? metric.value
      : metric.cityDisplay ?? metric.cityValue ?? metric.city ?? metric.benchmarkDisplay ?? metric.benchmark;
    const unit = metric.unit || '';
    const alreadyFormatted = side === 'area' ? metric.display !== undefined : metric.benchmarkDisplay !== undefined;
    return value === undefined || value === null || value === '' ? '자료 연결 대기' : `${value}${alreadyFormatted ? '' : unit}`;
  }

  function renderSignalMetric(metric, areaDong) {
    const direction = metric.direction || metric.reading || '';
    return `
      <div class="guided-signal-row">
        <div class="guided-signal-name">
          <strong>${esc(metric.label || metric.name || '확인 신호')}</strong>
          <span>${esc(metric.definition || metric.subtitle || '')}</span>
        </div>
        <dl class="guided-signal-values">
          <div><dt>${esc(areaDong)}</dt><dd class="is-area">${esc(metricValue(metric, 'area'))}</dd></div>
          <div><dt>고양시</dt><dd class="is-city">${esc(metricValue(metric, 'city'))}</dd></div>
        </dl>
        <p class="guided-signal-reading">${esc(direction || '비교 기준 확인 필요')}</p>
      </div>`;
  }

  function renderMap(model, area) {
    const markup = typeof model.mapSvg === 'string' && model.mapSvg.trim()
      ? model.mapSvg
      : typeof model.mapMarkup === 'string' && model.mapMarkup.trim()
        ? model.mapMarkup
        : '';
    if (!markup) {
      return `<div class="guided-map-empty" role="status"><strong>행정동 지도를 준비하고 있습니다.</strong><span>지도 없이도 아래 공개데이터 비교는 계속 확인할 수 있습니다.</span></div>`;
    }
    return `<div class="guided-map-canvas" role="img" aria-label="고양시 행정동 지도, ${esc(area.dong)} 강조">${markup}</div>`;
  }

  function renderStepTwo(model) {
    const area = selectedArea(model);
    const metrics = asList(model.signalMetrics || model.signals || model.metrics);
    const signalHeadline = model.evidenceFraming?.headline || model.signalHeadline
      || `${area.dong}의 수요·버스·의료 접근 신호를 고양시 기준과 비교합니다.`;
    const signalSubheadline = model.evidenceFraming?.subheadline || model.signalSubheadline
      || '공개데이터 비교는 현장조사 순서를 돕는 대리신호이며 실제 이동 수요가 아닙니다.';
    return `
      <section class="guided-page" aria-labelledby="guided-title">
        ${eyebrow(2, `${area.dong}의 공개데이터 신호`)}
        <h1 id="guided-title">왜 ${esc(area.dong)}을 먼저 확인하나요?</h1>
        <p class="guided-lead">${esc(signalHeadline)}</p>
        <p class="guided-sublead">${esc(signalSubheadline)}</p>

        <div class="guided-evidence-layout">
          <div class="guided-signal-list">
            <div class="guided-signal-legend" aria-label="비교 범례"><span class="is-area">${esc(area.dong)}</span><span class="is-city">고양시 평균</span></div>
            ${metrics.length ? metrics.map((metric) => renderSignalMetric(metric, area.dong)).join('') : `<div class="guided-data-empty"><strong>비교 수치를 연결하고 있습니다.</strong><span>고령 수요·버스 연결·의료 접근 순서로 표시됩니다.</span></div>`}
            <p class="guided-reading-summary"><span aria-hidden="true"></span>${esc(model.evidenceFraming?.summary || model.signalSummary || '공개 신호와 실제 서비스 도달을 구분해 확인합니다.')}</p>
          </div>
          <div class="guided-map-panel">
            <p><strong>고양시 44개 행정동</strong><span>${esc(area.dong)} 위치를 먼저 확인합니다.</span></p>
            ${renderMap(model, area)}
          </div>
        </div>

        <details class="guided-disclosure"><summary>근거와 계산 방식 보기</summary><div>${esc(model.methodNote || '공개데이터의 기준일·단위·공간조인 조건은 분석 상세에서 확인할 수 있습니다.')}</div></details>
        <p class="guided-boundary-note">이 결과는 도입 결정이 아니라 현장조사 순서를 돕는 공개데이터 대리진단입니다.</p>
        ${actionBar({ previousStep: 1, step: 3, label: '다음: 신호가 얼마나 반복되나요?' })}
      </section>`;
  }

  function robustnessPercent(item) {
    const explicit = Number(item.percent ?? item.ratioPercent);
    if (Number.isFinite(explicit)) return clamp(explicit, 0, 100);
    const numerator = Number(item.numerator ?? item.included ?? item.value);
    const denominator = Number(item.denominator ?? item.total);
    return denominator > 0 && Number.isFinite(numerator) ? clamp((numerator / denominator) * 100, 0, 100) : 0;
  }

  function robustnessDisplay(item) {
    if (item.display || item.valueLabel) return item.display || item.valueLabel;
    if (item.numerator !== undefined && item.denominator !== undefined) return `${item.numerator} / ${item.denominator}`;
    return display(item.value, '검증값 연결 대기');
  }

  function renderRobustness(item, index) {
    const percent = robustnessPercent(item);
    const symbol = item.symbol || (percent >= 99.9 ? '=' : '↓');
    return `
      <li class="guided-robustness-row">
        <span class="guided-sequence" aria-hidden="true">${index + 1}</span>
        <div class="guided-robustness-main">
          <div><strong>${esc(item.label || item.name || '재검증')}</strong><b>${esc(robustnessDisplay(item))}</b></div>
          <span class="guided-progress" aria-hidden="true"><i style="--guided-progress:${percent.toFixed(1)}%"></i></span>
        </div>
        <span class="guided-robustness-symbol" aria-hidden="true">${esc(symbol)}</span>
        <p>${esc(item.reading || item.note || '검증 조건에 따른 포함 여부를 확인합니다.')}</p>
      </li>`;
  }

  function renderStepThree(model) {
    const area = selectedArea(model);
    const checks = normalizeRobustness(model);
    return `
      <section class="guided-page" aria-labelledby="guided-title">
        ${eyebrow(3, '재분석으로 반복 여부를 확인합니다')}
        <h1 id="guided-title">이 신호는 얼마나 반복되나요?</h1>
        <p class="guided-lead">후보 8곳은 재현됐지만, 구성요소 간 중복과 항 제거 민감도가 확인됐습니다.</p>
        <p class="guided-definition-note"><span aria-hidden="true">i</span><strong>핵심 3개만 먼저 봅니다. 상관·교체 수는 선정확률이 아닙니다.</strong></p>

        ${checks.length ? `<ol class="guided-robustness-list">${checks.map(renderRobustness).join('')}</ol>` : `<div class="guided-data-empty"><strong>재검증 결과를 연결하고 있습니다.</strong><span>후보집합 재현·제한 가중치·전체 경계감사 순서로 표시됩니다.</span></div>`}

        <div class="guided-certainty-split">
          <div><span class="guided-certainty-icon is-confirmed" aria-hidden="true">✓</span><p><strong>확인된 것</strong><span>${esc(model.confirmedText || '현장조사가 필요한 신호는 반복됩니다.')}</span></p></div>
          <div><span class="guided-certainty-icon is-open" aria-hidden="true">−</span><p><strong>확정되지 않은 것</strong><span>${esc(model.unconfirmedText || 'DSS 값·내부순위·DRT 효과는 재현되지 않았습니다.')}</span></p></div>
        </div>

        ${renderAccessibilityScenario(model, area)}

        ${renderProfessionalAnalysis(model, area)}
        ${actionBar({ previousStep: 2, step: 4, label: '다음: 공개데이터가 모르는 것은?' })}
      </section>`;
  }

  function signedMinutes(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '자료 연결 대기';
    return `${number > 0 ? '+' : ''}${number.toFixed(1)}분`;
  }

  function percentFromRatio(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : '자료 연결 대기';
  }

  function renderAccessibilityScenario(model, area) {
    const scenario = model.accessibilityScenario;
    if (!scenario) return '';
    return `
      <aside class="guided-access-scenario" aria-label="${esc(area.dong)} 이동시간 가정 시나리오">
        <div class="guided-access-scenario-heading">
          <div><strong>대기시간을 모르면 개선 여부도 달라집니다.</strong><span>가정 시나리오 · 실제 정책효과 아님</span></div>
          <p>대기 ${esc(asList(scenario.waitScenarioMinutes, [5, 10, 15]).join('·'))}분을 각각 넣어 범위로 확인했습니다.</p>
        </div>
        <dl class="guided-access-scenario-metrics">
          <div><dt>30분 면적 커버리지</dt><dd>${esc(percentFromRatio(scenario.referenceCoverage30))} → ${esc(percentFromRatio(scenario.scenarioCoverage30Low))}~${esc(percentFromRatio(scenario.scenarioCoverage30High))}</dd><small>사람 비율이 아니라 100m 면적격자 비율</small></div>
          <div><dt>중앙 일반화시간</dt><dd>${esc(fixedOrPending(scenario.referenceMedianMinutes, 1))}분 → ${esc(fixedOrPending(scenario.scenarioMedianMinutesLow, 1))}~${esc(fixedOrPending(scenario.scenarioMedianMinutesHigh, 1))}분</dd><small>기준 대비 ${esc(signedMinutes(scenario.medianTimeChangeMinutesLow))}~${esc(signedMinutes(scenario.medianTimeChangeMinutesHigh))}</small></div>
          <div><dt>중앙격자 손익분기 대기</dt><dd>${esc(fixedOrPending(scenario.breakEvenWaitMedianMinutes, 1))}분</dd><small>이보다 길면 중앙시간 개선을 보장할 수 없음</small></div>
        </dl>
        <p>따라서 실제 대기·승하차·OD 로그를 확보하기 전에는 “DRT로 개선된다”고 결론내리지 않습니다.</p>
      </aside>`;
  }

  function fixedOrPending(value, digits = 2) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : '자료 연결 대기';
  }

  function renderProfessionalAnalysis(model, area) {
    const audit = model.feedbackAudit;
    if (!audit) {
      return `<details class="guided-disclosure"><summary>전문 재분석 보기</summary><div>${esc(model.robustnessMethodNote || '세부 재분석 자료를 연결하고 있습니다.')}</div></details>`;
    }
    const stableCore = asList(audit.ablation?.stableCoreDongs).join(' · ') || '자료 연결 대기';
    const qFdr = fixedOrPending(audit.spatial?.queenQFdr, 4);
    const spatialReading = audit.spatial?.queenSignificantHh && !audit.spatial?.otherMethodsSignificantHh
      ? `${area.dong}은 Queen 인접에서만 HH(q=${qFdr})였습니다.`
      : audit.spatial?.interpretation || '공간 이웃 정의별 결과 확인이 필요합니다.';
    return `
      <details class="guided-disclosure guided-analysis-detail">
        <summary>전문 재분석 보기</summary>
        <dl>
          <div><dt>선형상관 / 순위상관</dt><dd>r ${esc(fixedOrPending(audit.componentDependence?.pearsonR, 3))} · ρ ${esc(fixedOrPending(audit.componentDependence?.spearmanRho, 3))}</dd></div>
          <div><dt>VIF</dt><dd>CAG ${esc(fixedOrPending(audit.componentDependence?.vif?.cag))} · 버스 ${esc(fixedOrPending(audit.componentDependence?.vif?.bus))} · 의료 ${esc(fixedOrPending(audit.componentDependence?.vif?.facility))}</dd></div>
          <div><dt>안정 핵심</dt><dd>${esc(stableCore)}</dd></div>
          <div><dt>공간 민감도</dt><dd>${esc(spatialReading)}</dd></div>
        </dl>
        <p>버스·의료 항을 함께 빼면 최대 ${esc(display(audit.ablation?.combinedRemovalReplacementCount, '자료 연결 대기'))}/8이 교체됩니다. CAG 안의 시설 접근성은 남으므로 구성타당도 검토가 더 필요합니다.</p>
      </details>`;
  }

  function normalizeRobustness(model) {
    if (Array.isArray(model.feedbackRobustness) && model.feedbackRobustness.length) return model.feedbackRobustness.slice(0, 3);
    if (Array.isArray(model.robustnessChecks) && model.robustnessChecks.length) return model.robustnessChecks;
    if (Array.isArray(model.robustness) && model.robustness.length) return model.robustness;
    const rows = [];
    if (model.candidateSet) {
      rows.push({
        label: '후보집합 재현',
        display: model.candidateSet.display,
        numerator: model.candidateSet.matchedCount,
        denominator: model.candidateSet.expectedCount,
        reading: model.candidateSet.isReproduced ? '제출 후보 집합이 다시 나옴' : '제출 후보 중 일부만 다시 나옴',
      });
    }
    if (model.robustness?.bounded) {
      rows.push({
        label: '제한 가중치 검토',
        display: model.robustness.bounded.display,
        numerator: model.robustness.bounded.count,
        denominator: model.robustness.bounded.total,
        percent: model.robustness.bounded.share * 100,
        reading: '명시한 범위에서의 포함 횟수',
      });
    }
    if (model.robustness?.boundary) {
      rows.push({
        label: '전체 경계감사',
        display: model.robustness.boundary.display,
        numerator: model.robustness.boundary.count,
        denominator: model.robustness.boundary.total,
        percent: model.robustness.boundary.share * 100,
        reading: '가중치 제약을 풀었을 때의 포함 횟수',
      });
    }
    return rows;
  }

  function renderFieldCheck(item, state, key = 'fieldChecks') {
    const checked = stateIncludes(state, key, item.id);
    return `
      <label class="guided-check-row">
        <input type="checkbox" data-action="guided-toggle-check" data-check-id="${esc(item.id)}"${checkedAttribute(checked)}>
        <span class="guided-custom-check" aria-hidden="true"></span>
        <span><strong>${esc(item.label)}</strong><small>${esc(item.hint || item.description || '')}</small></span>
      </label>`;
  }

  function renderStepFour(model, state) {
    const items = asList(model.fieldChecks || model.unknownChecks, DEFAULT_FIELD_CHECKS);
    const area = selectedArea(model);
    return `
      <section class="guided-page guided-page-checks" aria-labelledby="guided-title">
        ${eyebrow(4, '공개데이터의 빈칸을 현장 질문으로 바꿉니다')}
        <h1 id="guided-title">현장에서 무엇을 확인해야 하나요?</h1>
        <p class="guided-lead">아래 항목은 공개데이터만으로 알 수 없습니다. 조사할 항목을 체크해 주세요.</p>

        <fieldset class="guided-check-fieldset">
          <legend class="guided-visually-hidden">현장조사 확인 항목</legend>
          ${items.map((item) => renderFieldCheck(item, state)).join('')}
        </fieldset>

        <details class="guided-evidence-disclosure">
          <summary>왜 이 항목을 확인하나요?</summary>
          <div class="guided-evidence-disclosure-body">
            ${renderVillageBusScreening(model, area)}
            ${renderBusNetworkEvidence(model)}
            ${renderWelfareDestinationSnapshot(model, area)}
            ${renderWelfareCoordinateSnapshot(model, area)}
            ${renderWelfareDestinationSensitivity(model, area)}
            ${renderCurrentDrtContext(model)}
            ${renderDataAcquisition(model)}
          </div>
        </details>

        <p class="guided-boundary-note">개인 위치·실제 이동경로·정책 효과는 이 화면에 포함하지 않습니다.</p>
        ${actionBar({ previousStep: 3, step: 5, label: '다음: 어떤 대안을 가를까요?' })}
      </section>`;
  }

  function renderDataAcquisition(model) {
    const rows = asList(model.dataAcquisition);
    if (!rows.length) return '';
    return `
      <section class="guided-data-acquisition" aria-labelledby="guided-data-acquisition-title">
        <h2 id="guided-data-acquisition-title">자료 준비 상태</h2>
        <ul>${rows.map((row) => `<li><span>${esc(row.status)}</span><p><strong>${esc(row.label)}</strong><small>${esc(row.detail)}</small></p></li>`).join('')}</ul>
      </section>`;
  }

  function renderCurrentDrtContext(model) {
    const context = model.currentDrtContext;
    if (!context) return '';
    return `
      <aside class="guided-drt-context" aria-label="기존 똑버스 운영방식과 돌봄 이동 검증의 차이">
        <h2>기존 똑버스와 무엇이 다른가요?</h2>
        <div><span>식사·덕은·향동</span><strong>${esc(context.mixedOperationDescription)}</strong></div>
        <div><span>${esc(context.fullDayFlexibleZone)}</span><strong>${esc(context.fullDayFlexibleDescription)}</strong></div>
        <p>${esc(context.interpretation)}</p>
        <small>${esc(context.serviceZoneCount)}개 운영권역 · ${esc(context.vehicleSnapshot)}대 시점값 · ${esc(context.limitation)}</small>
      </aside>`;
  }

  function renderWelfareDestinationSnapshot(model, area) {
    const snapshot = model.welfareDestinationSnapshot;
    if (!snapshot) return '';
    return `
      <aside class="guided-welfare-screen" aria-label="${esc(area.dong)} 복지 목적지 목록 준비 상태">
        <div><span>${esc(area.dong)} 경로당</span><strong>${esc(snapshot.selectedDongCount)}곳</strong></div>
        <div><span>현재 웹 / 2026-06 Excel</span><strong>${esc(snapshot.currentWebDisplayedTotal)}건 / ${esc(snapshot.workbookRecordCount)}행</strong></div>
        <div><span>2026-06 파일 내 좌표 열</span><strong>없음</strong></div>
        <p><b>해석</b>최신 파일 자체에는 좌표 열이 없지만, 별도 공식 공개좌표표와 연결한 공간 대리값은 아래에서 분리해 보여 줍니다.</p>
      </aside>`;
  }

  function renderWelfareCoordinateSnapshot(model, area) {
    const snapshot = model.welfareCoordinateSnapshot;
    if (!snapshot) return '';
    const center = snapshot.seniorCenter;
    const linkage = snapshot.linkage || {};
    return `
      <aside class="guided-welfare-coordinate" aria-label="${esc(area.dong)} 복지 목적지 공식 좌표 접근성 대리값">
        <h2>복지 목적지 좌표도 보완했습니다.</h2>
        <div class="guided-welfare-coordinate-grid">
          <p><span>경로당 공개좌표</span><strong>${esc(center?.citywideCoordinateCount ?? '—')}건</strong></p>
          <p><span>${esc(area.dong)} 경로당</span><strong>${esc(center?.facilityCountInsideDong ?? '—')}곳</strong></p>
          <p><span>최근접거리 중앙값</span><strong>${center ? `${esc(Math.round(center.nearestMedianM))}m` : '—'}</strong></p>
          <p><span>15분 면적격자</span><strong>${center ? `${esc(Number(center.coverage15MinPct).toFixed(1))}%` : '—'}</strong></p>
        </div>
        <p>최신 594행과 좌표표 결합: 자동 좌표완성 ${esc(linkage.coordinate_complete ?? '—')}건 · 수동검토 ${esc(linkage.manual_review ?? '—')}건 · 미매칭 ${esc(linkage.unmatched ?? '—')}건.</p>
        <small>${esc(snapshot.interpretation)} ${esc(snapshot.criticalDisclaimer)}</small>
      </aside>`;
  }

  function renderWelfareDestinationSensitivity(model, area) {
    const snapshot = model.welfareDestinationSensitivitySnapshot;
    if (!snapshot) return '';
    const selected = snapshot.selectedArea;
    const stableCore = asList(snapshot.stableCoreDongs).join('·');
    return `
      <aside class="guided-destination-sensitivity" aria-label="${esc(area.dong)} 복지 목적지 정의 민감도">
        <h2>목적지를 바꾸면 후보도 바뀝니다.</h2>
        <div class="guided-welfare-coordinate-grid">
          <p><span>복지 목적지 시나리오</span><strong>${esc(snapshot.scenarioCount)}개</strong></p>
          <p><span>기준 후보 최대 교체</span><strong>${esc(snapshot.maximumReplacementCount)}/8</strong></p>
          <p><span>최저 집합 유사도</span><strong>J ${esc(Number(snapshot.minimumJaccard).toFixed(3))}</strong></p>
          <p><span>${esc(area.dong)} 후보 유지</span><strong>${selected ? `${esc(selected.top8ScenarioCount)}/${esc(selected.scenarioCount)}` : '—'}</strong></p>
        </div>
        <p>시설항만 교체 ${esc(snapshot.partialScenarioCount)}개와 CAG·시설항을 함께 교체한 ${esc(snapshot.fullScenarioCount)}개를 분리했습니다. 모든 시나리오의 안정핵심은 ${esc(stableCore || '자료 연결 대기')}입니다.</p>
        <small>${esc(snapshot.interpretation)} ${esc(snapshot.criticalDisclaimer)} 정책효과가 아닙니다.</small>
      </aside>`;
  }

  function renderVillageBusScreening(model, area) {
    const snapshot = model.villageBusSnapshot;
    if (!snapshot) return '';
    return `
      <aside class="guided-village-screen" aria-label="${esc(area.dong)} 마을버스 정적 스크리닝">
        <div><span>마을노선 표기 정류장</span><strong>${esc(snapshot.servingStopCount)}/${esc(snapshot.allStopCount)}</strong></div>
        <div><span>고유 마을노선명</span><strong>${esc(snapshot.uniqueRouteCount)}개</strong></div>
        <p><b>2025-08-25 정적 존재 확인</b>${esc(snapshot.interpretation)}</p>
      </aside>`;
  }

  function renderBusNetworkEvidence(model) {
    const snapshot = model.busNetworkEvidenceSnapshot;
    if (!snapshot) return '';
    const needsReview = snapshot.multipleOfficialRows + snapshot.unresolvedNoCandidate;
    return `
      <aside class="guided-bus-evidence" aria-label="마을버스 공식 배차표 교차검증">
        <h2>배차표까지 확인했지만, 현행 운행은 아직 모릅니다.</h2>
        <div class="guided-bus-evidence-grid">
          <p><span>마을노선 분모</span><strong>${esc(snapshot.routeDenominator)}개</strong></p>
          <p><span>번호 후보 확인</span><strong>${esc(snapshot.routeNumberCandidates)}개</strong></p>
          <p><span>단일 공식행</span><strong>${esc(snapshot.uniqueOfficialRows)}개</strong></p>
          <p><span>추가 확인</span><strong>${esc(needsReview)}개</strong></p>
        </div>
        <p>복수 공식행 ${esc(snapshot.multipleOfficialRows)}개 · 후보 없음 ${esc(snapshot.unresolvedNoCandidate)}개. 2023 BMS는 ${esc(snapshot.historicalBms.linkedRoutes)}/${esc(snapshot.historicalBms.routeDenominator)}개 노선만 역사적으로 연결됐습니다.</p>
        <small>${esc(snapshot.interpretation)} ${esc(snapshot.historicalBms.interpretation)}</small>
      </aside>`;
  }

  function policyAnswer(state, questionId) {
    const answers = state.policyAnswers || state.alternativeAnswers || state.answers || {};
    return ['yes', 'no'].includes(answers[questionId]) ? answers[questionId] : 'unknown';
  }

  function policyReviewed(state, questionId) {
    const reviewed = asList(state.policyReviewedQuestions || state.guidedReviewedQuestions);
    return reviewed.includes(questionId) || ['yes', 'no'].includes(policyAnswer(state, questionId));
  }

  function renderAlternativeList(model) {
    const alternatives = asList(model.alternatives, DEFAULT_ALTERNATIVES);
    return `
      <div class="guided-alternative-strip" aria-label="검토할 정책 대안">
        <p>답변으로 구분할 대안</p>
        <ul>${alternatives.map((item) => {
          const label = typeof item === 'string' ? item : item.label || item.name;
          return `<li><span>${esc(label)}</span><small>미확인</small></li>`;
        }).join('')}</ul>
      </div>`;
  }

  function renderStepFive(model, state) {
    const questions = asList(model.policyQuestions || model.alternativeQuestions, DEFAULT_POLICY_QUESTIONS);
    const questionIndex = Math.min(
      Math.max(0, questions.length - 1),
      Math.max(0, Number(state.policyQuestionIndex) || 0),
    );
    const question = questions[questionIndex];
    const answer = policyAnswer(state, question.id);
    const reviewed = policyReviewed(state, question.id);
    const answeredCount = questions.filter((item) => policyReviewed(state, item.id)).length;
    const isLast = questionIndex === questions.length - 1;
    return `
      <section class="guided-page guided-page-policy" aria-labelledby="guided-title">
        ${eyebrow(5, '대안별 조사 질문을 하나씩 확인합니다')}
        <h1 id="guided-title">어떤 대안이 맞는지 무엇을 물어야 하나요?</h1>
        <p class="guided-lead">지금은 모든 대안이 <strong>미확인</strong>입니다. 답변은 자동 추천이나 점수가 아닙니다.</p>

        <div class="guided-question-progress" aria-label="대안 조사 질문 진행률">
          <span>질문 ${questionIndex + 1} / ${questions.length}</span>
          <span>${answeredCount}개 답변 기록</span>
          <i aria-hidden="true"><b style="--guided-question-progress:${((questionIndex + 1) / questions.length) * 100}%"></b></i>
        </div>

        <div class="guided-policy-question-list">
          <fieldset class="guided-policy-question is-current">
            <legend><span>${questionIndex + 1}</span>${esc(question.text)}</legend>
            <p>${esc(question.note || '현장에서 담당자와 이용자에게 확인할 질문입니다.')}</p>
            <div class="guided-answer-options">
              ${[
                ['unknown', '아직 모름'],
                ['yes', '예'],
                ['no', '아니오'],
              ].map(([value, label]) => `<label><input type="radio" name="guided-policy-answer-${esc(question.id)}" value="${value}" data-action="guided-policy-answer" data-guided-question="${esc(question.id)}" data-guided-answer="${value}"${checkedAttribute(reviewed && answer === value)}><span>${label}</span></label>`).join('')}
            </div>
          </fieldset>
        </div>

        <div class="guided-current-alternative">
          <span>이 질문이 구분하는 대안</span>
          <strong>${esc(question.alternative || DEFAULT_ALTERNATIVES[questionIndex] || '정책 대안')}</strong>
          <small>답변만 기록하며 적합도·순위·점수는 계산하지 않습니다.</small>
        </div>
        <p class="guided-boundary-note">현장 답변을 모은 뒤에도 교통·복지 담당자가 공동 검토합니다.</p>
        <div class="guided-action-bar">
          ${questionIndex > 0
            ? '<button class="guided-back-link" type="button" data-action="guided-policy-prev"><span aria-hidden="true">←</span> 이전 질문</button>'
            : '<button class="guided-back-link" type="button" data-action="guided-prev" data-guided-step="4"><span aria-hidden="true">←</span> 이전 단계</button>'}
          ${isLast
            ? '<button class="guided-primary-action" type="button" data-action="guided-next" data-guided-step="6"><span>체크리스트 검토하기</span><span aria-hidden="true">→</span></button>'
            : '<button class="guided-primary-action" type="button" data-action="guided-policy-next"><span>다음 조사 질문</span><span aria-hidden="true">→</span></button>'}
        </div>
      </section>`;
  }

  function renderCompactSignals(model) {
    const signals = asList(model.confirmedSignals || model.signalSummaryItems);
    if (!signals.length) return '';
    return `<ul class="guided-compact-signals">${signals.map((item) => {
      const label = typeof item === 'string' ? item : item.label || item.name;
      const tone = typeof item === 'object' && item.tone === 'neutral' ? 'is-neutral' : 'is-signal';
      return `<li class="${tone}">${esc(label)}</li>`;
    }).join('')}</ul>`;
  }

  function renderStepSix(model, state) {
    const area = selectedArea(model);
    const items = asList(model.finalChecks || model.fieldChecks || model.unknownChecks, DEFAULT_FIELD_CHECKS);
    const questions = asList(model.policyQuestions || model.alternativeQuestions, DEFAULT_POLICY_QUESTIONS);
    const answerLabels = { yes: '예', no: '아니오', unknown: '아직 모름' };
    return `
      <section class="guided-page guided-page-review" aria-labelledby="guided-title">
        ${eyebrow(6, '근거·한계·질문을 한 파일로 묶습니다')}
        <h1 id="guided-title">${esc(area.dong)} 현장조사 체크리스트를 저장할까요?</h1>
        <p class="guided-lead">교통·복지 담당자가 같은 근거와 질문으로 공동검토를 시작합니다.</p>

        <div class="guided-review-layout">
          <div class="guided-review-document">
            <section><h2>1. 조사 대상</h2><p><strong>${esc(area.dong)}</strong><span>${esc(area.district)}</span><em>추가 현장조사</em></p></section>
            <section><h2>2. 공개데이터에서 확인한 신호</h2>${renderCompactSignals(model) || '<p class="guided-inline-empty">신호 요약 연결 대기</p>'}</section>
            <section><h2>3. 현장에서 확인할 항목</h2><div class="guided-final-checks">${items.map((item) => renderFieldCheck(item, state, 'fieldChecks')).join('')}</div></section>
            <section><h2>4. 대안별 조사 답변</h2><ul class="guided-answer-summary">${questions.map((question) => {
              const reviewed = policyReviewed(state, question.id);
              const answer = reviewed ? answerLabels[policyAnswer(state, question.id)] : '미응답';
              return `<li><span><strong>${esc(question.alternative || '정책 대안')}</strong>${esc(question.text)}</span><em class="${reviewed ? '' : 'is-unanswered'}">${esc(answer)}</em></li>`;
            }).join('')}</ul><p class="guided-answer-summary-note">답변은 대안을 자동 추천하지 않으며, 교통·복지 담당자의 공동 검토 자료로만 사용합니다.</p></section>
            <p class="guided-document-limit">개인 위치·실제 OD·정책 효과는 포함하지 않습니다.</p>
          </div>

          <div class="guided-review-note">
            <span aria-hidden="true">i</span>
            <p><strong>개인정보를 입력받지 않습니다.</strong><small>이 파일에는 구조화된 조사 항목만 저장합니다. 대상자 이름·주소·연락처·건강정보는 기관의 승인된 내부 절차로 별도 관리하세요.</small></p>
          </div>
        </div>

        <p class="guided-boundary-note">자유입력란이 없어 저장 파일에 이름·주소·연락처가 들어가지 않습니다.</p>
        ${renderSavedCard(model, state)}
        <div class="guided-action-bar guided-save-actions">
          <button class="guided-back-link" type="button" data-action="guided-prev" data-guided-step="5"><span aria-hidden="true">←</span> 이전 화면</button>
          <button class="guided-primary-action" type="button" data-action="guided-print"><span>인쇄·PDF로 저장</span><span aria-hidden="true">▣</span></button>
          <button class="guided-data-action" type="button" data-action="guided-save">데이터용 JSON 저장</button>
        </div>
      </section>`;
  }

  // 저장은 파일만 떨어뜨리고 화면에 흔적을 남기지 않았다. 전체화면 시연에서는
  // 브라우저 다운로드 알림마저 가려져 결론 장면이 관측되지 않는다.
  function renderSavedCard(model, state) {
    if (!state.guidedSavedAt) return '';
    const area = selectedArea(model);
    // ISO(UTC)를 그대로 자르면 한국 시간 오전에는 날짜가 하루 밀린다. 로컬로 환산한다.
    const at = new Date(String(state.guidedSavedAt));
    const pad = (v) => String(v).padStart(2, '0');
    const day = Number.isNaN(at.getTime())
      ? String(state.guidedSavedAt).slice(0, 10)
      : `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    const time = Number.isNaN(at.getTime())
      ? String(state.guidedSavedAt).slice(11, 16)
      : `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    const picked = asList(state.guidedChecks).length;
    return `
      <div class="guided-saved-card" role="status" aria-live="polite">
        <h3>저장했습니다</h3>
        <p class="guided-saved-file">현장조사_체크리스트_${esc(area.dong)}_${esc(day)}.json</p>
        <dl>
          <div><dt>저장 시각</dt><dd>${esc(day)} ${esc(time)}</dd></div>
          <div><dt>현장에서 확인할 항목</dt><dd>${picked}개</dd></div>
          <div><dt>자료 기준일</dt><dd>인구·시설 2026-06-30 · 버스 2025-08-25 · 경계 2026-04-01</dd></div>
          <div><dt>자유입력란</dt><dd>없음</dd></div>
        </dl>
      </div>`;
  }

  function renderStep(step, model, state) {
    const renderers = [null, renderStepOne, renderStepTwo, renderStepThree, renderStepFour, renderStepFive, renderStepSix];
    return renderers[step](model, state);
  }

  function render({ step = 1, model = {}, state = {} } = {}) {
    const activeStep = clamp(step, 1, STEPS.length);
    return `
      <div class="guided-app" data-guided-step="${activeStep}">
        ${header(model)}
        <div class="guided-layout">
          ${stepRail(activeStep, state)}
          <main class="guided-main" id="app-main" tabindex="-1">
            ${renderStep(activeStep, model, state)}
          </main>
        </div>
        <footer class="guided-footer"><span aria-hidden="true">i</span><p>${esc(model.footerNote || '공개데이터 대리진단 · 혼합 기준일 · 실제 이용자 위치 미사용')}</p></footer>
      </div>`;
  }

  return Object.freeze({ render, STEPS });
});
