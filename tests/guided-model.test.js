const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODEL_PATH = path.join(__dirname, '..', 'src', 'guided-model.js');
const DATA_PATH = path.join(__dirname, '..', 'public', 'data', 'data.js');
const PRO_PATH = path.join(__dirname, '..', 'public', 'data', 'pro_analysis.js');

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
  return {
    data: JSON.parse(JSON.stringify(sandbox.window.DDOL_V2_DATA)),
    pro: JSON.parse(JSON.stringify(sandbox.window.DDOL_PRO_ANALYSIS)),
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
const { data, pro } = loadData();

test('classic script와 CommonJS에서 동일한 6단계 API를 제공한다', () => {
  const browserApi = loadBrowserGlobal(MODEL_PATH, 'DDOL_GUIDED_MODEL');
  assert.equal(STEPS.length, 6);
  assert.deepEqual(STEPS.map((step) => step.number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(STEPS.map((step) => step.title), [
    '판단 질문', '행주동 신호', '근거 확실성', '확인할 빈칸', '대안별 조사', '체크리스트 저장',
  ]);
  assert.equal(new Set(STEPS.map((step) => step.id)).size, 6);
  assert.equal(browserApi.DEFAULT_DONG_CODE, DEFAULT_DONG_CODE);
  assert.equal(browserApi.STEPS.length, 6);
  assert.equal(browserApi.POLICY_QUESTIONS.length, 5);
  assert.equal(typeof browserApi.buildAreaModel, 'function');
  assert.equal(typeof browserApi.buildChecklistExport, 'function');
});

test('행주동은 공개 DATA와 PRO에서 핵심 신호와 견고성 값을 계산한다', () => {
  const model = buildAreaModel(data, pro, DEFAULT_DONG_CODE);
  assert.deepEqual(model.selectedArea, {
    code: '4128163000',
    district: '고양시 덕양구',
    dong: '행주동',
  });
  assert.equal(model.usedFallback, false);
  assert.deepEqual(model.areaMetrics, {
    population: 11690,
    elderly65: 3243,
    single70: 746,
    agingRate: 0.27741659538066726,
    stops: 40,
    routesPerStop: 3.05,
    nearestFacilityM: 1358.4192868361513,
    cag: 0.7904260084118929,
    dssReproduced: 0.7260478729608268,
    posterDss: 1,
    posterRank: 3,
    reproducedProxyRank: 6,
  });
  assert.deepEqual(model.signals.map((item) => item.display), ['27.7%', '3.05', '1358.4m']);
  assert.equal(model.candidateSet.display, '8/8');
  assert.equal(model.candidateSet.isReproduced, true);
  assert.equal(model.robustness.bounded.display, '45/45');
  assert.equal(model.robustness.boundary.display, '206/231');
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

  const model = buildAreaModel(clonedData, clonedPro, other.code);
  const bounded = clonedPro.weightSensitivity.inclusionRows.find((row) => row.code === other.code);
  const boundary = clonedPro.weightSensitivity.boundaryAudit.inclusionRows.find((row) => row.code === other.code);
  assert.equal(model.selectedArea.code, other.code);
  assert.deepEqual(model.signals.map((item) => item.display), ['21.1%', '1.23', '987.6m']);
  assert.equal(model.robustness.bounded.display, `${bounded.count}/${clonedPro.weightSensitivity.scenarioCount}`);
  assert.equal(model.robustness.boundary.display, `${boundary.count}/${clonedPro.weightSensitivity.boundaryAudit.scenarioCount}`);

  const nonCandidate = data.areas.find((area) => !area.candidate);
  const fallback = buildAreaModel(data, pro, nonCandidate.code);
  assert.equal(fallback.selectedArea.code, DEFAULT_DONG_CODE);
  assert.equal(fallback.usedFallback, true);
});

test('알 수 없는 코드도 행주동으로 안전하게 복구한다', () => {
  const model = buildAreaModel(data, pro, 'not-a-candidate');
  assert.equal(model.selectedArea.code, DEFAULT_DONG_CODE);
  assert.equal(model.selectedArea.dong, '행주동');
  assert.equal(model.usedFallback, true);
});

test('현장확인 체크리스트는 6개이며 알려진 항목만 저장한다', () => {
  assert.equal(CHECKLIST_ITEMS.length, 6);
  assert.equal(new Set(CHECKLIST_ITEMS.map((item) => item.id)).size, 6);
  assert.deepEqual(CHECKLIST_ITEMS.map((item) => item.label), [
    '주요 이용 서비스와 목적지 유형',
    '이용 빈도·시간대·방향의 집중 여부',
    '앱·전화 호출 가능성과 미이용 사유',
    '휠체어·승하차·동행지원 필요',
    '방문서비스 대체 가능성과 제공기관 수용력',
    '차량·운영인력·호출·대기·OD·비용 자료 확보 가능성',
  ]);
  const model = buildAreaModel(data, pro, DEFAULT_DONG_CODE);
  const result = buildChecklistExport({
    model,
    selectedChecks: [CHECKLIST_ITEMS[0].id, { id: CHECKLIST_ITEMS[3].id }, 'unknown-check'],
    policyAnswers: { visitSubstitution: 'yes', accessibleVehicle: 'no', irregularDemand: 'invented' },
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
  assert.ok(result.alternativeQuestions.every((item) => !('score' in item) && !('recommendation' in item)));
});

test('저장 결과는 현장조사 범위와 사람 검토를 명시하고 개인정보·OD·정책추천 필드를 만들지 않는다', () => {
  const model = buildAreaModel(data, pro, DEFAULT_DONG_CODE);
  const result = buildChecklistExport({
    model,
    selectedChecks: CHECKLIST_ITEMS.map((item) => item.id),
    savedAt: new Date('2026-08-10T12:34:56.000Z'),
    personalData: { phone: 'ignored' },
    od: { origin: 'ignored', destination: 'ignored' },
    recommendation: 'ignored',
  });

  assert.equal(result.schemaVersion, 'field-checklist-v1');
  assert.equal(result.savedAt, '2026-08-10T12:34:56.000Z');
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
