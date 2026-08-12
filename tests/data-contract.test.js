const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');


const DATA_PATH = path.join(__dirname, '..', 'public', 'data', 'data.js');
const BOUNDARY_PATH = path.join(__dirname, '..', 'public', 'data', 'boundaries.js');

function loadData() {
  const source = fs.readFileSync(DATA_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: DATA_PATH });
  assert.ok(sandbox.window.DDOL_V2_DATA, 'window.DDOL_V2_DATA가 생성되어야 합니다.');
  return JSON.parse(JSON.stringify(sandbox.window.DDOL_V2_DATA));
}

function loadBoundaries() {
  const source = fs.readFileSync(BOUNDARY_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: BOUNDARY_PATH });
  assert.ok(sandbox.window.DDOL_V2_BOUNDARIES, 'window.DDOL_V2_BOUNDARIES가 생성되어야 합니다.');
  return JSON.parse(JSON.stringify(sandbox.window.DDOL_V2_BOUNDARIES));
}

function collectEntries(value, currentPath = [], entries = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectEntries(item, [...currentPath, String(index)], entries));
    return entries;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      const childPath = [...currentPath, key];
      entries.push({ key, path: childPath.join('.'), value: child });
      collectEntries(child, childPath, entries);
    });
  }
  return entries;
}

const data = loadData();
const boundaries = loadBoundaries();

const EXPECTED_AREA_FIELDS = [
  'code',
  'district',
  'dong',
  'population',
  'elderly65',
  'single70',
  'agingRate',
  'demandIndex',
  'stops',
  'routesPerStop',
  'routeMentions',
  'nearestFacilityM',
  'facilityP90M',
  'currentDrt',
  'candidate',
].sort();

const EXPECTED_CANDIDATES = [
  {
    code: '4128761000', district: '고양시 일산서구', dong: '가좌동', population: 18020,
    elderly65: 3490, single70: 451, agingRate: 0.1936736958934517, stops: 78,
    routesPerStop: 1.8974358974358974, nearestFacilityM: 2160.780363381229,
    cag: 0.27416592285572716, dssReproduced: 0.8266009301288514, posterDss: 0.98,
    posterRank: 4,
  },
  {
    code: '4128159000', district: '고양시 덕양구', dong: '고양동', population: 26927,
    elderly65: 7002, single70: 1436, agingRate: 0.26003639469677275, stops: 132,
    routesPerStop: 4.613636363636363, nearestFacilityM: 1438.5542854295577,
    cag: 0.8058970767150847, dssReproduced: 0.7371819434081454, posterDss: 1,
    posterRank: 2,
  },
  {
    code: '4128160000', district: '고양시 덕양구', dong: '관산동', population: 32905,
    elderly65: 9764, single70: 1957, agingRate: 0.296733019297979, stops: 129,
    routesPerStop: 4.612403100775194, nearestFacilityM: 834.2584241105883,
    cag: 1.2274261933978212, dssReproduced: 0.7098788082240636, posterDss: 0.96,
    posterRank: 5,
  },
  {
    code: '4128161000', district: '고양시 덕양구', dong: '능곡동', population: 16886,
    elderly65: 3662, single70: 538, agingRate: 0.21686604287575506, stops: 55,
    routesPerStop: 2.890909090909091, nearestFacilityM: 1268.7646315385791,
    cag: 0.23502891344290366, dssReproduced: 0.633207092490031, posterDss: 0.76,
    posterRank: 7,
  },
  {
    code: '4128758000', district: '고양시 일산서구', dong: '송포동', population: 19827,
    elderly65: 3604, single70: 414, agingRate: 0.1817723306602108, stops: 35,
    routesPerStop: 3.4, nearestFacilityM: 1437.3604284129906, cag: 0.0656085006590319,
    dssReproduced: 0.6020022615965129, posterDss: 0.67, posterRank: 9,
  },
  {
    code: '4128151000', district: '고양시 덕양구', dong: '주교동', population: 10113,
    elderly65: 2853, single70: 672, agingRate: 0.28211213289824977, stops: 59,
    routesPerStop: 2.0847457627118646, nearestFacilityM: 801.3816390718099,
    cag: 0.7489773417793479, dssReproduced: 0.7263358025881106, posterDss: 0.93,
    posterRank: 6,
  },
  {
    code: '4128163000', district: '고양시 덕양구', dong: '행주동', population: 11690,
    elderly65: 3243, single70: 746, agingRate: 0.27741659538066726, stops: 40,
    routesPerStop: 3.05, nearestFacilityM: 1358.4192868361513, cag: 0.7904260084118929,
    dssReproduced: 0.7260478729608268, posterDss: 1, posterRank: 3,
  },
  {
    code: '4128156000', district: '고양시 덕양구', dong: '효자동', population: 26307,
    elderly65: 3233, single70: 771, agingRate: 0.12289504694567986, stops: 53,
    routesPerStop: 3.339622641509434, nearestFacilityM: 4152.763786508891,
    cag: -0.3803880881701609, dssReproduced: 0.7994321316703027, posterDss: 0.75,
    posterRank: 8,
  },
];

