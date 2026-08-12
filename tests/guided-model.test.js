const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODEL_PATH = path.join(__dirname, '..', 'src', 'guided-model.js');
const DATA_PATH = path.join(__dirname, '..', 'public', 'data', 'data.js');
const PRO_PATH = path.join(__dirname, '..', 'public', 'data', 'pro_analysis.js');
const WELFARE_PATH = path.join(__dirname, '..', 'public', 'data', 'welfare_destinations.js');
const WELFARE_COORDINATE_PATH = path.join(__dirname, '..', 'public', 'data', 'welfare_coordinate_layers.js');
const WELFARE_DESTINATION_SENSITIVITY_PATH = path.join(__dirname, '..', 'public', 'data', 'welfare_destination_sensitivity.js');
const BUS_NETWORK_EVIDENCE_PATH = path.join(__dirname, '..', 'public', 'data', 'bus_network_evidence.js');

function loadBrowserGlobal(filePath, globalName) {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), sandbox, { filename: filePath });
  return sandbox.window[globalName];
}

function loadData() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(DATA_PATH, 'utf8'), sandbox, { filename: DATA_PATH });
  vm.runInContext(fs.readFileSync(PRO_PATH, 'utf8'), sandbox, { filename: PRO_PATH });
  vm.runInContext(fs.readFileSync(WELFARE_PATH, 'utf8'), sandbox, { filename: WELFARE_PATH });
  vm.runInContext(fs.readFileSync(WELFARE_COORDINATE_PATH, 'utf8'), sandbox, { filename: WELFARE_COORDINATE_PATH });
  vm.runInContext(fs.readFileSync(WELFARE_DESTINATION_SENSITIVITY_PATH, 'utf8'), sandbox, { filename: WELFARE_DESTINATION_SENSITIVITY_PATH });
  vm.runInContext(fs.readFileSync(BUS_NETWORK_EVIDENCE_PATH, 'utf8'), sandbox, { filename: BUS_NETWORK_EVIDENCE_PATH });
  return {
    data: JSON.parse(JSON.stringify(sandbox.window.DDOL_V2_DATA)),
    pro: JSON.parse(JSON.stringify(sandbox.window.DDOL_PRO_ANALYSIS)),
    welfare: JSON.parse(JSON.stringify(sandbox.window.DDOL_WELFARE_DESTINATIONS)),
    welfareCoordinates: JSON.parse(JSON.stringify(sandbox.window.DDOL_WELFARE_COORDINATE_LAYERS)),
    welfareDestinationSensitivity: JSON.parse(JSON.stringify(sandbox.window.DDOL_WELFARE_DESTINATION_SENSITIVITY)),
    busNetworkEvidence: JSON.parse(JSON.stringify(sandbox.window.DDOL_BUS_NETWORK_EVIDENCE)),
  };
}

const {
  STEPS,
  DEFAULT_DONG_CODE,
  CHECKLIST_ITEMS,
  POLICY_QUESTIONS,
  buildAreaModel,
  buildChecklistExport,
} = require('../src/guided-model.js');
const {
  data,
  pro,
  welfare,
  welfareCoordinates,
  welfareDestinationSensitivity,
  busNetworkEvidence,
} = loadData();

