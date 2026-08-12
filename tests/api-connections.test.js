'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto').webcrypto;
const API = require('../src/api-connections.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
}

test('정류장 CSV에서 인용부호와 마을버스 노선번호를 파싱한다', () => {
  const csv = [
    '표준아이디(ID),정류소번호,정류소명,경유노선,위도,경도',
    '1,100,풍산역," 070A(마을), 070B(마을), 99(시내)",37.1,126.1',
    '2,101,원당역," 043(원당역)(마을), 11(시내), 15-1(지축)(마을)",37.2,126.2',
    '3,102,다른역,"070A(마을)",37.3,126.3',
  ].join('\r\n');
  const result = API.analyzeBusStopCsv(csv);
  assert.equal(result.rowCount, 3);
  assert.equal(result.routeColumn, '경유노선');
  assert.deepEqual(result.villageRoutes, ['15-1(지축)', '043(원당역)', '070A', '070B']);
});

test('마을 토큰 앞의 정류장명 등 비노선 문자열은 제외한다', () => {
  assert.deepEqual(API.extractVillageRoutes('원흥주유소(마을), N003(마을), 091A(마을)'), ['N003', '091A']);
});

test('키는 허용 공급자만 sessionStorage 한 항목에 저장한다', () => {
  const storage = memoryStorage();
  const saved = API.safeSessionWrite(storage, { tago: 'session-only-key', unknown: 'discard-me', gyeonggi: '' });
  assert.equal(saved, true);
  assert.deepEqual(API.safeSessionRead(storage), { tago: 'session-only-key' });
  assert.deepEqual(Object.keys(storage.dump()), [API.STORAGE_KEY]);
});

test('관리자 진입은 admin=1인 URL에서만 표시 대상으로 판정한다', () => {
  assert.equal(API.isAdminLocation({ href: 'https://example.test/?admin=1' }), true);
  assert.equal(API.isAdminLocation({ href: 'https://example.test/?admin=0' }), false);
  assert.equal(API.isAdminLocation({ href: 'https://example.test/' }), false);
});

test('TAGO 응답에서 고양 도시코드와 노선목록을 추출한다', () => {
  const city = API.extractTogoCity({ response: { body: { items: { item: [{ citycode: '25', cityname: '대전광역시' }, { citycode: '31100', cityname: '고양시' }] } } } });
  assert.deepEqual(city, { code: '31100', name: '고양시' });
  const routes = API.extractTogoRoutes({ response: { body: { items: { item: [{ routeid: 'RID-1', routeno: '070A', routetp: '마을버스', startnodenm: '기점', endnodenm: '종점' }] } } } });
  assert.deepEqual(routes, [{ routeId: 'RID-1', routeNo: '070A', routeType: '마을버스', startNode: '기점', endNode: '종점' }]);
});

test('TAGO 검색 후보가 있어도 exact 노선번호가 없으면 증거 매칭에서 제외한다', () => {
  const fixture = { response: { body: { items: { item: [
    { routeid: 'RID-70A', routeno: '070A' },
    { routeid: 'RID-70B', routeno: '070B' },
  ] } } } };
  const noExact = API.selectExactTogoRoutes(fixture, '070');
  assert.deepEqual(noExact, []);
  assert.deepEqual(API.selectExactTogoRoutes(fixture, '070a').map((route) => route.routeId), ['RID-70A']);
  const classified = API.classifyTogoRouteResults([
    { localRoute: '070', queryRoute: '070', matches: noExact, unresolvedReason: 'TAGO exact 노선번호 일치 없음' },
  ]);
  assert.equal(classified.exactMatchedLocalRouteCount, 0);
  assert.deepEqual(classified.matchedRoutes, []);
  assert.deepEqual(classified.unresolvedLocalRoutes, [
    { localRoute: '070', queryRoute: '070', reason: 'TAGO exact 노선번호 일치 없음' },
  ]);
  assert.deepEqual(classified.collectionStatus, {
    complete: true,
    failedQueryCount: 0,
    rateLimitedQueryCount: 0,
    retryAfterSeconds: 0,
  });
});

test('프록시가 429 업무 오류를 반환하면 UI에 Retry-After를 포함해 실패 처리한다', async () => {
  const storage = memoryStorage();
  API.safeSessionWrite(storage, { tago: 'not-a-real-api-key' });
  const manager = API.createManager({
    storage,
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: (name) => name === 'Retry-After' ? '42' : null },
      json: async () => ({ ok: false, error: '요청 한도 초과', rateLimit: { scope: 'instance', retryAfter: 42 } }),
    }),
  });
  await assert.rejects(
    manager.proxy('tago', 'city-codes', { pageNo: '1', numOfRows: '10' }),
    (error) => error.status === 429 && error.retryAfter === 42 && /42초 후/.test(error.message),
  );
});

test('429로 실패한 노선은 부분수집 경계와 대기시간을 남기고 증거 집계에서 제외한다', () => {
  const classified = API.classifyTogoRouteResults([
    { localRoute: '070A', queryRoute: '070A', matches: [{ routeId: 'RID-1', routeNo: '070A' }] },
    { localRoute: '070B', queryRoute: '070B', matches: [], error: '요청 한도 초과', errorStatus: 429, retryAfter: 37 },
  ]);
  assert.equal(classified.exactMatchedLocalRouteCount, 1);
  assert.equal(classified.matchedRoutes.length, 1);
  assert.equal(classified.unresolvedLocalRoutes.length, 1);
  assert.deepEqual(classified.collectionStatus, {
    complete: false,
    failedQueryCount: 1,
    rateLimitedQueryCount: 1,
    retryAfterSeconds: 37,
  });
});

test('SHA-256은 브라우저 Web Crypto와 같은 16진수를 만든다', async () => {
  const bytes = new TextEncoder().encode('local csv only');
  const digest = await API.sha256Hex(bytes, crypto);
  assert.equal(digest, '76022d9a3aa3f0c9b34c79b1db37def61c4517c0e50a1ce760922a8a647b8fcc');
});
