(function bootstrap() {
  'use strict';

  const DATA = window.DDOL_V2_DATA;
  const BOUNDARIES = window.DDOL_V2_BOUNDARIES;
  const PRO = window.DDOL_PRO_ANALYSIS || null;
  const WELFARE = window.DDOL_WELFARE_DESTINATIONS || null;
  const WELFARE_COORDINATES = window.DDOL_WELFARE_COORDINATE_LAYERS || null;
  const WELFARE_DESTINATION_SENSITIVITY = window.DDOL_WELFARE_DESTINATION_SENSITIVITY || null;
  const BUS_NETWORK_EVIDENCE = window.DDOL_BUS_NETWORK_EVIDENCE || null;
  const CHARTS = window.DdolCharts;
  const ENGINE = window.PolicyEngine;
  const GUIDED = window.DDOL_GUIDED_MODEL;
  const GUIDED_VIEW = window.DDOL_GUIDED_VIEW;
  const app = document.getElementById('app');

  if (!DATA || !BOUNDARIES || !CHARTS || !ENGINE || !GUIDED || !GUIDED_VIEW) {
    app.innerHTML = `
      <main class="fatal">
        <h1>대시보드를 열 수 없습니다.</h1>
        <p>데이터와 안내형 화면 파일이 모두 생성됐는지 확인해 주세요.</p>
      </main>`;
    return;
  }

  const STAGES = [
    { id: 1, label: '현황' },
    { id: 2, label: '후보 비교' },
    { id: 3, label: '재검증 근거' },
    { id: 4, label: '정책 시나리오' },
  ];

  const FALLBACK_SOURCES = [
    {
      id: 'SRC-GOYANG-CARE-20260318',
      org: '고양특례시',
      title: '맞춤형 통합돌봄 서비스 본격화',
      date: '2026-03-18',
      url: 'https://www.goyang.go.kr/news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_bbscttSn=20260318195426555&q_estnColumn1=Y',
      definition: '약 2.9만 명은 우선관리 대상 추정치이며 실이용자·서비스 완료 인원이 아닙니다.',
      status: '공식 확인',
    },
    {
      id: 'SRC-GOYANG-CARE-20260601',
      org: '고양특례시',
      title: '의료·요양 통합돌봄 민관 협력 체계 강화',
      date: '2026-06-01',
      url: 'https://www.goyang.go.kr/news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_bbscttSn=20260601145921152&q_estnColumn1=All',
      definition: '62는 물리적 거점 수가 아니라 기존 57개와 특화 5개를 합친 서비스 목록 수입니다.',
      status: '공식 확인',
    },
    {
      id: 'SRC-GOYANG-CARE-20260609',
      org: '고양특례시',
      title: '빅데이터로 돌봄 사각지대 발굴',
      date: '2026-06-09',
      url: 'https://www.goyang.go.kr/news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_bbscttSn=20260609143417322&q_estnColumn1=All',
      definition: '1,972명은 건강보험 빅데이터로 선별한 특정 위험군의 조사대상입니다.',
      status: '공식 확인',
    },
    {
      id: 'SRC-GOYANG-CARE-20260710',
      org: '고양특례시',
      title: '통합돌봄 대상자 전수조사 결과',
      date: '2026-07-10',
      url: 'https://www.goyang.go.kr/news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_bbscttSn=20260710151704340&q_estnColumn1=All',
      definition: '1,972명은 선별 조사대상이며, 144명 서비스 연계 착수·1,359명 거부 후 모니터링으로 발표됐습니다. 산술 잔여 469명의 상태는 원문이 명명하지 않습니다.',
      status: '공식 결과',
    },
    {
      id: 'SRC-GOYANG-CARE-20260716',
      org: '고양특례시',
      title: '민관 협력체계 기반 장애인 통합돌봄 본격 추진',
      date: '2026-07-16',
      url: 'https://www.goyang.go.kr/news/user/bbs/BD_selectBbs.do?q_bbsCode=1090&q_bbscttSn=20260716132758633&q_clCode=-1&q_estnColumn1=All',
      definition: '2026-07-20부터 노인뿐 아니라 65세 미만 중증 장애인(장애 정도가 심한 장애인)까지 대상 범위가 확대됐습니다.',
      status: '공식 확인',
    },
    {
      id: 'SRC-GOYANG-DDOKBUS',
      org: '고양특례시',
      title: '고양 똑버스 안내',
      date: '2025-12-15 수정',
      url: 'https://www.goyang.go.kr/www/www03/www03_5/www03_5_4/www03_5_4_tab7.jsp',
      definition: '공식 서비스 범위는 식사·고봉·덕은·향동 4개 운영권역입니다. 운영권역은 행정동과 같은 단위가 아닙니다.',
      status: '공식 확인',
    },
    {
      id: 'SRC-GTRANS-DDOKBUS-20260813',
      org: '경기교통공사',
      title: '똑버스 운영현황',
      date: '2026-08-13 확인',
      url: 'https://www.gtrans.or.kr/web/lay1/program/S1T499C698/ddock_bus/list.do',
      definition: '공개 운영현황에서 고양 4개 권역의 차량을 식사 4·고봉 3·덕은 3·향동 4대로 확인했습니다. 합계 14대는 이 확인일의 시점값입니다.',
      status: '공식 목록 확인',
    },
    {
      id: 'population',
      org: '행정안전부',
      title: '행정동 성별·연령별 주민등록 인구수',
      date: '2026-06-30',
      url: 'https://www.data.go.kr/data/15097972/fileData.do',
      definition: '고양시 3개 구의 44개 행정동을 필터하고 65세부터 110세 이상까지 합산했습니다.',
      status: '원자료 재계산',
    },
    {
      id: 'one_person',
      org: '행정안전부',
      title: '행정동 성별·연령별 주민등록 1인세대수',
      date: '2026-06-30',
      url: 'https://www.data.go.kr/data/15097973/fileData.do',
      definition: '70세 이상 남녀 단일연령 열을 합산했습니다. 1인세대는 돌봄필요자와 같은 개념이 아닙니다.',
      status: '원자료 재계산',
    },
    {
      id: 'hira_hospital',
      aliases: ['hira_pharmacy', 'HIRA'],
      org: '건강보험심사평가원',
      title: '전국 병·의원 및 약국 현황',
      date: '2026-06-30',
      url: 'https://opendata.hira.or.kr/op/opc/selectOpenData.do?sno=11925',
      definition: '고양시 시군구코드로 병·의원 등 1,397행과 약국 496행을 필터했습니다. 이는 통합돌봄 거점이 아닙니다.',
      status: '원자료 재계산',
    },
    {
      id: 'bus_stops',
      org: '고양특례시',
      title: '버스정류장 현황',
      date: '2025-08-25',
      url: 'https://www.data.go.kr/data/3079629/fileData.do',
      definition: '파일 2,099행 중 2026-04-01 행정동 경계 안에 포함된 2,095개를 공간분석에 사용했습니다.',
      status: '원자료 재계산',
    },
    {
      id: 'boundary_display',
      org: '통계청 SGIS · vuski/admdongkor',
      title: '2026-04-01 행정동 경계',
      date: '2026-04-01',
      url: BOUNDARIES.metadata?.sourceUrl || 'https://github.com/vuski/admdongkor',
      definition: '제출 재현분석의 공간조인과 공개 화면에 같은 2026-04-01 행정동 경계를 사용했습니다. 고양시 공식 서비스가 아니라 SGIS 기반 공개 경계의 팀 가공 화면입니다.',
      status: '공개 라이선스 확인',
      hash: BOUNDARIES.metadata?.sourceSha256,
      license: BOUNDARIES.metadata?.licenseStatus,
    },
    {
      id: 'SRC-MOLIT-DRT',
      org: '국토교통부',
      title: '수요응답형 교통체계(DRT) 운영 가이드라인',
      date: '2025-12-30',
      url: 'https://www.molit.go.kr/USR/policyData/m_34681/dtl.jsp?id=4869',
      definition: '접근성·이용률·교통약자 비율 등을 고려하되 절대 기준은 없다고 설명합니다. 0.5/0.3/0.2는 팀 시나리오입니다.',
      status: '공식 확인',
    },
  ];

  const FALLBACK_CONTEXT = [
    { value: '약 2.9만 명', title: '2026년 3월 우선관리 대상 추정', detail: '실이용자 수가 아니며 7월 대상 확대 전 값', sourceId: 'SRC-GOYANG-CARE-20260318' },
    { value: '57 + 5', title: '통합돌봄 서비스 목록', detail: '62개소가 아니라 서비스 목록 62개', sourceId: 'SRC-GOYANG-CARE-20260601' },
    { value: '1,972명', title: '빅데이터 선별 조사대상', detail: '전체 수혜자·서비스 완료 인원이 아님', sourceId: 'SRC-GOYANG-CARE-20260710' },
    { value: '7월 20일', title: '65세 미만 중증 장애인까지 확대', detail: '3월 추정치를 현재 총량으로 재사용할 수 없음', sourceId: 'SRC-GOYANG-CARE-20260716' },
  ];

  const city = DATA.city || {};
  const welfareByDong = new Map((WELFARE?.areaRows || []).map((row) => [row.dong, numberValue(row.seniorCenterCount)]));
  const allAreas = (DATA.areas || []).map(normalizeArea);
  const areaByCode = new Map(allAreas.map((item) => [String(item.code), item]));
  const comparisonsByDong = new Map((DATA.candidateComparisons || []).map((item) => [
    pick(item, 'dong', 'dongName', 'dong_name'),
    item,
  ]));
  const rawCandidates = DATA.candidates?.length
    ? DATA.candidates
    : allAreas.filter((item) => item.candidate);
  const candidates = rawCandidates
    .map((item) => normalizeCandidate(item, comparisonsByDong.get(pick(item, 'dong', 'dongName', 'dong_name'))))
    .sort((a, b) => a.dong.localeCompare(b.dong, 'ko'));
  const candidateByCode = new Map(candidates.map((item) => [String(item.code), item]));
  const candidateByDong = new Map(candidates.map((item) => [item.dong, item]));
  const claims = (DATA.claims || []).map(normalizeClaim);
  const claimSummary = normalizeClaimSummary(DATA.claimSummary, claims);
  const sensitivity = normalizeSensitivity(DATA.sensitivity || []);
  const localMoran = DATA.localMoran || [];
  const modelComparison = DATA.modelComparison || [];
  const rankComparisons = DATA.rankComparisons || [];
  const officialContext = DATA.officialContext?.length ? DATA.officialContext : FALLBACK_CONTEXT;
  const sources = buildSources();
  const selectedDefault = candidateByDong.get('관산동') || candidates[0];

  if (!selectedDefault || candidates.length !== 8) {
    app.innerHTML = '<main class="fatal"><h1>후보 데이터 계약 오류</h1><p>후보 8개 동의 데이터가 모두 생성됐는지 확인해 주세요.</p></main>';
    return;
  }

  const STATE_KEY = 'ddol-dashboard-v2-state';
  const GUIDED_STATE_KEY = 'ddol-dashboard-guided-v1';
  let guidedStorageAvailable = true;
  prepareDemoState();
  let state = readState();
  let activeSourceId = null;
  let helpOpen = false;
  let toastMessage = '';
  let overlayReturn = null;

  function pick(object, ...keys) {
    if (!object) return undefined;
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
    }
    return undefined;
  }

  function numberValue(value, fallback = 0) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  }

  function normalizeArea(item) {
    return {
      code: String(pick(item, 'code', 'admCd2', 'adm_cd2') ?? ''),
      district: pick(item, 'district', 'districtName', 'district_name') ?? '',
      dong: pick(item, 'dong', 'dongName', 'dong_name') ?? '',
      population: numberValue(pick(item, 'population')),
      elderly65: numberValue(pick(item, 'elderly65')),
      single70: numberValue(pick(item, 'single70')),
      agingRate: numberValue(pick(item, 'agingRate', 'aging_rate')),
      demandIndex: numberValue(pick(item, 'demandIndex', 'demand_index')),
      stops: numberValue(pick(item, 'stops', 'busStopCount', 'bus_stop_count')),
      routesPerStop: numberValue(pick(item, 'routesPerStop', 'routes_per_stop')),
      routeMentions: numberValue(pick(item, 'routeMentions', 'route_mentions')),
      nearestFacilityM: numberValue(pick(item, 'nearestFacilityM', 'nearest_facility_mean_m')),
      facilityP90M: numberValue(pick(item, 'facilityP90M', 'facility_p90_m')),
      seniorCenterCount: welfareByDong.has(pick(item, 'dong', 'dongName', 'dong_name'))
        ? welfareByDong.get(pick(item, 'dong', 'dongName', 'dong_name'))
        : null,
      currentDrt: Boolean(pick(item, 'currentDrt', 'current_drt_flag')),
      candidate: Boolean(pick(item, 'candidate', 'candidateTop8', 'candidate_top8')),
    };
  }

  function normalizeCandidate(item, comparison) {
    const base = normalizeArea(item);
    const source = comparison || item;
    return {
      ...base,
      cag: numberValue(pick(source, 'cag', 'cagReproduced')),
      posterCag: numberValue(pick(source, 'posterCag', 'cagPoster', 'cag_poster')),
      posterDss: numberValue(pick(source, 'posterDss', 'dssPoster', 'dss_poster')),
      reproducedDss: numberValue(pick(source, 'reproducedDss', 'dssReproduced', 'dss_01')),
      posterRank: numberValue(pick(source, 'posterRank', 'posterGlobalRank', 'poster_global_rank')),
      reproducedRank: numberValue(pick(source, 'reproducedRank', 'rankGlobal', 'rank_global')),
      candidate: true,
    };
  }

  function normalizeClaim(item) {
    return {
      id: pick(item, 'id', 'claimId', 'claim_id') ?? '',
      claim: pick(item, 'claim') ?? '',
      poster: pick(item, 'poster', 'posterValue', 'poster_value') ?? '',
      reproduced: pick(item, 'reproduced', 'reproducedValue', 'reproduced_value') ?? '',
      status: pick(item, 'status') ?? '',
      group: pick(item, 'group', 'statusGroup', 'status_group') ?? '',
      note: pick(item, 'note') ?? '',
      evidenceLevel: pick(item, 'evidenceLevel', 'evidence_level') ?? '',
    };
  }

  function normalizeClaimSummary(summary, items) {
    if (summary) {
      const confirmed = numberValue(pick(summary, 'confirmed', 'reproduced', '재현/확인'));
      const conditional = numberValue(pick(summary, 'conditional', '조건부'));
      const correction = numberValue(pick(summary, 'correction', 'needsCorrection', '수정·명세 보완'));
      return { confirmed, conditional, correction, total: numberValue(summary.total, confirmed + conditional + correction) };
    }
    const count = (group) => items.filter((item) => item.group === group).length;
    return { confirmed: count('재현/확인'), conditional: count('조건부'), correction: count('수정·명세 보완'), total: items.length };
  }

  function normalizeSensitivity(items) {
    const unique = new Map();
    items.forEach((item) => {
      const id = pick(item, 'scenarioId', 'scenario_id');
      if (!id || unique.has(id)) return;
      unique.set(id, {
        scenarioId: id,
        label: pick(item, 'label', 'scenarioLabel') || sensitivityLabel(id),
        type: pick(item, 'type', 'scenarioType', 'scenario_type'),
        jaccard: numberValue(pick(item, 'jaccard', 'jaccardVsBaseTop8', 'jaccard_vs_base_top8')),
        top8Dongs: pick(item, 'top8Dongs', 'top8_dongs') || '',
      });
    });
    return [...unique.values()];
  }

  function sensitivityLabel(id) {
    const labels = {
      base_50_30_20: '기준 가중치 50·30·20',
      demand_60_25_15: '수요 강조 60·25·15',
      bus_40_40_20: '버스 강조 40·40·20',
      dispersion_40_25_35: '시설분산 강조 40·25·35',
      'beta_0.02': '거리감쇠 β 0.02',
      'beta_0.05': '거리감쇠 β 0.05',
      'beta_0.1': '거리감쇠 β 0.10',
      'beta_0.13': '거리감쇠 β 0.13',
      'beta_0.138629': '5분 반감기 β 0.1386',
      'beta_0.15': '거리감쇠 β 0.15',
      'beta_0.2': '거리감쇠 β 0.20',
    };
    return labels[id] || id;
  }

  function buildSources() {
    const merged = new Map(FALLBACK_SOURCES.map((source) => [source.id, source]));
    (DATA.sources || []).forEach((source) => {
      const id = pick(source, 'id', 'sourceId', 'source_id');
      if (!id) return;
      merged.set(id, {
        ...(merged.get(id) || {}),
        ...source,
        id,
        org: pick(source, 'org', 'organization'),
        date: pick(source, 'date', 'publishedAt', 'published_at'),
        checkedAt: pick(source, 'checkedAt', 'checked_at'),
      });
    });
    (DATA.sourceManifest || []).forEach((source) => {
      const id = pick(source, 'id', 'sourceId', 'source_id');
      if (!id) return;
      const existing = merged.get(id) || {};
      merged.set(id, {
        ...existing,
        id,
        title: existing.title || pick(source, 'layer') || id,
        date: existing.date || pick(source, 'snapshotDate', 'snapshot_date'),
        url: existing.url || pick(source, 'sourceUrl', 'source_url'),
        status: existing.status || '원자료 확보',
        hash: pick(source, 'sha256'),
        checkedAt: pick(source, 'checkedAt', 'checked_at'),
        license: pick(source, 'license'),
      });
    });
    return [...merged.values()];
  }

  function prepareDemoState() {
    const url = new URL(window.location.href);
    if (url.searchParams.get('demo') !== '1') return;
    try {
      window.localStorage.removeItem(STATE_KEY);
      window.localStorage.removeItem(GUIDED_STATE_KEY);
    } catch (_error) {
      guidedStorageAvailable = false;
    }
    url.searchParams.delete('demo');
    window.history.replaceState({}, '', url);
  }

  function readState() {
    const params = new URL(window.location.href).searchParams;
    let stored = {};
    let guidedStored = {};
    try { stored = JSON.parse(window.localStorage.getItem(STATE_KEY) || '{}'); } catch (_error) { stored = {}; }
    try {
      guidedStored = JSON.parse(window.localStorage.getItem(GUIDED_STATE_KEY) || '{}');
      if (Object.prototype.hasOwnProperty.call(guidedStored, 'note')) {
        delete guidedStored.note;
        window.localStorage.setItem(GUIDED_STATE_KEY, JSON.stringify(guidedStored));
      }
    } catch (_error) {
      guidedStored = {};
      guidedStorageAvailable = false;
    }
    const requestedView = params.get('view');
    const view = requestedView === 'analysis' || requestedView === 'guided'
      ? requestedView
      : params.has('stage')
        ? 'analysis'
        : 'guided';
    const legacyGuidedDefault = guidedStored.selectedCode === '4128163000'
      && !params.get('dong')
      && !guidedStored.feedbackFlowVersion;
    if (legacyGuidedDefault) guidedStored.selectedCode = selectedDefault.code;
    const requestedCode = params.get('dong') || guidedStored.selectedCode || stored.selectedCode;
    const selected = candidateByCode.get(String(requestedCode)) || candidateByDong.get(requestedCode) || selectedDefault;
    const requestedMapCode = String(stored.mapAreaCode || selected.code);
    const mapArea = areaByCode.get(requestedMapCode) || areaByCode.get(String(selected.code)) || allAreas[0];
    const mapMetric = ['agingRate', 'single70', 'demandIndex', 'routesPerStop', 'nearestFacilityM', 'seniorCenterCount', 'currentDrt', 'candidate'].includes(stored.mapMetric)
      ? stored.mapMetric
      : 'agingRate';
    const mapDistrict = ['전체', '고양시 덕양구', '고양시 일산동구', '고양시 일산서구'].includes(stored.mapDistrict)
      ? stored.mapDistrict
      : '전체';
    const checklistIds = GUIDED.CHECKLIST_ITEMS.map((item) => item.id);
    const guidedChecks = Array.isArray(guidedStored.checks)
      ? guidedStored.checks.filter((id) => checklistIds.includes(id))
      : [];
    const guidedAnswers = {
      visitSubstitution: 'unknown',
      demandConcentration: 'unknown',
      phoneReservation: 'unknown',
      irregularDemand: 'unknown',
      accessibleVehicle: 'unknown',
      ...(guidedStored.answers || {}),
    };
    const questionIds = GUIDED.POLICY_QUESTIONS.map((item) => item.id);
    const guidedReviewedQuestions = Array.isArray(guidedStored.reviewedQuestions)
      ? guidedStored.reviewedQuestions.filter((id) => questionIds.includes(id))
      : questionIds.filter((id) => ['yes', 'no'].includes(guidedAnswers[id]));
    const guidedStep = clamp(numberValue(params.get('step') || guidedStored.step || 1), 1, 6);
    const guidedQuestionIndex = clamp(numberValue(params.get('q') || guidedStored.questionIndex || 0), 0, GUIDED.POLICY_QUESTIONS.length - 1);
    return {
      view,
      stage: clamp(numberValue(params.get('stage') || stored.stage || 1), 1, 4),
      guidedStep,
      guidedVisitedStep: clamp(Math.max(guidedStep, numberValue(guidedStored.visitedStep, guidedStep)), 1, 6),
      guidedQuestionIndex,
      guidedChecks,
      guidedAnswers,
      guidedReviewedQuestions,
      guidedSavedAt: null,
      selectedCode: selected.code,
      mapAreaCode: mapArea.code,
      mapMetric,
      mapDistrict,
      mapBusPoints: stored.mapBusPoints !== false,
      mapFacilityPoints: Boolean(stored.mapFacilityPoints),
      claimFilter: stored.claimFilter || '전체',
      demand: stored.demand || 'medium',
      pattern: stored.pattern || 'dispersed',
      digital: stored.digital || 'low',
      serviceMode: stored.serviceMode || 'travel',
      vehicles: clamp(numberValue(stored.vehicles, 2), 1, 10),
      wheelchair: Boolean(stored.wheelchair),
      decisionStatus: ['investigate', 'pilot_review', 'hold', 'reject'].includes(stored.decisionStatus) ? stored.decisionStatus : 'investigate',
      decisionReason: String(stored.decisionReason || '').slice(0, 500),
    };
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function selectedArea() { return candidateByCode.get(String(state.selectedCode)) || selectedDefault; }
  function selectedMapArea() { return areaByCode.get(String(state.mapAreaCode)) || areaByCode.get(String(selectedDefault.code)) || allAreas[0]; }
  function number(value) { return new Intl.NumberFormat('ko-KR').format(Math.round(numberValue(value))); }
  function percent(value, digits = 1) { return `${(numberValue(value) * 100).toFixed(digits)}%`; }
  function km(value) { return `${(numberValue(value) / 1000).toFixed(2)}km`; }
  function esc(value) { return CHARTS.escapeHtml(value); }

  function persistState() {
    const analysisState = {
      stage: state.stage,
      selectedCode: state.selectedCode,
      mapAreaCode: state.mapAreaCode,
      mapMetric: state.mapMetric,
      mapDistrict: state.mapDistrict,
      mapBusPoints: state.mapBusPoints,
      mapFacilityPoints: state.mapFacilityPoints,
      claimFilter: state.claimFilter,
      demand: state.demand,
      pattern: state.pattern,
      digital: state.digital,
      serviceMode: state.serviceMode,
      vehicles: state.vehicles,
      wheelchair: state.wheelchair,
      decisionStatus: state.decisionStatus,
      decisionReason: state.decisionReason,
    };
    const guidedState = {
      step: state.guidedStep,
      visitedStep: state.guidedVisitedStep,
      selectedCode: state.selectedCode,
      checks: state.guidedChecks,
      answers: state.guidedAnswers,
      reviewedQuestions: state.guidedReviewedQuestions,
      questionIndex: state.guidedQuestionIndex,
      feedbackFlowVersion: 2,
    };
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify(analysisState));
    } catch (_error) {
      // 분석 상세는 저장 실패 시에도 현재 세션에서 계속 사용할 수 있습니다.
    }
    try {
      window.localStorage.setItem(GUIDED_STATE_KEY, JSON.stringify(guidedState));
      guidedStorageAvailable = true;
    } catch (_error) {
      guidedStorageAvailable = false;
    }
  }

  function updateState(patch, pushHistory = false, focusMain = false) {
    state = { ...state, ...patch };
    persistState();
    const url = new URL(window.location.href);
    url.searchParams.set('view', state.view);
    url.searchParams.set('dong', state.selectedCode);
    if (state.view === 'guided') {
      url.searchParams.set('step', String(state.guidedStep));
      url.searchParams.delete('stage');
      if (state.guidedStep === 5) url.searchParams.set('q', String(state.guidedQuestionIndex));
      else url.searchParams.delete('q');
    } else {
      url.searchParams.set('stage', String(state.stage));
      url.searchParams.delete('step');
      url.searchParams.delete('q');
    }
    window.history[pushHistory ? 'pushState' : 'replaceState']({}, '', url);
    render();
    if (focusMain) window.setTimeout(() => {
      // 단계형 안내는 화면 전체를 교체한다. 이전 단계의 스크롤 위치를 남기면
      // 새 질문의 제목과 설명이 잘리므로 항상 새 화면의 시작점으로 돌아간다.
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.getElementById('app-main')?.focus({ preventScroll: true });
    }, 0);
  }

  function shell(content) {
    return `
      <header class="topbar">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true"></span>
          <div class="brand-copy"><strong>닿지 않는 돌봄</strong><span>고양시 교통·복지 정책 사전검토</span></div>
        </div>
        <div class="top-actions">
          <button class="top-action" data-view="guided" aria-label="단계형 안내로 돌아가기"><span class="button-text">단계형 안내</span></button>
          <span class="offline-badge"><i></i>오프라인 시연</span>
          <button class="top-action" data-action="print" aria-label="현재 화면 인쇄"><span class="button-icon">▣</span><span class="button-text">인쇄</span></button>
          <button class="top-action" data-action="export" aria-label="검토 결과 내보내기"><span class="button-icon">⇩</span><span class="button-text">내보내기</span></button>
          <button class="top-action" data-action="help" aria-label="도움말"><span class="button-icon">?</span><span class="button-text">도움말</span></button>
        </div>
      </header>
      <div class="stage-wrap"><nav class="stage-nav" aria-label="정책 검토 단계">${renderStageNav()}</nav></div>
      <main id="app-main" tabindex="-1">${content}</main>
      <footer class="app-footer">
        <div><strong>혼합 기준일</strong>버스 2025-08-25 · 경계 2026-04-01 · 인구·시설 2026-06-30</div>
        <div><strong>해석 범위</strong>실제 대상자 위치·통행시간·운영비가 없는 공개데이터 대리진단</div>
        <button class="text-button" data-stage="3">근거와 한계 보기 →</button>
      </footer>
      ${renderOverlays()}
      ${toastMessage ? `<div class="toast" role="status">${esc(toastMessage)}</div>` : ''}`;
  }

  function renderStageNav() {
    return STAGES.map((stage) => `
      <button class="stage-button ${state.stage === stage.id ? 'is-active' : ''}" data-stage="${stage.id}" aria-current="${state.stage === stage.id ? 'step' : 'false'}">
        <span class="stage-number">${stage.id}</span><span class="stage-label">${stage.label}</span>
      </button>`).join('');
  }

  function renderGuidedMap(selectedCode) {
    const features = BOUNDARIES.features || [];
    const selectedFeature = features.find((feature) => String(feature.code) === String(selectedCode));
    const paths = features.map((feature) => {
      const area = areaByCode.get(String(feature.code));
      if (!area) return '';
      const selected = String(feature.code) === String(selectedCode);
      const candidate = candidateByCode.has(String(feature.code));
      const attributes = candidate
        ? `data-guided-dong="${esc(feature.code)}" tabindex="0" role="button" aria-label="${esc(area.dong)} 후보 선택"`
        : 'aria-hidden="true"';
      return `<path class="guided-map-path ${selected ? 'is-selected' : ''} ${candidate ? 'is-candidate' : ''}" ${attributes} d="${esc(feature.path)}" fill-rule="evenodd"><title>${esc(area.dong)}</title></path>`;
    }).join('');
    const selectedLabel = selectedFeature
      ? `<g class="guided-map-selected-label" transform="translate(${numberValue(selectedFeature.labelX)} ${numberValue(selectedFeature.labelY)})"><circle r="11"></circle><text y="-18" text-anchor="middle">${esc(selectedArea().dong)}</text></g>`
      : '';
    return `
      <svg class="guided-map-svg" viewBox="${esc(BOUNDARIES.metadata?.viewBox || '0 0 900 660')}" role="group" aria-label="고양시 44개 행정동 후보 지도">
        <g>${paths}</g>${selectedLabel}
      </svg>`;
  }

  function buildGuidedModel() {
    const model = GUIDED.buildAreaModel(
      DATA,
      PRO,
      state.selectedCode,
      WELFARE,
      WELFARE_COORDINATES,
      BUS_NETWORK_EVIDENCE,
      WELFARE_DESTINATION_SENSITIVITY,
    );
    const signalMetrics = model.signals.map((signal) => ({
      ...signal,
      areaDisplay: signal.id === 'nearest-facility' ? km(signal.value) : signal.display,
      cityDisplay: signal.id === 'nearest-facility' ? km(signal.benchmark) : signal.benchmarkDisplay,
      definition: signal.id === 'aging-rate'
        ? '65세 이상 주민등록인구 비율'
        : signal.id === 'routes-per-stop'
          ? '정류장별 경유노선 수의 평균'
          : '100m 격자별 최근접 의료기관 거리 평균',
    }));
    const agingHigher = model.signals[0].value > model.signals[0].benchmark;
    const routesLower = model.signals[1].value < model.signals[1].benchmark;
    const facilityGapRatio = Math.abs(model.signals[2].value - model.signals[2].benchmark) / Math.max(model.signals[2].benchmark, 1);
    const mapMarkup = renderGuidedMap(model.selectedArea?.code || state.selectedCode);
    return {
      ...model,
      productSubtitle: '고양시 교통·복지 현장조사 지원',
      areaCount: allAreas.length,
      eligibleAreaCount: numberValue(PRO.baseline?.eligibleAreaCount, 41),
      candidateCount: candidates.length,
      signalMetrics,
      signalHeadline: model.evidenceFraming?.headline
        || `${agingHigher ? '고령 수요는 높고' : '고령 수요는 낮고'}, 버스 연결은 ${routesLower ? '낮게' : '높게'} 관찰됐습니다.`,
      signalSubheadline: model.evidenceFraming?.subheadline || (facilityGapRatio <= 0.1
        ? '의료시설 거리는 시 평균과 비슷합니다. 실제 이동 수요는 현장에서 확인해야 합니다.'
        : `의료시설 거리는 시 평균보다 ${model.signals[2].value > model.signals[2].benchmark ? '멀게' : '가깝게'} 관찰됐습니다. 실제 이동시간은 아직 모릅니다.`),
      signalSummary: model.evidenceFraming?.summary
        || `${agingHigher ? '고령 수요 취약 신호' : '고령 수요 신호'} · ${routesLower ? '버스 연결 취약 신호' : '버스 연결 공급 신호'} · 의료 접근 ${facilityGapRatio <= 0.1 ? '평균 수준' : '차이 관찰'}`,
      methodNote: '인구·시설 2026-06-30, 버스 2025-08-25, 행정동 경계 2026-04-01을 결합했습니다. 실제 통행시간은 포함하지 않습니다.',
      confirmedText: `후보집합 8/8은 재현됐고, 네 구성요소 명세에 공통인 핵심은 ${model.feedbackAudit?.ablation?.stableCoreDongs?.join('·') || '확인 중'}입니다.`,
      unconfirmedText: `${model.scoreVerification.interpretation}. 마을버스 중복·DRT 효과·비용은 아직 검증하지 않았습니다.`,
      robustnessMethodNote: '순위상관은 지표 중복 위험을, 구성요소 제거는 후보 교체 폭을 보여줍니다. 둘 다 선정확률이나 정책효과가 아닙니다.',
      fieldChecks: GUIDED.CHECKLIST_ITEMS,
      policyQuestions: GUIDED.POLICY_QUESTIONS,
      confirmedSignals: [
        `${model.selectedArea.dong} 고령화율 ${signalMetrics[0].areaDisplay}`,
        `정류장당 노선 ${signalMetrics[1].areaDisplay}개`,
        `의료시설 평균거리 ${signalMetrics[2].areaDisplay}`,
      ],
      footerNote: '공개데이터 대리진단 · 버스·경계·인구·시설 혼합 기준일 · 실제 이용자 위치 미사용',
      mapMarkup,
      mapSvg: mapMarkup,
    };
  }

  function renderGuided() {
    const model = buildGuidedModel();
    return GUIDED_VIEW.render({
      step: state.guidedStep,
      model,
      state: {
        ...state,
        step: state.guidedStep,
        visitedStep: state.guidedVisitedStep,
        checks: state.guidedChecks,
        answers: state.guidedAnswers,
        policyAnswers: state.guidedAnswers,
        policyReviewedQuestions: state.guidedReviewedQuestions,
        policyQuestionIndex: state.guidedQuestionIndex,
        storageAvailable: guidedStorageAvailable,
        savedAt: state.guidedSavedAt || null,
      },
    });
  }

  function pageIntro(eyebrow, title, copy, statusTitle, statusCopy) {
    return `
      <div class="page-intro">
        <div><span class="eyebrow">${esc(eyebrow)}</span><h1>${title}</h1><p>${copy}</p></div>
        <div class="page-status"><strong>${esc(statusTitle)}</strong>${esc(statusCopy)}</div>
      </div>`;
  }

  function contextSourceId(item) {
    const direct = pick(item, 'primarySourceId', 'primary_source_id', 'sourceId', 'source_id');
    if (direct) return direct;
    if (Array.isArray(item.sourceIds) && item.sourceIds.length) return item.sourceIds[0];
    return '';
  }

  function renderContextSourceButtons(item) {
    const primary = contextSourceId(item);
    const ids = Array.isArray(item.sourceIds) && item.sourceIds.length
      ? [...item.sourceIds]
      : [primary].filter(Boolean);
    const ordered = [...new Set([primary, ...ids].filter(Boolean))];
    return `<div class="context-source-actions">${ordered.map((id, index) => {
      const source = sourceById(id);
      const date = source?.date || source?.publishedAt || '';
      const label = index === 0 ? '주요 원문' : `${date || '추가'} 원문`;
      return `<button class="source-button" data-source="${esc(id)}">${esc(label)}</button>`;
    }).join('')}</div>`;
  }

  function registeredScenarioSummary() {
    const scenarioSets = sensitivity
      .map((item) => Array.isArray(item.top8Dongs)
        ? new Set(item.top8Dongs)
        : new Set(String(item.top8Dongs || '').split(/[|,]/).map((value) => value.trim()).filter(Boolean)))
      .filter((set) => set.size);
    const baseline = sensitivity.find((item) => item.scenarioId === 'base_50_30_20');
    const baselineSet = baseline
      ? (Array.isArray(baseline.top8Dongs)
        ? new Set(baseline.top8Dongs)
        : new Set(String(baseline.top8Dongs || '').split(/[|,]/).map((value) => value.trim()).filter(Boolean)))
      : new Set(candidates.map((item) => item.dong));
    const common = new Set([...baselineSet].filter((dong) => scenarioSets.every((set) => set.has(dong))));
    const conditional = new Set([...baselineSet].filter((dong) => !common.has(dong)));
    const alternatives = new Set(scenarioSets.flatMap((set) => [...set]).filter((dong) => !baselineSet.has(dong)));
    return {
      count: scenarioSets.length,
      baseline: [...baselineSet].sort((a, b) => a.localeCompare(b, 'ko')),
      common: [...common].sort((a, b) => a.localeCompare(b, 'ko')),
      conditional: [...conditional].sort((a, b) => a.localeCompare(b, 'ko')),
      alternatives: [...alternatives].sort((a, b) => a.localeCompare(b, 'ko')),
    };
  }

  function renderAnalysisContractStrip() {
    return `
      <section class="analysis-contract" aria-label="분석 범위와 기준">
        <div class="analysis-contract-lead"><span>보고서 질문</span><strong>복지 문제를 교통 데이터로 푼다</strong><small>WHO → HOW FAR → WHERE FIRST</small></div>
        <div><span>행정 범위</span><strong>44<small>개 행정동</small></strong><small>고양시 전체</small></div>
        <div><span>공개데이터</span><strong>3<small>개 계층</small></strong><small>수요 · 공급 · 연결</small></div>
        <div><span>기준 후보</span><strong>8<small>곳</small></strong><small>제출 보고서 기준</small></div>
        <div><span>혼합 기준일</span><strong class="date-value">2025.08 → 2026.06</strong><small>계층별 차이 공개</small></div>
        <button class="analysis-contract-badge" data-stage="3"><b>공개데이터</b><span>대리진단</span><small>근거·한계 보기</small></button>
      </section>`;
  }

  function renderReportPipeline() {
    const steps = [
      ['L1', '돌봄 수요', '고령인구·1인세대'],
      ['L2', '의료 공급', '병·의원 등·약국'],
      ['L3', '교통 연결', '정류장·경유노선'],
      ['RI', '접근성', '직선보행 대리값'],
      ['CAG', '수요-공급 격차', '동별 비교'],
      ['DSS', '탐색 결합지수', '팀 시나리오'],
      ['8', '검토후보', '현장조사로 연결'],
    ];
    return `
      <article class="card report-pipeline-card">
        <div class="card-head"><div><span class="eyebrow">제출 보고서 기준선</span><h2>L1 + L2 + L3 → RI → CAG → DSS → 후보 8곳</h2><p>원자료를 다시 잠그고 같은 질문을 재계산한 뒤, 통계·공간·민감도 검증을 덧붙였습니다.</p></div><span class="badge team">기준 흐름 유지</span></div>
        <div class="report-pipeline" aria-label="제출 보고서 분석 파이프라인">
          ${steps.map(([code, title, copy], index) => `${index ? '<span class="pipeline-arrow">→</span>' : ''}<div class="pipeline-step"><i>${esc(code)}</i><strong>${esc(title)}</strong><small>${esc(copy)}</small></div>`).join('')}
        </div>
        <div class="pipeline-method"><span><b>재분석 절차</b> 원자료 잠금 → 결측·중복·이상치 QA → 보고서 기준식 재계산 → 통계·공간 검증 → 정책 해석</span><button class="source-button" data-stage="3">전문 검증 결과 보기</button></div>
      </article>`;
  }

  function renderRegisteredScenarioSummary() {
    const summary = registeredScenarioSummary();
    return `
      <article class="card scenario-summary-card">
        <div class="card-head"><div><span class="eyebrow">등록 시나리오 점검</span><h2>후보가 얼마나 흔들리는가</h2><p>기존에 등록한 ${summary.count}개 시나리오 안에서만 집합의 유지·교체를 셉니다.</p></div><span class="badge pending">순위·확률 아님</span></div>
        <div class="scenario-summary-grid">
          <div><span>기준 후보</span><strong>${summary.baseline.length}<small>곳</small></strong><small>제출 기준</small></div>
          <div class="is-stable"><span>${summary.count}개 모두 유지</span><strong>${summary.common.length}<small>곳</small></strong><small>${esc(summary.common.join(' · '))}</small></div>
          <div><span>조건부 유지</span><strong>${summary.conditional.length}<small>곳</small></strong><small>${esc(summary.conditional.join(' · '))}</small></div>
          <div><span>대안에서 추가</span><strong>${summary.alternatives.length}<small>곳</small></strong><small>${esc(summary.alternatives.join(' · '))}</small></div>
        </div>
        <p class="scenario-summary-note">포함 횟수는 선정확률이 아닙니다. 아래 전문 분석에서는 더 촘촘한 45개 가중치 조합과 공간·거리 명세 변화까지 별도로 확인합니다.</p>
      </article>`;
  }

  function renderOverview() {
    const population = numberValue(pick(city, 'population'), 1057438);
    const elderly = numberValue(pick(city, 'elderly65'), 204878);
    const aging = numberValue(pick(city, 'agingRate'), 0.19374942);
    const facilities = numberValue(pick(city, 'facilities'), 1893);
    const busRaw = numberValue(pick(city, 'busStopsRaw', 'busStopRows'), 2099);
    const busInside = numberValue(pick(city, 'busStopsInBoundary'), 2095);
    return `
      <section class="page overview-page">
        ${pageIntro(
          '1 / 4 · 현황',
          '돌봄 수요가 높은데 <em>이동 공급이 낮은 동은 어디인가?</em>',
          '고양시 44개 행정동을 다차원·공간 관점에서 진단해 현장확인이 필요한 동을 좁힙니다.',
          '분석이 답하는 결정',
          '도입 확정이 아니라 현장조사·대안 비교에 올릴 동을 고릅니다.',
        )}
        ${renderAnalysisContractStrip()}
        ${renderAdministrativeMapPanel()}
        <div class="analysis-method-grid">
          ${renderReportPipeline()}
          ${renderRegisteredScenarioSummary()}
        </div>
        <div class="hero-split">
          <article class="card official-context">
            <div class="card-head"><div><h2>고양온돌 공식 맥락</h2><p>서로 다른 모집단·단위를 곱하거나 같은 수치처럼 읽지 않습니다.</p></div><span class="badge official">공식 확인</span></div>
            <div class="context-grid">
              ${officialContext.map((item) => `
                <div class="context-item">
                  <span class="badge official">정의 잠금</span>
                  <strong class="context-value">${esc(pick(item, 'value'))}</strong>
                  <h3>${esc(pick(item, 'title', 'label'))}</h3>
                  ${pick(item, 'asOf', 'as_of') ? `<small class="context-asof">기준 ${esc(pick(item, 'asOf', 'as_of'))}</small>` : ''}
                  <p>${esc(pick(item, 'detail', 'definition'))}${pick(item, 'caution') ? `<br><strong>${esc(pick(item, 'caution'))}</strong>` : ''}</p>
                  ${renderContextSourceButtons(item)}
                </div>`).join('')}
            </div>
          </article>
          <article class="card analysis-answer">
            <span class="badge">공개데이터 대리진단</span>
            <h2>“누가 서비스를 못 받았나”가 아니라 “어느 동부터 현장확인할까”를 답합니다.</h2>
            <p>실제 고양온돌 대상자 위치와 62개 서비스 제공지를 사용하지 않았습니다. 일반 고령수요·의료 공급·버스 공급 신호로 조사 범위를 좁힙니다.</p>
            <ul>
              <li><i>1</i><span>수요: 65세 이상 인구와 70세 이상 1인세대</span></li>
              <li><i>2</i><span>공급: 병·의원 등 요양기관·약국과 버스정류장</span></li>
              <li><i>3</i><span>결정: 담당자가 5개 정책대안을 비교하고 검토 상태·사유를 기록</span></li>
            </ul>
          </article>
        </div>
        <article class="card baseline-card">
          <div class="card-head"><div><h2>고양시 공개데이터 기준선</h2><p>단위와 기준일을 고정한 재계산 결과</p></div><span class="badge reproduced">원자료 재계산</span></div>
          <div class="baseline-grid">
            ${baseline('44개', '행정동', '행안부 키 44개 유일', 'population')}
            ${baseline(number(population), '주민등록인구', '명 · 2026-06-30', 'population')}
            ${baseline(number(elderly), '65세 이상', `${percent(aging)} · 110세 이상 포함`, 'population')}
            ${baseline(numberValue(pick(city, 'single70'), 35295).toLocaleString('ko-KR'), '70세 이상 1인세대', '명 · 돌봄 필요와 동일하지 않음', 'one_person')}
            ${baseline(number(facilities), '병·의원 등·약국', '접근성 계산 입력 1,893행 · 경계 안 표시 1,892점', 'hira_hospital')}
            ${baseline(number(busInside), '경계 안 정류장', `원파일 ${number(busRaw)}행 · 2025-08-25`, 'bus_stops')}
          </div>
        </article>
        <div class="overview-visuals">
          <article class="card composition-card">
            <div class="card-head"><div><h2>연령구성 한눈에 보기</h2><p>전체 주민등록인구와 65세 이상의 구성비</p></div><span class="badge reproduced">인구 구성</span></div>
            <div class="chart-body">${CHARTS.cityComposition({ population, elderly65: elderly })}</div>
            <div class="chart-note"><strong>19.4%</strong>는 인구 구성비이며 통합돌봄 필요자 비율이 아닙니다.</div>
          </article>
          <article class="card flow-card">
            <div class="card-head"><div><h2>근거에서 정책까지</h2><p>대리지표가 사업 확정으로 직행하지 않는 5단계</p></div><span class="badge team">사람 결정</span></div>
            <div class="evidence-flow" aria-label="공식 정의에서 현장조사와 정책대안 비교로 이어지는 흐름">
              ${flowNode('1', '공식 정의 잠금', '2.9만·62·1,972의 단위 구분')}
              <span class="flow-arrow">→</span>
              ${flowNode('2', '공개 대리신호', '고령수요·의료·버스')}
              <span class="flow-arrow">→</span>
              ${flowNode('3', '29개 주장 재검증', '확인 7·조건부 9·수정 13')}
              <span class="flow-arrow">→</span>
              ${flowNode('4', '현장조사', '실제 목적지·시간대·원가')}
              <span class="flow-arrow">→</span>
              ${flowNode('5', '정책대안 비교', '파일럿 검토·보류·기각 기록')}
            </div>
          </article>
        </div>
        <div class="overview-grid">
          <article class="card">
            <div class="card-head"><div><h2>포스터 주장 29건 재검증</h2><p>숫자가 다시 나왔는지, 조건이 필요한지, 명세를 고쳐야 하는지 분리</p></div><span class="badge team">팀 검증</span></div>
            <div class="status-chart-wrap">${CHARTS.statusStack(claimSummary)}</div>
            <div class="chart-note"><strong>핵심:</strong> 후보 8개 집합은 다시 나왔지만, 점수·내부순위와 일부 공간통계는 일치하지 않았습니다.</div>
          </article>
          <article class="card">
            <div class="card-head"><div><h2>경계·정의 QA가 바꾼 값</h2><p>작은 차이도 산식과 공간 포함 규칙을 남깁니다.</p></div><span class="badge corrected">정정</span></div>
            <div class="qa-list">
              ${qaRow('65세 이상 인구', '204,876명', '204,878명')}
              ${qaRow('정류장', '원파일 2,099행', '경계 안 2,095개')}
              ${qaRow('의료 공급', '접근성 계산 1,893행', '경계 안 화면점 1,892개')}
            </div>
          </article>
          ${renderTimeline()}
        </div>
        <div class="action-row">
          <div class="warning-box"><span class="warning-icon">!</span><span>이 화면의 2.9만·62·1,972는 같은 모집단이 아니며 서로 곱하지 않습니다.</span></div>
          <button class="primary-button" data-stage="2">후보 8곳 수치 비교 →</button>
        </div>
      </section>`;
  }

  function baseline(value, label, note, sourceId) {
    return `<div class="baseline-item"><strong>${value}</strong><span>${esc(label)}</span><small>${esc(note)}</small><br><button class="source-button" data-source="${esc(sourceId)}">근거</button></div>`;
  }

  function flowNode(numberText, title, copy) {
    return `<div class="flow-node"><i>${esc(numberText)}</i><strong>${esc(title)}</strong><span>${esc(copy)}</span></div>`;
  }

  function renderAdministrativeMapPanel() {
    const requestedArea = selectedMapArea();
    const area = state.mapDistrict === '전체' || requestedArea.district === state.mapDistrict
      ? requestedArea
      : allAreas.find((item) => item.district === state.mapDistrict) || requestedArea;
    const effectiveMapMetric = state.mapMetric === 'seniorCenterCount' && !WELFARE
      ? 'agingRate'
      : state.mapMetric;
    const metrics = [
      ['agingRate', '고령화율'],
      ['single70', '70+ 1인세대'],
      ['demandIndex', '고령수요'],
      ['routesPerStop', '경유노선'],
      ['nearestFacilityM', '의료거리'],
      ['seniorCenterCount', '경로당 수'],
      ['currentDrt', '과거 팀 대리매핑'],
      ['candidate', '후보 8개'],
    ].filter(([key]) => key !== 'seniorCenterCount' || WELFARE);
    const districts = [
      ['전체', '고양시 전체'],
      ['고양시 덕양구', '덕양구'],
      ['고양시 일산동구', '일산동구'],
      ['고양시 일산서구', '일산서구'],
    ];
    const candidate = candidateByCode.get(String(area.code));
    const mapStatus = candidate ? '우선검토 후보' : area.currentDrt ? '과거 팀 사후 대리매핑 행정동' : '44개 행정동 비교 대상';
    const activeMetric = {
      agingRate: ['고령화율', percent(area.agingRate)],
      single70: ['70세 이상 1인세대', `${number(area.single70)}세대`],
      demandIndex: ['고령수요 대리지수', area.demandIndex.toFixed(2)],
      routesPerStop: ['정류장당 경유노선', `${area.routesPerStop.toFixed(2)}개`],
      nearestFacilityM: ['의료시설 평균 최근접거리', `${(area.nearestFacilityM / 1000).toFixed(2)}km`],
      seniorCenterCount: ['공식 Excel 경로당 수', `${number(area.seniorCenterCount)}곳`],
      currentDrt: ['과거 팀 사후 대리매핑', area.currentDrt ? '포함' : '미포함'],
      candidate: ['후보 8개 집합', area.candidate ? '후보' : '비후보'],
    }[effectiveMapMetric] || ['고령화율', percent(area.agingRate)];
    return `
      <article class="card gis-card">
        <div class="card-head gis-card-head"><div><span class="eyebrow">행정 GIS 관제</span><h2>고양시 44개 행정동 공급·수요 지도</h2><p>실제 행정동 경계에 제출 분석의 지표와 익명 공급점을 겹쳐 봅니다.</p></div><span class="badge proxy">오프라인 GIS</span></div>
        <div class="map-command-kpis" aria-label="지도 핵심 수치">
          <div><strong>44</strong><span>행정동</span></div>
          <div><strong>8</strong><span>검토후보</span></div>
          <div><strong>2,095</strong><span>경계 안 정류장</span></div>
          <div><strong>1,892</strong><span>경계 안 표시점</span></div>
          <div><strong>4</strong><span>공식 운영권역 · 행정동과 별도</span></div>
        </div>
        <div class="map-toolbar">
          <div class="map-toolbar-row"><strong>행정구역</strong><div class="map-control-scroll" role="group" aria-label="행정구역 필터">
            ${districts.map(([key, label]) => `<button class="filter-chip ${state.mapDistrict === key ? 'is-active' : ''}" data-map-district="${esc(key)}">${esc(label)}</button>`).join('')}
          </div></div>
          <div class="map-toolbar-row"><strong>색상 지표</strong><div class="map-control-scroll" role="group" aria-label="지도 표시 지표">
            ${metrics.map(([key, label]) => `<button class="filter-chip ${effectiveMapMetric === key ? 'is-active' : ''}" data-map-metric="${key}">${esc(label)}</button>`).join('')}
          </div></div>
          <div class="map-toolbar-row"><strong>공급점</strong><div class="map-control-scroll" role="group" aria-label="지도 공급점 레이어">
            <button class="layer-toggle ${state.mapBusPoints ? 'is-active' : ''}" data-map-layer="bus" aria-pressed="${state.mapBusPoints}"><i class="bus"></i>정류장 2,095</button>
            <button class="layer-toggle ${state.mapFacilityPoints ? 'is-active' : ''}" data-map-layer="facility" aria-pressed="${state.mapFacilityPoints}"><i class="medical"></i>경계 안 의료점 1,892</button>
          </div></div>
          <small class="map-toolbar-asof">기준일 · 버스 2025-08-25 · 행정동 경계 2026-04-01 · 인구·의료 2026-06-30 · 경로당 Excel 2026-06</small>
        </div>
        <div class="gis-layout">
          <div class="gis-map-panel">
            ${CHARTS.administrativeMap(BOUNDARIES, allAreas, area.code, {
              metric: effectiveMapMetric,
              district: state.mapDistrict,
              showBus: state.mapBusPoints,
              showFacilities: state.mapFacilityPoints,
            })}
          </div>
          <aside class="map-inspector" aria-live="polite">
            <div><span class="badge ${candidate ? 'reproduced' : 'proxy'}">${esc(mapStatus)}</span><small>${esc(area.district.replace('고양시', ''))}</small><h3>${esc(area.dong)}</h3></div>
            <div class="map-base-stats"><span><small>인구</small><b>${number(area.population)}</b></span><span><small>65세 이상</small><b>${number(area.elderly65)}</b></span><span><small>정류장</small><b>${number(area.stops)}</b></span></div>
            <div class="map-active-metric"><span>${esc(activeMetric[0])}</span><strong>${esc(activeMetric[1])}</strong><small>${effectiveMapMetric === 'seniorCenterCount' ? '시설 수이며 좌표 접근성은 아직 계산하지 않음' : '현재 지도 색상 지표'}</small></div>
            ${renderMapBenchmarkBands(area)}
            ${candidate ? `<button class="primary-button compact" data-open-candidate="${esc(area.code)}">이 후보 상세 비교 →</button>` : '<p class="map-inspector-note">후보 8개 밖의 동도 비교 기준선과 공간적 위치를 함께 확인할 수 있습니다.</p>'}
            <div class="map-validation-brief">
              <span>포스터 주장 ${claimSummary.total}건 재검증</span>
              <div><b class="ok">확인 ${claimSummary.confirmed}</b><b class="warn">조건부 ${claimSummary.conditional}</b><b class="fix">수정 ${claimSummary.correction}</b></div>
              <p>후보집합 ${numberValue(pick(city, 'candidateCount'), 8)}/8 · DSS MAE ${dssMae().toFixed(3)} · 값·내부순위 불일치</p>
              <button class="source-button" data-stage="3">재검증 근거 보기 →</button>
            </div>
            <div class="map-source-note"><strong>경계 계보</strong><span>분석·표시: 2026-04-01 동일 경계<br>SGIS 기반 admdongkor 가공본</span><button class="source-button" data-source="boundary_display">경계 근거</button></div>
          </aside>
        </div>
        ${renderDistrictStrip()}
        <div class="chart-note">지도는 분석과 같은 <strong>2026-04-01 행정동 경계</strong>를 사용합니다. 색은 44개 동 상대비교이며 사업 도입 임계치가 아닙니다.</div>
      </article>`;
  }

  function renderDistrictStrip() {
    const districtLabels = {
      '고양시 덕양구': '덕양구',
      '고양시 일산동구': '일산동구',
      '고양시 일산서구': '일산서구',
    };
    const rows = Object.keys(districtLabels).map((district) => {
      const areas = allAreas.filter((item) => item.district === district);
      const population = areas.reduce((sum, item) => sum + item.population, 0);
      const elderly = areas.reduce((sum, item) => sum + item.elderly65, 0);
      const stops = areas.reduce((sum, item) => sum + item.stops, 0);
      const routeMentions = areas.reduce((sum, item) => sum + item.routeMentions, 0);
      return {
        district,
        label: districtLabels[district],
        population,
        agingRate: population ? elderly / population : 0,
        stops,
        routesPerStop: stops ? routeMentions / stops : 0,
        candidates: areas.filter((item) => item.candidate).length,
      };
    });
    const maxPopulation = Math.max(...rows.map((row) => row.population));
    return `
      <div class="district-strip" aria-label="3개 구 집계 비교">
        ${rows.map((row) => `<button class="district-pulse ${state.mapDistrict === row.district ? 'is-active' : ''}" data-map-district="${esc(row.district)}">
          <span><strong>${esc(row.label)}</strong><small>${allAreas.filter((item) => item.district === row.district).length}개 동</small></span>
          <i><b style="--value:${(row.population / maxPopulation) * 100}%"></b></i>
          <dl><div><dt>인구</dt><dd>${number(row.population)}</dd></div><div><dt>고령화율</dt><dd>${percent(row.agingRate)}</dd></div><div><dt>노선/정류장</dt><dd>${row.routesPerStop.toFixed(2)}</dd></div><div><dt>후보</dt><dd>${row.candidates}개</dd></div></dl>
        </button>`).join('')}
      </div>`;
  }

  function renderMapBenchmarkBands(selected) {
    const median = (values) => {
      const ordered = values.map(numberValue).sort((a, b) => a - b);
      const middle = Math.floor(ordered.length / 2);
      return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
    };
    const specs = [
      { key: 'agingRate', label: '고령화율', format: (value) => percent(value), benchmark: numberValue(city.agingRate), benchmarkLabel: '시 전체' },
      { key: 'single70', label: '70+ 1인세대', format: (value) => `${number(value)}명`, benchmark: median(allAreas.map((item) => item.single70)), benchmarkLabel: '동 중앙값' },
      { key: 'routesPerStop', label: '노선/정류장', format: (value) => `${value.toFixed(2)}개`, benchmark: numberValue(city.routesPerStop), benchmarkLabel: '시 전체' },
      { key: 'nearestFacilityM', label: '의료 평균거리', format: (value) => km(value), benchmark: numberValue(city.nearestFacilityMeanM), benchmarkLabel: '격자가중' },
      { key: 'facilityP90M', label: '의료거리 P90', format: (value) => km(value), benchmark: median(allAreas.map((item) => item.facilityP90M)), benchmarkLabel: '동 중앙값' },
    ];
    return `
      <div class="map-benchmark-board" aria-label="선택 동의 44개 행정동 분포 내 위치">
        <div class="map-benchmark-title"><strong>44개 동 분포 안의 위치</strong><span>회색 점=행정동 · 세로선=기준</span></div>
        ${specs.map((spec) => {
          const values = allAreas.map((item) => numberValue(item[spec.key]));
          const minimum = Math.min(...values);
          const maximum = Math.max(...values);
          const position = (value) => Math.max(1, Math.min(99, ((numberValue(value) - minimum) / (maximum - minimum || 1)) * 100));
          return `<div class="benchmark-band-row">
            <div><span>${esc(spec.label)}</span><b>${esc(spec.format(numberValue(selected[spec.key])))}</b></div>
            <div class="benchmark-band">
              ${allAreas.map((item) => `<i class="area-dot ${item.candidate ? 'is-candidate' : ''} ${item.currentDrt ? 'is-drt' : ''}" style="--left:${position(item[spec.key])}%"></i>`).join('')}
              <em style="--left:${position(spec.benchmark)}%"><small>${esc(spec.benchmarkLabel)}</small></em>
              <strong style="--left:${position(selected[spec.key])}%"></strong>
            </div>
          </div>`;
        }).join('')}
        <small class="benchmark-footnote">1인세대·P90 기준은 44개 동 비가중 중앙값입니다.</small>
      </div>`;
  }

  function qaRow(label, before, after) {
    return `<div class="qa-row"><span>${esc(label)}</span><strong>${esc(before)}</strong><i>→</i><b>${esc(after)}</b></div>`;
  }

  function renderTimeline() {
    return `
      <article class="card timeline-card">
        <div class="card-head"><div><h2>데이터 기준 시점</h2><p>버스 공급이 인구·시설보다 약 10개월 앞선 혼합 스냅샷입니다.</p></div><span class="badge pending">시점 제한</span></div>
        <div class="timeline">
          <div class="timeline-item"><span class="timeline-icon">▣</span><div class="timeline-copy"><strong>버스정류장</strong><span>2025-08-25 · 2,099행</span></div></div>
          <div class="timeline-item"><span class="timeline-icon">⌖</span><div class="timeline-copy"><strong>행정동 경계</strong><span>2026-04-01 · 44개 동</span></div></div>
          <div class="timeline-item"><span class="timeline-icon">●</span><div class="timeline-copy"><strong>인구·의료시설</strong><span>2026-06-30</span></div></div>
        </div>
      </article>`;
  }

  function renderCandidates() {
    const area = selectedArea();
    const cityAging = numberValue(pick(city, 'agingRate'), 0.19374942);
    const cityRoutes = numberValue(pick(city, 'routesPerStop'), 3.7718377);
    const cityDistance = numberValue(pick(city, 'nearestFacilityMeanM'));
    return `
      <section class="page candidate-page">
        ${pageIntro(
          '2 / 4 · 후보 비교',
          '8개 후보를 <em>같은 척도와 단위</em>로 비교',
          '확정 순위를 만들지 않고 가나다순으로 비교합니다. 동을 바꾸면 수치·근거·정책 시나리오가 함께 바뀝니다.',
          '후보의 의미',
          '도입 확정지가 아니라 현장조사 우선검토 후보입니다.',
        )}
        <article class="card candidate-hero">
          <div class="candidate-head">
            <div class="candidate-title"><span class="pin-icon">⌖</span><div><small>${esc(area.district)}</small><h2>${esc(area.dong)}</h2></div></div>
            <label><span class="metric-label">후보 지역 변경</span><select class="candidate-select" data-field="selectedCode">${candidates.map((item) => `<option value="${esc(item.code)}" ${item.code === area.code ? 'selected' : ''}>${esc(item.dong)}</option>`).join('')}</select></label>
          </div>
          <div class="candidate-kpis">
            ${candidateKpi('고령화율', percent(area.agingRate), `고양시 ${percent(cityAging)}`, 'population')}
            ${candidateKpi('70세 이상 1인세대', `${number(area.single70)}<small>명</small>`, '행정동 집계', 'one_person')}
            ${candidateKpi('정류장당 경유노선', `${area.routesPerStop.toFixed(2)}<small>개</small>`, `경계 내 전체 ${cityRoutes.toFixed(2)}개`, 'bus_stops')}
            ${candidateKpi('의료시설 평균 최근접거리', `${(area.nearestFacilityM / 1000).toFixed(2)}<small>km</small>`, `격자가중 전체 약 ${(cityDistance / 1000).toFixed(2)}km`, 'hira_hospital')}
          </div>
        </article>
        <div class="candidate-geo-grid">
          <article class="card candidate-map-card">
            <div class="card-head"><div><h2>후보 8개 공간 배치</h2><p>행정동 경계 위에 제출 분석의 정류장·의료 공급점을 함께 표시</p></div><span class="badge proxy">GIS 중첩</span></div>
            <div class="candidate-map-body">${CHARTS.administrativeMap(BOUNDARIES, allAreas, area.code, {
              metric: 'candidate',
              district: '전체',
              showBus: true,
              showFacilities: true,
            })}</div>
            <div class="chart-note">화면점은 <strong>경계 안 정류장 2,095개와 병·의원 등·약국 1,892개</strong>입니다. 접근성 계산에는 HIRA 1,893행이 입력됐고 경계 밖 좌표 1건은 최근접·30분 결과에 영향이 없었습니다. 고양온돌 개인이나 62개 서비스 위치가 아닙니다.</div>
          </article>
          <article class="card candidate-signal-card">
            <div class="card-head"><div><h2>후보 원인 신호판</h2><p>가나다순 · 막대는 후보 8개 안 상대크기</p></div><span class="badge team">순위 아님</span></div>
            ${renderCandidateSignalMatrix(area)}
            <div class="chart-note">파랑은 고령화율, 청록은 버스 공급 부족, 빨강은 의료시설 거리입니다. <strong>막대 길이는 도입 우선순위가 아닙니다.</strong></div>
          </article>
        </div>
        <div class="candidate-layout">
          <div class="candidate-main">
            <article class="card">
              <div class="card-head"><div><h2>후보 지역 비교</h2><p>고령수요 · 버스 공급 · 의료시설 거리의 서로 다른 원인을 함께 봅니다.</p></div><div class="legend"><span class="badge reproduced">정확값 표시</span></div></div>
              <div class="chart-body">${CHARTS.candidateProfiles(candidates, area.dong, { agingRate: cityAging, routesPerStop: cityRoutes, nearestFacilityM: cityDistance })}</div>
              <div class="chart-note">점선은 고양시 기준선입니다. <strong>오른쪽이 모두 좋은 방향은 아닙니다.</strong> 고령화율·거리는 클수록, 경유노선은 작을수록 현장확인 필요성이 커집니다.</div>
            </article>
            <article class="card">
              <div class="card-head"><div><h2>후보 원인 사분면</h2><p>고령화율·버스 공급·의료시설 거리·1인세대를 한 그래프에 겹쳐 봅니다.</p></div><span class="badge team">다변량 비교</span></div>
              <div class="chart-body">${CHARTS.candidateQuadrant(candidates, area.dong, { agingRate: cityAging, routesPerStop: cityRoutes })}</div>
              <div class="chart-note"><strong>좌상단</strong>은 고령화율이 높고 경유노선이 적은 영역입니다. 원 크기는 70세 이상 1인세대, 색은 의료시설 거리이며 <strong>순위를 의미하지 않습니다.</strong></div>
            </article>
            <article class="card">
              <div class="card-head"><div><h2>정확 수치표</h2><p>발표 질문에서 바로 확인할 수 있도록 모든 값을 표로 함께 제공합니다.</p></div><span class="badge reproduced">단위 잠금</span></div>
              <div class="card-body">${renderCandidateTable(area)}</div>
            </article>
          </div>
          <aside class="candidate-sidebar">
            <article class="card">
              <div class="card-head"><div><h3>후보 vs 재검증</h3><p>집합과 점수·순위를 분리해 판정</p></div></div>
              <div class="verification-cards">
                <div class="verification-card"><span class="verification-icon">✓</span><span>후보 집합</span><strong>8/8</strong><span>일치</span></div>
                <div class="verification-card is-warning"><span class="verification-icon">!</span><span>DSS 값·내부순위</span><strong>불일치</strong><span>재해석 필요</span></div>
              </div>
              <div class="chart-note">DSS MAE ${dssMae().toFixed(3)} · 후보 내부순위 MAE ${rankMae().toFixed(2)}</div>
            </article>
            <article class="card">
              <div class="card-head"><div><h3>증거 / 분석 정보</h3><p>${esc(area.dong)} 수치의 계보</p></div><span class="badge proxy">대리분석</span></div>
              <dl class="evidence-rows">
                <div class="evidence-row"><dt>데이터</dt><dd>행안부 인구·1인세대, HIRA, 고양시 정류장</dd></div>
                <div class="evidence-row"><dt>필터</dt><dd>고양시 3개 구 · 44행정동 · 경계 밖 제외</dd></div>
                <div class="evidence-row"><dt>산식</dt><dd><code>고령화율 = 65세 이상 ÷ 전체인구</code><br><code>노선평균 = 경유노선 토큰 ÷ 정류장</code></dd></div>
                <div class="evidence-row"><dt>단위</dt><dd>% · 명 · 개/정류장 · km</dd></div>
                <div class="evidence-row"><dt>한계</dt><dd>직선거리·혼합 기준일·실제 OD/배차 미반영</dd></div>
              </dl>
            </article>
            <div class="warning-box"><span class="warning-icon">!</span><span>최종 선정이 아니라 실제 목적지·시간대별 수요·운영비를 조사할 순서를 좁히는 화면입니다.</span></div>
            <div class="action-row"><button class="secondary-button" data-action="export">이 지역 검토서 저장</button><button class="primary-button" data-stage="3">재검증 근거 보기 →</button></div>
          </aside>
        </div>
      </section>`;
  }

  function candidateKpi(label, value, benchmark, sourceId) {
    return `<div class="candidate-kpi"><span class="metric-label">${esc(label)} <button class="source-button info-dot" data-source="${esc(sourceId)}" aria-label="${esc(label)} 근거">i</button></span><strong class="metric-value">${value}</strong><span class="metric-benchmark">/ <b>${esc(benchmark)}</b></span></div>`;
  }

  function renderCandidateSignalMatrix(selected) {
    const extent = (key) => {
      const values = candidates.map((item) => numberValue(item[key]));
      return [Math.min(...values), Math.max(...values)];
    };
    const [agingMin, agingMax] = extent('agingRate');
    const [routesMin, routesMax] = extent('routesPerStop');
    const [distanceMin, distanceMax] = extent('nearestFacilityM');
    const relative = (value, minimum, maximum, reverse = false) => {
      const ratio = (numberValue(value) - minimum) / (maximum - minimum || 1);
      return Math.max(8, Math.min(100, (reverse ? 1 - ratio : ratio) * 100));
    };
    return `
      <div class="candidate-signal-matrix" role="list" aria-label="후보 8개 원인별 상대크기">
        <div class="signal-matrix-head"><span>행정동</span><span>고령화율</span><span>버스부족</span><span>의료거리</span></div>
        ${candidates.map((item) => `<button class="signal-row ${item.code === selected.code ? 'is-selected' : ''}" data-open-candidate="${esc(item.code)}" role="listitem">
          <strong>${esc(item.dong)}</strong>
          <span class="signal-cell"><i class="aging"><b style="--value:${relative(item.agingRate, agingMin, agingMax)}%"></b></i><small>${percent(item.agingRate)}</small></span>
          <span class="signal-cell"><i class="bus"><b style="--value:${relative(item.routesPerStop, routesMin, routesMax, true)}%"></b></i><small>${item.routesPerStop.toFixed(2)}</small></span>
          <span class="signal-cell"><i class="facility"><b style="--value:${relative(item.nearestFacilityM, distanceMin, distanceMax)}%"></b></i><small>${(item.nearestFacilityM / 1000).toFixed(2)}km</small></span>
        </button>`).join('')}
      </div>`;
  }

  function renderCandidateTable(area) {
    return `
      <table class="candidate-table">
        <thead><tr><th>행정동</th><th>65세 이상</th><th>고령화율</th><th>70+ 1인세대</th><th>정류장</th><th>노선/정류장</th><th>시설거리</th></tr></thead>
        <tbody>${candidates.map((item) => `<tr class="${item.code === area.code ? 'is-selected' : ''}"><td>${esc(item.dong)}</td><td>${number(item.elderly65)}명</td><td>${percent(item.agingRate)}</td><td>${number(item.single70)}명</td><td>${number(item.stops)}개</td><td>${item.routesPerStop.toFixed(2)}개</td><td>${km(item.nearestFacilityM)}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  function dssMae() {
    const rows = candidates.filter((item) => Number.isFinite(item.posterDss) && Number.isFinite(item.reproducedDss));
    return rows.length ? rows.reduce((sum, item) => sum + Math.abs(item.posterDss - item.reproducedDss), 0) / rows.length : 0.174;
  }

  function rankMae() {
    const rows = rankComparisons
      .filter((item) => String(pick(item, 'group', 'rankGroup', 'rank_group')).includes('후보'))
      .map((item) => Math.abs(numberValue(pick(item, 'rankDifference', 'rank_difference', 'difference'))));
    if (rows.length) return rows.reduce((sum, value) => sum + value, 0) / rows.length;
    return 2;
  }

  function renderRevalidation() {
    const significantHH = localMoran.filter((item) => {
      const significant = Boolean(pick(item, 'significant', 'significantFdr', 'significantFdr05')) || String(pick(item, 'significant_fdr_0_05')).toLowerCase() === 'true';
      return significant && pick(item, 'quadrant') === 'HH';
    });
    const minSensitivity = sensitivity.length ? Math.min(...sensitivity.map((item) => item.jaccard)) : 0.6;
    return `
      <section class="page revalidation-page">
        ${pageIntro(
          '3 / 4 · 재검증 근거',
          '맞은 것보다 <em>어디까지 맞았는지</em>를 보여줍니다',
          '포스터의 29개 핵심 주장을 원자료·코드·통계 명세로 다시 계산하고, 후보 집합·값·순위·공간군집을 따로 판정했습니다.',
          '해석 원칙',
          '재현되지 않은 수치는 숨기지 않고 발표 문장을 함께 고칩니다.',
        )}
        <div class="revalidation-summary">
          <article class="card summary-main"><strong>${claimSummary.total}개</strong><span>포스터 핵심 주장 단위 재검증</span></article>
          <article class="card summary-stat"><span>재현 확인</span><strong>${claimSummary.confirmed}</strong><small>원자료·산식으로 확인</small></article>
          <article class="card summary-stat"><span>조건부</span><strong>${claimSummary.conditional}</strong><small>규칙·해석 명시 필요</small></article>
          <article class="card summary-stat"><span>수정 필요</span><strong>${claimSummary.correction}</strong><small>값 또는 명세 정정</small></article>
        </div>
        <article class="card validation-flow-card">
          <div class="card-head"><div><h2>포스터 주장 재검증 흐름</h2><p>원문 숫자를 복사하지 않고 원자료·필터·산식·통계 명세를 다시 연결했습니다.</p></div><span class="badge reproduced">재현 계보</span></div>
          <div class="validation-flow" aria-label="포스터 주장 29건 재검증 흐름">
            ${flowNode('A', '포스터 29건', '주장·값·단위 분해')}
            <span class="flow-arrow">→</span>
            ${flowNode('B', '원자료 잠금', '해시·기준일·키 확인')}
            <span class="flow-arrow">→</span>
            ${flowNode('C', '독립 재계산', '필터·산식·seed 42')}
            <span class="flow-arrow">→</span>
            <div class="validation-branch">
              <span class="badge reproduced">확인 ${claimSummary.confirmed}</span>
              <span class="badge pending">조건부 ${claimSummary.conditional}</span>
              <span class="badge corrected">수정 ${claimSummary.correction}</span>
            </div>
            <span class="flow-arrow">→</span>
            ${flowNode('D', '발표 문장 교정', '확인·가설·한계 구분')}
          </div>
        </article>
        <div class="revalidation-grid">
          <article class="card">
            <div class="card-head"><div><h2>후보 DSS: 포스터 vs 재현</h2><p>같은 8개 동이라도 점수와 내부순위는 달랐습니다.</p></div><span class="badge corrected">값 불일치</span></div>
            <div class="chart-body">${CHARTS.dssDumbbell(candidates)}</div>
            <div class="stat-callout"><strong>MAE ${dssMae().toFixed(3)}</strong><span>최대 절대차 약 0.274 · 상관계수 약 0.542. 후보집합 일치를 점수 재현으로 확대 해석하지 않습니다.</span></div>
          </article>
          <article class="card">
            <div class="card-head"><div><h2>제출 분석에 등록된 11개 시나리오</h2><p>가중치 4개·거리감쇠 7개에서 기준 후보집합 유지 정도를 Jaccard로 확인</p></div><span class="badge team">등록 11개 한정</span></div>
            <div class="sensitivity-list">${renderSensitivityRows()}</div>
            <div class="stat-callout"><strong>등록 범위 최저 J=${minSensitivity.toFixed(2)}</strong><span>기준 상위 8개 중 6개를 유지하고 2개가 교체됐습니다(합집합 10개, Jaccard 거리 0.40). 위 45개 가중치 조합과는 별도이며 “강건한 최적지”를 뜻하지 않습니다.</span></div>
          </article>
        </div>
        ${renderProfessionalAnalysis()}
        <div class="revalidation-grid">
          <article class="card">
            <div class="card-head"><div><h2>공간 군집 재검증</h2><p>조건부 순열 9,999회 · seed 42 · BH-FDR</p></div><span class="badge reproduced">통계 재계산</span></div>
            <div class="chart-body">${CHARTS.moranScatter(localMoran)}</div>
            <div class="stat-callout"><strong>유의 HH ${significantHH.length}곳</strong><span>${significantHH.map((item) => `${esc(pick(item, 'dong', 'dongName', 'dong_name'))} q=${numberValue(pick(item, 'qFdr', 'q_fdr')).toFixed(4)}`).join(' · ') || '관산동 q=0.0403'}만 고고(HH) 군집입니다. LL 유의지역과 구분합니다.</span></div>
          </article>
          <article class="card">
            <div class="card-head"><div><h2>단일지표 vs 결합 대리모형</h2><p>과거 팀 사후 대리매핑 3동과 포스터 후보집합의 탐색적 중첩을 별도 표시</p></div><span class="badge proxy">사후 비교</span></div>
            <div class="model-list">${CHARTS.modelBars(modelComparison)}</div>
            <div class="chart-note"><strong>주의:</strong> 공식 운영권역 GIS가 아닌 과거 팀의 사후 대리매핑과 비교한 결과이며 예측 정확도나 정책효과가 아닙니다.</div>
          </article>
          <article class="card wide">
            <div class="card-head"><div><h2>29개 주장 판정 원장</h2><p>포스터 값 → 재현 값 → 판정 → 근거 수준을 한 줄씩 확인</p></div><span class="badge team">감사 추적</span></div>
            <div class="claim-controls">${['전체', '재현/확인', '조건부', '수정·명세 보완'].map((group) => `<button class="filter-chip ${state.claimFilter === group ? 'is-active' : ''}" data-filter="${esc(group)}">${esc(group)}</button>`).join('')}</div>
            <div class="claim-list">${renderClaims()}</div>
          </article>
        </div>
        <div class="action-row"><div class="warning-box"><span class="warning-icon">!</span><span>RI는 0.8m/s 직선보행 대리값이며 실제 도보망·버스 대기·환승·주행시간이 아닙니다.</span></div><button class="primary-button" data-stage="4">정책 대안 비교 →</button></div>
      </section>`;
  }

  function renderSensitivityRows() {
    return sensitivity.map((item) => `
      <div class="sensitivity-row">
        <strong>${esc(item.label)}</strong>
        <div class="sensitivity-track" aria-label="Jaccard ${item.jaccard.toFixed(2)}"><i style="--value:${item.jaccard * 100}%"></i></div>
        <b>${item.jaccard.toFixed(2)}</b>
        ${item.top8Dongs ? `<small>${esc(item.top8Dongs)}</small>` : ''}
      </div>`).join('');
  }

  function renderAccessibilityTimeRanges(analysis) {
    const rows = analysis?.candidateRangeRows || [];
    if (!rows.length) return '<p>이동시간 가정 시나리오를 불러오지 못했습니다.</p>';
    const maximum = Math.max(...rows.flatMap((row) => [
      numberValue(row.referenceMedianMinutes),
      numberValue(row.scenarioMedianMinutesHigh),
    ]), 1);
    const selected = selectedArea();
    return `
      <div class="access-time-range-legend" aria-label="이동시간 범례"><span class="is-reference">보행 대리 중앙값</span><span class="is-range">대기 5·10·15분 가정 범위</span></div>
      <div class="access-time-range-chart" role="list" aria-label="후보 8개 이동시간 가정 범위">
        ${rows.map((row) => {
          const reference = numberValue(row.referenceMedianMinutes);
          const low = numberValue(row.scenarioMedianMinutesLow);
          const high = numberValue(row.scenarioMedianMinutesHigh);
          return `<div class="access-time-range-row ${row.code === selected.code ? 'is-selected' : ''}" role="listitem">
            <strong>${esc(row.dong)}</strong>
            <div class="access-time-range-track" aria-label="${esc(row.dong)} 보행 대리 ${reference.toFixed(1)}분, 가정 범위 ${low.toFixed(1)}분에서 ${high.toFixed(1)}분">
              <span style="--left:${(low / maximum) * 100}%;--width:${Math.max(1, ((high - low) / maximum) * 100)}%"></span>
              <i style="--left:${(reference / maximum) * 100}%"></i>
            </div>
            <b>${reference.toFixed(1)} → ${low.toFixed(1)}~${high.toFixed(1)}분</b>
            <small>손익분기 대기 ${numberValue(row.breakEvenWaitMedianMinutes).toFixed(1)}분</small>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderProfessionalAnalysis() {
    if (!PRO) return '';
    const weights = PRO.weightSensitivity || {};
    const boundaryAudit = weights.boundaryAudit || {};
    const coverage = PRO.facilityCoverage || {};
    const spatial = PRO.spatialWeights || [];
    const overlap = PRO.overlapNull || {};
    const construct = PRO.constructSensitivity || {};
    const accessibilityTime = PRO.accessibilityTimeScenarios || {};
    const scenarioCount = numberValue(weights.scenarioCount, 45);
    const stableDongs = weights.stableDongs || [];
    const conditionalDongs = weights.conditionalDongs || [];
    const boundaryScenarioCount = numberValue(boundaryAudit.scenarioCount, 231);
    const boundaryStableDongs = boundaryAudit.stableDongs || [];
    const inclusionByDong = new Map((weights.inclusionRows || []).map((item) => [item.dong, item]));
    const coverage15Candidate = numberValue(coverage.candidateMedian?.coverage15);
    const coverage15Other = numberValue(coverage.nonCandidateMedian?.coverage15);
    const coverage30Candidate = numberValue(coverage.candidateMedian?.coverage30);
    const overlapP = numberValue(overlap.pAtLeastObserved);
    const overlapTop3 = overlap.baselineTop3Dongs || [];
    const currentDrtDongs = allAreas.filter((item) => item.currentDrt).map((item) => item.dong).sort((a, b) => a.localeCompare(b, 'ko'));
    const overlapDongs = overlapTop3.filter((dong) => currentDrtDongs.includes(dong));
    return `
      <section class="professional-analysis" aria-labelledby="professional-analysis-title">
        <div class="section-title-row">
          <div><span class="eyebrow">전문 분석 · 기준 후보를 교체하지 않는 반증 점검</span><h2 id="professional-analysis-title">가중치·거리·공간이 바뀌어도 결론이 유지되는가?</h2><p>보고서 기준 8곳은 그대로 두고, 결과가 어떤 가정에 민감한지 다섯 갈래로 다시 계산했습니다.</p></div>
          <span class="badge reproduced">seed 42 · 재현 산출물</span>
        </div>
        <div class="pro-kpi-strip">
          <div><span>가중치 조합</span><strong>${scenarioCount}<small>개</small></strong><small>제약 범위 안 전수 조합</small></div>
          <div><span>최저 후보집합 Jaccard</span><strong>${numberValue(weights.minJaccard).toFixed(3)}</strong><small>기준 8곳과의 집합 겹침</small></div>
          <div><span>후보 15분 면적격자</span><strong>${percent(coverage15Candidate)}</strong><small>비후보 중앙값 ${percent(coverage15Other)}</small></div>
          <div><span>과거 팀 3동 겹침 참고치</span><strong>${percent(overlapP)}</strong><small>정책 재현율 아님</small></div>
        </div>
        <div class="pro-analysis-grid">
          <article class="card pro-weight-card wide">
            <div class="card-head"><div><h3>${scenarioCount}개 가중치 조합 포함 횟수</h3><p>44동 표준화 후 과거 팀 사후 대리매핑 3동을 제외한 41동에서 상위 8 선택 · CAG 0.30~0.70 · 버스 0.15~0.50 · 시설 0.10~0.40</p></div><span class="badge pending">지정 범위 · 확률 아님</span></div>
            <div class="chart-body">${CHARTS.weightStability(weights.inclusionRows || [], scenarioCount)}</div>
            <p class="pro-chart-scope">기준 후보 8곳과 한 번 이상 대안에 등장한 3곳만 표시합니다. 나머지 33개 동은 45개 조합 모두에서 상위 8에 포함되지 않았습니다.</p>
            <div class="pro-finding-row">
              <span><b>${scenarioCount}/${scenarioCount} 포함 ${stableDongs.length}곳</b>${esc(stableDongs.join(' · '))}</span>
              <span><b>조건부 기준 후보 ${conditionalDongs.length}곳</b>${esc(conditionalDongs.map((item) => {
                const dong = typeof item === 'string' ? item : item.dong;
                const count = typeof item === 'string' ? inclusionByDong.get(item)?.count : item.count;
                return `${dong}${Number.isFinite(Number(count)) ? ` ${count}/${scenarioCount}` : ''}`;
              }).join(' · '))}</span>
              <span><b>최저 J=${numberValue(weights.minJaccard).toFixed(3)}</b>후보 8곳 전체가 가중치 변화에 고정된 것은 아닙니다.</span>
            </div>
            <div class="weight-boundary-audit" role="note" aria-label="전체 비음수 가중치 경계감사">
              <div class="boundary-audit-copy"><span class="eyebrow">경계감사 · 제한범위 의존성 공개</span><strong>가중치 0까지 허용한 전체 simplex에서는 안정 후보가 1곳으로 줄었습니다.</strong><small>극단 가중치까지 포함한 반증용 감사이며 실제 정책 가중치 범위나 선정확률이 아닙니다.</small></div>
              <div class="boundary-audit-metrics">
                <span><small>전체 조합</small><b>${boundaryScenarioCount}<em>개</em></b></span>
                <span><small>전 조합 유지</small><b>${boundaryStableDongs.length}<em>곳</em></b><i>${esc(boundaryStableDongs.join(' · ') || '없음')}</i></span>
                <span><small>최저 Jaccard</small><b>${numberValue(boundaryAudit.minJaccard).toFixed(3)}</b></span>
              </div>
            </div>
          </article>
          <article class="card">
            <div class="card-head"><div><h3>의료시설 직선보행 도달 면적</h3><p>0.8m/s · 100m 격자 · 후보/비후보 동 중앙값</p></div><span class="badge proxy">인구비율 아님</span></div>
            <div class="chart-body">${CHARTS.facilityCoverage(coverage)}</div>
            <div class="stat-callout"><strong>15분 ${percent(coverage15Candidate)}</strong><span>후보 8곳의 면적격자 중앙값입니다. 후보식에 같은 의료거리 변수가 포함돼 독립 검증이 아닌 해석용 단위변환이며, 개인·인구의 도달률이 아닙니다.</span></div>
          </article>
          <article class="card access-time-scenario-card wide">
            <div class="card-head"><div><h3>대기시간 가정에 따른 중앙 일반화시간</h3><p>보행 대리 vs 접근·승하차 5분 + 대기 5·10·15분 + 거리계수 1.3 + 차내 15km/h</p></div><span class="badge corrected">가정 시나리오 · 효과 아님</span></div>
            <div class="chart-body">${renderAccessibilityTimeRanges(accessibilityTime)}</div>
            <div class="stat-callout"><strong>실제 대기시간이 판정을 바꿉니다.</strong><span>관산동은 보행 대리 16.2분에서 가정 범위 14.1~24.1분입니다. 실제 OD·대기·승하차·도착 로그를 받기 전에는 DRT 전후효과나 수혜자 비율로 해석하지 않습니다.</span></div>
          </article>
          <article class="card">
            <div class="card-head"><div><h3>공간가중치 명세 민감도</h3><p>Queen · 최근접 4개 · 최근접 6개 이웃 비교</p></div><span class="badge corrected">국지결론 변동</span></div>
            <div class="chart-body">${CHARTS.spatialWeightComparison(spatial)}</div>
            <div class="stat-callout"><strong>전역 양의 군집 유지</strong><span>전역 Moran I의 방향은 같아도 FDR 유의 HH 지역은 이웃 정의에 따라 달라집니다. 관산동을 확정 군집으로 단정하지 않습니다.</span></div>
          </article>
          <article class="card">
            <div class="card-head"><div><h3>과거 팀 대리매핑 3동의 귀무분포</h3><p>공식 4개 운영권역의 GIS 교차가 아니라, 과거 팀이 사후 매핑한 화전·식사·고봉 3동을 대상으로 한 참고치</p></div><span class="badge pending">정책 검증 아님</span></div>
            <div class="chart-body">${CHARTS.overlapNull(overlap)}</div>
            <div class="pro-set-detail"><span><b>기준 DSS top3</b>${esc(overlapTop3.join(' · '))}</span><span><b>과거 팀 사후 대리매핑 3동</b>${esc(currentDrtDongs.join(' · '))}</span><span><b>겹침</b>${esc(overlapDongs.join(' · ') || '없음')}</span></div>
            <div class="stat-callout"><strong>P(1곳 이상)=${percent(overlapP)}</strong><span>공식 현황은 식사·고봉·덕은·향동 4개 운영권역입니다. 권역은 행정동과 같지 않고 덕은은 대덕·화전에 걸쳐 있어, 이 값은 정책 재현율이나 효과 검증에 사용할 수 없습니다.</span></div>
          </article>
          <article class="card">
            <div class="card-head"><div><h3>구성개념·시설 명세 교차점검</h3><p>수요 정의와 시설 범위를 바꿨을 때 후보집합 변화</p></div><span class="badge team">대리지표 점검</span></div>
            <div class="construct-list">${(construct.scenarios || []).map((item) => `
              <div><span><b>${esc(item.scenarioId)}</b><small>${esc(item.changedAxis || '')}</small></span><strong>J=${numberValue(item.jaccardVsBaseline).toFixed(2)}</strong><em>${item.outDongs?.length ? `제외 ${esc(item.outDongs.join(' · '))}` : '기준집합 유지'}${item.inDongs?.length ? `<br>추가 ${esc(item.inDongs.join(' · '))}` : ''}</em></div>`).join('') || '<p>구성개념 점검 결과를 불러오지 못했습니다.</p>'}</div>
            <div class="chart-note">같은 후보집합이 나와도 측정개념이 실제 고양온돌 대상자의 이동을 대표한다는 뜻은 아닙니다.</div>
          </article>
        </div>
        <div class="method-boundary"><strong>해석 경계</strong><span>모든 결과는 공개데이터 대리모형과 혼합 기준일에 한정됩니다. 지정 범위 45개에서는 5곳이 유지됐지만 전체 비음수 simplex 231개에서는 고양동 1곳만 유지되어, 결론이 가중치 범위에 의존함을 공개합니다. 포함 횟수는 확률이 아니며, 면적격자 비율은 독립 검증이나 인구 도달률이 아니고 공간통계는 이웃 정의에 민감합니다.</span></div>
      </section>`;
  }

  function renderPolicyRuleLedger() {
    const meta = ENGINE.RULE_META || {};
    const ledger = ENGINE.RULE_LEDGER || [];
    const optionNames = new Map((ENGINE.OPTIONS || []).map((option) => [option.id, option.name]));
    return `
      <details class="policy-rule-ledger">
        <summary><span><strong>${esc(meta.label || '시연용 미검증 규칙표')}</strong><small>${ledger.length}개 가점·감점 조건 전체 보기</small></span><span class="badge corrected">공식 점수식 아님</span></summary>
        <div class="rule-ledger-meta"><span><b>상태</b>${esc(meta.status || '실증 전')}</span><span><b>점수 처리</b>${esc(meta.scoreRange || '0~10')}</span><span><b>화면 구간</b>${esc(meta.fitBands || '')}</span><span><b>권위 경계</b>${esc(meta.authority || '')}</span></div>
        <div class="rule-ledger-table" role="table" aria-label="정책 대안 조건 일치도 규칙 원장">
          <div class="rule-ledger-row is-head" role="row"><span>규칙</span><span>대안</span><span>조건</span><span>점수</span></div>
          ${ledger.map((rule) => `<div class="rule-ledger-row" role="row"><code>${esc(rule.ruleId)}</code><strong>${esc(optionNames.get(rule.optionId) || rule.optionId)}</strong><span>${esc(rule.condition)}</span><b class="${numberValue(rule.points) < 0 ? 'is-minus' : ''}">${numberValue(rule.points) > 0 ? '+' : ''}${numberValue(rule.points)}</b></div>`).join('')}
        </div>
        <p>이 원장은 시연 로직을 재현하기 위한 공개 명세입니다. 가점 크기와 7·4점 구간은 행정 합의나 효과 검증을 거치지 않았으므로 사업 선정 근거로 단독 사용하지 않습니다.</p>
      </details>`;
  }

  function claimTone(group) {
    if (group === '재현/확인') return 'reproduced';
    if (group === '조건부') return 'pending';
    return 'corrected';
  }

  function renderClaims() {
    const filtered = state.claimFilter === '전체' ? claims : claims.filter((item) => item.group === state.claimFilter);
    return filtered.map((item) => `
      <article class="claim-item" title="${esc(item.note)}">
        <code>${esc(item.id)}</code>
        <strong>${esc(item.claim)}</strong>
        <span class="claim-poster">${esc(item.poster)}</span>
        <span class="claim-arrow">→</span>
        <span class="claim-reproduced">${esc(item.reproduced)}</span>
        <span class="badge ${claimTone(item.group)}">${esc(item.group)}</span>
      </article>`).join('') || '<p>선택한 판정의 주장이 없습니다.</p>';
  }

  function renderPolicy() {
    const area = selectedArea();
    const result = ENGINE.scoreOptions(policyInput(area));
    const firstReviews = result.firstReviewOptions?.length ? result.firstReviewOptions : [result.firstReview];
    const firstReviewNames = firstReviews.map((option) => option.name).join(' · ');
    const firstReviewCopies = firstReviews.map((option) => option.short).join(' / ');
    const signal = result.settings.areaSignal;
    return `
      <section class="page policy-page">
        ${pageIntro(
          '4 / 4 · 정책 시나리오',
          'DRT 하나를 정답으로 두지 않고 <em>5개 대안</em>을 비교',
          `${esc(area.dong)}의 공개데이터 신호에 현장 가정을 더해 조사할 대안을 좁힙니다. 점수는 효과예측이 아니라 시연용 미검증 규칙과 입력조건의 일치도입니다.`,
          '사람의 결정',
          '담당자가 파일럿 검토·보류·기각 상태와 사유를 기록하고, 합의한 KPI로 검증합니다.',
        )}
        <div class="policy-layout">
          <aside class="card scenario-panel">
            <div class="card-head"><div><h2>${esc(area.dong)} 현장 가정</h2><p>시연용 입력이며 실제 조사값으로 교체해야 합니다.</p></div><span class="badge team">시나리오</span></div>
            <div class="area-signal-summary">
              <strong>공개데이터 지역 신호</strong>
              <span class="${signal.agingAboveCity ? 'is-gap' : ''}">고령화율 ${signal.agingAboveCity ? '↑' : '↓'}</span>
              <span class="${signal.busSupplyBelowCity ? 'is-gap' : ''}">노선 공급 ${signal.busSupplyBelowCity ? '↓' : '↑'}</span>
              <span class="${signal.facilityDistanceAboveCity ? 'is-gap' : ''}">의료거리 ${signal.facilityDistanceAboveCity ? '↑' : '↓'}</span>
              <small>화살표는 고양시 기준선 대비입니다.</small>
            </div>
            <div class="control-list">
              ${selectField('demand', '예상 수요 규모', [['low','낮음'],['medium','중간'],['high','높음']])}
              ${selectField('pattern', '시간·방향 패턴', [['dispersed','분산'],['concentrated','집중']])}
              ${selectField('digital', '디지털 접근성', [['low','낮음'],['medium','보통'],['high','높음']])}
              ${selectField('serviceMode', '서비스 제공방식', [['travel','이동 필수'],['mixed','이동·방문 혼합'],['visit','방문 가능']])}
              <div class="field"><div class="range-head"><label for="vehicles">검토 차량 수</label><output for="vehicles">${state.vehicles}대</output></div><input id="vehicles" data-field="vehicles" type="range" min="1" max="10" value="${state.vehicles}" /></div>
              <label class="checkbox-field"><input data-field="wheelchair" type="checkbox" ${state.wheelchair ? 'checked' : ''}/><span><strong>휠체어·승하차 지원 필요</strong><br>차량 적합성과 동행지원은 별도 확인</span></label>
            </div>
            <div class="scenario-disclaimer">실제 수요·운영비·차량가용성 데이터가 없으므로 이 점수를 예산효과나 도입확률로 해석하지 않습니다.</div>
          </aside>
          <div class="policy-results">
            <article class="card first-review"><small>${result.isTie ? '시연 규칙의 공동 조사 후보' : '시연 규칙에서 먼저 조사할 대안'}</small><h2>${esc(firstReviewNames)}</h2><p>${esc(firstReviewCopies)} · 동점은 임의로 하나를 고르지 않으며, 정책 우선순위가 아닙니다.</p></article>
            <article class="card policy-score-card">
              <div class="card-head"><div><h2>5개 정책대안 조건 일치도</h2><p>현장 가정을 바꾸면 막대와 조사 후보가 즉시 바뀝니다.</p></div><span class="badge corrected">시연용 미검증 규칙표 v1</span></div>
              <div class="policy-score-chart">${CHARTS.policyScoreBars(result.options)}</div>
              <div class="chart-note"><strong>효과예측이 아닙니다.</strong> 선택 동의 3개 공개데이터 신호와 입력한 수요 패턴·디지털 접근성·방문 가능성을 팀 규칙으로 비교한 값입니다.</div>
              ${renderPolicyRuleLedger()}
            </article>
            <article class="card decision-flow-card">
              <div class="card-head"><div><h2>대안 분기 다이어그램</h2><p>단일 점수보다 현장 질문으로 적합한 대안을 좁힙니다.</p></div><span class="badge proxy">조사 순서</span></div>
              <div class="decision-diagram" aria-label="방문서비스, 고정노선, DRT, 택시 바우처 선택을 위한 질문 흐름">
                <div class="decision-question"><span>1</span><strong>서비스가 방문할 수 있나?</strong><small>YES → 방문서비스</small></div>
                <i class="decision-arrow">→</i>
                <div class="decision-question"><span>2</span><strong>수요가 시간·방향에 집중되나?</strong><small>YES → 고정노선·복지셔틀</small></div>
                <i class="decision-arrow">→</i>
                <div class="decision-question"><span>3</span><strong>디지털 접근성이 낮은가?</strong><small>YES → 전화예약 DRT</small></div>
                <i class="decision-arrow">→</i>
                <div class="decision-question"><span>4</span><strong>수요가 매우 적고 불규칙한가?</strong><small>YES → 택시·바우처</small></div>
                <i class="decision-arrow">→</i>
                <div class="decision-question is-result"><span>5</span><strong>분산·실시간 수요</strong><small>DRT 파일럿 조사</small></div>
              </div>
              <div class="chart-note">이 분기는 <strong>현장 인터뷰 순서</strong>이며, 단독 사업 결정 규칙이 아닙니다.</div>
            </article>
            <article class="card pilot-kpi-card">
              <div class="card-head"><div><h2>파일럿 KPI · 효과 주장이 아닌 측정계획</h2><p>임계값은 발명하지 않고 교통·복지 부서가 시행 전에 기준선·비교권역과 함께 합의합니다.</p></div><span class="badge pending">목표값 사전합의</span></div>
              <div class="pilot-kpi-grid">
                <div><strong>예약·호출 성공률</strong><span>성공 배차 ÷ 유효 요청</span><small>호출로그 · 주간 · 버스정책</small></div>
                <div><strong>대기·총이동시간</strong><span>중앙값·P90, 동일 시간대 비교</span><small>배차·OD 로그 · 주간 · 버스정책</small></div>
                <div><strong>돌봄 연계완료율</strong><span>제공 완료 ÷ 적격 의뢰</span><small>가명 집계 · 월간 · 복지정책</small></div>
                <div><strong>완료 1건당 비용</strong><span>총운영비 ÷ 완료 이동·연계</span><small>운영·정산자료 · 월간 · 공동판정</small></div>
              </div>
              <p class="kpi-stop-rule"><strong>중단조건:</strong> 분모·기준선·비교권역·로그 결합키를 확보하지 못하면 효과·비용 개선 주장을 하지 않습니다.</p>
            </article>
            ${result.options.map((option) => renderPolicyCard(option)).join('')}
            <article class="card human-review-card">
              <div class="card-head"><div><h2>담당자 검토 기록</h2><p>자동 결정이 아닙니다. 선택한 상태와 사유가 현재 동·시나리오·근거와 함께 JSON에 저장됩니다.</p></div><span class="badge team">사람의 결정</span></div>
              <div class="human-review-fields">
                ${selectField('decisionStatus', '검토 상태', [['investigate','추가 현장조사'],['pilot_review','파일럿 검토'],['hold','보류'],['reject','기각']])}
                <div class="field"><label for="decisionReason">검토 사유</label><textarea id="decisionReason" data-field="decisionReason" maxlength="500" placeholder="근거·한계·추가로 필요한 자료를 기록하세요. 개인정보는 입력하지 않습니다.">${esc(state.decisionReason)}</textarea><small>최대 500자 · 개인정보 입력 금지</small></div>
              </div>
            </article>
            <div class="warning-box"><span class="warning-icon">!</span><span>실제 대상자·목적지·호출 로그·운영원가를 확보하기 전에는 도입지역·차량 대수·성과를 확정하지 않습니다.</span></div>
            <div class="action-row"><button class="secondary-button" data-action="reset">시연 초기화</button><button class="primary-button" data-action="export">검토 결과 JSON 저장</button></div>
          </div>
        </div>
      </section>`;
  }

  function policyInput(area) {
    return {
      ...state,
      area: {
        dong: area.dong,
        agingRate: area.agingRate,
        routesPerStop: area.routesPerStop,
        nearestFacilityM: area.nearestFacilityM,
        cityAgingRate: numberValue(pick(city, 'agingRate'), 0.19374942),
        cityRoutesPerStop: numberValue(pick(city, 'routesPerStop'), 3.7718377),
        cityNearestFacilityM: numberValue(pick(city, 'nearestFacilityMeanM')),
      },
    };
  }

  function selectField(field, label, options) {
    return `<div class="field"><label for="${field}">${esc(label)}</label><select id="${field}" data-field="${field}">${options.map(([value, text]) => `<option value="${value}" ${state[field] === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></div>`;
  }

  function renderPolicyCard(option) {
    return `
      <article class="card policy-card">
        <div class="scenario-score"><strong>${option.score}/10</strong><span>조건 일치도 · ${esc(option.fit)}</span></div>
        <div class="policy-copy"><h3>${esc(option.name)}</h3><p>${esc(option.short)}</p><div class="policy-meta"><span>비용자료 ${esc(option.cost)}</span><span>운영조건 ${esc(option.complexity)}</span></div></div>
        <div class="policy-evidence"><div><h4>현재 입력과 맞는 이유</h4><ul>${(option.reasons.length ? option.reasons : ['현재 입력에서 뚜렷한 우선 근거 없음']).map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div><div class="caution"><h4>확인해야 할 조건</h4><ul>${[...option.conditions.slice(0,2), ...option.cautions.slice(0,2)].map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div></div>
      </article>`;
  }

  function renderOverlays() {
    if (activeSourceId) return renderSourceDrawer(activeSourceId);
    if (helpOpen) return renderHelp();
    return '';
  }

  function sourceById(id) {
    return sources.find((source) => source.id === id || (source.aliases || []).includes(id));
  }

  function renderSourceDrawer(id) {
    const source = sourceById(id);
    if (!source) return '';
    return `
      <div class="drawer-backdrop" data-action="close-overlay" aria-hidden="true"></div>
      <aside class="evidence-drawer" role="dialog" aria-modal="true" aria-label="근거 상세">
        <div class="drawer-head"><div><span class="eyebrow">Evidence</span><h2>근거 상세</h2></div><button class="icon-button" data-action="close-overlay" aria-label="닫기">×</button></div>
        <div class="source-detail"><span class="badge official">${esc(source.status || '근거')}</span><small>${esc(source.org || '')} · ${esc(source.date || '')}</small><h3>${esc(source.title || source.id)}</h3><p>${esc(source.definition || '원자료의 기준일·필터·단위는 데이터 계보 문서에서 확인할 수 있습니다.')}</p>${source.url ? `<a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener"><span>공식 원문 열기</span><span>↗</span></a>` : ''}</div>
        <dl class="evidence-rows">
          <div class="evidence-row"><dt>Source ID</dt><dd>${esc(source.id)}</dd></div>
          ${source.hash ? `<div class="evidence-row"><dt>SHA-256</dt><dd><code>${esc(source.hash)}</code></dd></div>` : ''}
          ${source.checkedAt ? `<div class="evidence-row"><dt>확인일</dt><dd>${esc(source.checkedAt)}</dd></div>` : ''}
          ${source.license ? `<div class="evidence-row"><dt>이용조건</dt><dd>${esc(source.license)}</dd></div>` : ''}
          <div class="evidence-row"><dt>화면 해석</dt><dd>표시 수치의 정의를 넘어서 대상자·효과·인과로 확대하지 않습니다.</dd></div>
        </dl>
      </aside>`;
  }

  function renderHelp() {
    return `
      <div class="modal-backdrop" data-action="close-overlay" aria-hidden="true"></div>
      <section class="help-modal" role="dialog" aria-modal="true" aria-label="2분 시연 도움말">
        <div class="modal-head"><div><span class="eyebrow">2분 시연</span><h2>심사위원에게 보여 줄 흐름</h2></div><button class="icon-button" data-action="close-overlay" aria-label="닫기">×</button></div>
        <div class="help-steps">
          <div class="help-step"><strong>공식 수치의 뜻부터 잠급니다</strong><span>2.9만은 추정치, 62는 서비스 목록, 1,972는 조사대상임을 20초 안에 설명합니다.</span></div>
          <div class="help-step"><strong>관산동의 상충 신호를 읽습니다</strong><span>고령화율 29.7%는 높지만 노선 4.61개, 의료시설 거리 0.83km로 공개 공급신호는 양호합니다. 그래서 실제 서비스 도달을 추가 확인합니다.</span></div>
          <div class="help-step"><strong>후보집합과 점수 재현을 분리합니다</strong><span>8/8 집합은 일치하지만 DSS 값·내부순위는 불일치했다고 투명하게 밝힙니다.</span></div>
          <div class="help-step"><strong>5개 대안을 비교하고 다음 데이터를 요청합니다</strong><span>DRT를 자동 추천하지 않고 현장수요·운영비·접근가능 차량 조건을 확인합니다.</span></div>
        </div>
      </section>`;
  }

  function guidedStepToAnalysisStage(step = state.guidedStep) {
    if (step === 2) return 2;
    if (step === 3) return 3;
    if (step >= 5) return 4;
    return 1;
  }

  function goToGuidedStep(target, pushHistory = true) {
    const step = clamp(numberValue(target, state.guidedStep), 1, 6);
    if (step > state.guidedVisitedStep + 1) return;
    if (state.guidedStep === 4 && step > 4 && state.guidedChecks.length === 0) {
      // 구석 토스트를 쓰지 않는다. 사용자의 시선이 있는 자리(체크 목록 바로 아래)에
      // 안내를 띄우고, 화면을 다시 그리지 않아 방금 누른 버튼의 포커스를 지킨다.
      const slot = document.querySelector('.guided-error-slot');
      if (slot) {
        slot.textContent = '현장에서 확인할 항목을 한 개 이상 골라 주세요.';
        slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      return;
    }
    const patch = {
      view: 'guided',
      guidedStep: step,
      guidedVisitedStep: Math.max(state.guidedVisitedStep, step),
      guidedSavedAt: null,
    };
    if (state.guidedStep === 4 && step === 5) patch.guidedQuestionIndex = 0;
    updateState(patch, pushHistory, true);
  }

  function resetGuided() {
    try { window.localStorage.removeItem(GUIDED_STATE_KEY); } catch (_error) { guidedStorageAvailable = false; }
    updateState({
      view: 'guided',
      guidedStep: 1,
      guidedVisitedStep: 1,
      guidedQuestionIndex: 0,
      selectedCode: selectedDefault.code,
      mapAreaCode: selectedDefault.code,
      guidedChecks: [],
      guidedAnswers: {
        visitSubstitution: 'unknown',
        demandConcentration: 'unknown',
        phoneReservation: 'unknown',
        irregularDemand: 'unknown',
        accessibleVehicle: 'unknown',
      },
      guidedReviewedQuestions: [],
      guidedSavedAt: null,
    }, true, true);
    showToast('현장조사 안내를 처음부터 시작합니다.');
  }

  function saveGuidedChecklist() {
    const model = buildGuidedModel();
    const savedAt = new Date().toISOString();
    const payload = GUIDED.buildChecklistExport({
      model,
      selectedChecks: state.guidedChecks,
      policyAnswers: state.guidedAnswers,
      reviewedQuestionIds: state.guidedReviewedQuestions,
      savedAt,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    // savedAt은 ISO(UTC)라 한국 시간 자정~오전 9시 사이에는 날짜가 하루 앞선다.
    // 파일명은 담당자가 보는 이름이므로 로컬 날짜를 쓴다.
    const local = new Date(savedAt);
    const localDay = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    anchor.download = `현장조사_체크리스트_${model.selectedArea.dong}_${localDay}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    state = { ...state, guidedSavedAt: savedAt };
    render();
    showToast(guidedStorageAvailable
      ? `${model.selectedArea.dong} 현장조사 체크리스트를 저장했습니다.`
      : '파일은 저장했지만 이 기기에 초안은 남지 않았습니다.');
  }

  function exportReview() {
    const area = selectedArea();
    const result = ENGINE.scoreOptions(policyInput(area));
    const payload = {
      product: '닿지 않는 돌봄 정책 사전검토 MVP v2',
      exportedAt: new Date().toISOString(),
      evidenceCheckedAt: pick(DATA.metadata, 'checkedAt', 'checked_at') || '2026-08-09',
      decisionScope: '현장조사 우선검토 후보. 도입 확정 아님.',
      selectedArea: {
        district: area.district,
        dong: area.dong,
        population: area.population,
        elderly65: area.elderly65,
        agingRate: area.agingRate,
        single70: area.single70,
        busStops: area.stops,
        routesPerStop: area.routesPerStop,
        nearestFacilityM: area.nearestFacilityM,
      },
      scenario: result.settings,
      firstReview: result.firstReviewOptions.map((option) => option.name),
      firstReviewTie: result.isTie,
      alternatives: result.options.map(({ id, name, score, fit, appliedRuleIds, reasons, cautions }) => ({ id, name, score, fit, appliedRuleIds, reasons, cautions })),
      policyRule: {
        ...ENGINE.RULE_META,
        ledger: ENGINE.RULE_LEDGER,
        note: '시연용 미검증 규칙. 행정 합의·효과 검증 전 단독 정책결정 금지.',
      },
      humanReview: {
        status: state.decisionStatus,
        reason: state.decisionReason,
        note: '정책 확정이 아닌 담당자 사전검토 기록',
      },
      pilotKpiPlan: [
        { metric: '예약·호출 성공률', formula: '성공 배차 ÷ 유효 요청', cadence: '주간', threshold: '시행 전 부서 합의 필요' },
        { metric: '대기·총이동시간', formula: '중앙값·P90, 동일 시간대 비교', cadence: '주간', threshold: '시행 전 부서 합의 필요' },
        { metric: '돌봄 연계완료율', formula: '제공 완료 ÷ 적격 의뢰', cadence: '월간', threshold: '시행 전 부서 합의 필요' },
        { metric: '완료 1건당 비용', formula: '총운영비 ÷ 완료 이동·연계', cadence: '월간', threshold: '시행 전 부서 합의 필요' },
      ],
      fixedLimitations: [
        '공개데이터 대리진단이며 실제 고양온돌 대상자 위치·62 서비스 제공지를 사용하지 않음',
        '버스 2025-08-25, 경계 2026-04-01, 인구·시설 2026-06-30의 혼합 기준일',
        'RI는 직선보행 대리값이며 대기·환승·주행시간을 포함하지 않음',
        '정책 점수는 효과예측·도입확률이 아닌 입력조건과 규칙의 일치도',
      ],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `정책_사전검토_${area.dong}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`${area.dong} 검토 결과를 저장했습니다.`);
  }

  function showToast(message) {
    toastMessage = message;
    render();
    window.setTimeout(() => { toastMessage = ''; render(); }, 2200);
  }

  function resetDemo() {
    try { window.localStorage.removeItem(STATE_KEY); } catch (_error) { /* 현재 세션 상태는 계속 사용 */ }
    state = {
      ...state,
      view: 'analysis',
      stage: 1,
      selectedCode: selectedDefault.code,
      mapAreaCode: selectedDefault.code,
      mapMetric: 'agingRate',
      mapDistrict: '전체',
      mapBusPoints: true,
      mapFacilityPoints: false,
      claimFilter: '전체',
      demand: 'medium',
      pattern: 'dispersed',
      digital: 'low',
      serviceMode: 'travel',
      vehicles: 2,
      wheelchair: false,
      decisionStatus: 'investigate',
      decisionReason: '',
    };
    updateState(state, false, true);
    showToast('시연 상태를 초기화했습니다.');
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
      const view = button.dataset.view === 'analysis' ? 'analysis' : 'guided';
      const patch = { view };
      if (view === 'analysis') patch.stage = numberValue(button.dataset.analysisStage, guidedStepToAnalysisStage());
      updateState(patch, true, true);
    }));
    document.querySelectorAll('[data-guided-step]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (!button.disabled && ['guided-next', 'guided-prev', 'guided-go-step'].includes(action)) {
        goToGuidedStep(button.dataset.guidedStep, true);
      }
    }));
    document.querySelectorAll('[data-guided-dong]').forEach((element) => {
      const selectDong = () => {
        const code = String(element.dataset.guidedDong);
        if (!candidateByCode.has(code)) return;
        updateState({ selectedCode: code, mapAreaCode: code, guidedSavedAt: null });
      };
      element.addEventListener('click', selectDong);
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectDong();
        }
      });
    });
    document.querySelectorAll('[data-guided-field="selectedCode"]').forEach((field) => field.addEventListener('change', () => {
      const code = String(field.value);
      if (candidateByCode.has(code)) updateState({ selectedCode: code, mapAreaCode: code, guidedSavedAt: null });
    }));
    document.querySelectorAll('input[type="checkbox"][data-check-id]').forEach((field) => field.addEventListener('change', () => {
      const id = String(field.dataset.checkId);
      const selected = new Set(state.guidedChecks);
      if (field.checked) selected.add(id); else selected.delete(id);
      updateState({ guidedChecks: [...selected], guidedSavedAt: null });
    }));
    document.querySelectorAll('[data-guided-question][data-guided-answer]').forEach((button) => button.addEventListener('click', () => {
      const question = button.dataset.guidedQuestion;
      const answer = button.dataset.guidedAnswer;
      updateState({
        guidedAnswers: { ...state.guidedAnswers, [question]: answer },
        guidedReviewedQuestions: [...new Set([...state.guidedReviewedQuestions, question])],
        guidedSavedAt: null,
      });
      window.setTimeout(() => document.querySelector(
        `[data-guided-question="${CSS.escape(question)}"][data-guided-answer="${CSS.escape(answer)}"]`,
      )?.focus(), 0);
    }));
    document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => {
      updateState({ view: 'analysis', stage: numberValue(button.dataset.stage, 1) }, true, true);
    }));
    document.querySelectorAll('[data-source]').forEach((button) => button.addEventListener('click', () => {
      overlayReturn = { type: 'source', value: button.dataset.source };
      activeSourceId = button.dataset.source;
      render();
      window.setTimeout(() => document.querySelector('.evidence-drawer .icon-button')?.focus(), 0);
    }));
    document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
      updateState({ claimFilter: button.dataset.filter });
    }));
    document.querySelectorAll('[data-map-metric]').forEach((button) => button.addEventListener('click', () => {
      updateState({ mapMetric: button.dataset.mapMetric });
    }));
    document.querySelectorAll('[data-map-district]').forEach((button) => button.addEventListener('click', () => {
      const district = button.dataset.mapDistrict;
      const current = selectedMapArea();
      const mapArea = district === '전체' || current.district === district
        ? current
        : allAreas.find((item) => item.district === district) || current;
      updateState({ mapDistrict: district, mapAreaCode: mapArea.code });
    }));
    document.querySelectorAll('[data-map-layer]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.mapLayer === 'bus') updateState({ mapBusPoints: !state.mapBusPoints });
      if (button.dataset.mapLayer === 'facility') updateState({ mapFacilityPoints: !state.mapFacilityPoints });
    }));
    document.querySelectorAll('[data-map-code]').forEach((shape) => {
      const selectMapArea = () => {
        const code = String(shape.dataset.mapCode);
        const patch = { mapAreaCode: code };
        if (state.stage === 2 && candidateByCode.has(code)) patch.selectedCode = code;
        updateState(patch);
      };
      shape.addEventListener('click', selectMapArea);
      shape.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectMapArea();
        }
      });
    });
    document.querySelectorAll('[data-open-candidate]').forEach((button) => button.addEventListener('click', () => {
      const code = String(button.dataset.openCandidate);
      if (candidateByCode.has(code)) updateState({ selectedCode: code, mapAreaCode: code, stage: 2 }, true, true);
    }));
    document.querySelectorAll('[data-field]').forEach((field) => {
      const commitField = () => {
        let value = field.type === 'checkbox' ? field.checked : field.value;
        if (field.dataset.field === 'vehicles') value = numberValue(value, 2);
        const patch = { [field.dataset.field]: value };
        if (field.dataset.field === 'selectedCode') patch.mapAreaCode = value;
        updateState(patch);
        if (field.type === 'range') window.setTimeout(() => document.querySelector(`[data-field="${CSS.escape(field.dataset.field)}"]`)?.focus(), 0);
      };
      if (field.type === 'range') {
        field.addEventListener('input', () => {
          const output = field.closest('.field')?.querySelector('output');
          if (output) output.textContent = `${field.value}대`;
        });
        field.addEventListener('change', commitField);
      } else {
        field.addEventListener('change', commitField);
      }
    });
    document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'print') window.print();
      if (action === 'export') exportReview();
      if (action === 'guided-save' || action === 'save-checklist') saveGuidedChecklist();
      if (action === 'guided-policy-next') updateState({
        guidedQuestionIndex: clamp(state.guidedQuestionIndex + 1, 0, GUIDED.POLICY_QUESTIONS.length - 1),
        guidedSavedAt: null,
      }, false, true);
      if (action === 'guided-policy-prev') updateState({
        guidedQuestionIndex: clamp(state.guidedQuestionIndex - 1, 0, GUIDED.POLICY_QUESTIONS.length - 1),
        guidedSavedAt: null,
      }, false, true);
      if (action === 'guided-print') window.print();
      if (action === 'guided-reset') resetGuided();
      if (action === 'open-analysis') updateState({ view: 'analysis', stage: numberValue(button.dataset.analysisStage, guidedStepToAnalysisStage()) }, true, true);
      if (action === 'help') { overlayReturn = { type: 'action', value: 'help' }; helpOpen = true; activeSourceId = null; render(); window.setTimeout(() => document.querySelector('.help-modal .icon-button')?.focus(), 0); }
      if (action === 'close-overlay') closeOverlay();
      if (action === 'reset') resetDemo();
    }));
    document.removeEventListener('keydown', onKeydown);
    document.addEventListener('keydown', onKeydown);
    applyOverlayAccessibility();
  }

  function onKeydown(event) {
    const overlay = document.querySelector('.evidence-drawer, .help-modal');
    if (event.key === 'Escape' && overlay) {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key === 'Tab' && overlay) {
      const focusable = [...overlay.querySelectorAll('button, a[href], input, select, [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.disabled && element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  function applyOverlayAccessibility() {
    const open = Boolean(helpOpen || activeSourceId);
    document.querySelectorAll('.topbar, .guided-app, .stage-wrap, #app-main, .app-footer').forEach((element) => {
      if (open) {
        element.setAttribute('inert', '');
        element.setAttribute('aria-hidden', 'true');
      } else {
        element.removeAttribute('inert');
        element.removeAttribute('aria-hidden');
      }
    });
  }

  function closeOverlay() {
    const returnTarget = overlayReturn;
    helpOpen = false;
    activeSourceId = null;
    overlayReturn = null;
    render();
    window.setTimeout(() => {
      const selector = returnTarget?.type === 'source'
        ? `[data-source="${CSS.escape(returnTarget.value)}"]`
        : returnTarget?.type === 'action'
          ? `[data-action="${CSS.escape(returnTarget.value)}"]`
          : '#app-main';
      document.querySelector(selector)?.focus();
    }, 0);
  }

  function render() {
    if (state.view === 'guided') {
      app.innerHTML = `${renderGuided()}${renderOverlays()}${toastMessage ? `<div class="toast" role="status">${esc(toastMessage)}</div>` : ''}`;
    } else {
      const renderers = [null, renderOverview, renderCandidates, renderRevalidation, renderPolicy];
      app.innerHTML = shell(renderers[state.stage]());
    }
    bindEvents();
  }

  window.addEventListener('popstate', () => {
    const params = new URL(window.location.href).searchParams;
    const requestedView = params.get('view');
    const view = requestedView === 'analysis' || requestedView === 'guided'
      ? requestedView
      : params.has('stage') ? 'analysis' : 'guided';
    const stage = clamp(numberValue(params.get('stage'), state.stage), 1, 4);
    const guidedStep = clamp(numberValue(params.get('step'), state.guidedStep), 1, 6);
    const guidedQuestionIndex = clamp(numberValue(params.get('q'), state.guidedQuestionIndex), 0, GUIDED.POLICY_QUESTIONS.length - 1);
    const requestedCode = params.get('dong');
    const selected = candidateByCode.get(String(requestedCode)) || candidateByDong.get(requestedCode) || selectedArea();
    state = {
      ...state,
      view,
      stage,
      guidedStep,
      guidedQuestionIndex,
      guidedVisitedStep: Math.max(state.guidedVisitedStep, guidedStep),
      selectedCode: selected.code,
      mapAreaCode: selected.code,
    };
    render();
  });

  render();
  window.DDOL_API_CONNECTIONS?.mount();
})();
