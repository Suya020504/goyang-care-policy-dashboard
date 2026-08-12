const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'public', 'data', 'data.js');
const prefix = 'window.DDOL_V2_DATA = ';
const source = fs.readFileSync(dataPath, 'utf8').trim();

if (!source.startsWith(prefix) || !source.endsWith(';')) {
  throw new Error('data.js 형식을 확인하세요.');
}

const payload = JSON.parse(source.slice(prefix.length, -1));
payload.metadata.publicRelease = {
  releasedAt: '2026-08-13',
  repository: 'https://github.com/Suya020504/goyang-care-policy-dashboard',
  boundaryPolicy: 'admdongkor 2026-04-01 경계만 공개 재배포',
};

payload.city.drtVehicleSnapshot = 14;
payload.city.drtVehicleSnapshotDate = '2026-08-13';
payload.city.drtVehicleCurrentStatus = 'official-live-list-verified';

const ddokbusContext = payload.officialContext.find((item) => item.id === 'ddokbus-operating-context');
if (!ddokbusContext) throw new Error('고양 똑버스 공식 맥락 카드가 없습니다.');
ddokbusContext.value = '4개 운영권역 · 14대(2026-08-13 확인)';
ddokbusContext.asOf = '경기교통공사 운영현황 2026-08-13 확인';
ddokbusContext.caution = '운영권역은 행정동과 같은 단위가 아니다. 14대는 2026-08-13 공개 목록의 시점값이며 실제 배차·이용성과를 뜻하지 않는다.';
ddokbusContext.metrics.vehicleSnapshot = {
  value: 14,
  asOf: '2026-08-13',
  currentStatus: 'official-live-list-verified',
  sourceId: 'SRC-GTRANS-DDOKBUS-20260813',
};
ddokbusContext.sourceIds = ['SRC-GOYANG-DDOKBUS-GUIDE', 'SRC-GTRANS-DDOKBUS-20260813'];
ddokbusContext.sourceUrls = [
  'https://www.goyang.go.kr/www/www03/www03_5/www03_5_4/www03_5_4_tab7.jsp',
  'https://www.gtrans.or.kr/web/lay1/program/S1T499C698/ddock_bus/list.do',
];

payload.sources = payload.sources.filter((item) => item.id !== 'SRC-GTRANS-DDOKBUS-20260813');
payload.sources.push({
  id: 'SRC-GTRANS-DDOKBUS-20260813',
  kind: 'official',
  organization: '경기교통공사',
  title: '똑버스 운영현황',
  publishedAt: '상시 갱신 목록',
  checkedAt: '2026-08-13',
  url: 'https://www.gtrans.or.kr/web/lay1/program/S1T499C698/ddock_bus/list.do',
});

const analysisBoundary = payload.sourceManifest.find((item) => item.sourceId === 'admdongkor_boundary');
if (!analysisBoundary) throw new Error('admdongkor source manifest가 없습니다.');
analysisBoundary.license = 'CC BY 4.0(가공부분) + SGIS 공공누리 제1유형(원천)';
analysisBoundary.sourceUrl = 'https://github.com/vuski/admdongkor/tree/master/ver20260401';

const excludedBoundary = payload.sourceManifest.find(
  (item) => item.sourceId === 'goyang_official_boundary_reference',
);
if (excludedBoundary) {
  excludedBoundary.status = 'excluded_from_public_release';
  excludedBoundary.license = 'not_redistributed';
}

fs.writeFileSync(
  dataPath,
  `${prefix}${JSON.stringify(payload)};\n`,
  'utf8',
);

console.log(`WROTE ${dataPath}`);
