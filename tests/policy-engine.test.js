const test = require('node:test');
const assert = require('node:assert/strict');
const { OPTIONS, RULE_META, RULE_LEDGER, scoreOptions } = require('../src/policy-engine.js');

test('시연용 정책 규칙의 버전·검증상태·33개 가점 원장을 공개한다', () => {
  assert.equal(RULE_META.version, 'demo-unvalidated-v1');
  assert.match(RULE_META.status, /실증 전/);
  assert.match(RULE_META.authority, /공식 점수식 아님/);
  assert.equal(RULE_LEDGER.length, 33);
  assert.equal(new Set(RULE_LEDGER.map((row) => row.ruleId)).size, 33);
  assert.ok(RULE_LEDGER.every((row) => OPTIONS.some((option) => option.id === row.optionId)));
  assert.deepEqual(
    Object.fromEntries(OPTIONS.map((option) => [option.id, RULE_LEDGER.filter((row) => row.optionId === option.id).length])),
    { realtime: 8, phone: 7, fixed: 6, voucher: 6, visit: 6 },
  );
  assert.deepEqual(
    RULE_LEDGER.find((row) => row.ruleId === 'R-VI-01'),
    { ruleId: 'R-VI-01', optionId: 'visit', condition: '서비스 제공방식=방문 가능', points: 8 },
  );
  assert.deepEqual(
    RULE_LEDGER.find((row) => row.ruleId === 'R-RT-05'),
    { ruleId: 'R-RT-05', optionId: 'realtime', condition: '디지털 접근성=낮음', points: -2 },
  );
});

test('모든 8,640개 입력 조합에서 화면 점수는 공개 규칙 원장의 적용 합과 같다', () => {
  const demands = ['low', 'medium', 'high'];
  const patterns = ['dispersed', 'concentrated'];
  const digitals = ['low', 'medium', 'high'];
  const serviceModes = ['travel', 'mixed', 'visit'];
  const booleans = [false, true];
  const points = new Map(RULE_LEDGER.map((rule) => [rule.ruleId, rule.points]));
  const optionByRule = new Map(RULE_LEDGER.map((rule) => [rule.ruleId, rule.optionId]));
  const seen = new Set();
  let combinations = 0;

  for (const demand of demands) for (const pattern of patterns) for (const digital of digitals) {
    for (const serviceMode of serviceModes) for (let vehicles = 1; vehicles <= 10; vehicles += 1) {
      for (const wheelchair of booleans) for (const agingAbove of booleans) {
        for (const busBelow of booleans) for (const facilityAbove of booleans) {
          combinations += 1;
          const result = scoreOptions({
            demand, pattern, digital, serviceMode, vehicles, wheelchair,
            area: {
              dong: '검증동',
              agingRate: agingAbove ? 0.2 : 0.1,
              cityAgingRate: 0.15,
              routesPerStop: busBelow ? 3 : 4,
              cityRoutesPerStop: 3.5,
              nearestFacilityM: facilityAbove ? 1500 : 1000,
              cityNearestFacilityM: 1300,
            },
          });
          for (const option of result.options) {
            assert.equal(new Set(option.appliedRuleIds).size, option.appliedRuleIds.length);
            assert.ok(option.appliedRuleIds.every((ruleId) => optionByRule.get(ruleId) === option.id));
            const raw = option.appliedRuleIds.reduce((sum, ruleId) => sum + points.get(ruleId), 0);
            assert.equal(option.score, Math.min(10, Math.max(0, raw)));
            option.appliedRuleIds.forEach((ruleId) => seen.add(ruleId));
          }
        }
      }
    }
  }

  assert.equal(combinations, 8640);
  assert.deepEqual([...seen].sort(), RULE_LEDGER.map((rule) => rule.ruleId).sort());
});

test('낮은 디지털 접근성과 분산 수요에서는 전화예약형 DRT를 먼저 검토한다', () => {
  const result = scoreOptions({ demand: 'medium', pattern: 'dispersed', digital: 'low', serviceMode: 'travel', vehicles: 2 });
  assert.equal(result.firstReview.id, 'phone');
  assert.equal(result.options.length, 5);
});

