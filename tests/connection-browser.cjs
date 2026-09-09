// Reproduce the exact missing-receiver failure in an extension with an old worker.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-translate-old-worker-'));
  const extension = path.join(temp, 'extension'); await fs.mkdir(extension);
  for (const file of ['manifest.json', 'providers.js', 'protocol.js', 'connection.js', 'content.js', 'content.css', 'popup', 'icons']) await fs.cp(file, path.join(extension, file), { recursive: true });
  await fs.writeFile(path.join(extension, 'background.js'), 'chrome.runtime.onConnect.addListener(() => {});');
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { executablePath: chromium.executablePath(), headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 400, height: 600 } });
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const popup = await context.newPage(); const errors = []; popup.on('pageerror', e => errors.push(e.message));
    let status = 200, delay = 0; const requests = [];
    await context.route('https://mock.example/**', async route => {
      requests.push({ url: route.request().url(), method: route.request().method() });
      const responseStatus = status; if (delay) await new Promise(r => setTimeout(r, delay));
      await route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'model-one' }, { id: 'model-two' }] }) }).catch(() => {});
    });
    let planStatus = 404; const planRequests = [];
    await context.route('https://token-plan.cn-beijing.maas.aliyuncs.com/**', async route => {
      const req = route.request(); planRequests.push({ url: req.url(), method: req.method(), body: req.postDataJSON() });
      const post = req.method() === 'POST';
      await route.fulfill({ status: post ? 200 : planStatus, contentType: 'application/json', body: JSON.stringify(post ? { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] } : { message: 'No model listing endpoint' }) });
    });
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup/popup.html`);
    const oldError = await popup.evaluate(async () => { try { await chrome.runtime.sendMessage({ action: 'DISCOVER_MODELS' }); return ''; } catch (error) { return error.message; } });
    assert.match(oldError, /Receiving end does not exist/);
    await popup.locator('#worker-warning').waitFor({ state: 'visible' });
    await popup.locator('[data-panel-target="model"]').click();
    await popup.locator('#provider-select').selectOption('custom');
    await popup.locator('#custom-api-url').fill('https://mock.example/v1');
    await popup.locator('#api-key').fill('fake-test-key');
    await popup.locator('#detect-models').click();
    await popup.waitForFunction(() => document.querySelector('#tips-model-name').textContent.includes('接口已返回模型'));
    assert.equal(await popup.locator('#model-dropdown [role="option"]').count(), 2);
    assert.deepEqual(requests.map(r => r.method), ['GET']);
    // Wrong credentials remain an authentication error, never catalog success.
    status = 401; await popup.locator('#detect-models').click();
    await popup.waitForFunction(() => document.querySelector('#panel-feedback').textContent.includes('HTTP 401'));
    assert(!await popup.locator('#panel-feedback').textContent().then(s => s.includes('Receiving end')));
    // A changed URL aborts stale discovery; its result must not replace another provider's list.
    status = 200; delay = 300; await popup.locator('#detect-models').click();
    await popup.locator('#provider-select').selectOption('qwen_token_plan');
    await popup.waitForTimeout(350);
    assert.equal(await popup.locator('#custom-api-url').inputValue(), 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
    assert.equal(await popup.locator('#custom-model-name').inputValue(), 'qwen3.8-flash');
    await popup.locator('#api-protocol').selectOption('anthropic');
    assert.equal(await popup.locator('#custom-api-url').inputValue(), 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages');
    await popup.locator('#api-key').fill('fake-plan-key');
    await popup.locator('#detect-models').click();
    await popup.waitForFunction(() => document.querySelector('#tips-model-name').textContent.includes('官方文档参考模型'));
    assert(planRequests.every(r => r.method === 'GET'));
    assert(planRequests.some(r => r.url.endsWith('/compatible-mode/v1/models')));
    assert((await popup.locator('#panel-feedback').textContent()).includes('尚未验证 Key'));
    // The separate, explicit probe is the only action allowed to generate tokens.
    await popup.locator('#api-protocol').selectOption('openai');
    await popup.locator('#probe-model').click();
    await popup.waitForFunction(() => document.querySelector('#probe-status').textContent.includes('已接受测试请求'));
    const probe = planRequests.find(r => r.method === 'POST'); assert(probe); assert.equal(probe.body.max_tokens, 32); assert.equal(probe.body.stream, false);
    await popup.locator('#lang-toggle').click();
    assert.match(await popup.locator('#worker-warning-text').textContent(), /background is unavailable/);
    assert.match(await popup.locator('#probe-status').textContent(), /accepted the test request/);
    await fs.mkdir('dist/qa', { recursive: true }); await popup.evaluate(() => window.scrollTo(0, 0));
    await popup.screenshot({ path: 'dist/qa/token-plan-old-worker.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Missing-receiver regression passed: exact original error reproduced; direct model detection works without a worker receiver; Token Plan URL/protocol/fallback/auth/probe/localization verified.');
  } finally { await context?.close(); await fs.rm(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