test('classic script와 CommonJS에서 동일한 6단계 API를 제공한다', () => {
  const browserApi = loadBrowserGlobal(MODEL_PATH, 'DDOL_GUIDED_MODEL');
  assert.equal(STEPS.length, 6);
  assert.deepEqual(STEPS.map((step) => step.number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(STEPS.map((step) => step.title), [
    '판단 질문', '지역 신호', '근거 확실성', '확인할 빈칸', '대안별 조사', '체크리스트 저장',
  ]);
  assert.equal(new Set(STEPS.map((step) => step.id)).size, 6);
  assert.equal(browserApi.DEFAULT_DONG_CODE, DEFAULT_DONG_CODE);
  assert.equal(browserApi.STEPS.length, 6);
  assert.equal(browserApi.POLICY_QUESTIONS.length, 5);
  assert.equal(typeof browserApi.buildAreaModel, 'function');
  assert.equal(typeof browserApi.buildChecklistExport, 'function');
});

test('기본 관산동은 상충 신호와 피드백 재분석을 함께 계산한다', () => {
  const model = buildAreaModel(
    data,
    pro,
    DEFAULT_DONG_CODE,
    welfare,
    welfareCoordinates,
    busNetworkEvidence,
    welfareDestinationSensitivity,
  );
  assert.deepEqual(model.selectedArea, {
    code: '4128160000',
    district: '고양시 덕양구',
    dong: '관산동',
  });
  assert.equal(model.usedFallback, false);
  assert.deepEqual(model.areaMetrics, {
    population: 32905,
    elderly65: 9764,
    single70: 1957,
    agingRate: 0.296733019297979,
    stops: 129,
    routesPerStop: 4.612403100775194,
    nearestFacilityM: 834.2584241105883,
    cag: 1.2274261933978212,
    dssReproduced: 0.7098788082240636,
    posterDss: 0.96,
    posterRank: 5,
    reproducedProxyRank: 7,
  });
  assert.deepEqual(model.signals.map((item) => item.display), ['29.7%', '4.61', '834.3m']);
  assert.match(model.evidenceFraming.headline, /공개 공급 신호도 양호/);
  assert.deepEqual(model.feedbackRobustness.map((item) => item.display), ['8/8', 'ρ 0.931', '3/8 교체']);
  assert.equal(model.feedbackAudit.componentDependence.spearmanRho, 0.93107822410148);
  assert.equal(model.feedbackAudit.ablation.combinedRemovalReplacementCount, 4);
  assert.deepEqual(model.feedbackAudit.ablation.stableCoreDongs, ['고양동', '관산동', '행주동']);
  assert.equal(model.feedbackAudit.spatial.queenSignificantHh, true);
  assert.equal(model.feedbackAudit.spatial.otherMethodsSignificantHh, false);
  assert.equal(model.villageBusSnapshot.servingStopCount, 127);
  assert.equal(model.villageBusSnapshot.allStopCount, 129);
  assert.equal(model.welfareDestinationSensitivitySnapshot.scenarioCount, 11);
  assert.equal(model.welfareDestinationSensitivitySnapshot.maximumReplacementCount, 4);
  assert.equal(model.welfareDestinationSensitivitySnapshot.minimumJaccard, 0.333333);
  assert.deepEqual(model.welfareDestinationSensitivitySnapshot.stableCoreDongs, ['가좌동', '효자동', '고양동', '관산동']);
  assert.deepEqual(model.welfareDestinationSensitivitySnapshot.selectedArea, {
    dong: '관산동',
    top8ScenarioCount: 11,
    scenarioCount: 11,
    stableAllScenarios: true,
  });
  assert.equal(model.villageBusSnapshot.uniqueRouteCount, 8);
  assert.equal(model.accessibilityScenario.status, 'hypothetical_scenario_not_observed_before_after');
  assert.equal(model.accessibilityScenario.referenceMedianMinutes, 16.2342144479973);
  assert.equal(model.accessibilityScenario.scenarioMedianMinutesLow, 14.052059926220126);
  assert.equal(model.accessibilityScenario.scenarioMedianMinutesHigh, 24.052059926220124);
  assert.equal(model.accessibilityScenario.referenceCoverage30, 0.8849230769230769);
  assert.equal(model.accessibilityScenario.scenarioCoverage30Low, 0.9956923076923077);
  assert.equal(model.accessibilityScenario.scenarioCoverage30High, 1);
  assert.equal(model.accessibilityScenario.breakEvenWaitMedianMinutes, 7.182154521777173);
  assert.deepEqual(model.accessibilityScenario.waitScenarioMinutes, [5, 10, 15]);
  assert.deepEqual(model.dataAcquisition.map((item) => item.status), ['확보', '목록 확보', '부분 확보', '기관 협조']);
  assert.equal(model.welfareDestinationSnapshot.selectedDongCount, 16);
  assert.equal(model.welfareDestinationSnapshot.currentWebDisplayedTotal, 593);
  assert.equal(model.welfareDestinationSnapshot.workbookRecordCount, 594);
  assert.equal(model.welfareDestinationSnapshot.coordinateCount, 0);
  assert.equal(model.welfareCoordinateSnapshot.seniorCenter.citywideCoordinateCount, 585);
  assert.equal(model.welfareCoordinateSnapshot.seniorCenter.facilityCountInsideDong, 16);
  assert.equal(model.welfareCoordinateSnapshot.seniorCenter.nearestMedianM, 513.879);
  assert.equal(model.welfareCoordinateSnapshot.seniorCenter.coverage15MinPct, 76.738);
  assert.equal(
    model.welfareCoordinateSnapshot.linkage.linked_total
      + model.welfareCoordinateSnapshot.linkage.manual_review
      + model.welfareCoordinateSnapshot.linkage.unmatched,
    594,
  );
  assert.match(model.welfareCoordinateSnapshot.criticalDisclaimer, /62개 서비스 위치가 아니며/);
  assert.equal(model.busNetworkEvidenceSnapshot.routeDenominator, 86);
  assert.equal(model.busNetworkEvidenceSnapshot.routeNumberCandidates, 82);
  assert.equal(model.busNetworkEvidenceSnapshot.uniqueOfficialRows, 72);
  assert.equal(model.busNetworkEvidenceSnapshot.multipleOfficialRows, 10);
  assert.equal(model.busNetworkEvidenceSnapshot.unresolvedNoCandidate, 4);
  assert.equal(model.busNetworkEvidenceSnapshot.historicalBms.linkedRoutes, 7);
  assert.match(model.busNetworkEvidenceSnapshot.interpretation, /실제 운행준수율/);
  assert.equal(model.currentDrtContext.serviceZoneCount, 4);
  assert.equal(model.currentDrtContext.vehicleSnapshot, 14);
  assert.deepEqual(model.currentDrtContext.mixedOperationZones, ['식사', '덕은', '향동']);
  assert.equal(model.currentDrtContext.fullDayFlexibleZone, '고봉');
  assert.match(model.currentDrtContext.limitation, /운영권역은 행정동과 같은 단위가 아니며/);
  assert.equal(model.candidateSet.display, '8/8');
  assert.equal(model.candidateSet.isReproduced, true);
  assert.equal(model.robustness.bounded.display, '45/45');
  assert.equal(model.robustness.boundary.display, '124/231');
  assert.equal(model.robustness.inclusionIsProbability, false);
  assert.equal(model.scoreVerification.status, 'mismatch');
  assert.equal(model.scoreVerification.dss.matches, false);
  assert.equal(model.scoreVerification.internalRank.matches, false);
  assert.match(model.scoreVerification.interpretation, /DSS 값과 후보 내부순위 불일치/);
  assert.deepEqual(model.dataBoundary.excludes, ['개인정보', '실제 출발지·목적지 자료', '자동 정책추천']);
});

test('다른 후보의 값도 선택한 행과 민감도 행에서 가져오며 비후보 코드는 선택하지 않는다', () => {
  const other = data.candidates.find((area) => area.code !== DEFAULT_DONG_CODE);
  const clonedData = structuredClone(data);
  const clonedPro = structuredClone(pro);
  const changed = clonedData.candidates.find((area) => area.code === other.code);
  changed.agingRate = 0.21123;
  changed.routesPerStop = 1.234;
  changed.nearestFacilityM = 987.65;

  const model = buildAreaModel(clonedData, clonedPro, other.code, welfare);
  const bounded = clonedPro.weightSensitivity.inclusionRows.find((row) => row.code === other.code);
  const boundary = clonedPro.weightSensitivity.boundaryAudit.inclusionRows.find((row) => row.code === other.code);
  assert.equal(model.selectedArea.code, other.code);
  assert.deepEqual(model.signals.map((item) => item.display), ['21.1%', '1.23', '987.6m']);
  assert.equal(model.robustness.bounded.display, `${bounded.count}/${clonedPro.weightSensitivity.scenarioCount}`);
  assert.equal(model.robustness.boundary.display, `${boundary.count}/${clonedPro.weightSensitivity.boundaryAudit.scenarioCount}`);

  const nonCandidate = data.areas.find((area) => !area.candidate);
  const fallback = buildAreaModel(data, pro, nonCandidate.code, welfare);
  assert.equal(fallback.selectedArea.code, DEFAULT_DONG_CODE);
  assert.equal(fallback.usedFallback, true);
});

test('알 수 없는 코드도 관산동으로 안전하게 복구한다', () => {
  const model = buildAreaModel(data, pro, 'not-a-candidate', welfare);
  assert.equal(model.selectedArea.code, DEFAULT_DONG_CODE);
  assert.equal(model.selectedArea.dong, '관산동');
  assert.equal(model.usedFallback, true);
});

test('현장확인 체크리스트는 6개이며 알려진 항목만 저장한다', () => {
  assert.equal(CHECKLIST_ITEMS.length, 6);
  assert.equal(new Set(CHECKLIST_ITEMS.map((item) => item.id)).size, 6);
  assert.deepEqual(CHECKLIST_ITEMS.map((item) => item.label), [
    '실제 대상자 규모와 서비스별 이동수요',
    '62개 서비스의 실제 제공 위치와 수용력',
    '마을버스 배차·운행시간·방향·목적지',
    '운영경계·OD·보행·환승 조건',
    '앱·전화·승하차·동행지원 접근성',
    '대안별 운영자원·비용과 방문서비스 대체성',
  ]);
  const model = buildAreaModel(
    data,
    pro,
    DEFAULT_DONG_CODE,
    welfare,
    welfareCoordinates,
    busNetworkEvidence,
    welfareDestinationSensitivity,
  );
  const result = buildChecklistExport({
    model,
    selectedChecks: [CHECKLIST_ITEMS[0].id, { id: CHECKLIST_ITEMS[3].id }, 'unknown-check'],
    policyAnswers: { visitSubstitution: 'yes', accessibleVehicle: 'no', irregularDemand: 'invented' },
    reviewedQuestionIds: POLICY_QUESTIONS.map((item) => item.id),
    savedAt: '2026-08-10T03:00:00.000Z',
  });
  assert.equal(result.fieldChecks.length, 6);
  assert.deepEqual(
    result.fieldChecks.filter((item) => item.checked).map((item) => item.id),
    [CHECKLIST_ITEMS[0].id, CHECKLIST_ITEMS[3].id],
  );
  assert.equal('note' in result, false);
  assert.equal(POLICY_QUESTIONS.length, 5);
  assert.deepEqual(result.alternativeQuestions.map((item) => item.answer), ['yes', 'unknown', 'unknown', 'unknown', 'no']);
  assert.ok(result.alternativeQuestions.every((item) => item.reviewed));
  assert.ok(result.alternativeQuestions.every((item) => !('score' in item) && !('recommendation' in item)));
});

test('저장 결과는 현장조사 범위와 사람 검토를 명시하고 개인정보·OD·정책추천 필드를 만들지 않는다', () => {
  const model = buildAreaModel(
    data,
    pro,
    DEFAULT_DONG_CODE,
    welfare,
    welfareCoordinates,
    busNetworkEvidence,
    welfareDestinationSensitivity,
  );
  const result = buildChecklistExport({
    model,
    selectedChecks: CHECKLIST_ITEMS.map((item) => item.id),
    savedAt: new Date('2026-08-10T12:34:56.000Z'),
    personalData: { phone: 'ignored' },
    od: { origin: 'ignored', destination: 'ignored' },
    recommendation: 'ignored',
  });

  assert.equal(result.schemaVersion, 'field-checklist-v2');
  assert.equal(result.dataRequests.length, 6);
  assert.equal(result.dataRequests.filter((item) => item.requested).length, 6);
  assert.equal(result.evidenceSnapshot.busFacilitySpearmanRho, 0.93107822410148);
  assert.equal(result.evidenceSnapshot.singleComponentRemovalReplacementCount, 3);
  assert.equal(result.evidenceSnapshot.villageBusStaticPresence.servingStops, 127);
  assert.equal(result.evidenceSnapshot.accessibilityScenario.status, 'hypothetical_scenario_not_observed_before_after');
  assert.equal(result.evidenceSnapshot.accessibilityScenario.referenceCoverage30, 0.8849230769230769);
  assert.equal(result.evidenceSnapshot.accessibilityScenario.scenarioCoverage30Low, 0.9956923076923077);
  assert.equal(result.evidenceSnapshot.accessibilityScenario.scenarioCoverage30High, 1);
  assert.match(result.evidenceSnapshot.accessibilityScenario.limitation, /실제 DRT 효과.*아닙니다/);
  assert.equal(result.evidenceSnapshot.welfareDestinationSensitivity.scenarioCount, 11);
  assert.equal(result.evidenceSnapshot.welfareDestinationSensitivity.maximumReplacementCount, 4);
  assert.equal(result.evidenceSnapshot.welfareDestinationSensitivity.minimumJaccard, 0.333333);
  assert.deepEqual(result.evidenceSnapshot.welfareDestinationSensitivity.stableCoreDongs, ['가좌동', '효자동', '고양동', '관산동']);
  assert.equal(result.evidenceSnapshot.welfareDestinationSensitivity.selectedArea.top8ScenarioCount, 11);
  assert.match(result.evidenceSnapshot.welfareDestinationSensitivity.limitation, /62개 서비스/);
  assert.equal(result.savedAt, '2026-08-10T12:34:56.000Z');
  assert.ok(result.alternativeQuestions.every((item) => item.answer === 'unanswered' && item.reviewed === false));
  assert.equal(result.decisionScope, '현장조사 우선검토');
  assert.equal(result.decisionNotice, '정책 도입 확정 아님');
  assert.equal(result.humanReview.status, 'investigate');
  assert.ok(result.fieldChecks.every((item) => item.checked));

  const forbidden = /^(personalData|pii|phone|email|address|od|origin|destination|recommendation|policyRecommendation)$/i;
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    Object.entries(value).forEach(([key, child]) => {
      assert.equal(forbidden.test(key), false, `금지된 내보내기 필드: ${key}`);
      visit(child);
    });
  };
  visit(result);
});
