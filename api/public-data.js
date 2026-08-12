'use strict';

const UPSTREAMS = Object.freeze({
  tago: Object.freeze({
    host: 'apis.data.go.kr',
    basePath: '/1613000/BusRouteInfoInqireService',
    keyParam: 'serviceKey',
    formatParams: Object.freeze({ _type: 'json' }),
    operations: Object.freeze({
      'city-codes': Object.freeze({ path: '/getCtyCodeList', params: ['pageNo', 'numOfRows'] }),
      'route-list': Object.freeze({ path: '/getRouteNoList', params: ['cityCode', 'routeNo', 'pageNo', 'numOfRows'] }),
      'route-info': Object.freeze({ path: '/getRouteInfoIem', params: ['cityCode', 'routeId'] }),
      'route-stops': Object.freeze({ path: '/getRouteAcctoThrghSttnList', params: ['cityCode', 'routeId', 'pageNo', 'numOfRows'] }),
    }),
  }),
  gyeonggi: Object.freeze({
    host: 'apis.data.go.kr',
    basePath: '/6410000/busrouteservice/v2',
    keyParam: 'serviceKey',
    formatParams: Object.freeze({ format: 'json' }),
    operations: Object.freeze({
      'route-search': Object.freeze({ path: '/getBusRouteListv2', params: ['keyword'] }),
      'route-info': Object.freeze({ path: '/getBusRouteInfoItemv2', params: ['routeId'] }),
      'route-stops': Object.freeze({ path: '/getBusRouteStationListv2', params: ['routeId'] }),
      'route-line': Object.freeze({ path: '/getBusRouteLineListv2', params: ['routeId'] }),
    }),
  }),
  'juso-search': Object.freeze({
    host: 'business.juso.go.kr',
    basePath: '/addrlink',
    keyParam: 'confmKey',
    formatParams: Object.freeze({ resultType: 'json' }),
    operations: Object.freeze({
      'address-search': Object.freeze({ path: '/addrLinkApi.do', params: ['currentPage', 'countPerPage', 'keyword', 'hstryYn', 'firstSort', 'addInfoYn'] }),
    }),
  }),
  'juso-coordinate': Object.freeze({
    host: 'business.juso.go.kr',
    basePath: '/addrlink',
    keyParam: 'confmKey',
    formatParams: Object.freeze({ resultType: 'json' }),
    operations: Object.freeze({
      coordinate: Object.freeze({ path: '/addrCoordApi.do', params: ['admCd', 'rnMgtSn', 'udrtYn', 'buldMnnm', 'buldSlno'] }),
    }),
  }),
});

const PARAM_RULES = Object.freeze({
  pageNo: Object.freeze({ pattern: /^\d{1,5}$/, max: 5 }),
  numOfRows: Object.freeze({ pattern: /^\d{1,4}$/, max: 4 }),
  cityCode: Object.freeze({ pattern: /^[A-Za-z0-9_-]{1,12}$/, max: 12 }),
  routeNo: Object.freeze({ pattern: /^[0-9A-Za-z가-힣\-\.\s]{0,40}$/, max: 40 }),
  routeId: Object.freeze({ pattern: /^[0-9A-Za-z_-]{1,40}$/, max: 40 }),
  keyword: Object.freeze({ pattern: /^[0-9A-Za-z가-힣\-\.\s]{1,80}$/, max: 80 }),
  currentPage: Object.freeze({ pattern: /^\d{1,5}$/, max: 5 }),
  countPerPage: Object.freeze({ pattern: /^\d{1,3}$/, max: 3 }),
  hstryYn: Object.freeze({ pattern: /^[YN]$/, max: 1 }),
  firstSort: Object.freeze({ pattern: /^(none|road|location)$/, max: 8 }),
  addInfoYn: Object.freeze({ pattern: /^[YN]$/, max: 1 }),
  admCd: Object.freeze({ pattern: /^\d{10}$/, max: 10 }),
  rnMgtSn: Object.freeze({ pattern: /^\d{12}$/, max: 12 }),
  udrtYn: Object.freeze({ pattern: /^[01]$/, max: 1 }),
  buldMnnm: Object.freeze({ pattern: /^\d{1,5}$/, max: 5 }),
  buldSlno: Object.freeze({ pattern: /^\d{0,5}$/, max: 5 }),
});

const SENSITIVE_FIELD = /^(apiKey|serviceKey|confmKey|authorization|token|secret)$/i;
const SUCCESS_CODES = new Set(['0', '00', '000', '0000', 'SUCCESS', 'NORMAL_CODE', 'INFO-000']);
const RATE_LIMIT_POLICY = Object.freeze({ windowMs: 60_000, maxRequests: 120, scope: 'instance' });
const rateLimitBuckets = new Map();

function setPrivateHeaders(response) {
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

function sendJson(response, statusCode, payload) {
  setPrivateHeaders(response);
  response.status(statusCode).json(payload);
}

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === 'object') return request.body;
  if (typeof request.body !== 'string' || request.body.length > 16_384) throw new Error('INVALID_BODY');
  return JSON.parse(request.body);
}

