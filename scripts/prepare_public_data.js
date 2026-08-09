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
  releasedAt: '2026-08-10',
  repository: 'https://github.com/Suya020504/goyang-care-policy-dashboard',
  boundaryPolicy: 'admdongkor 2026-04-01 경계만 공개 재배포',
};

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