test('오프라인 브라우저 전역과 v2 최상위 스키마를 제공한다', () => {
  assert.deepEqual(
    Object.keys(data).sort(),
    [
      'metadata', 'city', 'areas', 'candidates', 'claimSummary', 'claims',
      'candidateComparisons', 'rankComparisons', 'sensitivity', 'localMoran',
      'modelComparison', 'sourceManifest', 'officialContext', 'sources',
    ].sort(),
  );
  assert.equal(data.metadata.schemaVersion, '2.0.0');
  assert.match(data.metadata.generatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(data.metadata.rankingPolicy, /확정값이 아니다/);
  assert.match(data.metadata.collectionOrderPolicy, /가나다순/);
  assert.equal(data.metadata.buildInputs.length, 9);
  assert.match(data.metadata.coordinatePolicy, /boundaries\.js/);
  const baseline = data.metadata.buildInputs.find((input) => input.id === 'v1-dashboard-baseline');
  assert.ok(baseline);
  assert.equal(baseline.bytes, 30224);
  assert.match(baseline.sha256, /^[A-F0-9]{64}$/);
});

test('44개 행정동의 코드와 동명이 고유하고 area에는 순위·좌표가 없다', () => {
  assert.equal(data.areas.length, 44);
  assert.equal(new Set(data.areas.map((area) => area.code)).size, 44);
  assert.equal(new Set(data.areas.map((area) => area.dong)).size, 44);
  data.areas.forEach((area) => {
    assert.deepEqual(Object.keys(area).sort(), EXPECTED_AREA_FIELDS);
    assert.equal(Object.keys(area).some((key) => /rank/i.test(key)), false);
    assert.equal(Object.keys(area).some((key) => /centroid|latitude|longitude|coordinate/i.test(key)), false);
  });
});

test('도시 기준 합계와 DRT 시점 표기가 정확하다', () => {
  assert.deepEqual(
    {
      areaCount: data.city.areaCount,
      population: data.city.population,
      elderly65: data.city.elderly65,
      single70: data.city.single70,
      facilities: data.city.facilities,
      medicalFacilities: data.city.medicalFacilities,
      pharmacies: data.city.pharmacies,
      busStopsInBoundary: data.city.busStopsInBoundary,
      routeMentions: data.city.routeMentions,
      candidateCount: data.city.candidateCount,
      analysisDrtAdministrativeDongs: data.city.analysisDrtAdministrativeDongs,
      officialDrtServiceZones: data.city.officialDrtServiceZones,
      drtVehicleSnapshot: data.city.drtVehicleSnapshot,
    },
    {
      areaCount: 44,
      population: 1057438,
      elderly65: 204878,
      single70: 35295,
      facilities: 1893,
      medicalFacilities: 1397,
      pharmacies: 496,
      busStopsInBoundary: 2095,
      routeMentions: 7902,
      candidateCount: 8,
      analysisDrtAdministrativeDongs: 3,
      officialDrtServiceZones: 4,
      drtVehicleSnapshot: 14,
    },
  );
  assert.equal(data.city.drtVehicleSnapshotDate, '2026-08-13');
  assert.equal(data.city.drtVehicleCurrentStatus, 'official-live-list-verified');
  assert.ok(Math.abs(data.city.nearestFacilityMeanM - 1307.06340934404) < 1e-9);
  assert.equal(data.city.nearestFacilityAggregation, '100m 격자 26,595개 가중평균');
  assert.equal(data.areas.reduce((sum, area) => sum + area.population, 0), data.city.population);
  assert.equal(data.areas.reduce((sum, area) => sum + area.stops, 0), data.city.busStopsInBoundary);
});

test('후보 8개는 가나다순이며 모든 핵심 값이 재현표와 정확히 일치한다', () => {
  assert.deepEqual(data.candidates, EXPECTED_CANDIDATES);
  assert.deepEqual(data.candidates.map((candidate) => candidate.dong), [
    '가좌동', '고양동', '관산동', '능곡동', '송포동', '주교동', '행주동', '효자동',
  ]);
});

test('29개 주장 상태는 확인 7·조건부 9·수정 13이다', () => {
  assert.equal(data.claims.length, 29);
  assert.deepEqual(data.claimSummary, {
    confirmed: 7,
    conditional: 9,
    correction: 13,
    total: 29,
  });
  const counted = data.claims.reduce((acc, claim) => {
    acc[claim.claimStatus] = (acc[claim.claimStatus] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counted, { confirmed: 7, conditional: 9, correction: 13 });
});

test('후보 포스터-재현 비교와 순위 비교는 확정 순위가 아닌 비교 필드로 분리된다', () => {
  assert.equal(data.candidateComparisons.length, 8);
  assert.deepEqual(data.candidateComparisons.map((row) => row.dong), [
    '가좌동', '고양동', '관산동', '능곡동', '송포동', '주교동', '행주동', '효자동',
  ]);
  const haengju = data.candidateComparisons.find((row) => row.dong === '행주동');
  assert.equal(haengju.reproducedRoutesPerStop, 3.05);
  assert.equal(haengju.routesMatchHalfEven1dp, true);
  assert.equal(haengju.routesMatchHalfUp1dp, false);
  assert.equal(data.rankComparisons.length, 11);
  assert.deepEqual(
    data.rankComparisons.find((row) => row.dong === '고봉동'),
    {
      dong: '고봉동', group: '현행 DRT 3동', posterRank: 1,
      reproducedProxyRank: 1, difference: 0, status: '일치',
    },
  );
  assert.equal(data.rankComparisons.some((row) => Object.hasOwn(row, 'rank')), false);
});

test('민감도 11개 시나리오의 상위 8 집합 Jaccard 최솟값은 0.60이다', () => {
  assert.equal(data.sensitivity.length, 11);
  assert.equal(Math.min(...data.sensitivity.map((row) => row.jaccard)), 0.6);
  data.sensitivity.forEach((row) => {
    assert.equal(row.top8Dongs.length, 8);
    assert.equal(new Set(row.top8Dongs).size, 8);
    assert.deepEqual(row.top8Dongs, [...row.top8Dongs].sort());
  });
  const minimum = data.sensitivity.find((row) => row.scenarioId === 'demand_60_25_15');
  assert.equal(minimum.jaccard, 0.6);
});

test('Local Moran은 관산동 HH와 BH q≈0.0403을 보존한다', () => {
  assert.equal(data.localMoran.length, 44);
  const gwansan = data.localMoran.find((row) => row.dong === '관산동');
  assert.equal(gwansan.quadrant, 'HH');
  assert.equal(gwansan.pRaw, 0.0048);
  assert.ok(Math.abs(gwansan.qFdr - 0.04033333333333333) < 1e-15);
  assert.equal(gwansan.significantFdr05, true);
});

test('모델 비교와 원자료 manifest를 완전하게 제공한다', () => {
  assert.deepEqual(data.modelComparison.map((row) => row.model), [
    'B1_demand_only', 'B2_nearest_facility', 'B3_bus_inefficiency', 'poster_proxy_v1',
  ]);
  assert.equal(data.sourceManifest.length, 9);
  assert.equal(new Set(data.sourceManifest.map((row) => row.sourceId)).size, 9);
  const population = data.sourceManifest.find((row) => row.sourceId === 'population');
  assert.equal(population.bytes, 2563714);
  assert.equal(population.sha256, '4D1530F251B312CE6564BA5676093B1043057F46A0FE2A58CF2756AFC530DA7B');
});

test('공식 맥락 5개가 정의·시점·출처 제한을 함께 보존한다', () => {
  assert.equal(data.officialContext.length, 5);
  assert.equal(data.sources.length, 8);
  const sourceIds = new Set(data.sources.map((source) => source.id));
  assert.ok(sourceIds.has('SRC-GTRANS-DDOKBUS-20260813'));
  data.officialContext.forEach((card) => {
    assert.ok(card.sourceIds.every((sourceId) => sourceIds.has(sourceId)));
    assert.ok(card.sourceUrls.every((url) => url.startsWith('https://')));
  });

  const estimate = data.officialContext.find((card) => card.id === 'care-priority-estimate');
  assert.equal(estimate.value, '약 2.9만 명');
  assert.match(estimate.definition, /추정치/);
  assert.match(estimate.caution, /실이용자 수/);

  const services = data.officialContext.find((card) => card.id === 'service-catalog');
  assert.equal(services.value, '62개 = 기존 57 + 특화 5');
  assert.match(services.caution, /물리적 거점/);

  const survey = data.officialContext.find((card) => card.id === 'screened-survey-population');
  assert.equal(survey.value, '1,972명');
  assert.match(survey.caution, /144명/);
  assert.match(survey.caution, /1,359명/);
  assert.match(survey.caution, /469명/);
  assert.equal(survey.primarySourceId, 'SRC-O04');

  const expansion = data.officialContext.find((card) => card.id === 'eligibility-expansion');
  assert.equal(expansion.value, '2026-07-20');
  assert.match(expansion.definition, /65세 미만 중증 장애인/);
  assert.match(expansion.caution, /모든 65세 미만 장애인을 뜻하지 않/);

  const ddokbus = data.officialContext.find((card) => card.id === 'ddokbus-operating-context');
  assert.equal(ddokbus.value, '4개 운영권역 · 14대(2026-08-13 확인)');
  assert.deepEqual(ddokbus.metrics.serviceZones.names, ['식사', '고봉', '덕은', '향동']);
  assert.equal(ddokbus.metrics.vehicleSnapshot.value, 14);
  assert.equal(ddokbus.metrics.vehicleSnapshot.asOf, '2026-08-13');
  assert.equal(ddokbus.metrics.vehicleSnapshot.currentStatus, 'official-live-list-verified');
});

test('공개 GIS 경계는 분석 경계와 같고 44개 행정동에 1:1 연결된다', () => {
  assert.equal(boundaries.metadata.featureCount, 44);
  assert.equal(boundaries.features.length, 44);
  assert.match(boundaries.metadata.sourceCrs, /CRS84/);
  assert.equal(boundaries.metadata.displayOnly, false);
  assert.match(boundaries.metadata.licenseStatus, /CC BY 4\.0/);
  assert.match(boundaries.metadata.licenseStatus, /공공누리 제1유형/);
  assert.match(boundaries.metadata.sourceSha256, /^[A-F0-9]{64}$/);
  const boundaryCodes = boundaries.features.map((feature) => feature.code).sort();
  const areaCodes = data.areas.map((area) => area.code).sort();
  assert.deepEqual(boundaryCodes, areaCodes);
  assert.equal(new Set(boundaries.features.map((feature) => feature.dong)).size, 44);
  assert.ok(boundaries.features.every((feature) => /^M[0-9.,LZ-]+$/.test(feature.path)));
  assert.ok(boundaries.features.every((feature) => (
    Array.isArray(feature.bbox)
    && feature.bbox.length === 4
    && feature.bbox.every(Number.isFinite)
    && feature.bbox[0] <= feature.bbox[2]
    && feature.bbox[1] <= feature.bbox[3]
  )));
  assert.match(boundaries.metadata.pointLayerNotice, /고양온돌 대상자·62개 서비스 거점이 아님/);
});

test('GIS 공급점은 제출 분석 범위의 익명 화면좌표만 제공한다', () => {
  assert.deepEqual(
    {
      bus: boundaries.layers.busStops.count,
      medical: boundaries.layers.medicalFacilities.count,
      pharmacy: boundaries.layers.pharmacies.count,
    },
    { bus: 2095, medical: 1397, pharmacy: 495 },
  );
  assert.equal(boundaries.layers.busStops.points.length, 2095);
  assert.equal(boundaries.layers.medicalFacilities.points.length, 1397);
  assert.equal(boundaries.layers.pharmacies.points.length, 495);
  const areaCodes = new Set(data.areas.map((area) => area.code));
  const validatePoint = (point, expectedLength) => {
    assert.equal(point.length, expectedLength);
    assert.ok(Number.isFinite(point[0]) && point[0] >= 0 && point[0] <= 900);
    assert.ok(Number.isFinite(point[1]) && point[1] >= 0 && point[1] <= 660);
    assert.ok(areaCodes.has(String(point[2])));
  };
  boundaries.layers.busStops.points.forEach((point) => {
    validatePoint(point, 4);
    assert.ok(Number.isInteger(point[3]) && point[3] >= 0);
  });
  boundaries.layers.medicalFacilities.points.forEach((point) => validatePoint(point, 3));
  boundaries.layers.pharmacies.points.forEach((point) => validatePoint(point, 3));
  Object.values(boundaries.layers).forEach((layer) => {
    assert.match(layer.sourceSha256, /^[A-F0-9]{64}$/);
    assert.equal(layer.displayInsideCount, layer.count);
    assert.equal(layer.displayClippedCount, 0);
  });
  const serialized = JSON.stringify(boundaries.layers);
  assert.equal(/facility_name|stop_name|address|longitude|latitude|person/i.test(serialized), false);
});

test('개인정보·좌표·일반 확정 순위 키를 데이터 계약에서 배제한다', () => {
  const entries = collectEntries(data);
  const coordinateKeys = entries.filter(({ key }) => (
    /^(?:lat|lng|latitude|longitude|x|y|geometry|coordinates?|centroid.*)$/i.test(key)
  ));
  assert.deepEqual(coordinateKeys, []);

  const piiKeys = entries.filter(({ key }) => (
    /^(?:address|email|phone|telephone|mobile|personName|personId|fullName)$/i.test(key)
  ));
  assert.deepEqual(piiKeys, []);

  const rankEntries = entries.filter(({ key }) => (
    /^(?:rank|rankGlobal|rankEligible|rank_global|rank_eligible|posterRank|reproducedProxyRank)$/i.test(key)
  ));
  rankEntries.forEach(({ key, path: keyPath }) => {
    const allowed = (
      (/^candidates\.\d+\.posterRank$/.test(keyPath) && key === 'posterRank')
      || (/^rankComparisons\.\d+\.(?:posterRank|reproducedProxyRank)$/.test(keyPath))
    );
    assert.equal(allowed, true, `허용되지 않은 순위 키 경로: ${keyPath}`);
  });

  const serialized = JSON.stringify(data);
  assert.equal(/(?:[A-Za-z]:[\\/](?:Users|Documents)[\\/]|\/(?:home|Users)\/)/.test(serialized), false);
  assert.equal(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(serialized), false);
  assert.equal(/\b0\d{1,2}[- ]\d{3,4}[- ]\d{4}\b/.test(serialized), false);
});