test('집중된 고수요에서는 고정노선 조정을 먼저 검토한다', () => {
  const result = scoreOptions({ demand: 'high', pattern: 'concentrated', digital: 'medium', serviceMode: 'travel', vehicles: 4 });
  assert.equal(result.firstReview.id, 'fixed');
});

test('낮은 수요와 적은 차량에서는 바우처 택시를 먼저 검토한다', () => {
  const result = scoreOptions({ demand: 'low', pattern: 'dispersed', digital: 'medium', serviceMode: 'travel', vehicles: 1 });
  assert.equal(result.firstReview.id, 'voucher');
});

test('방문 제공 가능 서비스에서는 방문서비스 연계를 먼저 검토한다', () => {
  const result = scoreOptions({ demand: 'medium', pattern: 'dispersed', digital: 'low', serviceMode: 'visit', vehicles: 2 });
  assert.equal(result.firstReview.id, 'visit');
});

test('입력 범위를 제한하고 휠체어 확인 문구를 남긴다', () => {
  const result = scoreOptions({ demand: 'medium', pattern: 'dispersed', digital: 'low', vehicles: 200, wheelchair: true });
  assert.equal(result.settings.vehicles, 10);
  assert.ok(result.options.every((option) => option.cautions.some((item) => item.includes('휠체어'))));
});

test('화면에 보여 줄 대안 순서와 우선 검토안이 일치한다', () => {
  const result = scoreOptions({ demand: 'medium', pattern: 'dispersed', digital: 'low', serviceMode: 'travel', vehicles: 2 });
  assert.equal(result.options[0].id, result.firstReview.id);
  assert.deepEqual(
    result.options.map((option) => option.score),
    [...result.options].map((option) => option.score).sort((a, b) => b - a),
  );
});

test('대기시간은 근거 없는 시뮬레이션 입력으로 사용하지 않는다', () => {
  const result = scoreOptions({ demand: 'medium', pattern: 'dispersed', digital: 'low', wait: 5, vehicles: 2 });
  assert.equal(Object.hasOwn(result.settings, 'wait'), false);
});

test('공동 1위를 임의의 한 대안으로 숨기지 않는다', () => {
  const result = scoreOptions({ demand: 'low', pattern: 'dispersed', digital: 'low', serviceMode: 'travel', vehicles: 1 });
  assert.equal(result.isTie, true);
  assert.deepEqual(
    result.firstReviewOptions.map((option) => option.id).sort(),
    ['phone', 'voucher'],
  );
  assert.ok(result.firstReviewOptions.every((option) => option.score === 7));
});

test('같은 현장 가정에서도 선택 동의 공개데이터 신호가 점수 근거에 반영된다', () => {
  const base = { demand: 'medium', pattern: 'dispersed', digital: 'low', serviceMode: 'travel', vehicles: 2 };
  const benchmarks = { cityAgingRate: 0.194, cityRoutesPerStop: 3.77, cityNearestFacilityM: 1307 };
  const highGap = scoreOptions({
    ...base,
    area: { dong: '행주동', agingRate: 0.277, routesPerStop: 3.05, nearestFacilityM: 1358, ...benchmarks },
  });
  const lowGap = scoreOptions({
    ...base,
    area: { dong: '관산동', agingRate: 0.297, routesPerStop: 4.61, nearestFacilityM: 834, ...benchmarks },
  });
  const highGapPhone = highGap.options.find((option) => option.id === 'phone');
  const lowGapPhone = lowGap.options.find((option) => option.id === 'phone');
  assert.notEqual(highGapPhone.score, lowGapPhone.score);
  assert.match(highGapPhone.reasons.join(' '), /행주동/);
  assert.equal(highGap.settings.areaSignal.busSupplyBelowCity, true);
  assert.equal(lowGap.settings.areaSignal.busSupplyBelowCity, false);
});

test('미확보 비용·운영자료를 근거 있는 등급처럼 표시하지 않는다', () => {
  assert.ok(OPTIONS.every((option) => option.cost === '자료 미확보'));
  assert.ok(OPTIONS.every((option) => option.complexity === '현장 검토'));
});
