/* No network or production database: exercise actual TS helpers with in-memory adapters. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { QueryClient } = require('@tanstack/react-query');

function load(file, overrides = {}, globals = {}) {
  const filename = path.join(__dirname, '../src', file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports, require: name => name in overrides ? overrides[name] : require(name), setTimeout, clearTimeout, Date, DOMException, ...globals }, { filename });
  return mod.exports;
}

(async () => {
  const calls = [];
  let abortDuringResponse;
  const summary = { count: 235, quantity: 705, total: 70500 };
  const api = { get: async (url, config) => {
    calls.push({ url, ...config.params });
    if (abortDuringResponse) { abortDuringResponse.abort(); abortDuringResponse = undefined; }
    return { data: { data: [{ id: 'row' }], ...(config.params.totals === 'omit' ? {} : { summary, pagination: { total: 235 } }) } };
  } };
  const { loadReportPage, reportPageStaleTime } = load('lib/report-pages.ts', { './api': { api } });
  const client = new QueryClient();
  try {
    const scope = ['sales', 'records-totals', 'owner:Owner', { productKey: 'V2' }];
    for (let page = 1; page <= 24; page++) {
      const result = await loadReportPage(client, '/sales/records', { page, limit: 10, productKey: 'V2' }, scope);
      assert.equal(result.summary.quantity, 705);
      assert.equal(result.pagination.totalPages, 24);
      assert.equal(result.pagination.total, 235);
    }
    assert.equal(calls.length, 24);
    assert.equal(calls.filter(c => !c.totals).length, 1);
    assert.equal(calls.filter(c => c.totals === 'omit').length, 23);
    await client.invalidateQueries({ queryKey: ['sales'], refetchType: 'none' });
    await loadReportPage(client, '/sales/records', { page: 2, limit: 25 }, scope);
    assert.equal(calls.at(-1).totals, undefined, 'mutation invalidation must recompute totals');
    const old = client.getQueryData(scope);
    client.setQueryData(scope, old, { updatedAt: Date.now() - 46_000 });
    await loadReportPage(client, '/sales/records', { page: 3, limit: 100 }, scope);
    assert.equal(calls.at(-1).totals, undefined, 'expired totals must not be reused');
    await loadReportPage(client, '/sales/records', { page: 1, limit: 10 }, ['sales', 'records-totals', 'other:Admin', { productKey: 'V2' }]);
    assert.equal(calls.at(-1).totals, undefined, 'accounts must never share a totals cache');
    await loadReportPage(client, '/sales/records', { page: 1, limit: 10 }, ['sales', 'records-totals', 'owner:Owner', { productKey: 'V2 Plus' }]);
    assert.equal(calls.at(-1).totals, undefined, 'filters must never share a totals cache');
    assert.equal(reportPageStaleTime({ state: { data: { totalsUpdatedAt: 1000 }, dataUpdatedAt: 45000 } }), 1000);
    const controller = new AbortController(); controller.abort();
    const before = calls.length;
    await assert.rejects(loadReportPage(client, '/sales/records', {}, ['sales', 'aborted'], controller.signal), { name: 'AbortError' });
    assert.equal(calls.length, before);
    const during = new AbortController(); abortDuringResponse = during;
    await assert.rejects(loadReportPage(client, '/sales/records', {}, ['sales', 'canceled-response'], during.signal), { name: 'AbortError' });
    assert.equal(client.getQueryData(['sales', 'canceled-response']), undefined);
    console.log('PASS totals reuse: 24 page requests, one full totals query, expiry/invalidation/account/filter/cancellation boundaries');
  } finally { client.clear(); }

  const policy = load('lib/request-policy.ts');
  assert.equal(policy.shouldRetryRead('get', 503, true), true);
  assert.equal(policy.shouldRetryRead('post', 503, true), false);
  assert.equal(policy.shouldRetryRead('put', undefined, false), false);
  assert.equal(policy.shouldRetryQuery(0, { __readRetriesExhausted: true }), false);
  assert.equal(policy.shouldRetryQuery(0, { code: 'ERR_CANCELED' }), false);
  assert.equal(policy.shouldRetryQuery(0, { response: { status: 403 } }), false);
  assert.equal(policy.shouldRetryQuery(0, { response: { status: 500 } }), true);
  assert.equal(policy.shouldRetryQuery(1, { response: { status: 500 } }), false);
  const canceledWait = new AbortController();
  const wait = policy.waitForRetry(60_000, canceledWait.signal); canceledWait.abort();
  await assert.rejects(wait, { name: 'AbortError' });

  let replay = 0, rejectHandler, waits = 0;
  const fakeApi = async () => { replay++; return {}; };
  fakeApi.interceptors = { request: { use() {} }, response: { use(ok, fail) { rejectHandler = fail; } } };
  fakeApi.defaults = { baseURL: 'http://fixture/api/v1' };
  const fakeAxios = { create: () => fakeApi, isCancel: e => e?.code === 'ERR_CANCELED' };
  const fakeStore = { useAuthStore: { getState: () => ({ accessToken: 'token' }) } };
  load('lib/api.ts', { axios: { default: fakeAxios }, './store': fakeStore, './request-policy': { ...policy, waitForRetry: async () => { waits++; } } }, { process: { env: {} } });
  const cancel = { code: 'ERR_CANCELED', config: { method: 'get' } };
  await assert.rejects(rejectHandler(cancel), e => e === cancel);
  assert.equal(replay, 0);
  const writeFailure = { response: { status: 503 }, config: { method: 'post' } };
  await assert.rejects(rejectHandler(writeFailure), e => e === writeFailure);
  assert.equal(replay, 0);
  await rejectHandler({ response: { status: 503 }, config: { method: 'get' } });
  assert.equal(replay, 1); assert.equal(waits, 1);
  const exhausted = { response: { status: 503 }, config: { method: 'get', __retryCount: 4 } };
  await assert.rejects(rejectHandler(exhausted), e => e === exhausted);
  assert.equal(exhausted.__readRetriesExhausted, true);
  assert.equal(replay, 1);
  console.log('PASS actual Axios interceptor: canceled and write requests not replayed; cold-start read retries are bounded once');

  const doc = { hidden: true }, nav = { onLine: true };
  let token = 'token', callback, created = 0, cleared = 0, refreshes = 0, previousDeps, cleanup;
  const { Heartbeat } = load('components/Heartbeat.tsx', {
    react: { useEffect(fn, deps) { if (!previousDeps || deps[0] !== previousDeps[0]) { cleanup?.(); cleanup = fn(); previousDeps = deps; } } },
    '@/lib/store': { useAuthStore: selector => selector({ accessToken: token }) },
    '@/lib/api': { refreshTokenQuietly() { refreshes++; }, warmUpBackend() { throw Error('redundant health ping'); } },
  }, { document: doc, navigator: nav, setInterval(fn) { callback = fn; created++; return created; }, clearInterval() { cleared++; } });
  Heartbeat(); callback(); assert.equal(refreshes, 0);
  doc.hidden = false; nav.onLine = false; callback(); assert.equal(refreshes, 0);
  nav.onLine = true; callback(); assert.equal(refreshes, 1);
  token = 'rotated-token'; Heartbeat(); assert.equal(created, 1);
  token = null; Heartbeat(); assert.equal(cleared, 1);
  console.log('PASS heartbeat: hidden/offline silence, visible auth refresh retained, token rotation does not restart keepalives');
})().catch(error => { console.error(error); process.exitCode = 1; });
