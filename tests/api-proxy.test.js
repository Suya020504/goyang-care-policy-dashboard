'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const PROXY = require('../api/public-data.js')._test;
const handler = require('../api/public-data.js');

function mockResponse() {
  return {
    headers: {},
    statusCode: 0,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('TAGO allowlist URL을 만들고 API 키는 쿼리 한 곳에만 둔다', () => {
  const target = PROXY.createUpstreamRequest({
    provider: 'tago',
    operation: 'route-list',
    apiKey: 'not-a-real-key',
    params: { cityCode: '31100', routeNo: '070A', pageNo: '1', numOfRows: '100' },
  });
  assert.equal(target.url.hostname, 'apis.data.go.kr');
  assert.equal(target.url.pathname, '/1613000/BusRouteInfoInqireService/getRouteNoList');
  assert.equal(target.url.searchParams.get('serviceKey'), 'not-a-real-key');
  assert.equal(target.url.searchParams.get('_type'), 'json');
  assert.equal(target.url.searchParams.get('cityCode'), '31100');
});

test('경기도와 주소 API도 고정된 호스트·경로만 허용한다', () => {
  const gyeonggi = PROXY.createUpstreamRequest({ provider: 'gyeonggi', operation: 'route-search', apiKey: 'example-only', params: { keyword: '070A' } });
  assert.equal(gyeonggi.url.href, 'https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteListv2?serviceKey=example-only&format=json&keyword=070A');
  const juso = PROXY.createUpstreamRequest({ provider: 'juso-search', operation: 'address-search', apiKey: 'example-only', params: { currentPage: '1', countPerPage: '1', keyword: '고양시청' } });
  assert.equal(juso.url.hostname, 'business.juso.go.kr');
  assert.equal(juso.url.pathname, '/addrlink/addrLinkApi.do');
  assert.equal(juso.url.searchParams.get('confmKey'), 'example-only');
});

test('미허용 공급자·작업·파라미터와 URL 주입값을 거부한다', () => {
  assert.throws(() => PROXY.createUpstreamRequest({ provider: 'custom', operation: 'fetch', apiKey: 'example-only', params: {} }), /NOT_ALLOWED/);
  assert.throws(() => PROXY.createUpstreamRequest({ provider: 'tago', operation: 'custom', apiKey: 'example-only', params: {} }), /NOT_ALLOWED/);
  assert.throws(() => PROXY.createUpstreamRequest({ provider: 'tago', operation: 'city-codes', apiKey: 'example-only', params: { url: 'https://example.invalid' } }), /UNEXPECTED_PARAMETER/);
  assert.throws(() => PROXY.createUpstreamRequest({ provider: 'tago', operation: 'route-list', apiKey: 'example-only', params: { cityCode: '../admin', routeNo: '1' } }), /INVALID_PARAMETER/);
});

test('상위 API 응답에 섞인 민감 필드는 재귀적으로 제거한다', () => {
  const sanitized = PROXY.sanitizePayload({
    result: { routeNo: '070A', serviceKey: 'must-go', nested: [{ token: 'must-go', routeId: 'RID-1' }] },
    confmKey: 'must-go',
  });
  assert.deepEqual(sanitized, { result: { routeNo: '070A', nested: [{ routeId: 'RID-1' }] } });
});

test('HTTP 200 JSON 업무 오류를 non-2xx와 ok false로 변환한다', async () => {
  const originalFetch = global.fetch;
  PROXY.resetRateLimitForTests();
  global.fetch = async () => new Response(JSON.stringify({
    response: { header: { resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED' } },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = mockResponse();
    await handler({
      method: 'POST',
      headers: { host: 'example.test', origin: 'https://example.test', 'x-forwarded-for': '192.0.2.10' },
      body: { provider: 'tago', operation: 'city-codes', apiKey: 'not-a-real-api-key', params: { pageNo: '1', numOfRows: '10' } },
    }, response);
    assert.equal(response.statusCode, 401);
    assert.equal(response.payload.ok, false);
    assert.equal(response.payload.upstreamStatus, 200);
    assert.equal(response.payload.upstreamError.code, '30');
  } finally {
    global.fetch = originalFetch;
  }
});

test('XML과 JSON 문자열에 반사된 제출 키의 원문·URI 인코딩 표현을 제거한다', async () => {
  const key = 'not/a+real=key';
  const encoded = encodeURIComponent(key);
  const xml = `<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><errMsg>invalid ${key} ${encoded}</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>`;
  const xmlData = await PROXY.readUpstreamResponse(new Response(xml), [key]);
  assert.equal(xmlData.includes(key), false);
  assert.equal(xmlData.includes(encoded), false);
  assert.match(xmlData, /\[REDACTED\]/);
  assert.deepEqual(PROXY.detectBusinessError(xmlData), { code: '30', message: 'invalid [REDACTED] [REDACTED]' });

  const jsonData = await PROXY.readUpstreamResponse(new Response(JSON.stringify({ nested: { reflected: `${key} ${encoded}` } })), [key]);
  assert.equal(jsonData.nested.reflected, '[REDACTED] [REDACTED]');
});

test('동일 Origin과 Host만 허용하고 정상 87회 수집은 통과하되 인스턴스 121번째 요청은 제한한다', () => {
  assert.equal(PROXY.isSameOriginRequest({ headers: { origin: 'https://demo.example', host: 'demo.example' } }), true);
  assert.equal(PROXY.isSameOriginRequest({ headers: { origin: 'https://other.example', host: 'demo.example' } }), false);
  assert.equal(PROXY.isSameOriginRequest({ headers: { host: 'demo.example' } }), false);

  PROXY.resetRateLimitForTests();
  const request = { headers: { 'x-forwarded-for': '192.0.2.20' } };
  let result;
  for (let count = 0; count < 87; count += 1) result = PROXY.consumeRateLimit(request, 1_000);
  assert.equal(result.allowed, true);
  for (let count = 87; count < 120; count += 1) result = PROXY.consumeRateLimit(request, 1_000);
  assert.equal(result.allowed, true);
  result = PROXY.consumeRateLimit(request, 1_000);
  assert.equal(result.allowed, false);
  assert.equal(result.retryAfter, 60);
  assert.deepEqual(PROXY.RATE_LIMIT_POLICY, { windowMs: 60_000, maxRequests: 120, scope: 'instance' });
  assert.equal(PROXY.consumeRateLimit(request, 61_000).allowed, true);
});

test('프록시는 동일 Origin이 아니면 403, 인스턴스 한도 초과면 Retry-After와 429를 반환한다', async () => {
  PROXY.resetRateLimitForTests();
  const crossOriginResponse = mockResponse();
  await handler({ method: 'POST', headers: { origin: 'https://other.example', host: 'demo.example' }, body: {} }, crossOriginResponse);
  assert.equal(crossOriginResponse.statusCode, 403);

  const request = {
    method: 'POST',
    headers: { origin: 'https://demo.example', host: 'demo.example', 'x-forwarded-for': '192.0.2.30' },
    body: {},
  };
  for (let count = 0; count < 120; count += 1) PROXY.consumeRateLimit(request, Date.now());
  const limitedResponse = mockResponse();
  await handler(request, limitedResponse);
  assert.equal(limitedResponse.statusCode, 429);
  assert.match(String(limitedResponse.headers['Retry-After']), /^\d+$/);
  assert.equal(limitedResponse.payload.rateLimit.scope, 'instance');
});
