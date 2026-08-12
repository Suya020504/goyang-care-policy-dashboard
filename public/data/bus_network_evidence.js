window.DDOL_BUS_NETWORK_EVIDENCE = Object.freeze({
  metadata: Object.freeze({
    schemaVersion: '1.1.0',
    checkedAt: '2026-08-13',
    analysisId: 'official_bus_headway_bms_crosscheck_v1',
    privacy: '노선번호 집계와 비식별 역사적 정류장 점만 공개하며 인증키·원본 식별정보를 포함하지 않음',
  }),
  headway: Object.freeze({
    localVillageRouteDenominator: 86,
    officialRouteNumberCandidates: 82,
    uniqueOfficialRows: 72,
    multipleOfficialRows: 10,
    unresolvedNoCandidate: 4,
    unresolvedRoutes: Object.freeze(['15-1(구파발)', '15-1(지축)', '15A', '15B']),
    sourceDate: '2024-12-31',
    officialRowCount: 132,
    officialUniqueRouteNumberCount: 123,
    interpretation: '공식 배차간격은 자유기술 계획값이며 실제 운행준수율·결행·정류장 체감대기시간이 아닙니다.',
  }),
  historicalBms: Object.freeze({
    sourceDate: '2023-09-26',
    linkedRoutes: 7,
    routeDenominator: 86,
    linkedRouteStopRows: 56,
    uniqueCoordinateLocations: 47,
    interpretation: '2023 BMS와 2025 정류장 표기의 보수적 역사 교차검증이며 현행 노선형상·방향·운행품질이 아닙니다.',
  }),
  sources: Object.freeze([
    Object.freeze({ title: '고양시 버스노선별 배차간격정보', url: 'https://www.data.go.kr/data/3079226/fileData.do' }),
    Object.freeze({ title: '경기도 BMS 노선 정보 검증', url: 'https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=1MQHOF2F4XO6DQMRHXOA34337309&infSeq=1' }),
    Object.freeze({ title: '경기도 BMS 노선 경유정류소', url: 'https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=TEXYY9BODHAA8QZ1ZZG233176356&infSeq=1' }),
  ]),
});
