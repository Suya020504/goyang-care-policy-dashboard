(function initGuidedModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DDOL_GUIDED_MODEL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGuidedModel() {
  'use strict';

  const DEFAULT_DONG_CODE = '4128160000';

  const STEPS = Object.freeze([
    Object.freeze({
      id: 'decision-scope',
      number: 1,
      title: '판단 질문',
      summary: '정책 도입지가 아니라 현장조사를 먼저 검토할 후보를 살펴봅니다.',
    }),
    Object.freeze({
      id: 'area-signals',
      number: 2,
      title: '지역 신호',
      summary: '선택 지역의 고령수요, 버스 공급, 의료시설 거리 신호를 도시 기준과 비교합니다.',
    }),
    Object.freeze({
      id: 'evidence-confidence',
      number: 3,
      title: '근거 확실성',
      summary: '후보집합 재현, 구성요소 중복, 항 제거 민감도를 한 단계씩 구분해 읽습니다.',
    }),
    Object.freeze({
      id: 'evidence-gaps',
      number: 4,
      title: '확인할 빈칸',
      summary: '공개데이터에 없는 실제 이동수요와 운영조건을 현장확인 과제로 남깁니다.',
    }),
    Object.freeze({
      id: 'alternative-research',
      number: 5,
      title: '대안별 조사',
      summary: 'DRT를 자동 추천하지 않고 교통·복지 대안별로 필요한 조사 항목을 비교합니다.',
    }),
    Object.freeze({
      id: 'field-checklist',
      number: 6,
      title: '체크리스트 저장',
      summary: '확인할 항목을 저장해 담당자가 현장조사와 사람 검토를 이어갑니다.',
    }),
  ]);

  const CHECKLIST_ITEMS = Object.freeze([
    Object.freeze({
      id: 'aggregate-target-demand',
      label: '실제 대상자 규모와 서비스별 이동수요',
      description: '개인을 식별하지 않는 집계 단위로 대상자 수, 이용 서비스, 미충족 수요를 확인합니다.',
    }),
    Object.freeze({
      id: 'service-location-capacity',
      label: '62개 서비스의 실제 제공 위치와 수용력',
      description: '서비스 목록 수가 아니라 실제 제공기관 위치, 운영시간, 정원과 이용조건을 확인합니다.',
    }),
    Object.freeze({
      id: 'village-bus-operation',
      label: '마을버스 배차·운행시간·방향·목적지',
      description: '정적 노선 존재를 넘어 실제 운행횟수, 첫·막차, 방향과 돌봄 목적지 연결을 확인합니다.',
    }),
    Object.freeze({
      id: 'operational-boundary-od',
      label: '운영경계·OD·보행·환승 조건',
      description: '행정동 경계가 아닌 실제 출발지·목적지 집계, 정류장 보행권과 환승 부담을 확인합니다.',
    }),
    Object.freeze({
      id: 'access-support',
      label: '앱·전화·승하차·동행지원 접근성',
      description: '호출수단, 휠체어 승하차, 보호자·돌봄인력 동행과 미이용 사유를 확인합니다.',
    }),
    Object.freeze({
      id: 'alternative-capacity-cost',
      label: '대안별 운영자원·비용과 방문서비스 대체성',
      description: '차량·인력·대기·비용과 방문서비스 제공기관의 수용력을 함께 확인합니다.',
    }),
  ]);

  const POLICY_QUESTIONS = Object.freeze([
    Object.freeze({
      id: 'visitSubstitution',
      text: '이동 대신 방문서비스로 제공할 수 있나요?',
      note: '제공기관의 서비스 범위와 수용력을 함께 확인합니다.',
      alternative: '방문서비스 강화',
    }),
    Object.freeze({
      id: 'demandConcentration',
      text: '수요가 특정 시간대와 방향에 모이나요?',
      note: '집중 수요는 고정노선이나 복지셔틀 검토 근거가 됩니다.',
      alternative: '고정노선·복지셔틀',
    }),
    Object.freeze({
      id: 'phoneReservation',
      text: '앱 호출이 어려워 전화예약이 필요한가요?',
      note: '디지털 접근성과 상담원 연결 조건을 확인합니다.',
      alternative: '전화예약형 이동지원',
    }),
    Object.freeze({
      id: 'irregularDemand',
      text: '수요가 적고 시간·목적지가 분산되어 있나요?',
      note: '실제 호출과 이동패턴을 확보한 뒤 판단합니다.',
      alternative: '택시·바우처',
    }),
    Object.freeze({
      id: 'accessibleVehicle',
      text: '휠체어·승하차·동행지원 차량이 필요한가요?',
      note: '필요 차량과 돌봄 인력 조건이 사업 대안을 가릅니다.',
      alternative: 'DRT 파일럿 조사',
    }),
  ]);

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatPercent(value) {
    return `${(finite(value) * 100).toFixed(1)}%`;
  }

  function formatFixed(value, digits, suffix = '') {
    return `${finite(value).toFixed(digits)}${suffix}`;
  }

  function comparisonDirection(value, benchmark, higherMeaning, lowerMeaning) {
    const current = finite(value);
    const city = finite(benchmark);
    if (Math.abs(current - city) < 1e-12) return '고양시 기준과 비슷함';
    return current > city ? higherMeaning : lowerMeaning;
  }

  function candidateRows(data) {
    const supplied = Array.isArray(data?.candidates) ? data.candidates : [];
    const derived = Array.isArray(data?.areas) ? data.areas.filter((area) => area?.candidate) : [];
    return (supplied.length ? supplied : derived).filter((area) => area && area.code && area.dong);
  }

  function findCandidate(data, requestedCode) {
    const candidates = candidateRows(data);
    const fallback = candidates.find((area) => String(area.code) === DEFAULT_DONG_CODE);
    if (!fallback) throw new TypeError('후보 데이터에서 기본 관산동을 찾을 수 없습니다.');
    const selected = candidates.find((area) => String(area.code) === String(requestedCode));
    return { candidates, selected: selected || fallback, usedFallback: !selected };
  }

  function findByDong(rows, dong) {
    return (Array.isArray(rows) ? rows : []).find((row) => row?.dong === dong) || null;
  }

  function findByCodeOrDong(rows, area) {
    const source = Array.isArray(rows) ? rows : [];
    return source.find((row) => String(row?.code) === String(area.code))
      || source.find((row) => row?.dong === area.dong)
      || null;
  }

  function signal(id, label, value, benchmark, display, benchmarkDisplay, direction) {
    return Object.freeze({
      id,
      label,
      value,
      benchmark,
      display,
      benchmarkDisplay,
      direction,
    });
  }

  function inclusionSummary(row, scenarioCount) {
    const total = finite(scenarioCount);
    const count = finite(row?.count);
    return Object.freeze({
      count,
      total,
      display: `${count}/${total}`,
      share: total ? count / total : 0,
      minRank: row?.minRank ?? null,
      medianRank: row?.medianRank ?? null,
      maxRank: row?.maxRank ?? null,
    });
  }

  function findScenario(rows, scenarioId) {
    return (Array.isArray(rows) ? rows : []).find((row) => row?.scenarioId === scenarioId) || null;
  }

  function dssFeedbackAudit(pro, area) {
    const dependence = pro.dssComponentDependence || {};
    const ablation = pro.dssAblation || {};
    const dependencePair = (dependence.highMonotonicDependencePairs || dependence.pairRows || [])
      .find((row) => new Set([row?.componentA, row?.componentB]).has('bus')
        && new Set([row?.componentA, row?.componentB]).has('facility')) || null;
    const singleRemovalScenarios = ['remove_bus', 'remove_explicit_facility']
      .map((scenarioId) => findScenario(ablation.scenarios, scenarioId))
      .filter(Boolean);
    const combinedRemoval = findScenario(ablation.scenarios, 'remove_bus_and_explicit_facility');
    const baselineCount = finite(findScenario(ablation.scenarios, 'baseline')?.top8Dongs?.length, 8);
    const replacedCount = (scenario) => Math.max(0, baselineCount - finite(scenario?.intersectionCount));
    const maxSingleReplacement = singleRemovalScenarios.reduce(
      (maximum, scenario) => Math.max(maximum, replacedCount(scenario)),
      0,
    );
    const vif = Object.fromEntries((dependence.vifRows || []).map((row) => [row.component, finite(row.vif)]));
    const spatialMethods = Array.isArray(pro.spatialWeights) ? pro.spatialWeights : [];
    const queen = spatialMethods.find((item) => item?.method === 'queen') || null;
    const queenRow = findByDong(queen?.localRows, area.dong);
    const otherMethodHh = spatialMethods
      .filter((item) => item?.method !== 'queen')
      .some((item) => (item?.significantHhDongs || []).includes(area.dong));

    return Object.freeze({
      componentDependence: Object.freeze({
        pearsonR: dependencePair ? finite(dependencePair.pearsonR) : null,
        spearmanRho: dependencePair ? finite(dependencePair.spearmanRho) : null,
        warningThreshold: finite(dependence.highMonotonicDependenceThreshold, 0.8),
        vif: Object.freeze({
          cag: vif.cag ?? null,
          bus: vif.bus ?? null,
          facility: vif.facility ?? null,
        }),
        interpretation: '버스 비효율과 의료거리 항이 비슷한 동 순서를 만들어 중복 반영될 위험이 있습니다.',
      }),
      ablation: Object.freeze({
        baselineCount,
        singleRemovalReplacementCount: maxSingleReplacement,
        singleRemovalScenarioCount: singleRemovalScenarios.length,
        combinedRemovalReplacementCount: combinedRemoval ? replacedCount(combinedRemoval) : null,
        stableCoreDongs: Object.freeze([...(ablation.stableCoreDongs || [])]),
        interpretation: '버스 또는 명시적 의료거리 항을 하나 빼면 기준 후보 8곳 중 각각 3곳이 바뀝니다.',
      }),
      spatial: Object.freeze({
        queenQuadrant: queenRow?.quadrant ?? null,
        queenQFdr: queenRow?.qFdr ?? null,
        queenSignificantHh: Boolean(queenRow?.significantFdr05 && queenRow?.quadrant === 'HH'),
        otherMethodsSignificantHh: otherMethodHh,
        interpretation: queenRow?.significantFdr05 && queenRow?.quadrant === 'HH' && !otherMethodHh
          ? `${area.dong} HH 군집은 Queen 인접에서만 확인돼 이웃 정의에 민감합니다.`
          : `${area.dong}의 군집 판정은 공간 이웃 정의별 결과를 함께 확인해야 합니다.`,
      }),
    });
  }

  function villageBusSnapshot(pro, area) {
    const screening = pro.villageBusScreening || {};
    const row = findByCodeOrDong(screening.areaRows, area);
    if (!row) return null;
    return Object.freeze({
      sourceDate: screening.sourceDate || null,
      servingStopCount: finite(row.villageServingStopCount),
      allStopCount: finite(row.allStopCount),
      servingStopShare: finite(row.villageServingStopShare),
      uniqueRouteCount: finite(row.uniqueVillageRouteCount),
      routeNames: Object.freeze([...(row.villageRouteNames || [])]),
      interpretation: '정류장 파일의 마을노선 존재 표기이며 배차·운행횟수·방향·목적지·실제 중복을 증명하지 않습니다.',
    });
  }

  function accessibilityScenarioSnapshot(pro, area) {
    const analysis = pro.accessibilityTimeScenarios || {};
    const row = findByCodeOrDong(analysis.candidateRangeRows, area);
    if (!row) return null;
    return Object.freeze({
      status: analysis.effectStatus || 'assumption_only',
      referenceMedianMinutes: finite(row.referenceMedianMinutes),
      scenarioMedianMinutesLow: finite(row.scenarioMedianMinutesLow),
      scenarioMedianMinutesHigh: finite(row.scenarioMedianMinutesHigh),
      medianTimeChangeMinutesLow: finite(row.medianTimeChangeMinutesLow),
      medianTimeChangeMinutesHigh: finite(row.medianTimeChangeMinutesHigh),
      referenceCoverage30: finite(row.referenceCoverage30),
      scenarioCoverage30Low: finite(row.scenarioCoverage30Low),
      scenarioCoverage30High: finite(row.scenarioCoverage30High),
      coverage30ChangePercentagePointsLow: finite(row.coverage30ChangePercentagePointsLow),
      coverage30ChangePercentagePointsHigh: finite(row.coverage30ChangePercentagePointsHigh),
      breakEvenWaitMedianMinutes: finite(row.breakEvenWaitMedianMinutes),
      waitScenarioMinutes: Object.freeze([...(analysis.waitScenarioMinutes || [])]),
      assumptions: Object.freeze({ ...(analysis.assumptions || {}) }),
      unit: analysis.unit || null,
      formula: analysis.formula || null,
      interpretation: '공개 가정에 따른 면적격자 시나리오입니다. 실제 DRT 효과나 대상자 수혜율이 아닙니다.',
    });
  }

  function welfareDestinationSnapshot(welfare, area) {
    const metadata = welfare?.metadata || {};
    const row = findByDong(welfare?.areaRows, area.dong);
    if (!row) return null;
    return Object.freeze({
      selectedDongCount: finite(row.seniorCenterCount),
      currentWebDisplayedTotal: finite(metadata.currentWebDisplayedTotal),
      workbookRecordCount: finite(metadata.workbookRecordCount),
      workbookInternalReference: metadata.workbookInternalReference || null,
      seniorWelfareCenterCount: finite(metadata.seniorWelfareCenterCount),
      coordinateCount: finite(metadata.coordinateCount),
      coordinateStatus: metadata.coordinateStatus || null,
      interpretation: metadata.interpretation || '목록만 확보했으며 접근성은 계산하지 않았습니다.',
    });
  }

  function welfareCoordinateSnapshot(coordinates, area) {
    const metadata = coordinates?.metadata || {};
    const rows = Array.isArray(coordinates?.areaAccessibility) ? coordinates.areaAccessibility : [];
    const areaRows = rows.filter((row) => row.adminDong === area.dong);
    if (!areaRows.length) return null;
    const findLayer = (serviceLayer) => areaRows.find((row) => row.serviceLayer === serviceLayer) || null;
    const seniorCenter = findLayer('senior_centers');
    const seniorWelfare = findLayer('senior_welfare_centers');
    const careProvider = findLayer('elder_care_providers');
    return Object.freeze({
      source: metadata.source || null,
      checkedAt: metadata.checkedAt || null,
      linkage: Object.freeze({ ...(metadata.linkage || {}) }),
      seniorCenter: seniorCenter ? Object.freeze({ ...seniorCenter }) : null,
      seniorWelfare: seniorWelfare ? Object.freeze({ ...seniorWelfare }) : null,
      careProvider: careProvider ? Object.freeze({ ...careProvider }) : null,
      interpretation: '공식 공개좌표로 계산한 100m 면적격자의 직선거리 대리값이며 주민 도달률·도로망 이동시간·고양온돌 62개 서비스 접근성이 아닙니다.',
      criticalDisclaimer: metadata.criticalDisclaimer || '경로당·복지관·노인돌봄 수행기관을 고양온돌 62개 서비스 위치와 동일시하지 않습니다.',
    });
  }

  function welfareDestinationSensitivitySnapshot(sensitivity, area) {
    const scenarios = (Array.isArray(sensitivity?.scenarios) ? sensitivity.scenarios : [])
      .filter((row) => row.replacement_scope !== 'baseline_medical');
    if (!scenarios.length) return null;

    const partialScenarios = scenarios.filter((row) => row.replacement_scope === 'partial_facility_term_only');
    const fullScenarios = scenarios.filter((row) => row.replacement_scope === 'full_cag_and_facility_term');
    const stabilityRows = Array.isArray(sensitivity?.candidateStability) ? sensitivity.candidateStability : [];
    const selectedStability = stabilityRows.find((row) => row.dong_name === area.dong) || null;
    const stableCoreDongs = stabilityRows
      .filter((row) => row.stable_all_scenarios)
      .map((row) => row.dong_name);
    const versionRows = Array.isArray(sensitivity?.seniorCenterVersionComparison)
      ? sensitivity.seniorCenterVersionComparison
      : [];
    const versionJaccards = versionRows
      .map((row) => Number(row.top8_jaccard_public585_vs_linked570))
      .filter(Number.isFinite);

    return Object.freeze({
      scenarioCount: scenarios.length,
      partialScenarioCount: partialScenarios.length,
      fullScenarioCount: fullScenarios.length,
      minimumJaccard: Math.min(...scenarios.map((row) => Number(row.jaccard_vs_baseline_top8))),
      maximumReplacementCount: Math.max(...scenarios.map((row) => Number(row.replacement_count))),
      stableCoreDongs: Object.freeze(stableCoreDongs),
      selectedArea: selectedStability ? Object.freeze({
        dong: selectedStability.dong_name,
        top8ScenarioCount: finite(selectedStability.top8_scenario_count),
        scenarioCount: finite(selectedStability.scenario_count),
        stableAllScenarios: Boolean(selectedStability.stable_all_scenarios),
      }) : null,
      seniorCenterVersionMinimumJaccard: versionJaccards.length ? Math.min(...versionJaccards) : null,
      interpretation: '목적지 대리층을 바꾸면 후보집합도 달라집니다. 시설항만 교체한 경우와 CAG·시설항을 함께 교체한 경우를 분리해 읽습니다.',
      criticalDisclaimer: sensitivity?.metadata?.evidenceBoundary
        || '공식 고양온돌 62개 서비스 제공위치·이용실적·운영제약이 아닌 공개 복지목적지 대리층 민감도입니다.',
      versionBoundary: sensitivity?.metadata?.seniorCenterVersionBoundary || null,
    });
  }

  function busNetworkEvidenceSnapshot(evidence) {
    const headway = evidence?.headway;
    const historicalBms = evidence?.historicalBms;
    if (!headway || !historicalBms) return null;
    return Object.freeze({
      sourceDate: headway.sourceDate || null,
      routeDenominator: finite(headway.localVillageRouteDenominator),
      routeNumberCandidates: finite(headway.officialRouteNumberCandidates),
      uniqueOfficialRows: finite(headway.uniqueOfficialRows),
      multipleOfficialRows: finite(headway.multipleOfficialRows),
      unresolvedNoCandidate: finite(headway.unresolvedNoCandidate),
      unresolvedRoutes: Object.freeze([...(headway.unresolvedRoutes || [])]),
      interpretation: headway.interpretation || '',
      historicalBms: Object.freeze({ ...historicalBms }),
    });
  }

  function buildAreaModel(
    data,
    pro,
    code = DEFAULT_DONG_CODE,
    welfare = {},
    welfareCoordinates = {},
    busNetworkEvidence = {},
    welfareDestinationSensitivity = {},
  ) {
    if (!data || !pro) throw new TypeError('안내형 모델에는 DATA와 PRO가 모두 필요합니다.');

    const { candidates, selected, usedFallback } = findCandidate(data, code);
    const city = data.city || {};
    const baseline = pro.baseline || {};
    const weights = pro.weightSensitivity || {};
    const boundaryAudit = weights.boundaryAudit || {};
    const comparison = findByDong(data.candidateComparisons, selected.dong);
    const rankComparison = findByDong(data.rankComparisons, selected.dong);
    const boundedRow = findByCodeOrDong(weights.inclusionRows, selected);
    const boundaryRow = findByCodeOrDong(boundaryAudit.inclusionRows, selected);
    const feedbackAudit = dssFeedbackAudit(pro, selected);
    const villageSnapshot = villageBusSnapshot(pro, selected);
    const accessibilityScenario = accessibilityScenarioSnapshot(pro, selected);
    const welfareSnapshot = welfareDestinationSnapshot(welfare, selected);
    const welfareCoordinatesSnapshot = welfareCoordinateSnapshot(welfareCoordinates, selected);
    const busEvidenceSnapshot = busNetworkEvidenceSnapshot(busNetworkEvidence);
    const welfareSensitivitySnapshot = welfareDestinationSensitivitySnapshot(
      welfareDestinationSensitivity,
      selected,
    );

    const baselineDongs = Array.isArray(baseline.candidateDongs) ? baseline.candidateDongs : [];
    const candidateDongs = candidates.map((area) => area.dong);
    const expectedCandidateCount = finite(
      baseline.candidateCount,
      baselineDongs.length || finite(city.candidateCount, candidates.length),
    );
    const matchedCandidateCount = baselineDongs.length
      ? candidateDongs.filter((dong) => baselineDongs.includes(dong)).length
      : Math.min(candidates.length, expectedCandidateCount);

    const dssPoster = comparison?.posterDss ?? selected.posterDss ?? null;
    const dssReproduced = comparison?.reproducedDss ?? selected.dssReproduced ?? null;
    const dssMatches = dssPoster !== null && dssReproduced !== null
      ? Math.abs(finite(dssPoster) - finite(dssReproduced)) < 1e-12
      : null;
    const rankMatches = rankComparison
      ? rankComparison.posterRank === rankComparison.reproducedProxyRank
      : null;

    const signals = Object.freeze([
      signal(
        'aging-rate',
        '고령화율',
        finite(selected.agingRate),
        finite(city.agingRate),
        formatPercent(selected.agingRate),
        formatPercent(city.agingRate),
        comparisonDirection(selected.agingRate, city.agingRate, '고양시 기준보다 높음', '고양시 기준보다 낮음'),
      ),
      signal(
        'routes-per-stop',
        '정류장당 경유노선',
        finite(selected.routesPerStop),
        finite(city.routesPerStop),
        formatFixed(selected.routesPerStop, 2),
        formatFixed(city.routesPerStop, 2),
        comparisonDirection(selected.routesPerStop, city.routesPerStop, '고양시 기준보다 많음', '고양시 기준보다 적음'),
      ),
      signal(
        'nearest-facility',
        '의료시설 평균 최근접거리',
        finite(selected.nearestFacilityM),
        finite(city.nearestFacilityMeanM),
        formatFixed(selected.nearestFacilityM, 1, 'm'),
        formatFixed(city.nearestFacilityMeanM, 1, 'm'),
        comparisonDirection(selected.nearestFacilityM, city.nearestFacilityMeanM, '고양시 기준보다 멂', '고양시 기준보다 가까움'),
      ),
    ]);

    const demandIsHigher = finite(selected.agingRate) > finite(city.agingRate);
    const routesAreHigher = finite(selected.routesPerStop) > finite(city.routesPerStop);
    const facilityIsCloser = finite(selected.nearestFacilityM) < finite(city.nearestFacilityMeanM);
    const evidenceFraming = Object.freeze({
      headline: demandIsHigher && routesAreHigher && facilityIsCloser
        ? '고령 수요는 높지만, 공개 공급 신호도 양호합니다.'
        : `${selected.dong}의 수요와 공개 공급 신호를 함께 비교합니다.`,
      subheadline: demandIsHigher && routesAreHigher && facilityIsCloser
        ? `고령화율 ${formatPercent(selected.agingRate)}와 달리 정류장당 노선은 ${formatFixed(selected.routesPerStop, 2)}개, 의료시설 평균거리는 ${formatFixed(selected.nearestFacilityM / 1000, 2, 'km')}입니다. 이 상충을 실제 서비스 도달자료로 확인해야 합니다.`
        : '공개 공급량이 실제 배차·환승·목적지 도달과 같은지는 현장에서 확인해야 합니다.',
      summary: demandIsHigher && routesAreHigher && facilityIsCloser
        ? '고령 수요 높음 · 공개 공급 신호 양호 · 실서비스 검증 필요'
        : '공개데이터 대리신호 · 실서비스 검증 필요',
    });

    return Object.freeze({
      steps: STEPS,
      decision: Object.freeze({
        scope: '현장조사 우선검토',
        notice: '정책 도입 확정 아님',
        question: '이 후보를 현장조사 대상으로 먼저 검토할 근거가 있는가?',
      }),
      candidates: Object.freeze(candidates.map((area) => Object.freeze({
        code: String(area.code),
        district: area.district,
        dong: area.dong,
      }))),
      policyQuestions: POLICY_QUESTIONS,
      fieldChecks: CHECKLIST_ITEMS,
      selectedArea: Object.freeze({
        code: String(selected.code),
        district: selected.district,
        dong: selected.dong,
      }),
      areaMetrics: Object.freeze({
        population: finite(selected.population),
        elderly65: finite(selected.elderly65),
        single70: finite(selected.single70),
        agingRate: finite(selected.agingRate),
        stops: finite(selected.stops),
        routesPerStop: finite(selected.routesPerStop),
        nearestFacilityM: finite(selected.nearestFacilityM),
        cag: finite(selected.cag),
        dssReproduced: dssReproduced === null ? null : finite(dssReproduced),
        posterDss: dssPoster === null ? null : finite(dssPoster),
        posterRank: rankComparison?.posterRank ?? selected.posterRank ?? null,
        reproducedProxyRank: rankComparison?.reproducedProxyRank ?? null,
      }),
      usedFallback,
      signals,
      evidenceFraming,
      candidateSet: Object.freeze({
        matchedCount: matchedCandidateCount,
        expectedCount: expectedCandidateCount,
        display: `${matchedCandidateCount}/${expectedCandidateCount}`,
        isReproduced: matchedCandidateCount === expectedCandidateCount,
        interpretation: '후보집합 일치는 점수와 내부순위까지 같다는 뜻이 아닙니다.',
      }),
      scoreVerification: Object.freeze({
        status: dssMatches === false || rankMatches === false ? 'mismatch' : 'match',
        dss: Object.freeze({
          poster: dssPoster,
          reproduced: dssReproduced,
          difference: comparison?.dssDifference ?? (
            dssPoster !== null && dssReproduced !== null ? finite(dssReproduced) - finite(dssPoster) : null
          ),
          matches: dssMatches,
        }),
        internalRank: Object.freeze({
          poster: rankComparison?.posterRank ?? selected.posterRank ?? null,
          reproduced: rankComparison?.reproducedProxyRank ?? null,
          difference: rankComparison?.difference ?? null,
          matches: rankMatches,
        }),
        interpretation: 'DSS 값과 후보 내부순위 불일치',
      }),
      robustness: Object.freeze({
        bounded: inclusionSummary(boundedRow, weights.scenarioCount),
        boundary: inclusionSummary(boundaryRow, boundaryAudit.scenarioCount),
        inclusionIsProbability: false,
        interpretation: '포함 횟수는 선정확률이 아니라 가중치 민감도 진단입니다.',
      }),
      feedbackAudit,
      feedbackRobustness: Object.freeze([
        Object.freeze({
          label: '후보집합 재현',
          display: `${matchedCandidateCount}/${expectedCandidateCount}`,
          numerator: matchedCandidateCount,
          denominator: expectedCandidateCount,
          reading: '제출한 후보 8곳의 집합은 다시 확인됨',
          symbol: '=',
        }),
        Object.freeze({
          label: '버스–의료 신호 중복',
          display: feedbackAudit.componentDependence.spearmanRho === null
            ? '자료 연결 대기'
            : `ρ ${feedbackAudit.componentDependence.spearmanRho.toFixed(3)}`,
          percent: Math.abs(finite(feedbackAudit.componentDependence.spearmanRho)) * 100,
          reading: '두 항이 비슷한 동 순서를 만들어 중복 반영 위험',
          symbol: '!',
        }),
        Object.freeze({
          label: '단일 구성요소 제거',
          display: `${feedbackAudit.ablation.singleRemovalReplacementCount}/${feedbackAudit.ablation.baselineCount} 교체`,
          numerator: feedbackAudit.ablation.singleRemovalReplacementCount,
          denominator: feedbackAudit.ablation.baselineCount,
          reading: '버스 또는 명시적 의료거리 항을 하나 빼면 각각 3곳 교체',
          symbol: '↺',
        }),
      ]),
      villageBusSnapshot: villageSnapshot,
      accessibilityScenario,
      welfareDestinationSnapshot: welfareSnapshot,
      welfareCoordinateSnapshot: welfareCoordinatesSnapshot,
      welfareDestinationSensitivitySnapshot: welfareSensitivitySnapshot,
      busNetworkEvidenceSnapshot: busEvidenceSnapshot,
      currentDrtContext: Object.freeze({
        serviceZoneCount: finite(city.officialDrtServiceZones, 4),
        vehicleSnapshot: finite(city.drtVehicleSnapshot, 14),
        asOf: city.drtVehicleSnapshotDate || null,
        mixedOperationZones: Object.freeze(['식사', '덕은', '향동']),
        fullDayFlexibleZone: '고봉',
        mixedOperationDescription: '출퇴근 고정노선 + 그 외 시간 호출형',
        fullDayFlexibleDescription: '06~24시 전일 호출형',
        interpretation: '기존 똑버스는 통근·신도시형 운영과 전일 호출형이 섞여 있습니다. 돌봄 이동 후보는 필수 목적지 도달 여부를 별도로 검증해야 합니다.',
        limitation: '운영권역은 행정동과 같은 단위가 아니며 이용성과·정책효과를 뜻하지 않습니다.',
      }),
      dataAcquisition: Object.freeze([
        Object.freeze({
          status: '확보',
          label: '정류장·정적 경유노선·계획 배차표',
          detail: busEvidenceSnapshot
            ? `2025-08 정류장과 2024-12 계획 배차표를 교차검증했습니다. 마을노선 ${busEvidenceSnapshot.routeDenominator}개 중 ${busEvidenceSnapshot.uniqueOfficialRows}개만 단일 공식행으로 바로 연결됩니다.`
            : '2025-08-25 정류장 CSV를 분석에 사용했습니다.',
        }),
        Object.freeze({
          status: '목록 확보',
          label: '경로당·노인종합복지관 목적지 후보',
          detail: welfareSnapshot
            ? welfareCoordinatesSnapshot
              ? welfareSensitivitySnapshot
                ? `최신 공식 Excel ${welfareSnapshot.workbookRecordCount}행과 공개 좌표표를 결합하고, 복지 목적지 정의 ${welfareSensitivitySnapshot.scenarioCount}개로 후보 민감도를 재계산했습니다. 실제 62개 서비스 위치는 아닙니다.`
                : `최신 공식 Excel ${welfareSnapshot.workbookRecordCount}행과 공개 좌표표를 결합했습니다. ${selected.dong} 경로당은 ${welfareSnapshot.selectedDongCount}곳이며, 좌표 결합은 검토 상태를 나눠 공개합니다.`
              : `공식 Excel ${welfareSnapshot.workbookRecordCount}행과 복지관 ${welfareSnapshot.seniorWelfareCenterCount}곳을 확인했습니다. ${selected.dong} 경로당은 ${welfareSnapshot.selectedDongCount}곳이며 좌표 접근성은 대기 중입니다.`
            : '공식 목록의 비식별 집계를 연결해야 합니다.',
        }),
        Object.freeze({
          status: welfareCoordinatesSnapshot ? '부분 확보' : 'API 필요',
          label: '현행 노선형상·실제 운행과 복지목적지 운영조건',
          detail: welfareCoordinatesSnapshot
            ? '복지 목적지 공개좌표와 후보 민감도는 계산했습니다. 실제 62개 서비스의 위치·시간·자격·수용량과 현행 노선 순서·형상·실제 배차·방향은 더 확인해야 합니다.'
            : '경기도 버스·TAGO로 순서·배차·형상을, 별도 Juso 승인키로 목적지 좌표를 수집해야 합니다.',
        }),
        Object.freeze({
          status: '기관 협조',
          label: '실제 대상자·62개 서비스·OD·대기·비용',
          detail: '비식별 집계와 운영 로그가 확보돼야 관측 효과를 검증할 수 있습니다.',
        }),
      ]),
      dataBoundary: Object.freeze({
        excludes: Object.freeze(['개인정보', '실제 출발지·목적지 자료', '자동 정책추천']),
        interpretation: '공개데이터 대리신호만으로 정책을 확정하지 않고 담당자가 현장을 확인합니다.',
      }),
      sourceSnapshot: Object.freeze({
        analysis: data.metadata?.analysisSnapshot ?? null,
        populationDate: data.metadata?.populationDate ?? null,
        facilityDate: data.metadata?.facilityDate ?? null,
        busDate: data.metadata?.busDate ?? null,
        proRunId: pro.metadata?.analysisRunId ?? null,
      }),
    });
  }

  function normalizeSavedAt(savedAt) {
    const date = savedAt instanceof Date ? savedAt : new Date(savedAt ?? Date.now());
    if (Number.isNaN(date.getTime())) throw new TypeError('savedAt은 유효한 날짜여야 합니다.');
    return date.toISOString();
  }

  function buildChecklistExport({ model, selectedChecks = [], policyAnswers = {}, reviewedQuestionIds = [], savedAt } = {}) {
    if (!model?.selectedArea) throw new TypeError('체크리스트 저장에는 buildAreaModel 결과가 필요합니다.');
    const selectedIds = new Set((Array.isArray(selectedChecks) ? selectedChecks : [])
      .map((item) => (typeof item === 'string' ? item : item?.id))
      .filter(Boolean));

    return {
      schemaVersion: 'field-checklist-v2',
      savedAt: normalizeSavedAt(savedAt),
      decisionScope: '현장조사 우선검토',
      decisionNotice: '정책 도입 확정 아님',
      area: {
        code: model.selectedArea.code,
        district: model.selectedArea.district,
        dong: model.selectedArea.dong,
      },
      evidenceSnapshot: {
        candidateSet: model.candidateSet.display,
        scoreVerification: model.scoreVerification.status,
        busFacilitySpearmanRho: model.feedbackAudit?.componentDependence?.spearmanRho ?? null,
        busVif: model.feedbackAudit?.componentDependence?.vif?.bus ?? null,
        facilityVif: model.feedbackAudit?.componentDependence?.vif?.facility ?? null,
        singleComponentRemovalReplacementCount: model.feedbackAudit?.ablation?.singleRemovalReplacementCount ?? null,
        combinedComponentRemovalReplacementCount: model.feedbackAudit?.ablation?.combinedRemovalReplacementCount ?? null,
        stableCoreDongs: [...(model.feedbackAudit?.ablation?.stableCoreDongs || [])],
        queenHhOnly: Boolean(
          model.feedbackAudit?.spatial?.queenSignificantHh
          && !model.feedbackAudit?.spatial?.otherMethodsSignificantHh
        ),
        villageBusStaticPresence: model.villageBusSnapshot ? {
          sourceDate: model.villageBusSnapshot.sourceDate,
          servingStops: model.villageBusSnapshot.servingStopCount,
          allStops: model.villageBusSnapshot.allStopCount,
          uniqueRouteNames: model.villageBusSnapshot.uniqueRouteCount,
          limitation: model.villageBusSnapshot.interpretation,
        } : null,
        villageBusHeadwayCrosscheck: model.busNetworkEvidenceSnapshot ? {
          sourceDate: model.busNetworkEvidenceSnapshot.sourceDate,
          routeDenominator: model.busNetworkEvidenceSnapshot.routeDenominator,
          routeNumberCandidates: model.busNetworkEvidenceSnapshot.routeNumberCandidates,
          uniqueOfficialRows: model.busNetworkEvidenceSnapshot.uniqueOfficialRows,
          multipleOfficialRows: model.busNetworkEvidenceSnapshot.multipleOfficialRows,
          unresolvedNoCandidate: model.busNetworkEvidenceSnapshot.unresolvedNoCandidate,
          limitation: model.busNetworkEvidenceSnapshot.interpretation,
        } : null,
        accessibilityScenario: model.accessibilityScenario ? {
          status: model.accessibilityScenario.status,
          referenceMedianMinutes: model.accessibilityScenario.referenceMedianMinutes,
          scenarioMedianMinutesLow: model.accessibilityScenario.scenarioMedianMinutesLow,
          scenarioMedianMinutesHigh: model.accessibilityScenario.scenarioMedianMinutesHigh,
          referenceCoverage30: model.accessibilityScenario.referenceCoverage30,
          scenarioCoverage30Low: model.accessibilityScenario.scenarioCoverage30Low,
          scenarioCoverage30High: model.accessibilityScenario.scenarioCoverage30High,
          breakEvenWaitMedianMinutes: model.accessibilityScenario.breakEvenWaitMedianMinutes,
          limitation: model.accessibilityScenario.interpretation,
        } : null,
        welfareDestination: model.welfareDestinationSnapshot ? {
          selectedDongCount: model.welfareDestinationSnapshot.selectedDongCount,
          currentWebDisplayedTotal: model.welfareDestinationSnapshot.currentWebDisplayedTotal,
          workbookRecordCount: model.welfareDestinationSnapshot.workbookRecordCount,
          seniorWelfareCenterCount: model.welfareDestinationSnapshot.seniorWelfareCenterCount,
          coordinateCount: model.welfareDestinationSnapshot.coordinateCount,
          limitation: model.welfareDestinationSnapshot.interpretation,
        } : null,
        welfareDestinationSensitivity: model.welfareDestinationSensitivitySnapshot ? {
          scenarioCount: model.welfareDestinationSensitivitySnapshot.scenarioCount,
          partialScenarioCount: model.welfareDestinationSensitivitySnapshot.partialScenarioCount,
          fullScenarioCount: model.welfareDestinationSensitivitySnapshot.fullScenarioCount,
          minimumJaccard: model.welfareDestinationSensitivitySnapshot.minimumJaccard,
          maximumReplacementCount: model.welfareDestinationSensitivitySnapshot.maximumReplacementCount,
          stableCoreDongs: [...model.welfareDestinationSensitivitySnapshot.stableCoreDongs],
          selectedArea: model.welfareDestinationSensitivitySnapshot.selectedArea
            ? { ...model.welfareDestinationSensitivitySnapshot.selectedArea }
            : null,
          seniorCenterVersionMinimumJaccard: model.welfareDestinationSensitivitySnapshot.seniorCenterVersionMinimumJaccard,
          limitation: model.welfareDestinationSensitivitySnapshot.criticalDisclaimer,
        } : null,
        inclusionIsProbability: false,
      },
      fieldChecks: CHECKLIST_ITEMS.map((item) => ({
        id: item.id,
        label: item.label,
        checked: selectedIds.has(item.id),
      })),
      dataRequests: CHECKLIST_ITEMS.map((item) => ({
        id: item.id,
        title: item.label,
        requested: selectedIds.has(item.id),
        purpose: item.description,
        handlingRule: '개인을 식별하지 않는 집계자료만 이 파일에 결합',
      })),
      alternativeQuestions: POLICY_QUESTIONS.map((item) => {
        const reviewed = reviewedQuestionIds.includes(item.id) || ['yes', 'no'].includes(policyAnswers?.[item.id]);
        return {
        id: item.id,
        question: item.text,
        alternative: item.alternative,
        reviewed,
        answer: reviewed
          ? (['yes', 'no'].includes(policyAnswers?.[item.id]) ? policyAnswers[item.id] : 'unknown')
          : 'unanswered',
        };
      }),
      humanReview: {
        status: 'investigate',
        notice: '개인정보·인증정보 입력 없이 교통·복지 담당자가 공동 검토',
      },
      limitations: [
        '공개데이터 대리진단이며 정책 도입 우선순위나 효과를 확정하지 않습니다.',
        '마을버스 정적 노선 표기는 배차·운행량·방향·목적지·실제 서비스 중복을 증명하지 않습니다.',
        '이동시간 범위는 공개 가정에 따른 면적격자 시나리오이며 실제 DRT 효과나 대상자 수혜율이 아닙니다.',
        '실제 대상자 자료는 승인된 내부 환경에서 비식별 집계 후 별도 검증해야 합니다.',
      ],
    };
  }

  return {
    STEPS,
    DEFAULT_DONG_CODE,
    CHECKLIST_ITEMS,
    POLICY_QUESTIONS,
    buildAreaModel,
    buildChecklistExport,
  };
});
