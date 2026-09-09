'use strict';
const UPDATE_ORIGIN = 'https://ai-translate-release-1317980685.cos.ap-shanghai.myqcloud.com';
const UPDATE_MANIFEST_URL = `${UPDATE_ORIGIN}/update_manifest.json`;
document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const providers = AI_TRANSLATE_PROVIDER_CATALOG.providers;
  let settings = await chrome.storage.local.get(['apiKey', 'apiUrl', 'modelName', 'provider', 'protocol', 'providerProfiles', 'targetLang', 'textTargetLang', 'bilingualMode', 'transStyle', 'showBubble', 'autoSites', 'uiLang']);
  let lang = settings.uiLang === 'en' ? 'en' : 'zh';
  const t = text => AITranslateI18n.text(text, lang);
  let provider = providers[settings.provider] ? settings.provider : AI_TRANSLATE_PROVIDER_CATALOG.defaultProvider;
  let profiles = { ...settings.providerProfiles };
  if (!profiles[provider]) profiles[provider] = { apiKey: settings.apiKey || '', apiUrl: settings.apiUrl || providers[provider].url, modelName: settings.modelName || providers[provider].model, protocol: settings.protocol || providers[provider].protocol || 'openai' };
  let detectionController = null, probeController = null, workerUnavailable = false;
  let models = [], listSource = 'recommended', modelIndex = -1, detectEpoch = 0;
  let tab = null, domain = '', translatingPage = false, textPort = null, result = '', textMode = 'dictionary';
  let textHeartbeat = null;
  let update = null, updateState = 'idle';
  const version = chrome.runtime.getManifest().version;
  $('current-version').textContent = version;
  $('text-target').replaceChildren(...[...$('target-lang').options].map(option => option.cloneNode(true)));
  const tabs = [...document.querySelectorAll('[data-panel-target]')];
  function panel(name) {
    window.scrollTo({ top: 0 });
    tabs.forEach(button => { const active = button.dataset.panelTarget === name; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    document.querySelectorAll('[data-panel]').forEach(view => view.classList.toggle('hidden', view.dataset.panel !== name));
    if (name === 'about') { refreshCache(); if (updateState === 'idle') checkUpdate(); }
  }
  tabs.forEach(button => button.addEventListener('click', () => panel(button.dataset.panelTarget)));
  function feedback(message = '', success = false) { $('panel-feedback').textContent = message; $('panel-feedback').style.color = success ? 'var(--success)' : 'var(--danger)'; }
  async function broadcast(message) {
    const openTabs = await chrome.tabs.query({});
    await Promise.allSettled(openTabs.filter(item => item.id).map(item => chrome.tabs.sendMessage(item.id, message)));
  }
  function renderProviderLabels() {
    $('provider-select').replaceChildren(...Object.entries(providers).map(([id, p]) => { const option = document.createElement('option'); option.value = id; option.textContent = lang === 'en' ? p.labelEn : p.labelZh; return option; }));
    $('provider-select').value = provider;
    const config = providers[provider];
    $('provider-endpoint').textContent = (lang === 'en' ? config.endpointNoteEn : config.endpointNoteZh) || t('地址与 API Key 必须来自同一服务商和地域。');
    $('provider-docs').href = config.docsUrl || 'https://developers.openai.com/api/docs';
    $('provider-docs').classList.toggle('hidden', !config.docsUrl);
  }
  function modelTips() {
    $('tips-model-name').textContent = listSource === 'api' ? `${t('接口已返回模型')} · ${models.length} · ${t('可搜索或手动输入 ID')}` : listSource === 'builtin' ? t('内置免费代理，无需 API Key') : listSource === 'catalog' ? t('官方文档参考模型，未验证当前 Key 或模型权限') : t('推荐模型（未经检测），也可手动输入 ID');
  }
  function renderLocale() {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'; document.title = t('AI 极简翻译');
    const names = new Intl.DisplayNames([lang === 'en' ? 'en' : 'zh-Hans'], { type: 'language' });
    for (const id of ['target-lang', 'text-target']) [...$(id).options].forEach(option => { option.textContent = option.value === 'zh' ? (lang === 'en' ? 'Simplified Chinese' : '简体中文') : option.value === 'zh-TW' ? (lang === 'en' ? 'Traditional Chinese' : '繁體中文') : names.of(option.value); });
    AITranslateI18n.apply(document.body, lang);
    $('app-title').textContent = t('AI 极简翻译'); $('lang-toggle').textContent = lang === 'en' ? '中文' : 'EN';
    renderProviderLabels(); modelTips(); renderPageButton(); renderUpdate(); renderWorkerWarning();
    $('toggle-visibility').textContent = t($('api-key').type === 'password' ? '显示' : '隐藏');
    $('result-heading').textContent = t(textMode === 'explain' ? '精细解释' : '翻译结果');
    if (textPort) $('text-status').textContent = t('正在翻译…');
    else if ($('text-status').textContent.includes(' · ')) { $('text-status').textContent = $('text-status').textContent.split(' · ').map(part => AITranslateI18n.text(part, lang)).join(' · '); }
    $('panel-feedback').textContent = AITranslateI18n.translateMessage($('panel-feedback').textContent, lang);
  }
  function draft() { return { apiKey: $('api-key').value.trim(), apiUrl: $('custom-api-url').value.trim(), modelName: $('custom-model-name').value.trim(), protocol: $('api-protocol').value }; }
  function invalidateDetection() { detectionController?.abort(); probeController?.abort(); $('probe-model').disabled = false; $('probe-status').textContent = ''; detectEpoch++; $('detect-models').disabled = false; $('refresh-models-btn').disabled = false; $('detect-models').textContent = t('检测并获取模型'); models = providers[provider].commonModels || []; listSource = 'recommended'; closeModels(); modelTips(); }
  function loadProvider() {
    invalidateDetection(); renderProviderLabels();
    const config = providers[provider], profile = profiles[provider] || {};
    $('api-key').value = profile.apiKey || ''; $('api-key').type = 'password';
    $('custom-api-url').value = profile.apiUrl ?? config.baseUrl ?? config.url ?? ''; $('custom-api-url').placeholder = config.urlPlaceholder || config.baseUrl || 'https://api.example.com/v1';
    $('api-protocol').value = profile.protocol || config.protocol || 'openai';
    $('custom-model-name').value = profile.modelName ?? config.model ?? '';
    $('custom-model-name').placeholder = 'model-id';
    $('custom-url-row').classList.toggle('hidden', !!config.isBuiltin);
    $('api-protocol').closest('label').classList.toggle('hidden', !!config.isBuiltin);
    $('key-detection').classList.toggle('hidden', !!config.isBuiltin);
    $('custom-model-name').disabled = !!config.isBuiltin;
    $('model-dropdown-btn').disabled = !!config.isBuiltin;
    $('refresh-models-btn').classList.toggle('hidden', !!config.isBuiltin);
    $('save-key-btn').disabled = false;
    $('probe-model').classList.toggle('hidden', !!config.isBuiltin);
    models = config.commonModels || []; listSource = config.isBuiltin ? 'builtin' : 'recommended';
    modelTips(); updateClearButtons();
  }
  $('provider-select').addEventListener('change', () => { profiles[provider] = draft(); provider = $('provider-select').value; loadProvider(); feedback(); });
  for (const id of ['api-key', 'custom-api-url', 'api-protocol']) $(id).addEventListener(id === 'api-protocol' ? 'change' : 'input', () => { invalidateDetection(); feedback(); });
  $('api-protocol').addEventListener('change', () => { try { $('custom-api-url').value = AITranslateProtocol.endpoint($('custom-api-url').value, $('api-protocol').value); } catch {} });
  function closeModels() { $('model-dropdown').classList.add('hidden'); $('custom-model-name').setAttribute('aria-expanded', 'false'); $('custom-model-name').removeAttribute('aria-activedescendant'); modelIndex = -1; }
  function selectModel(id) { probeController?.abort(); $('probe-model').disabled = false; $('probe-status').textContent = ''; $('custom-model-name').value = id; closeModels(); updateClearButtons(); $('custom-model-name').focus(); }
  function renderModels(filter = '') {
    const filtered = models.filter(id => id.toLowerCase().includes(filter.toLowerCase())).slice(0, 200);
    const dropdown = $('model-dropdown'); dropdown.replaceChildren();
    if (!filtered.length) { const empty = document.createElement('div'); empty.className = 'model-dropdown-item empty'; empty.textContent = t('没有匹配模型，可手动填写 ID'); dropdown.append(empty); }
    filtered.forEach((id, index) => {
      const item = document.createElement('div'); item.id = `model-option-${index}`; item.className = 'model-dropdown-item'; item.textContent = id; item.title = id; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(index === modelIndex));
      item.addEventListener('mousedown', event => { event.preventDefault(); selectModel(id); }); dropdown.append(item);
    });
    dropdown.classList.remove('hidden'); $('custom-model-name').setAttribute('aria-expanded', 'true');
  }
  $('model-dropdown-btn').addEventListener('click', () => { if ($('model-dropdown').classList.contains('hidden')) { modelIndex = -1; renderModels(); } else closeModels(); });
  $('custom-model-name').addEventListener('input', () => { probeController?.abort(); $('probe-model').disabled = false; $('probe-status').textContent = ''; modelIndex = -1; renderModels($('custom-model-name').value); });
  $('custom-model-name').addEventListener('keydown', event => {
    if (event.key === 'Escape') return closeModels();
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    if (event.key !== 'Enter' && $('model-dropdown').classList.contains('hidden')) renderModels();
    const items = [...$('model-dropdown').querySelectorAll('[role="option"]')];
    if (event.key === 'Enter') { if (items[modelIndex]) { event.preventDefault(); selectModel(items[modelIndex].textContent); } return; }
    event.preventDefault(); modelIndex = Math.max(0, Math.min(items.length - 1, modelIndex + (event.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((item, index) => { item.classList.toggle('active', index === modelIndex); item.setAttribute('aria-selected', String(index === modelIndex)); });
    if (items[modelIndex]) { $('custom-model-name').setAttribute('aria-activedescendant', items[modelIndex].id); items[modelIndex].scrollIntoView({ block: 'nearest' }); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.model-select-wrapper')) closeModels(); });
  async function detect() {
    detectionController?.abort(); detectionController = new AbortController();
    const epoch = ++detectEpoch;
    $('detect-models').disabled = true; $('refresh-models-btn').disabled = true; $('detect-models').textContent = t('正在检测…'); feedback();
    try {
      const config = draft();
      config.apiUrl = AITranslateConnection.resolve({ ...config, provider }).apiUrl;
      const response = await AITranslateConnection.discover({ ...config, provider }, { signal: detectionController.signal });
      if (epoch !== detectEpoch) return;
      if (response?.error) throw new Error(response.error);
      models = response.models || []; listSource = response.source; modelTips();
      $('custom-api-url').value = config.apiUrl;
      modelIndex = -1; renderModels();
      feedback(t(response.source === 'catalog' ? '接口未提供可读取的模型列表；已显示官方参考模型，尚未验证 Key。可选择模型后测试连接。' : '已获取模型列表；请选择模型后保存。列表可见不代表该模型支持当前协议。'), response.source === 'api');
    } catch (error) { if (epoch === detectEpoch) { models = providers[provider].commonModels || []; listSource = 'recommended'; modelTips(); feedback(`${t('检测失败')} · ${AITranslateConnection.describe(error, lang)}`); } }
    finally { if (epoch === detectEpoch) { $('detect-models').disabled = false; $('refresh-models-btn').disabled = false; $('detect-models').textContent = t('检测并获取模型'); } }
  }
  $('detect-models').addEventListener('click', detect); $('refresh-models-btn').addEventListener('click', detect);
  async function saveProfile() {
      const config = providers[provider], profile = draft();
      if (config.isBuiltin) Object.assign(profile, { apiKey: '', apiUrl: config.url, modelName: config.model, protocol: 'openai' });
      else { profile.apiUrl = AITranslateProtocol.endpoint(profile.apiUrl, profile.protocol); if (!profile.apiKey && provider !== 'custom') throw new Error(t('请填写 API Key。')); }
      if (!profile.modelName) throw new Error(t('请填写模型 ID。'));
      // Persist only this profile; other unsaved drafts remain in this popup.
      const saved = await chrome.storage.local.get(['providerProfiles']);
      const savedProfiles = { ...saved.providerProfiles, [provider]: profile };
      await chrome.storage.local.set({ ...profile, provider, providerProfiles: savedProfiles, providerConfigVersion: AI_TRANSLATE_PROVIDER_CATALOG.version });
      profiles[provider] = profile; settings = { ...settings, ...profile, provider }; $('custom-api-url').value = profile.apiUrl;
  }
  $('save-key-btn').addEventListener('click', async () => {
    try { await saveProfile(); feedback(t('模型配置已保存。'), true); renderPageButton(); }
    catch (error) { feedback(error.message); }
  });
  function renderWorkerWarning() {
    $('worker-warning').classList.toggle('hidden', !workerUnavailable);
    $('worker-warning-text').textContent = t('插件后台未就绪或版本不一致。模型列表仍可检测；翻译前请重新加载插件。');
  }
  async function checkWorker() {
    let timer;
    try {
      const response = await Promise.race([
        chrome.runtime.sendMessage({ action: 'BACKGROUND_STATUS' }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('worker timeout')), 5000); })
      ]);
      workerUnavailable = !response || response.version !== version || response.connectionVersion !== 1;
    } catch { workerUnavailable = true; }
    finally { clearTimeout(timer); renderWorkerWarning(); }
  }
  $('reload-extension').addEventListener('click', async () => {
    try { await saveProfile(); chrome.runtime.reload(); }
    catch (error) { feedback(error.message); }
  });
  $('probe-model').addEventListener('click', async () => {
    probeController?.abort(); const controller = new AbortController(); probeController = controller;
    $('probe-model').disabled = true; $('probe-status').textContent = t('正在测试模型连接…');
    try {
      await AITranslateConnection.probe({ ...draft(), provider }, { signal: controller.signal });
      if (!controller.signal.aborted) $('probe-status').textContent = t('模型接口已接受测试请求；可保存使用。');
    } catch (error) {
      if (!controller.signal.aborted) $('probe-status').textContent = AITranslateConnection.describe(error, lang);
    } finally { if (probeController === controller) $('probe-model').disabled = false; }
  });
  $('toggle-visibility').addEventListener('click', () => { const visible = $('api-key').type === 'password'; $('api-key').type = visible ? 'text' : 'password'; $('toggle-visibility').textContent = t(visible ? '隐藏' : '显示'); $('toggle-visibility').setAttribute('aria-pressed', String(visible)); });
  function updateClearButtons() { document.querySelectorAll('.clear-btn').forEach(button => { button.classList.toggle('visible', !!$(button.dataset.target)?.value); button.setAttribute('aria-label', t('清除')); }); }
  document.querySelectorAll('.clear-btn').forEach(button => button.addEventListener('click', () => { const input = $(button.dataset.target); input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); }));
  ['api-key', 'custom-api-url', 'custom-model-name'].forEach(id => $(id).addEventListener('input', updateClearButtons));
  $('lang-toggle').addEventListener('click', async () => { lang = lang === 'en' ? 'zh' : 'en'; await chrome.storage.local.set({ uiLang: lang }); renderLocale(); await broadcast({ action: 'UI_LANGUAGE_CHANGED', uiLang: lang }); });
  function renderPageButton() { document.querySelector('#main-action-btn .btn-text').textContent = t(translatingPage ? '显示原文' : '翻译当前页面'); $('main-action-btn').classList.toggle('restoring', translatingPage); $('btn-model-display').textContent = `${t('模型')}: ${settings.modelName || providers[settings.provider || provider]?.model || '—'}`; }
  $('main-action-btn').addEventListener('click', async () => {
    if ($('main-action-btn').closest('[data-panel]').classList.contains('hidden') || $('main-action-btn').disabled) return;
    $('main-action-btn').disabled = true;
    try {
      if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error(t('此页面无法翻译，请打开普通网页。'));
      const state = await chrome.tabs.sendMessage(tab.id, { action: 'SET_PAGE_TRANSLATION', enabled: !translatingPage });
      if (typeof state?.isTranslating !== 'boolean') throw new Error('Refresh content script');
      translatingPage = state.isTranslating; renderPageButton(); feedback();
    } catch { feedback(t('请刷新网页后重试；浏览器内部页面不支持翻译。')); }
    finally { $('main-action-btn').disabled = false; }
  });
  $('target-lang').value = settings.targetLang || 'zh'; $('text-target').value = settings.textTargetLang || settings.targetLang || 'zh';
  $('bilingual-mode').checked = settings.bilingualMode !== false; $('trans-style').value = settings.transStyle || 'minimal'; $('show-bubble').checked = settings.showBubble !== false;
  $('style-setting-row').classList.toggle('visible', $('bilingual-mode').checked);
  for (const [id, key] of [['target-lang', 'targetLang'], ['bilingual-mode', 'bilingualMode'], ['trans-style', 'transStyle'], ['show-bubble', 'showBubble']]) {
    $(id).addEventListener('change', async () => {
      const value = $(id).type === 'checkbox' ? $(id).checked : $(id).value;
      await chrome.storage.local.set({ [key]: value }); $('style-setting-row').classList.toggle('visible', $('bilingual-mode').checked);
      await broadcast(key === 'showBubble' ? { action: 'UPDATE_SETTINGS', payload: { showBubble: value } } : { action: 'TRANSLATION_SETTINGS_CHANGED' });
    });
  }
  $('auto-translate-site').addEventListener('change', async () => {
    if (!domain) return;
    const { autoSites = [] } = await chrome.storage.local.get(['autoSites']);
    await chrome.storage.local.set({ autoSites: $('auto-translate-site').checked ? [...new Set([...autoSites, domain])] : autoSites.filter(site => site !== domain) });
    await chrome.tabs.sendMessage(tab.id, { action: 'AUTO_TRANSLATE_SETTING_CHANGED', enabled: $('auto-translate-site').checked }).catch(() => feedback(t('请刷新网页后重试；浏览器内部页面不支持翻译。')));
  });
  function busyText(busy) { $('translate-text').disabled = busy || !$('text-input').value.trim(); $('explain-text').disabled = busy || !$('text-input').value.trim(); $('stop-text').classList.toggle('hidden', !busy); $('text-result').setAttribute('aria-busy', String(busy)); $('copy-text').disabled = busy || !result; }
  function stopText() { clearInterval(textHeartbeat); const port = textPort; textPort = null; port?.disconnect(); busyText(false); if (port) $('text-status').textContent = t('已停止'); }
  $('text-input').addEventListener('input', () => { stopText(); $('text-count').textContent = `${$('text-input').value.length} / 16000`; busyText(false); });
  $('text-target').addEventListener('change', () => { stopText(); chrome.storage.local.set({ textTargetLang: $('text-target').value }); });
  $('clear-text').addEventListener('click', () => { stopText(); $('text-input').value = ''; result = ''; $('text-result').textContent = ''; $('text-result-wrap').classList.add('hidden'); $('text-input').dispatchEvent(new Event('input')); $('text-input').focus(); });
  $('stop-text').addEventListener('click', stopText);
  function translateText(mode) {
    const text = $('text-input').value.trim(); if (!text || text.length > 16000 || textPort) return;
    textMode = mode; result = ''; $('text-result').textContent = ''; $('text-result-wrap').classList.remove('hidden'); $('result-heading').textContent = t(mode === 'explain' ? '精细解释' : '翻译结果');
    $('text-status').textContent = t('正在翻译…');
    let port, frame = 0;
    try { port = chrome.runtime.connect({ name: 'stream-translate' }); } catch { $('text-status').textContent = t('连接失败，请重试。'); return; }
    textPort = port; busyText(true);
    textHeartbeat = setInterval(() => { try { port.postMessage({ action: 'PING' }); } catch {} }, 20000);
    const flush = () => { frame = 0; $('text-result').textContent = result; };
    const finish = status => { clearInterval(textHeartbeat); if (frame) cancelAnimationFrame(frame); flush(); textPort = null; port.disconnect(); busyText(false); $('text-status').textContent = status; };
    port.onMessage.addListener(msg => {
      if (textPort !== port) return;
      if (msg.action === 'CHUNK') { result += msg.content || ''; if (!frame) frame = requestAnimationFrame(flush); }
      if (msg.action === 'DONE') finish(t(msg.cached ? '已完成 · 复用已有结果' : '已完成'));
      if (msg.error) finish(`${t('翻译失败')} · ${msg.error}`);
    });
    port.onDisconnect.addListener(() => { clearInterval(textHeartbeat); if (frame) cancelAnimationFrame(frame); if (textPort === port) { textPort = null; busyText(false); $('text-status').textContent = t('连接中断，请重试。'); void checkWorker(); } });
    port.postMessage({ action: 'TRANSLATE', text, targetLang: mode === 'explain' ? lang : $('text-target').value, mode });
  }
  $('translate-text').addEventListener('click', () => translateText('dictionary')); $('explain-text').addEventListener('click', () => translateText('explain'));
  $('text-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing || event.keyCode === 229) return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) translateText('dictionary');
  });
  $('copy-text').addEventListener('click', async () => { try { await navigator.clipboard.writeText(result); $('text-status').textContent = t('已复制'); } catch { $('text-status').textContent = t('复制失败，请手动选择文字。'); } });
  window.addEventListener('pagehide', () => { stopText(); detectionController?.abort(); probeController?.abort(); });
  async function refreshCache() { try { const info = await chrome.runtime.sendMessage({ action: 'CACHE_INFO' }); $('cache-info').textContent = `${info.count} ${t('条段落')} · ${(info.bytes / 1024 / 1024).toFixed(2)} MB${info.writeFailed ? ` · ${t('本地写入失败')}` : ''}`; } catch {} }
  $('clear-cache').addEventListener('click', async () => { const response = await chrome.runtime.sendMessage({ action: 'CLEAR_CACHE' }); if (response.error) feedback(response.error); else refreshCache(); });
  function newer(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; }
  function renderUpdate() {
    $('check-update-btn').disabled = updateState === 'checking';
    $('check-update-btn').textContent = update ? `${t('下载')} v${update.version}` : t('检查更新');
    $('update-status').textContent = updateState === 'checking' ? t('正在检查最新版…') : update ? `${t('发现新版本')} v${update.version}` : updateState === 'failed' ? t('暂时无法连接更新服务器') : `v${version} · ${t(updateState === 'latest' ? '已是最新版' : '当前版本')}`;
    $('update-notes').classList.toggle('hidden', !update); $('update-notes').textContent = update ? (lang === 'en' ? update.releaseNotesEn || update.releaseNotes : update.releaseNotes) || '' : '';
  }
  async function checkUpdate() {
    updateState = 'checking'; renderUpdate();
    try {
      const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('update'); const data = await response.json(); const url = new URL(data.downloadUrl);
      if (!/^\d+\.\d+\.\d+$/.test(data.version) || url.origin !== UPDATE_ORIGIN) throw new Error('manifest');
      update = newer(data.version, version) ? data : null; updateState = update ? 'available' : 'latest';
    } catch { updateState = 'failed'; } renderUpdate();
  }
  $('check-update-btn').addEventListener('click', async () => { if (update) { await chrome.tabs.create({ url: update.downloadUrl }); feedback(t('解压下载文件后，请在扩展管理页重新加载。'), true); } else checkUpdate(); });
  $('copy-qq').addEventListener('click', async () => { try { await navigator.clipboard.writeText('376556413'); feedback(t('已复制'), true); } catch { feedback(t('复制失败，请手动选择文字。')); } });
  loadProvider(); renderLocale(); busyText(false); void checkWorker();
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:/.test(tab.url)) { domain = new URL(tab.url).hostname; $('current-host').textContent = domain; $('auto-translate-site').checked = (settings.autoSites || []).includes(domain); const state = await chrome.tabs.sendMessage(tab.id, { action: 'GET_STATE' }); translatingPage = !!state?.isTranslating; renderPageButton(); }
  } catch {}
  $('auto-translate-site').disabled = !domain;
});