function normalizeKey(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.length > 512 || /[\r\n\0]/.test(trimmed)) throw new Error('INVALID_KEY');
  if (/%[0-9A-Fa-f]{2}/.test(trimmed)) {
    try { return decodeURIComponent(trimmed); } catch (_error) { return trimmed; }
  }
  return trimmed;
}

function sanitizeParams(input, allowedNames) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const unexpected = Object.keys(source).filter((key) => !allowedNames.includes(key));
  if (unexpected.length) throw new Error('UNEXPECTED_PARAMETER');
  const output = {};
  allowedNames.forEach((name) => {
    if (source[name] === undefined || source[name] === null || source[name] === '') return;
    const value = String(source[name]).trim();
    const rule = PARAM_RULES[name];
    if (!rule || value.length > rule.max || !rule.pattern.test(value)) throw new Error('INVALID_PARAMETER');
    output[name] = value;
  });
  return output;
}

function createUpstreamRequest(body) {
  const provider = String(body.provider || '');
  const operation = String(body.operation || '');
  const providerConfig = UPSTREAMS[provider];
  const operationConfig = providerConfig?.operations?.[operation];
  if (!providerConfig || !operationConfig) throw new Error('NOT_ALLOWED');

  const apiKey = normalizeKey(body.apiKey);
  const params = sanitizeParams(body.params, operationConfig.params);
  const url = new URL(`https://${providerConfig.host}${providerConfig.basePath}${operationConfig.path}`);
  url.searchParams.set(providerConfig.keyParam, apiKey);
  Object.entries(providerConfig.formatParams).forEach(([name, value]) => url.searchParams.set(name, value));
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));

  return { provider, operation, url };
}

function redactionVariants(values) {
  const variants = new Set();
  (Array.isArray(values) ? values : [values]).forEach((item) => {
    const value = String(item || '');
    if (!value) return;
    const encoded = encodeURIComponent(value);
    variants.add(value);
    variants.add(encoded);
    variants.add(encoded.replace(/%[0-9A-F]{2}/g, (part) => part.toLowerCase()));
    variants.add(encoded.replace(/%20/g, '+'));
  });
  return [...variants].filter(Boolean).sort((left, right) => right.length - left.length);
}

function redactString(value, sensitiveValues = []) {
  return redactionVariants(sensitiveValues).reduce(
    (output, secret) => output.split(secret).join('[REDACTED]'),
    String(value ?? ''),
  );
}

function sanitizePayload(value, depth = 0, sensitiveValues = []) {
  if (depth > 12) return null;
  if (typeof value === 'string') return redactString(value, sensitiveValues);
  if (Array.isArray(value)) return value.slice(0, 5_000).map((item) => sanitizePayload(item, depth + 1, sensitiveValues));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  Object.entries(value).forEach(([key, item]) => {
    if (!SENSITIVE_FIELD.test(key)) output[key] = sanitizePayload(item, depth + 1, sensitiveValues);
  });
  return output;
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .trim();
}

function normalizeBusinessCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isSuccessCode(value) {
  return SUCCESS_CODES.has(normalizeBusinessCode(value));
}

function isBenignMessage(value) {
  const message = String(value || '').trim();
  return !message || /^(정상|성공|success|normal(?: service)?\.?|ok)$/i.test(message);
}

