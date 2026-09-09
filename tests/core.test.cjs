const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
function worker(store = {}, fetcher) {
  const context = vm.createContext({ console, URL, Blob, TextEncoder, TextDecoder, AbortController, AbortSignal, DOMException, crypto: webcrypto, setTimeout, clearTimeout, Response,
    fetch: fetcher,
    chrome: { storage: { local: { get: async keys => keys ? Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]])) : structuredClone(store), set: async values => Object.assign(store, structuredClone(values)), remove: async keys => keys.forEach(k => delete store[k]), setAccessLevel: async () => {} } }, runtime: { onConnect: { addListener() {} }, onMessage: { addListener() {} } } } });
  context.importScripts = (...paths) => paths.forEach(path => vm.runInContext(fs.readFileSync(path, 'utf8'), context));
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), context);
  return context;
}
const config = { provider: 'custom', apiUrl: 'https://example.test/v1/chat/completions', protocol: 'openai', model: 'test-model', apiKey: 'test-only', requestOptions: {} };
function sse(text, finish = true) { return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n${finish ? 'data: [DONE]\n\n' : ''}`, { headers: { 'content-type': 'text/event-stream' } }); }
const run = (c, texts, overrides = {}) => c.translateSegments(texts, { ...config, ...overrides }, 'zh', 'fast', '', new AbortController().signal, () => {});
test('protocol URLs, auth and bodies remain separate', () => {
 const c = worker(); const p = c.AITranslateProtocol;
 assert.equal(p.endpoint('https://api.test/v1/', 'responses'), 'https://api.test/v1/responses');
 assert.equal(p.endpoint('https://api.test/v1/chat/completions', 'anthropic'), 'https://api.test/v1/messages');
 assert.equal(p.modelsUrl('https://api.test/custom/v4/messages', 'anthropic'), 'https://api.test/custom/v4/models');
 assert.throws(() => p.endpoint('http://evil.test/v1')); assert.throws(() => p.endpoint('https://user:pass@example.com/v1'));
 assert.equal(p.headers('test', 'anthropic')['x-api-key'], 'test'); assert.equal(p.headers('test', 'anthropic').Authorization, undefined);
 const body = p.body({ ...config, protocol: 'responses', system: 'rules', text: 'source' }); assert.equal(body.store, false); assert.equal(body.input, 'source'); assert.equal(body.messages, undefined);
});
test('overlapping batches reserve each unique paragraph once; cache survives worker restart', async () => {
 const store = {}; let calls = 0, sent = [];
 const fetcher = async (_url, options) => { calls++; const input = JSON.parse(options.body).messages[1].content; let values; try { values = JSON.parse(input); } catch { values = null; } sent.push(input); await new Promise(r => setTimeout(r, 20)); return sse(Array.isArray(values) ? JSON.stringify(values.map(v => '译:' + v)) : '译:' + input); };
 const c = worker(store, fetcher);
 const [first, second] = await Promise.all([run(c, ['alpha', 'beta', 'alpha']), run(c, ['beta', 'gamma'])]);
 assert.deepEqual([...first.values], ['译:alpha', '译:beta', '译:alpha']); assert.deepEqual([...second.values], ['译:beta', '译:gamma']);
 assert.equal(calls, 2); assert.equal(sent.filter(s => s.includes('beta')).length, 1);
 await run(c, ['gamma', 'alpha']); assert.equal(calls, 2);
 const restarted = worker(store, fetcher); await run(restarted, ['beta', 'alpha']); assert.equal(calls, 2);
 await run(c, ['alpha'], { apiUrl: 'https://different.test/v1/chat/completions' }); assert.equal(calls, 3);
});
test('malformed batches and truncated streams are never cached', async () => {
 const store = {}; let valid = false; let calls = 0;
 const c = worker(store, async () => { calls++; return valid ? sse('["one","two"]') : sse('["one"]'); });
 await assert.rejects(run(c, ['a', 'b'])); assert.equal(Object.keys(store).length, 0);
 valid = true; await run(c, ['a', 'b']); assert.equal(calls, 2);
 const partialStore = {}; const partial = worker(partialStore, async () => sse('partial', false));
 await assert.rejects(run(partial, ['source'])); assert.equal(Object.keys(partialStore).length, 0);
});
test('Responses and Anthropic stream events produce only text', async () => {
 for (const protocol of ['responses', 'anthropic']) {
   const events = protocol === 'responses' ? [{ type: 'response.output_text.delta', delta: 'hello' }, { type: 'response.completed' }] : [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }];
   const c = worker({}, async () => new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }));
   const value = await run(c, ['source'], { protocol }); assert.equal(value.values[0], 'hello');
 }
});
test('cancelling one subscriber keeps shared work alive for the other', async () => {
 let resolveFetch; let aborts = 0; const response = new Promise(r => { resolveFetch = r; });
 const c = worker({}, async (_url, options) => { options.signal.addEventListener('abort', () => aborts++); return response; });
 const a = new AbortController(), b = new AbortController();
 const one = c.translateSegments(['shared'], config, 'zh', 'fast', '', a.signal, () => {});
 const two = c.translateSegments(['shared'], config, 'zh', 'fast', '', b.signal, () => {});
 await new Promise(r => setTimeout(r, 20)); a.abort(); assert.equal(aborts, 0); resolveFetch(sse('shared result')); await Promise.all([one, two]);
});
test('model discovery uses edited endpoint and Anthropic pagination', async () => {
 let calls = [];
 const c = worker({}, async (url, options) => { calls.push({ url, options }); return Response.json(calls.length === 1 ? { data: [{ id: 'a' }], has_more: true, last_id: 'a' } : { data: [{ id: 'b' }], has_more: false }); });
 const result = await c.discoverModels({ provider: 'anthropic', apiKey: 'test', apiUrl: 'https://proxy.test/v1/messages', protocol: 'anthropic' });
 assert.deepEqual([...result.models], ['a', 'b']); assert.equal(calls[0].url, 'https://proxy.test/v1/models'); assert.match(calls[1].url, /after_id=a/); assert.equal(calls[0].options.headers['x-api-key'], 'test');
});
test('prompt modes separate dictionary and contextual explanation, with localized headings', () => {
 const c = worker(); const p = c.buildSystemPrompt('en', 'explain', false, 'bank of a river');
 assert.match(p, /untrusted/); assert.match(p, /headings in the target language/); assert.match(p, /bank of a river/); assert.doesNotMatch(p, /【释义】/);
 assert.match(c.buildSystemPrompt('zh', 'dictionary', false), /parts of speech/);
});
test('expired cache is removed and cache size is bounded', async () => {
 const store = {};
 store['translation.v3.expired'] = { value: 'old', createdAt: 1, usedAt: 1 };
 const now = Date.now(); for (let i = 0; i < 4100; i++) store[`translation.v3.${i}`] = { value: 'cached', createdAt: now, usedAt: now + i };
 const c = worker(store); await vm.runInContext('cacheReady', c);
 assert.equal(store['translation.v3.expired'], undefined); assert.equal(vm.runInContext('translationCache.size', c), 4000);
 assert.equal(Object.keys(store).length, 4000);
});
test('transport concurrency stays at four across simultaneous tabs', async () => {
 let active = 0, maximum = 0;
 const c = worker({}, async (_url, options) => { active++; maximum = Math.max(maximum, active); await new Promise(r => setTimeout(r, 10)); active--; return sse('translated'); });
 await Promise.all(Array.from({ length: 16 }, (_, i) => run(c, [`unique source ${i}`]))); assert.equal(maximum, 4);
});
test('error, token-limit, and incomplete events reject output', async () => {
 for (const json of [{ choices: [{ delta: { content: 'part' }, finish_reason: 'length' }] }, { type: 'response.incomplete', response: { status: 'incomplete' } }, { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, { type: 'error', error: { message: 'upstream failure' } }]) {
  const store = {}; const c = worker(store, async () => new Response(`data: ${JSON.stringify(json)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } }));
  await assert.rejects(run(c, ['source'])); assert.equal(Object.keys(store).length, 0);
 }
});
test('language, mode, model, protocol, and context cannot collide', async () => {
 const c = worker(); const baseline = await c.makeCacheKey('source', config, 'zh', 'fast', '');
 for (const value of [await c.makeCacheKey('source', config, 'en', 'fast', ''), await c.makeCacheKey('source', config, 'zh', 'dictionary', ''), await c.makeCacheKey('source', { ...config, model: 'different' }, 'zh', 'fast', ''), await c.makeCacheKey('source', { ...config, protocol: 'responses' }, 'zh', 'fast', ''), await c.makeCacheKey('source', config, 'zh', 'fast', 'context')]) assert.notEqual(value, baseline);
});
test('known official Anthropic endpoints use provider-specific prefixes', () => {
 const c = worker(); const p = c.AITranslateProtocol;
 assert.equal(p.endpoint('https://dashscope.aliyuncs.com/compatible-mode/v1', 'anthropic'), 'https://dashscope.aliyuncs.com/apps/anthropic/v1/messages');
 assert.equal(p.endpoint('https://llm-demo.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions', 'anthropic'), 'https://llm-demo.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages');
 assert.equal(p.endpoint('https://dashscope-intl.aliyuncs.com/apps/anthropic', 'openai'), 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
 assert.equal(p.endpoint('https://api.deepseek.com/chat/completions', 'anthropic'), 'https://api.deepseek.com/anthropic/v1/messages');
});
