(function attachApiConnections(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DDOL_API_CONNECTIONS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createApiConnections() {
  'use strict';

  const STORAGE_KEY = 'ddol-public-api-session-v1';
  const PROVIDERS = Object.freeze([
    Object.freeze({ id: 'tago', label: 'TAGO 버스노선', note: '도시코드·노선·경유정류소 조회', testOperation: 'city-codes', testParams: { pageNo: '1', numOfRows: '10' } }),
    Object.freeze({ id: 'gyeonggi', label: '경기도 버스노선', note: '노선·배차·정류소·선형 보완', testOperation: 'route-search', testParams: { keyword: '11' } }),
    Object.freeze({ id: 'juso-search', label: '도로명주소 검색', note: '시설 주소의 표준 주소요소 조회', testOperation: 'address-search', testParams: { currentPage: '1', countPerPage: '1', keyword: '고양시청' } }),
    Object.freeze({ id: 'juso-coordinate', label: '주소 좌표제공', note: '검색 결과의 주소요소를 좌표로 변환', testOperation: 'coordinate', testParams: null }),
  ]);

  const VILLAGE_ROUTE_PATTERN = /((?:[NM]?\d{1,4}(?:-\d+)?[A-Z]?)(?:\([^)]*\))?)\s*\(마을\)/gi;

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeSessionRead(storage) {
    try {
      const value = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      return Object.fromEntries(PROVIDERS.map(({ id }) => [id, String(value[id] || '')]).filter(([, key]) => key));
    } catch (_error) {
      return {};
    }
  }

  function safeSessionWrite(storage, keys) {
    const allowed = Object.fromEntries(PROVIDERS.map(({ id }) => [id, String(keys[id] || '').trim()]).filter(([, key]) => key));
    try {
      if (Object.keys(allowed).length) storage?.setItem(STORAGE_KEY, JSON.stringify(allowed));
      else storage?.removeItem(STORAGE_KEY);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function normalizeKey(value) {
    return String(value || '').trim().slice(0, 512);
  }

  function detectDelimiter(line) {
    const candidates = [',', '\t', ';'];
    let best = ',';
    let bestCount = -1;
    candidates.forEach((delimiter) => {
      let count = 0;
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') quoted = !quoted;
        if (!quoted && char === delimiter) count += 1;
      }
      if (count > bestCount) { best = delimiter; bestCount = count; }
    });
    return best;
  }

  function parseCsv(text, delimiter = detectDelimiter(String(text).split(/\r?\n/, 1)[0] || '')) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text || '').replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (char === '"') {
        if (quoted && source[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(field.trim()); field = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && source[index + 1] === '\n') index += 1;
        row.push(field.trim()); field = '';
        if (row.some((value) => value !== '')) rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
    if (field || row.length) {
      row.push(field.trim());
      if (row.some((value) => value !== '')) rows.push(row);
    }
    return { delimiter, headers: rows[0] || [], rows: rows.slice(1) };
  }

  function extractVillageRoutes(value) {
    const found = new Set();
    const text = String(value || '');
    VILLAGE_ROUTE_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(VILLAGE_ROUTE_PATTERN)) found.add(match[1].trim());
    return [...found];
  }

  function analyzeBusStopCsv(text) {
    const parsed = parseCsv(text);
    const preferred = parsed.headers.findIndex((header) => /경유\s*노선/.test(header));
    const routeColumnIndex = preferred >= 0
      ? preferred
      : parsed.headers.findIndex((header) => /노선/.test(header));
    const routes = new Set();
    if (routeColumnIndex >= 0) {
      parsed.rows.forEach((row) => extractVillageRoutes(row[routeColumnIndex]).forEach((route) => routes.add(route)));
    }
    return {
      delimiter: parsed.delimiter === '\t' ? 'tab' : parsed.delimiter,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      routeColumn: routeColumnIndex >= 0 ? parsed.headers[routeColumnIndex] : null,
      villageRoutes: [...routes].sort((left, right) => left.localeCompare(right, 'ko', { numeric: true })),
    };
  }

  function decodeCsvBuffer(buffer) {
    let utf8 = '';
    try { utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (_error) { utf8 = ''; }
    if (utf8 && /경유|노선|정류/.test(utf8.slice(0, 1_000))) return { text: utf8, encoding: 'UTF-8' };
    try { return { text: new TextDecoder('euc-kr').decode(buffer), encoding: 'CP949/EUC-KR' }; } catch (_error) { return { text: new TextDecoder().decode(buffer), encoding: 'UTF-8 추정' }; }
  }

  async function sha256Hex(buffer, cryptoApi) {
    if (!cryptoApi?.subtle) return null;
    const digest = await cryptoApi.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function valueByNames(object, names) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return undefined;
    const lowered = Object.fromEntries(Object.entries(object).map(([key, value]) => [key.toLowerCase(), value]));
    for (const name of names) {
      const value = lowered[name.toLowerCase()];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  }

  function collectObjects(value, output = [], depth = 0) {
    if (depth > 12 || value === null || value === undefined) return output;
    if (Array.isArray(value)) value.forEach((item) => collectObjects(item, output, depth + 1));
    else if (typeof value === 'object') {
      output.push(value);
      Object.values(value).forEach((item) => collectObjects(item, output, depth + 1));
    }
    return output;
  }

  function extractTogoCity(data, keyword = '고양') {
    return collectObjects(data).map((item) => ({
      code: valueByNames(item, ['citycode', 'cityCode']),
      name: valueByNames(item, ['cityname', 'cityName']),
    })).find((item) => item.code && String(item.name || '').includes(keyword)) || null;
  }

  function extractTogoRoutes(data) {
    const unique = new Map();
    collectObjects(data).forEach((item) => {
      const routeId = valueByNames(item, ['routeid', 'routeId']);
      const routeNo = valueByNames(item, ['routeno', 'routeNo']);
      if (!routeId || !routeNo) return;
      const key = String(routeId);
      unique.set(key, {
        routeId: key,
        routeNo: String(routeNo),
        routeType: String(valueByNames(item, ['routetp', 'routeType']) || ''),
        startNode: String(valueByNames(item, ['startnodenm', 'startNodeName']) || ''),
        endNode: String(valueByNames(item, ['endnodenm', 'endNodeName']) || ''),
      });
    });
    return [...unique.values()];
  }

  function selectExactTogoRoutes(data, queryRoute) {
    const expected = String(queryRoute || '').trim().toUpperCase();
    if (!expected) return [];
    return extractTogoRoutes(data).filter((route) => String(route.routeNo || '').trim().toUpperCase() === expected);
  }

  function classifyTogoRouteResults(results) {
    const resolved = results.filter((item) => item.matches.length);
    const failedQueries = results.filter((item) => item.error);
    const rateLimitedQueries = failedQueries.filter((item) => item.errorStatus === 429);
    return {
      exactMatchedLocalRouteCount: resolved.length,
      matchedRoutes: resolved.flatMap((item) => item.matches.map((match) => ({
        localRoute: item.localRoute,
        queryRoute: item.queryRoute,
        ...match,
      }))),
      unresolvedLocalRoutes: results.filter((item) => !item.matches.length).map((item) => ({
        localRoute: item.localRoute,
        queryRoute: item.queryRoute,
        reason: item.error || item.unresolvedReason || 'TAGO exact 노선번호 일치 없음',
      })),
      collectionStatus: {
        complete: failedQueries.length === 0,
        failedQueryCount: failedQueries.length,
        rateLimitedQueryCount: rateLimitedQueries.length,
        retryAfterSeconds: rateLimitedQueries.reduce((maximum, item) => Math.max(maximum, Number(item.retryAfter) || 0), 0),
      },
    };
  }

  function extractJusoAddress(data) {
    return collectObjects(data).map((item) => ({
      admCd: valueByNames(item, ['admCd']),
      rnMgtSn: valueByNames(item, ['rnMgtSn']),
      udrtYn: valueByNames(item, ['udrtYn']),
      buldMnnm: valueByNames(item, ['buldMnnm']),
      buldSlno: valueByNames(item, ['buldSlno']),
    })).find((item) => item.admCd && item.rnMgtSn && item.udrtYn !== undefined && item.buldMnnm) || null;
  }

  function isAdminLocation(locationObject) {
    try { return new URL(locationObject.href).searchParams.get('admin') === '1'; } catch (_error) { return false; }
  }

  function renderProvider(provider, keys, visible, statuses, busy) {
    const key = keys[provider.id] || '';
    const status = statuses[provider.id] || { tone: 'idle', message: key ? '현재 탭에 저장됨' : '키를 입력해 주세요.' };
    return `
      <section class="api-provider-row" data-provider-row="${esc(provider.id)}">
        <div class="api-provider-copy"><strong>${esc(provider.label)}</strong><span>${esc(provider.note)}</span></div>
        <label class="api-key-field"><span class="sr-only">${esc(provider.label)} 인증키</span><input type="${visible[provider.id] ? 'text' : 'password'}" value="${esc(key)}" autocomplete="off" spellcheck="false" data-api-key-input="${esc(provider.id)}" placeholder="현재 탭에서만 사용할 키"></label>
        <button class="api-small-button" type="button" data-api-action="toggle-key" data-api-provider="${esc(provider.id)}" aria-pressed="${visible[provider.id] ? 'true' : 'false'}">${visible[provider.id] ? '숨기기' : '표시'}</button>
        <button class="api-small-button" type="button" data-api-action="save-key" data-api-provider="${esc(provider.id)}">세션 저장</button>
        <button class="api-small-button is-test" type="button" data-api-action="test-key" data-api-provider="${esc(provider.id)}"${busy ? ' disabled' : ''}>연결 테스트</button>
        <button class="api-delete-button" type="button" data-api-action="delete-key" data-api-provider="${esc(provider.id)}" aria-label="${esc(provider.label)} 키 삭제">삭제</button>
        <p class="api-provider-status is-${esc(status.tone)}" role="status">${esc(status.message)}</p>
      </section>`;
  }

  function renderFileSummary(fileState) {
    if (!fileState) return '<p class="api-empty-copy">정류장 원파일을 선택하면 브라우저 안에서만 읽고, 원파일은 서버로 보내지 않습니다.</p>';
    if (fileState.loading) return '<p class="api-collection-progress" role="status">CSV 헤더·행수·마을버스 노선번호·SHA-256을 확인하고 있습니다…</p>';
    if (fileState.error) return `<p class="api-file-error" role="alert">${esc(fileState.error)}</p>`;
    const analysis = fileState.analysis;
    return `
      <dl class="api-file-summary">
        <div><dt>파일</dt><dd>${esc(fileState.name)}</dd></div>
        <div><dt>인코딩</dt><dd>${esc(fileState.encoding)}</dd></div>
        <div><dt>데이터 행</dt><dd>${analysis.rowCount.toLocaleString('ko-KR')}행</dd></div>
        <div><dt>노선 열</dt><dd>${esc(analysis.routeColumn || '찾지 못함')}</dd></div>
        <div><dt>마을버스</dt><dd>${analysis.villageRoutes.length.toLocaleString('ko-KR')}개 노선번호</dd></div>
        <div><dt>SHA-256</dt><dd><code>${esc(fileState.sha256 || '현재 브라우저에서 계산 불가')}</code></dd></div>
      </dl>
      <details class="api-route-list"><summary>파싱한 노선번호 보기</summary><p>${analysis.villageRoutes.length ? analysis.villageRoutes.map(esc).join(' · ') : '경유노선 열에서 (마을) 토큰을 찾지 못했습니다.'}</p></details>`;
  }

  function renderCollection(collection, progress) {
    if (progress) return `<p class="api-collection-progress" role="status">${esc(progress)}</p>`;
    if (!collection) return '<p class="api-empty-copy">CSV 파싱 후 TAGO와 대조하면 고양시 도시코드, 일치 노선, 미일치 노선을 정리합니다.</p>';
    const boundary = collection.tago.collectionStatus;
    const partialMessage = boundary && !boundary.complete
      ? `<p class="api-file-error" role="alert"><strong>부분 수집 결과</strong> · ${boundary.failedQueryCount.toLocaleString('ko-KR')}개 노선 조회가 완료되지 않아 전체 집계로 사용할 수 없습니다.${boundary.rateLimitedQueryCount ? ` 요청 한도 영향 ${boundary.rateLimitedQueryCount.toLocaleString('ko-KR')}개${boundary.retryAfterSeconds ? ` · 약 ${boundary.retryAfterSeconds.toLocaleString('ko-KR')}초 후 다시 수집` : ''}` : ''}</p>`
      : '';
    return `
      <dl class="api-collection-summary">
        <div><dt>TAGO 도시</dt><dd>${esc(collection.tago.city.name)} · ${esc(collection.tago.city.code)}</dd></div>
        <div><dt>조회 노선</dt><dd>${collection.tago.queriedRouteCount.toLocaleString('ko-KR')}개</dd></div>
        <div><dt>정확 일치</dt><dd>${collection.tago.exactMatchedLocalRouteCount.toLocaleString('ko-KR')}개</dd></div>
        <div><dt>확인 필요</dt><dd>${collection.tago.unresolvedLocalRoutes.length.toLocaleString('ko-KR')}개</dd></div>
      </dl>${partialMessage}`;
  }

  function renderModal(state) {
    return `
      <div class="api-admin-backdrop" data-api-action="close" aria-hidden="true"></div>
      <section class="api-admin-modal" role="dialog" aria-modal="true" aria-labelledby="api-admin-title">
        <div class="api-admin-head">
          <div><h2 id="api-admin-title">데이터 연결 설정</h2><p>공개데이터 인증키와 고양시 정류장 CSV를 이용해 분석 보완자료를 준비합니다.</p></div>
          <button class="api-admin-close" type="button" data-api-action="close" aria-label="데이터 연결 설정 닫기">×</button>
        </div>
        <div class="api-security-note"><strong>보안 경계</strong><span>키는 이 탭의 sessionStorage에만 보관됩니다. URL·localStorage·검토서·수집 JSON에는 들어가지 않습니다. 이 창은 관리자 인증 기능이 아닙니다.</span></div>
        <div class="api-provider-list">${PROVIDERS.map((provider) => renderProvider(provider, state.keys, state.visible, state.statuses, state.busy)).join('')}</div>
        <section class="api-work-section" aria-labelledby="api-file-title">
          <div class="api-section-head"><div><h3 id="api-file-title">1. 버스정류장 CSV 로컬 검사</h3><p>CP949와 UTF-8을 판별하고 경유노선의 <code>(마을)</code> 토큰에서 노선번호를 추출합니다.</p></div><button class="api-text-button" type="button" data-api-action="clear-file"${state.fileState ? '' : ' disabled'}>파일 비우기</button></div>
          <label class="api-file-picker"><span>고양시 버스정류장 CSV 선택</span><input type="file" accept=".csv,text/csv" data-api-file></label>
          ${renderFileSummary(state.fileState)}
        </section>
        <section class="api-work-section" aria-labelledby="api-collect-title">
          <div class="api-section-head"><div><h3 id="api-collect-title">2. TAGO 노선 대조</h3><p>도시코드 목록에서 고양시를 찾은 뒤, 로컬 마을버스 번호를 노선목록과 대조합니다.</p></div></div>
          <div class="api-collection-actions">
            <button class="api-primary-button" type="button" data-api-action="collect-tago"${state.busy || !state.fileState?.analysis?.villageRoutes?.length ? ' disabled' : ''}>TAGO 수집 시작</button>
            <button class="api-secondary-button" type="button" data-api-action="download-collection"${state.collection ? '' : ' disabled'}>키 제외 JSON 저장</button>
          </div>
          ${renderCollection(state.collection, state.progress)}
          ${state.collectionError ? `<p class="api-file-error" role="alert">${esc(state.collectionError)}</p>` : ''}
        </section>
        <div class="api-admin-foot"><button class="api-delete-all" type="button" data-api-action="delete-all">모든 키 삭제</button><button class="api-secondary-button" type="button" data-api-action="close">닫기</button></div>
      </section>`;
  }

  function createManager(options = {}) {
    const windowObject = options.windowObject || (typeof window !== 'undefined' ? window : null);
    const documentObject = options.documentObject || windowObject?.document;
    let storage = options.storage;
    if (!storage) {
      try { storage = windowObject?.sessionStorage; } catch (_error) { storage = null; }
    }
    const cryptoApi = options.cryptoApi || windowObject?.crypto;
    const fetchImpl = options.fetchImpl || windowObject?.fetch?.bind(windowObject);
    const proxyUrl = options.proxyUrl || '/api/public-data';
    const state = {
      open: false,
      keys: safeSessionRead(storage),
      visible: {},
      statuses: {},
      fileState: null,
      collection: null,
      collectionError: '',
      progress: '',
      busy: false,
    };
    let launcher = null;
    let overlay = null;
    let returnFocus = null;

    async function proxy(provider, operation, params) {
      const apiKey = state.keys[provider];
      if (!apiKey) throw new Error('먼저 인증키를 세션에 저장해 주세요.');
      const response = await fetchImpl(proxyUrl, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, operation, params, apiKey }),
      });
      let payload;
      try { payload = await response.json(); } catch (_error) { throw new Error('프록시 응답을 읽지 못했습니다. Vercel 배포 또는 개발 서버에서 다시 확인해 주세요.'); }
      if (!response.ok || !payload.ok) {
        const retryAfter = Number(payload.rateLimit?.retryAfter || response.headers?.get?.('Retry-After')) || 0;
        const baseMessage = payload.error || `공공 API 응답 오류(${payload.upstreamStatus || response.status})`;
        const error = new Error(response.status === 429 && retryAfter
          ? `${baseMessage} 약 ${retryAfter}초 후 다시 시도해 주세요.`
          : baseMessage);
        error.status = Number(response.status) || 0;
        error.retryAfter = retryAfter;
        throw error;
      }
      return payload.data;
    }

    function refresh(focusSelector) {
      if (!state.open || !documentObject?.body) return;
      overlay?.remove();
      overlay = documentObject.createElement('div');
      overlay.className = 'api-admin-overlay';
      overlay.innerHTML = renderModal(state);
      documentObject.body.append(overlay);
      bindOverlay();
      documentObject.querySelector('#app')?.setAttribute('inert', '');
      if (focusSelector) windowObject?.setTimeout(() => overlay.querySelector(focusSelector)?.focus(), 0);
    }

    function close() {
      state.open = false;
      overlay?.remove(); overlay = null;
      documentObject?.querySelector('#app')?.removeAttribute('inert');
      const target = returnFocus; returnFocus = null;
      windowObject?.setTimeout(() => target?.focus(), 0);
    }

    function open() {
      if (!documentObject?.body) return;
      returnFocus = documentObject.activeElement;
      state.open = true;
      refresh('.api-admin-close');
    }

    function saveKey(provider) {
      const input = overlay?.querySelector(`[data-api-key-input="${provider}"]`);
      const key = normalizeKey(input?.value);
      if (key) state.keys[provider] = key; else delete state.keys[provider];
      const saved = safeSessionWrite(storage, state.keys);
      state.statuses[provider] = { tone: saved ? 'ready' : 'error', message: saved ? (key ? '현재 탭에 저장했습니다.' : '입력값이 없어 저장하지 않았습니다.') : '세션 저장소를 사용할 수 없습니다.' };
      refresh(`[data-api-key-input="${provider}"]`);
    }

    function deleteKey(provider) {
      delete state.keys[provider];
      delete state.visible[provider];
      safeSessionWrite(storage, state.keys);
      state.statuses[provider] = { tone: 'idle', message: '현재 탭에서 키를 삭제했습니다.' };
      refresh(`[data-api-key-input="${provider}"]`);
    }

    async function testKey(provider) {
      const input = overlay?.querySelector(`[data-api-key-input="${provider}"]`);
      const typed = normalizeKey(input?.value);
      if (typed) { state.keys[provider] = typed; safeSessionWrite(storage, state.keys); }
      state.busy = true;
      state.statuses[provider] = { tone: 'loading', message: '공식 API 응답을 확인하고 있습니다…' };
      refresh();
      try {
        const definition = PROVIDERS.find((item) => item.id === provider);
        if (!definition) throw new Error('지원하지 않는 연결입니다.');
        if (provider === 'juso-coordinate') {
          const addressData = await proxy('juso-search', 'address-search', PROVIDERS.find((item) => item.id === 'juso-search').testParams);
          const address = extractJusoAddress(addressData);
          if (!address) throw new Error('좌표 테스트에 사용할 고양시청 주소요소를 찾지 못했습니다.');
          await proxy(provider, definition.testOperation, address);
        } else {
          await proxy(provider, definition.testOperation, definition.testParams);
        }
        state.statuses[provider] = { tone: 'ready', message: `연결 성공 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` };
      } catch (error) {
        state.statuses[provider] = { tone: 'error', message: error.message || '연결에 실패했습니다.' };
      } finally {
        state.busy = false;
        refresh(`[data-api-action="test-key"][data-api-provider="${provider}"]`);
      }
    }

    async function parseFile(file) {
      state.collection = null;
      state.collectionError = '';
      state.fileState = { name: file.name, loading: true };
      refresh('[data-api-file]');
      try {
        if (!/\.csv$/i.test(file.name) || file.size > 20_000_000) throw new Error('20MB 이하 CSV 파일만 선택해 주세요.');
        const buffer = await file.arrayBuffer();
        const decoded = decodeCsvBuffer(buffer);
        const [analysis, sha256] = await Promise.all([
          Promise.resolve(analyzeBusStopCsv(decoded.text)),
          sha256Hex(buffer, cryptoApi),
        ]);
        if (!analysis.headers.length || !analysis.routeColumn) throw new Error('경유노선 열을 찾지 못했습니다. 고양시 버스정류장 원파일인지 확인해 주세요.');
        state.fileState = { name: file.name, size: file.size, lastModified: file.lastModified, encoding: decoded.encoding, sha256, analysis };
      } catch (error) {
        state.fileState = { error: error.message || 'CSV를 읽지 못했습니다.' };
      }
      refresh();
    }

    async function mapPool(items, limit, mapper) {
      const results = new Array(items.length);
      let cursor = 0;
      async function worker() {
        while (cursor < items.length) {
          const index = cursor; cursor += 1;
          results[index] = await mapper(items[index], index);
        }
      }
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
      return results;
    }

    async function collectTago() {
      const routes = state.fileState?.analysis?.villageRoutes || [];
      if (!routes.length) return;
      state.busy = true;
      state.collection = null;
      state.collectionError = '';
      state.progress = '고양시 도시코드를 공식 목록에서 찾고 있습니다…';
      refresh();
      try {
        const cityData = await proxy('tago', 'city-codes', { pageNo: '1', numOfRows: '1000' });
        const city = extractTogoCity(cityData, '고양');
        if (!city) throw new Error('TAGO 도시코드 목록에서 고양시를 찾지 못했습니다. API 제공범위를 확인해 주세요.');
        let completed = 0;
        const results = await mapPool(routes, 3, async (localRoute) => {
          const queryRoute = localRoute.replace(/\([^)]*\)$/, '');
          try {
            const data = await proxy('tago', 'route-list', { cityCode: String(city.code), routeNo: queryRoute, pageNo: '1', numOfRows: '100' });
            const exact = selectExactTogoRoutes(data, queryRoute);
            return {
              localRoute,
              queryRoute,
              matches: exact,
              unresolvedReason: exact.length ? '' : 'TAGO exact 노선번호 일치 없음',
            };
          } catch (error) {
            return {
              localRoute,
              queryRoute,
              matches: [],
              error: error.message || '조회 실패',
              errorStatus: Number(error.status) || 0,
              retryAfter: Number(error.retryAfter) || 0,
            };
          } finally {
            completed += 1;
            state.progress = `TAGO 노선 대조 ${completed.toLocaleString('ko-KR')} / ${routes.length.toLocaleString('ko-KR')}`;
            if (completed === 1 || completed % 8 === 0 || completed === routes.length) refresh();
          }
        });
        const classified = classifyTogoRouteResults(results);
        state.collection = {
          schemaVersion: 'ddol-tago-route-match-v2',
          generatedAt: new Date().toISOString(),
          sourceCsv: {
            name: state.fileState.name,
            size: state.fileState.size,
            lastModified: new Date(state.fileState.lastModified).toISOString(),
            sha256: state.fileState.sha256,
            encoding: state.fileState.encoding,
            headers: state.fileState.analysis.headers,
            rowCount: state.fileState.analysis.rowCount,
            routeColumn: state.fileState.analysis.routeColumn,
            villageRouteCount: routes.length,
          },
          tago: {
            city: { code: String(city.code), name: String(city.name) },
            queriedRouteCount: routes.length,
            exactMatchedLocalRouteCount: classified.exactMatchedLocalRouteCount,
            matchedRoutes: classified.matchedRoutes,
            unresolvedLocalRoutes: classified.unresolvedLocalRoutes,
            collectionStatus: classified.collectionStatus,
          },
          security: { rawCsvIncluded: false, apiKeyIncluded: false },
          limitations: [
            '노선번호 문자열 일치 결과이며 실제 동일 노선 여부는 기종점·경유정류소로 추가 확인해야 합니다.',
            '검색 후보가 반환되어도 exact 노선번호가 없으면 확인 필요로 분류하며 matchedRoutes 증거 집계에서 제외합니다.',
            '조회 실패가 있으면 collectionStatus.complete=false인 부분 수집이며 전체 노선 집계 근거로 사용할 수 없습니다.',
            '원본 CSV는 브라우저 밖으로 전송하거나 결과 JSON에 포함하지 않았습니다.',
          ],
        };
      } catch (error) {
        state.collectionError = error.message || 'TAGO 수집에 실패했습니다.';
      } finally {
        state.busy = false;
        state.progress = '';
        refresh();
      }
    }

    function downloadCollection() {
      if (!state.collection || !windowObject) return;
      const blob = new Blob([JSON.stringify(state.collection, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = documentObject.createElement('a');
      anchor.href = url;
      anchor.download = `고양시_TAGO_마을버스_대조_${new Date().toISOString().slice(0, 10)}.json`;
      documentObject.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    }

    function bindOverlay() {
      overlay.querySelectorAll('[data-api-action]').forEach((button) => button.addEventListener('click', () => {
        const action = button.dataset.apiAction;
        const provider = button.dataset.apiProvider;
        if (action === 'close') close();
        if (action === 'toggle-key') { state.visible[provider] = !state.visible[provider]; refresh(`[data-api-key-input="${provider}"]`); }
        if (action === 'save-key') saveKey(provider);
        if (action === 'delete-key') deleteKey(provider);
        if (action === 'test-key') testKey(provider);
        if (action === 'delete-all') {
          state.keys = {}; state.visible = {}; state.statuses = {};
          safeSessionWrite(storage, state.keys); refresh('.api-admin-close');
        }
        if (action === 'clear-file') { state.fileState = null; state.collection = null; state.collectionError = ''; refresh('[data-api-file]'); }
        if (action === 'collect-tago') collectTago();
        if (action === 'download-collection') downloadCollection();
      }));
      overlay.querySelector('[data-api-file]')?.addEventListener('change', (event) => {
        const [file] = event.target.files || [];
        if (file) parseFile(file);
      });
      overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const focusable = [...overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentObject.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && documentObject.activeElement === last) { event.preventDefault(); first.focus(); }
      });
    }

    function mount() {
      if (!documentObject?.body || !isAdminLocation(windowObject.location) || launcher) return false;
      launcher = documentObject.createElement('button');
      launcher.className = 'api-admin-launcher';
      launcher.type = 'button';
      launcher.textContent = '데이터 연결';
      launcher.setAttribute('aria-label', '관리자 데이터 연결 설정 열기');
      launcher.addEventListener('click', open);
      documentObject.body.append(launcher);
      return true;
    }

    return Object.freeze({ mount, open, close, proxy, getState: () => state });
  }

  function mount(options) {
    const manager = createManager(options);
    manager.mount();
    return manager;
  }

  return Object.freeze({
    STORAGE_KEY,
    PROVIDERS,
    analyzeBusStopCsv,
    classifyTogoRouteResults,
    createManager,
    decodeCsvBuffer,
    extractJusoAddress,
    extractTogoCity,
    extractTogoRoutes,
    selectExactTogoRoutes,
    extractVillageRoutes,
    isAdminLocation,
    mount,
    parseCsv,
    safeSessionRead,
    safeSessionWrite,
    sha256Hex,
  });
});
