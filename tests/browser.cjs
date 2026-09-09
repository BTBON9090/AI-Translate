const { chromium } = require('playwright');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
 const requests = [], errors = [];
 const server = http.createServer(async (req, res) => {
   if (req.url.includes('/models')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'test-model' }, { id: 'other-model' }] })); return; }
   if (req.method === 'POST') {
     let raw = ''; for await (const part of req) raw += part;
     const body = JSON.parse(raw); requests.push({ url: req.url, body });
     const source = body.input || body.messages?.at(-1)?.content || '';
     let texts; try { texts = JSON.parse(source); } catch {}
     const result = Array.isArray(texts) ? JSON.stringify(texts.map(s => `译文：${s}`)) : `译文：${source}`;
     const events = req.url.endsWith('/responses') ? [{ type: 'response.output_text.delta', delta: result }, { type: 'response.completed' }] : req.url.endsWith('/messages') ? [{ type: 'content_block_delta', delta: { type: 'text_delta', text: result } }, { type: 'message_stop' }] : [{ choices: [{ delta: { content: result } }] }];
     res.setHeader('Content-Type', 'text/event-stream'); res.end(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'); return;
   }
   res.setHeader('Content-Type', 'text/html; charset=utf-8');
   res.end(`<!doctype html><html><head><title>Translation regression</title><style>body{font:18px/1.6 sans-serif;max-width:760px;margin:40px auto}p{margin:16px 0}</style></head><body><h1>Reading without interruptions</h1><p id="first">The river bank is a peaceful place to read.</p><p id="second">The river bank is a peaceful place to read.</p><p id="third">Keep your translation when returning to this page.</p><div id="dynamic"></div></body></html>`);
 });
 await new Promise(r => server.listen(0, '127.0.0.1', r));
 const base = `http://127.0.0.1:${server.address().port}`;
 const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-translate-test-'));
 const artifactDir = path.resolve('dist/qa'); await fs.mkdir(artifactDir, { recursive: true });
 let context;
 const launch = async () => chromium.launchPersistentContext(profile, { executablePath: chromium.executablePath(), headless: true, args: [`--disable-extensions-except=${path.resolve('.')}`, `--load-extension=${path.resolve('.')}`], viewport: { width: 1000, height: 800 } });
 try {
   context = await launch();
   context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
   let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
   const id = new URL(worker.url()).host;
   await worker.evaluate(async base => { await chrome.storage.local.set({ provider: 'custom', apiUrl: `${base}/v1/chat/completions`, apiKey: 'test-only', modelName: 'test-model', protocol: 'openai', targetLang: 'zh', bilingualMode: true, autoSites: ['127.0.0.1'] }); }, base);
   const page = await context.newPage(); await page.goto(base + '/article');
   await page.waitForFunction(() => document.querySelectorAll('.ai-trans-minimal:not(.ai-translation-pending)').length >= 4);
   await page.waitForFunction(() => !document.querySelector('.ai-translator-bubble.translating'));
   assert.equal(await page.locator('#first .ai-trans-minimal').count(), 1);
   const firstCount = requests.length;
   await page.reload(); await page.waitForFunction(() => document.querySelector('#third .ai-trans-minimal')?.textContent.includes('译文'));
   assert.equal(requests.length, firstCount, 'reload must use durable paragraph cache');
   await page.evaluate(() => { history.pushState({}, '', '/another'); document.querySelector('#dynamic').innerHTML = '<p>New route content appears here.</p>'; });
   await page.waitForFunction(() => document.querySelector('#dynamic .ai-trans-minimal')?.textContent.includes('译文'));
   assert.equal(requests.length, firstCount + 1, 'SPA should only request new text');
   await page.evaluate(() => { document.querySelector('#first').firstChild.nodeValue = 'A changed paragraph must receive a new translation.'; });
   await page.waitForFunction(() => document.querySelector('#first .ai-trans-minimal')?.textContent.includes('changed paragraph'));
   await page.evaluate(() => { document.querySelector('#third').innerHTML = 'Keep your translation <a href="#example">when returning</a> to this page.'; });
   await page.waitForFunction(() => document.querySelector('#third .ai-trans-minimal')?.textContent.includes('when returning'));
   assert.equal(await page.locator('#third a').textContent(), 'when returning');
   const beforeMutations = requests.length;
   await page.evaluate(() => { for (let i = 0; i < 1000; i++) { document.body.style.setProperty('--tick', String(i)); document.querySelector('#second').className = `tick-${i}`; } });
   await page.waitForTimeout(800); assert.equal(requests.length, beforeMutations, 'cosmetic mutations must not retranslate');
   await page.evaluate(() => {
     const long = document.createElement('section'); long.id = 'stress'; long.style.marginTop = '2000px';
     const fragment = document.createDocumentFragment();
     for (let i = 0; i < 12000; i++) { const p = document.createElement('p'); p.textContent = `Offscreen paragraph ${i} with enough text to translate.`; fragment.append(p); }
     long.append(fragment); document.body.append(long);
     window.heartbeat = 0; window.heartbeatTimer = setInterval(() => window.heartbeat++, 20);
   });
   await page.waitForFunction(() => window.heartbeat >= 10, null, { timeout: 5000 });
   assert.equal(requests.length, beforeMutations, 'offscreen stress content must not generate API requests');
   await page.evaluate(() => { clearInterval(window.heartbeatTimer); document.querySelector('#stress').remove(); });
   await worker.evaluate(() => chrome.storage.local.set({ bilingualMode: false }));
   const pageId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(t => t.url?.includes('/another'))?.id);
   await worker.evaluate(id => chrome.tabs.sendMessage(id, { action: 'TRANSLATION_SETTINGS_CHANGED' }), pageId);
   await page.waitForFunction(() => document.querySelector('#first .ai-trans-replacement')?.textContent.includes('changed paragraph'));
   await page.evaluate(() => { document.querySelector('#first .ai-origin-text').firstChild.nodeValue = 'Replacement mode changed text.'; });
   await page.waitForFunction(() => document.querySelector('#first .ai-trans-replacement')?.textContent.includes('Replacement mode changed text.'));
   await page.evaluate(() => { document.querySelector('#first').append(document.createTextNode(' Appended words.')); });
   await page.waitForFunction(() => document.querySelector('#first .ai-trans-replacement')?.textContent.includes('Appended words.'));
   await worker.evaluate(() => chrome.storage.local.set({ bilingualMode: true }));
   await worker.evaluate(id => chrome.tabs.sendMessage(id, { action: 'TRANSLATION_SETTINGS_CHANGED' }), pageId);
   await page.waitForFunction(() => document.querySelector('#third .ai-trans-minimal')?.textContent.includes('when returning'));
   // Drag to left edge and ensure it survives reload.
   const bubble = page.locator('.ai-translator-bubble'); await bubble.hover(); const rect = await bubble.boundingBox();
   await page.mouse.move(rect.x + 10, rect.y + 10); await page.mouse.down(); await page.mouse.move(12, 250, { steps: 10 }); await page.mouse.up();
   await page.waitForFunction(() => document.querySelector('.ai-translator-bubble')?.dataset.edge === 'left');
   // Select text by range then deliver native mouseup through dispatch.
   await page.evaluate(() => { const node = document.querySelector('#third').firstChild; const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 20); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); node.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
   await page.locator('.ai-selection-btn').click(); await page.waitForFunction(() => document.querySelector('.ai-card-translation')?.textContent.startsWith('译文'));
   await page.locator('.ai-explain-btn').click(); await page.waitForFunction(() => document.querySelector('.ai-explain-btn')?.textContent.includes('已解读'));
   const explainedCount = requests.length; await page.locator('.ai-explain-btn').click(); await page.locator('.ai-explain-btn').click(); assert.equal(requests.length, explainedCount);
   await page.screenshot({ path: path.join(artifactDir, 'selection.png') });
   await page.keyboard.press('Escape'); assert.equal(await page.locator('.ai-card').count(), 0);
   const popup = await context.newPage(); await popup.setViewportSize({ width: 400, height: 600 }); await popup.goto(`chrome-extension://${id}/popup/popup.html`);
   await popup.locator('#text-input').fill('bank'); await popup.locator('#translate-text').click(); await popup.waitForFunction(() => document.querySelector('#text-status').textContent.startsWith('已完成'));
   await popup.screenshot({ path: path.join(artifactDir, 'text-zh.png') });
   await popup.locator('#lang-toggle').click(); assert.equal(await popup.locator('html').getAttribute('lang'), 'en'); assert.equal(await popup.locator('#translate-text').textContent(), 'Translate');
   await popup.screenshot({ path: path.join(artifactDir, 'text-en.png') });
   await popup.locator('[data-panel-target="model"]').click();
   await popup.locator('#detect-models').click(); await popup.waitForFunction(() => document.querySelector('#tips-model-name').textContent.includes('Models returned by API'));
   assert.equal(await popup.locator('#model-dropdown [role="option"]').count(), 2);
   await popup.locator('#custom-model-name').press('ArrowDown'); await popup.locator('#custom-model-name').press('Enter');
   await popup.locator('#api-protocol').selectOption('responses'); await popup.locator('#save-key-btn').click(); await popup.waitForFunction(() => document.querySelector('#panel-feedback').textContent === 'Model settings saved.');
   await popup.evaluate(() => window.scrollTo(0, 0)); await popup.screenshot({ path: path.join(artifactDir, 'models-en.png'), fullPage: true });
   await popup.locator('[data-panel-target="text"]').click(); await popup.locator('#text-input').fill('responses text'); await popup.locator('#translate-text').click(); await popup.waitForFunction(() => document.querySelector('#text-status').textContent.startsWith('Done')); assert.equal(requests.at(-1).url, '/v1/responses');
   await popup.locator('[data-panel-target="model"]').click(); await popup.locator('#api-protocol').selectOption('anthropic'); await popup.locator('#save-key-btn').click();
   await popup.waitForFunction(() => document.querySelector('#custom-api-url').value.endsWith('/messages'));
   await popup.locator('[data-panel-target="text"]').click(); await popup.locator('#text-input').fill('anthropic text'); await popup.locator('#translate-text').click(); await popup.waitForFunction(() => document.querySelector('#text-status').textContent.startsWith('Done')); assert.equal(requests.at(-1).url, '/v1/messages');
   await popup.locator('#lang-toggle').click(); assert.equal(await popup.locator('#translate-text').textContent(), '翻译');
   await worker.evaluate(async base => { await chrome.storage.local.set({ protocol: 'openai', apiUrl: `${base}/v1/chat/completions`, modelName: 'test-model', providerProfiles: {} }); }, base);
   await context.close(); context = await launch(); worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
   const reopened = await context.newPage(); const beforeRestart = requests.length; await reopened.goto(base + '/article'); await reopened.waitForFunction(() => document.querySelector('#third .ai-trans-minimal')?.textContent.includes('译文'));
   assert.equal(requests.length, beforeRestart, 'browser restart must use persistent cache'); assert.equal(await reopened.locator('.ai-translator-bubble').getAttribute('data-edge'), 'left');
   assert.deepEqual(errors, []);
   console.log('Browser regression passed: auto/reload/SPA/dynamic DOM/selection/docking/i18n/discovery/all protocols/browser restart.');
 } finally { await context?.close(); server.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
