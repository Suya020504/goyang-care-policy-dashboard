(function initPolicyEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PolicyEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPolicyEngine() {
  'use strict';

  const OPTIONS = [
    {
      id: 'realtime',
      name: '실시간 DRT',
      short: '앱·전화 호출에 따라 경로를 바꾸는 방식',
      cost: '자료 미확보',
      complexity: '현장 검토',
      conditions: ['실시간 호출·배차 플랫폼', '분산 수요', '충분한 차량과 운영 인력'],
    },
    {
      id: 'phone',
      name: '전화예약형 DRT',
      short: '상담원이 예약을 받아 운행하는 방식',
      cost: '자료 미확보',
      complexity: '현장 검토',
      conditions: ['전화 예약·상담 인력', '분산 수요', '낮은 디지털 접근성 보완'],
    },
    {
      id: 'fixed',
      name: '고정노선·복지셔틀',
      short: '시간과 목적지가 모이는 수요를 정시 운행',
      cost: '자료 미확보',
      complexity: '현장 검토',
      conditions: ['시간·방향이 집중된 수요', '기존 정류장·노선 활용', '배차간격 조정 가능성'],
    },
    {
      id: 'voucher',
      name: '바우처 택시',
      short: '적고 불규칙한 이동을 건별로 지원',
      cost: '자료 미확보',
      complexity: '현장 검토',
      conditions: ['매우 적거나 불규칙한 수요', '개별 이동 지원', '택시업계·예산 협의'],
    },
    {
      id: 'visit',
      name: '방문서비스 연계',
      short: '사람을 이동시키기보다 서비스를 연결',
      cost: '자료 미확보',
      complexity: '현장 검토',
      conditions: ['이동이 불필요한 방문형 서비스', '제공기관 인력·권역', '복지·보건 연계'],
    },
  ];

  const RULE_META = Object.freeze({
    version: 'demo-unvalidated-v1',
    label: '시연용 미검증 규칙표 v1',
    status: '팀 내부 가설 · 부서 합의 및 실증 전',
    scoreRange: '합산 후 0~10 제한',
    fitBands: '7~10 조건 많이 일치 · 4~6 일부 일치 · 0~3 적게 일치',
    authority: '국토부·고양시 공식 점수식 아님',
  });

  const RULE_LEDGER = Object.freeze([
    { ruleId: 'R-RT-01', optionId: 'realtime', condition: '예상 수요=높음', points: 2 },
    { ruleId: 'R-RT-02', optionId: 'realtime', condition: '예상 수요=중간', points: 1 },
    { ruleId: 'R-RT-03', optionId: 'realtime', condition: '시간·방향 패턴=분산', points: 3 },
    { ruleId: 'R-RT-04', optionId: 'realtime', condition: '디지털 접근성=높음', points: 2 },
    { ruleId: 'R-RT-05', optionId: 'realtime', condition: '디지털 접근성=낮음', points: -2 },
    { ruleId: 'R-RT-06', optionId: 'realtime', condition: '검토 차량 수≥3', points: 1 },
    { ruleId: 'R-RT-07', optionId: 'realtime', condition: '동 노선공급<고양 기준 AND 패턴=분산', points: 1 },
    { ruleId: 'R-RT-08', optionId: 'realtime', condition: '동 의료거리>고양 기준', points: 1 },
    { ruleId: 'R-PH-01', optionId: 'phone', condition: '예상 수요=낮음 또는 중간', points: 2 },
    { ruleId: 'R-PH-02', optionId: 'phone', condition: '시간·방향 패턴=분산', points: 2 },
    { ruleId: 'R-PH-03', optionId: 'phone', condition: '디지털 접근성=낮음', points: 3 },
    { ruleId: 'R-PH-04', optionId: 'phone', condition: '디지털 접근성=보통', points: 1 },
    { ruleId: 'R-PH-05', optionId: 'phone', condition: '검토 차량 수≥2', points: 1 },
    { ruleId: 'R-PH-06', optionId: 'phone', condition: '동 고령화율>고양 기준', points: 1 },
    { ruleId: 'R-PH-07', optionId: 'phone', condition: '동 노선공급<고양 기준', points: 1 },
    { ruleId: 'R-FX-01', optionId: 'fixed', condition: '예상 수요=높음', points: 3 },
    { ruleId: 'R-FX-02', optionId: 'fixed', condition: '예상 수요=중간', points: 1 },
    { ruleId: 'R-FX-03', optionId: 'fixed', condition: '시간·방향 패턴=집중', points: 4 },
    { ruleId: 'R-FX-04', optionId: 'fixed', condition: '디지털 접근성=낮음', points: 1 },
    { ruleId: 'R-FX-05', optionId: 'fixed', condition: '동 노선공급<고양 기준 AND 패턴=집중', points: 1 },
    { ruleId: 'R-FX-06', optionId: 'fixed', condition: '동 고령화율>고양 기준', points: 1 },
    { ruleId: 'R-VO-01', optionId: 'voucher', condition: '예상 수요=낮음', points: 4 },
    { ruleId: 'R-VO-02', optionId: 'voucher', condition: '예상 수요=중간', points: 1 },
    { ruleId: 'R-VO-03', optionId: 'voucher', condition: '시간·방향 패턴=분산', points: 1 },
    { ruleId: 'R-VO-04', optionId: 'voucher', condition: '검토 차량 수≤2', points: 2 },
    { ruleId: 'R-VO-05', optionId: 'voucher', condition: '휠체어·승하차 지원 필요', points: 1 },
    { ruleId: 'R-VO-06', optionId: 'voucher', condition: '동 의료거리>고양 기준', points: 1 },
    { ruleId: 'R-VI-01', optionId: 'visit', condition: '서비스 제공방식=방문 가능', points: 8 },
    { ruleId: 'R-VI-02', optionId: 'visit', condition: '서비스 제공방식=이동·방문 혼합', points: 3 },
    { ruleId: 'R-VI-03', optionId: 'visit', condition: '디지털 접근성=낮음', points: 1 },
    { ruleId: 'R-VI-04', optionId: 'visit', condition: '휠체어·승하차 지원 필요', points: 2 },
    { ruleId: 'R-VI-05', optionId: 'visit', condition: '동 고령화율>고양 기준', points: 1 },
    { ruleId: 'R-VI-06', optionId: 'visit', condition: '동 의료거리>고양 기준 AND 이동 필수 아님', points: 1 },
  ]);
  const RULE_POINTS = new Map(RULE_LEDGER.map((rule) => [rule.ruleId, rule.points]));

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function finite(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeAreaSignal(area) {
    if (!area || !area.dong) return null;
    const agingRate = finite(area.agingRate);
    const routesPerStop = finite(area.routesPerStop);
    const nearestFacilityM = finite(area.nearestFacilityM);
    const cityAgingRate = finite(area.cityAgingRate);
    const cityRoutesPerStop = finite(area.cityRoutesPerStop);
    const cityNearestFacilityM = finite(area.cityNearestFacilityM);
    return {
      dong: String(area.dong),
      agingAboveCity: agingRate > cityAgingRate,
      busSupplyBelowCity: routesPerStop < cityRoutesPerStop,
      facilityDistanceAboveCity: nearestFacilityM > cityNearestFacilityM,
      values: { agingRate, routesPerStop, nearestFacilityM },
      benchmarks: { cityAgingRate, cityRoutesPerStop, cityNearestFacilityM },
    };
  }

  function scoreOptions(input) {
    const areaSignal = normalizeAreaSignal(input.area);
    const settings = {
      demand: input.demand || 'medium',
      pattern: input.pattern || 'dispersed',
      digital: input.digital || 'low',
      serviceMode: input.serviceMode || 'mixed',
      vehicles: clamp(Number(input.vehicles) || 2, 1, 10),
      wheelchair: Boolean(input.wheelchair),
      areaSignal,
    };

    const scored = OPTIONS.map((option) => {
      let score = 0;
      const reasons = [];
      const cautions = [];
      const appliedRuleIds = [];
      const applyRule = (ruleId, reason) => {
        if (!RULE_POINTS.has(ruleId)) throw new Error(`Unknown policy rule: ${ruleId}`);
        score += RULE_POINTS.get(ruleId);
        appliedRuleIds.push(ruleId);
        if (reason) reasons.push(reason);
      };

      if (option.id === 'realtime') {
        if (settings.demand === 'high') applyRule('R-RT-01', '중·고수요에 실시간 배차 검토 가치');
        if (settings.demand === 'medium') applyRule('R-RT-02', '중간 수요 수준');
        if (settings.pattern === 'dispersed') applyRule('R-RT-03', '분산 수요에 유연');
        if (settings.digital === 'high') applyRule('R-RT-04', '앱 호출 수용 가능성');
        if (settings.digital === 'low') { applyRule('R-RT-05'); cautions.push('앱만으로 운영하면 배제 위험'); }
        if (settings.vehicles >= 3) applyRule('R-RT-06', '최소 3대 가정');
      }

      if (option.id === 'phone') {
        if (settings.demand === 'low' || settings.demand === 'medium') applyRule('R-PH-01', '저·중수요에 단계적 운영 가능');
        if (settings.pattern === 'dispersed') applyRule('R-PH-02', '분산 수요 대응');
        if (settings.digital === 'low') applyRule('R-PH-03', '전화로 디지털 접근성 보완');
        if (settings.digital === 'medium') applyRule('R-PH-04', '앱·전화 병행 가능');
        if (settings.vehicles >= 2) applyRule('R-PH-05', '2대 이상 검토 가정');
        cautions.push('예약 인력과 노쇼 관리 기준 필요');
      }

      if (option.id === 'fixed') {
        if (settings.demand === 'high') applyRule('R-FX-01', '집중 수요는 정시성 확보에 유리');
        if (settings.demand === 'medium') applyRule('R-FX-02', '중간 수요 수준');
        if (settings.pattern === 'concentrated') applyRule('R-FX-03', '시간·방향 집중 수요에 적합');
        if (settings.digital === 'low') applyRule('R-FX-04', '별도 호출 없이 이용 가능');
        if (settings.pattern === 'dispersed') cautions.push('분산 수요에서는 우회·공차 위험');
      }

      if (option.id === 'voucher') {
        if (settings.demand === 'low') applyRule('R-VO-01', '매우 적은 수요에 건별 지원 가능');
        if (settings.demand === 'medium') applyRule('R-VO-02', '일부 개별수요 보완 가능');
        if (settings.pattern === 'dispersed') applyRule('R-VO-03', '개별 목적지 대응');
        if (settings.vehicles <= 2) applyRule('R-VO-04', '전용차량이 적을 때 대안');
        cautions.push('보조금 단가·이용 한도·업계 수용성 검증 필요');
      }

      if (option.id === 'visit') {
        if (settings.serviceMode === 'visit') applyRule('R-VI-01', '방문 제공이 가능한 서비스');
        if (settings.serviceMode === 'mixed') applyRule('R-VI-02', '이동형·방문형 서비스를 먼저 분리할 필요');
        if (settings.digital === 'low') applyRule('R-VI-03', '앱 호출 없이 복지 연계 가능');
        if (settings.wheelchair) applyRule('R-VI-04', '이동 자체가 어려운 대상의 대안');
        if (settings.serviceMode === 'travel') cautions.push('이동이 필수인 서비스에는 단독 대안이 아님');
        cautions.push('방문 인력·수용량·서비스 적격성 확인 필요');
      }

      if (settings.wheelchair) {
        cautions.push('휠체어 탑승 가능 차량·승하차 지원을 별도 확인');
        if (option.id === 'voucher') applyRule('R-VO-05');
      }

      if (areaSignal) {
        const areaPrefix = `${areaSignal.dong}:`;
        if (option.id === 'realtime') {
          if (areaSignal.busSupplyBelowCity && settings.pattern === 'dispersed') applyRule('R-RT-07', `${areaPrefix} 고양시보다 노선 공급이 낮은 분산 수요`);
          if (areaSignal.facilityDistanceAboveCity) applyRule('R-RT-08', `${areaPrefix} 의료시설 거리가 도시 기준보다 김`);
        }
        if (option.id === 'phone') {
          if (areaSignal.agingAboveCity) applyRule('R-PH-06', `${areaPrefix} 고령화율이 도시 기준보다 높음`);
          if (areaSignal.busSupplyBelowCity) applyRule('R-PH-07', `${areaPrefix} 노선 공급이 도시 기준보다 낮음`);
        }
        if (option.id === 'fixed') {
          if (areaSignal.busSupplyBelowCity && settings.pattern === 'concentrated') applyRule('R-FX-05', `${areaPrefix} 노선 공급 부족과 집중 수요 가정`);
          if (areaSignal.agingAboveCity) applyRule('R-FX-06', `${areaPrefix} 고령화율이 도시 기준보다 높음`);
        }
        if (option.id === 'voucher' && areaSignal.facilityDistanceAboveCity) {
          applyRule('R-VO-06', `${areaPrefix} 의료시설 거리가 도시 기준보다 김`);
        }
        if (option.id === 'visit') {
          if (areaSignal.agingAboveCity) applyRule('R-VI-05', `${areaPrefix} 고령수요 대리신호가 도시 기준보다 높음`);
          if (areaSignal.facilityDistanceAboveCity && settings.serviceMode !== 'travel') applyRule('R-VI-06', `${areaPrefix} 원거리 이동을 방문형으로 대체할 가설`);
        }
      }

      const bounded = clamp(score, 0, 10);
      return {
        ...option,
        score: bounded,
        fit: bounded >= 7 ? '높음' : bounded >= 4 ? '보통' : '낮음',
        appliedRuleIds,
        reasons,
        cautions,
      };
    });

    const ordered = [...scored].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
    const topScore = ordered[0]?.score ?? 0;
    const firstReviewOptions = ordered.filter((option) => option.score === topScore);
    return {
      settings,
      options: ordered,
      firstReview: firstReviewOptions[0],
      firstReviewOptions,
      isTie: firstReviewOptions.length > 1,
    };
  }

  return { OPTIONS, RULE_META, RULE_LEDGER, scoreOptions };
});