function detectObjectBusinessError(value, depth = 0) {
  if (depth > 12 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = detectObjectBusinessError(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const entries = Object.entries(value);
  const findValue = (pattern) => entries.find(([key]) => pattern.test(key))?.[1];
  const code = findValue(/^(resultCode|errorCode|errCode|returnReasonCode)$/i);
  const message = findValue(/^(resultMsg|errorMessage|errMsg|returnAuthMsg)$/i);
  if (code !== undefined && !isSuccessCode(code)) {
    return { code: String(code), message: String(message || '공공 API가 업무 오류를 반환했습니다.') };
  }
  if (code === undefined && message !== undefined && !isBenignMessage(message)) {
    return { code: '', message: String(message) };
  }
  for (const item of Object.values(value)) {
    const found = detectObjectBusinessError(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function detectTextBusinessError(text) {
  const source = String(text || '');
  const tagValue = (names) => {
    const match = source.match(new RegExp(`<(?:[\\w.-]+:)?(?:${names})\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?(?:${names})>`, 'i'));
    return match ? decodeXmlText(match[1]) : undefined;
  };
  const code = tagValue('resultCode|errorCode|errCode|returnReasonCode');
  const message = tagValue('resultMsg|errorMessage|errMsg|returnAuthMsg');
  if (code !== undefined && !isSuccessCode(code)) return { code, message: message || '공공 API가 업무 오류를 반환했습니다.' };
  if (code === undefined && message !== undefined && !isBenignMessage(message)) return { code: '', message };
  return null;
}

function detectBusinessError(data) {
  return typeof data === 'string' ? detectTextBusinessError(data) : detectObjectBusinessError(data);
}

function businessErrorStatus(error) {
  const description = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  if (/(service.?key|api.?key|인증|승인|권한|unauthori[sz]ed|forbidden|not registered)/i.test(description)) return 401;
  if (/(quota|traffic|rate.?limit|too many|초과|제한)/i.test(description)) return 429;
  if (/(parameter|파라미터|invalid request|잘못된 요청)/i.test(description)) return 422;
  return 502;
}

function requestHeader(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function isSameOriginRequest(request) {
  const origin = requestHeader(request, 'origin').trim();
  const host = requestHeader(request, 'host').split(',', 1)[0].trim().toLowerCase();
  if (!origin || !host || origin === 'null') return false;
  try { return new URL(origin).host.toLowerCase() === host; } catch (_error) { return false; }
}

function requestIp(request) {
  const forwarded = requestHeader(request, 'x-forwarded-for').split(',', 1)[0].trim();
  return forwarded || requestHeader(request, 'x-real-ip').trim() || request.socket?.remoteAddress || 'unknown';
}

// Best-effort abuse guard only: Vercel serverless instances do not share this map,
// so this is deliberately described and exposed as an instance-scoped limit.
function consumeRateLimit(request, now = Date.now()) {
  const ip = requestIp(request);
  if (rateLimitBuckets.size >= 1_000) {
    for (const [key, bucket] of rateLimitBuckets) {
      if (now - bucket.windowStartedAt >= RATE_LIMIT_POLICY.windowMs) rateLimitBuckets.delete(key);
    }
  }
  const current = rateLimitBuckets.get(ip);
  if (!current || now - current.windowStartedAt >= RATE_LIMIT_POLICY.windowMs) {
    rateLimitBuckets.set(ip, { windowStartedAt: now, count: 1 });
    return { allowed: true, remaining: RATE_LIMIT_POLICY.maxRequests - 1, retryAfter: 0 };
  }
  current.count += 1;
  const retryAfter = Math.max(1, Math.ceil((RATE_LIMIT_POLICY.windowMs - (now - current.windowStartedAt)) / 1_000));
  return { allowed: current.count <= RATE_LIMIT_POLICY.maxRequests, remaining: Math.max(0, RATE_LIMIT_POLICY.maxRequests - current.count), retryAfter };
}

function resetRateLimitForTests() {
  rateLimitBuckets.clear();
}

async function readUpstreamResponse(response, sensitiveValues = []) {
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error('RESPONSE_TOO_LARGE');
  const redacted = redactString(text, sensitiveValues);
  try { return sanitizePayload(JSON.parse(redacted), 0, sensitiveValues); } catch (_error) { return redacted.slice(0, 200_000); }
}

async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, error: 'POST 요청만 허용합니다.' });
    return;
  }

  if (!isSameOriginRequest(request)) {
    sendJson(response, 403, { ok: false, error: '동일한 사이트에서 보낸 요청만 허용합니다.' });
    return;
  }

  const rateLimit = consumeRateLimit(request);
  if (!rateLimit.allowed) {
    response.setHeader('Retry-After', String(rateLimit.retryAfter));
    sendJson(response, 429, {
      ok: false,
      error: '현재 서버 인스턴스의 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
      rateLimit: { scope: RATE_LIMIT_POLICY.scope, retryAfter: rateLimit.retryAfter },
    });
    return;
  }

  const contentLength = Number(request.headers?.['content-length'] || 0);
  if (contentLength > 16_384) {
    sendJson(response, 413, { ok: false, error: '요청 크기가 너무 큽니다.' });
    return;
  }

  let target;
  try {
    target = createUpstreamRequest(parseBody(request));
  } catch (_error) {
    sendJson(response, 400, { ok: false, error: '허용된 공공 API와 조회값만 입력해 주세요.' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const upstream = await fetch(target.url, {
      method: 'GET',
      headers: { Accept: 'application/json, application/xml;q=0.7, text/xml;q=0.6' },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    const submittedKey = target.url.searchParams.get(UPSTREAMS[target.provider].keyParam) || '';
    const data = await readUpstreamResponse(upstream, [submittedKey]);
    const businessError = upstream.ok ? detectBusinessError(data) : null;
    const ok = upstream.ok && !businessError;
    sendJson(response, ok ? 200 : (businessError ? businessErrorStatus(businessError) : 502), {
      ok,
      provider: target.provider,
      operation: target.operation,
      upstreamStatus: upstream.status,
      fetchedAt: new Date().toISOString(),
      ...(businessError ? {
        error: redactString(businessError.message || '공공 API가 업무 오류를 반환했습니다.', [submittedKey]).slice(0, 500),
        upstreamError: sanitizePayload(businessError, 0, [submittedKey]),
      } : {}),
      data,
    });
  } catch (_error) {
    sendJson(response, 502, { ok: false, error: '공공 API 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = handler;
module.exports._test = Object.freeze({
  UPSTREAMS,
  RATE_LIMIT_POLICY,
  businessErrorStatus,
  consumeRateLimit,
  createUpstreamRequest,
  detectBusinessError,
  isSameOriginRequest,
  readUpstreamResponse,
  redactString,
  resetRateLimitForTests,
  sanitizePayload,
  sanitizeParams,
});
