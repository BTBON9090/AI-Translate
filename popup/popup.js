if (!globalThis.chrome?.storage?.local && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  const previewStore = { provider: 'deepseek', targetLang: 'zh', bilingualMode: true, transStyle: 'minimal', showBubble: true };
  globalThis.chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const list = Array.isArray(keys) ? keys : Object.keys(keys || previewStore);
          const result = Object.fromEntries(list.filter(key => key in previewStore).map(key => [key, previewStore[key]]));
          if (callback) callback(result);
          return Promise.resolve(result);
        },
        set(values, callback) {
          Object.assign(previewStore, values);
          if (callback) callback();
          return Promise.resolve();
        }
      }
    },
    tabs: {
      query(_query, callback) {
        const tabs = [{ id: 1, url: 'https://example.com/article' }];
        if (callback) callback(tabs);
        return Promise.resolve(tabs);
      },
      sendMessage(_id, message, callback) {
        const response = message.action === 'GET_STATE' ? { isTranslating: false } : {};
        if (callback) callback(response);
        return Promise.resolve(response);
      },
      create({ url }) {
        return Promise.resolve({ id: 2, url });
      }
    },
    runtime: {
      lastError: null,
      getManifest() { return { version: '2.0.1' }; }
    }
  };
}

const UPDATE_ORIGIN = 'https://ai-translate-release-1317980685.cos.ap-shanghai.myqcloud.com';
const UPDATE_MANIFEST_URL = `${UPDATE_ORIGIN}/update_manifest.json`;
const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

document.addEventListener('DOMContentLoaded', () => {
  const i18n = {
    zh: {
      appTitle: "AI 极简翻译", statusReady: "就绪",
      btnTrans: "翻译当前页面", btnRestore: "显示原文",
      lblTarget: "目标语言", lblBiMode: "双语对照", lblStyle: "对照样式",
      optMinimal: "轻量", optHighlight: "高亮",
      lblBubble: "悬浮翻译入口", lblAuto: "始终翻译此网站",
      headerApi: "模型连接", placeholderKey: "sk-...",
      btnSave: "保存并使用", btnSaved: "已保存",
      tipsKey: "Key 仅保存在浏览器本地。网页文本会发送到你选择的模型服务商。", langBtn: "EN",
      lblCurrentModel: "模型: ", lblProvider: "模型服务商",
      lblModelName: "模型名称", tipsModel: "可选择推荐模型，也可直接输入",
      tipsModelFetching: "正在获取模型列表...",
      tipsModelFetched: "已获取 {{count}} 个模型 · 可手动输入",
      tipsModelFetchError: "获取失败，使用推荐模型 · 可手动输入",
      tipsModelBuiltin: "内置免费模型，无需配置 API Key，开箱即用",
      dropdownEmpty: "暂无可用模型",
      updateTitle: "版本更新", updateChecking: "正在检查最新版…", updateCheck: "检查更新",
      updateLatest: "当前 v{{version}} 已是最新版", updateAvailable: "发现新版本 v{{version}}",
      updateFailed: "暂时无法连接更新服务器", updateDownload: "下载 v{{version}}",
      updateDownloaded: "已开始下载，解压后请在扩展管理页重新加载"
    },
    en: {
      appTitle: "AI Translate", statusReady: "Ready",
      btnTrans: "Translate Page", btnRestore: "Show Original",
      lblTarget: "Target Lang", lblBiMode: "Bilingual", lblStyle: "Style",
      optMinimal: "Light", optHighlight: "Highlight",
      lblBubble: "Floating shortcut", lblAuto: "Always translate this site",
      headerApi: "Model connection", placeholderKey: "sk-...",
      btnSave: "Save and use", btnSaved: "Saved",
      tipsKey: "The key stays in this browser. Text is sent to your selected model provider.", langBtn: "中文",
      lblCurrentModel: "Model: ", lblProvider: "AI Provider",
      lblModelName: "Model name", tipsModel: "Choose a recommended model or type one",
      tipsModelFetching: "Fetching model list...",
      tipsModelFetched: "{{count}} models fetched · Type to customize",
      tipsModelFetchError: "Fetch failed, using recommended models · Type to customize",
      tipsModelBuiltin: "Built-in free model, no API Key needed",
      dropdownEmpty: "No models available",
      updateTitle: "Updates", updateChecking: "Checking for updates…", updateCheck: "Check",
      updateLatest: "v{{version}} is up to date", updateAvailable: "v{{version}} is available",
      updateFailed: "Update server is temporarily unavailable", updateDownload: "Download v{{version}}",
      updateDownloaded: "Download started. Unzip it, then reload the extension."
    }
  };

  const PROVIDER_CATALOG = globalThis.AI_TRANSLATE_PROVIDER_CATALOG;
  const PROVIDERS = PROVIDER_CATALOG.providers;

  const els = {
    appTitle: document.getElementById('app-title'),
    statusBadge: document.getElementById('status-badge'),
    langToggle: document.getElementById('lang-toggle'),
    lblTarget: document.getElementById('lbl-target-main'),
    lblBiMode: document.getElementById('lbl-bi-mode'),
    lblStyle: document.getElementById('lbl-style'),
    lblBubble: document.getElementById('lbl-bubble'),
    lblAutoText: document.getElementById('lbl-auto-main'),
    lblAutoSub: document.getElementById('current-host'),
    headerApi: document.getElementById('lbl-api-header'),
    apiTips: document.getElementById('lbl-api-tips'),
    apiKey: document.getElementById('api-key'),
    saveKeyBtn: document.getElementById('save-key-btn'),
    lblProvider: document.getElementById('lbl-provider'),
    providerSelect: document.getElementById('provider-select'),
    providerEndpoint: document.getElementById('provider-endpoint'),
    modelNameRow: document.getElementById('model-name-row'),
    customUrlRow: document.getElementById('custom-url-row'),
    mainBtn: document.getElementById('main-action-btn'),
    btnText: document.querySelector('#main-action-btn .btn-text'),
    btnSubtitle: document.getElementById('btn-model-display'),
    customUrl: document.getElementById('custom-api-url'),
    customModel: document.getElementById('custom-model-name'),
    toggleApi: document.getElementById('toggle-api'),
    apiPanel: document.getElementById('api-panel'),
    toggleEye: document.getElementById('toggle-visibility'),
    targetLang: document.getElementById('target-lang'),
    autoTranslateSite: document.getElementById('auto-translate-site'),
    currentHostLabel: document.getElementById('current-host'),
    bilingualMode: document.getElementById('bilingual-mode'),
    transStyle: document.getElementById('trans-style'),
    styleRow: document.getElementById('style-setting-row'),
    bubbleCheck: document.getElementById('show-bubble'),
    optMinimal: document.querySelector('#trans-style option[value="minimal"]'),
    optHighlight: document.querySelector('#trans-style option[value="highlight"]'),
    lblModelName: document.getElementById('lbl-model-name'),
    tipsModel: document.getElementById('tips-model-name'),
    refreshModelsBtn: document.getElementById('refresh-models-btn'),
    modelDropdownBtn: document.getElementById('model-dropdown-btn'),
    modelDropdown: document.getElementById('model-dropdown'),
    updateTitle: document.getElementById('update-title'),
    updateStatus: document.getElementById('update-status'),
    updateButton: document.getElementById('check-update-btn'),
    updateNotes: document.getElementById('update-notes'),
    currentVersion: document.getElementById('current-version')
  };
  const panelFeedback = document.getElementById('panel-feedback');
  const panelTabs = [...document.querySelectorAll('[data-panel-target]')];
  const panelViews = [...document.querySelectorAll('[data-panel]')];

  let currentDomain = '';
  let currentUiLang = 'zh';
  let availableModels = [];
  let dropdownActiveIndex = -1;
  let isSelectingModel = false;
  let isInitializing = true;
  let isKeyboardNav = false;
  let suppressFocusOpen = false;
  let providerProfiles = {};
  let updateState = 'checking';
  let availableUpdate = null;

  const installedVersion = chrome.runtime.getManifest().version;
  if (els.currentVersion) els.currentVersion.textContent = installedVersion;

  function populateProviderSelect() {
    if (!els.providerSelect) return;
    els.providerSelect.replaceChildren(...Object.entries(PROVIDERS).map(([value, config]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = currentUiLang === 'en' ? config.labelEn : config.labelZh;
      return option;
    }));
  }

  function updateProviderEndpoint(provider) {
    if (!els.providerEndpoint) return;
    const config = PROVIDERS[provider];
    if (!config) return;
    const note = currentUiLang === 'en' ? config.endpointNoteEn : config.endpointNoteZh;
    const prefix = currentUiLang === 'en' ? 'Base URL' : 'Base URL';
    els.providerEndpoint.textContent = config.baseUrl ? `${prefix}: ${config.baseUrl}${note ? ` · ${note}` : ''}` : (note || '');
  }

  function migrateProviderSettings(settings) {
    const provider = settings.provider || PROVIDER_CATALOG.defaultProvider;
    const config = PROVIDERS[provider] || PROVIDERS[PROVIDER_CATALOG.defaultProvider];
    const next = { ...settings, provider };
    const migratedModel = config.modelMigrations?.[settings.modelName];
    if (migratedModel) next.modelName = migratedModel;
    if (!settings.modelName && provider !== 'custom' && !config.isBuiltin) next.modelName = config.model;
    next.providerProfiles = { ...(settings.providerProfiles || {}) };
    if (!next.providerProfiles[provider] && (settings.apiKey || settings.apiUrl || settings.modelName)) {
      next.providerProfiles[provider] = {
        apiKey: settings.apiKey || '',
        apiUrl: settings.apiUrl || config.url || '',
        modelName: next.modelName || config.model || ''
      };
    }
    Object.entries(next.providerProfiles).forEach(([profileProvider, profile]) => {
      const profileConfig = PROVIDERS[profileProvider];
      if (!profileConfig || !profile) return;
      const profileModel = profileConfig.modelMigrations?.[profile.modelName] || profile.modelName;
      next.providerProfiles[profileProvider] = { ...profile, modelName: profileModel || profileConfig.model || '' };
    });
    next.providerConfigVersion = PROVIDER_CATALOG.version;
    return next;
  }

  function activatePanel(name) {
    panelTabs.forEach(tab => {
      const active = tab.dataset.panelTarget === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panelViews.forEach(view => view.classList.toggle('hidden', view.dataset.panel !== name));
  }

  function showFeedback(message, type = 'error') {
    if (!panelFeedback) return;
    panelFeedback.textContent = message || '';
    panelFeedback.dataset.type = type;
    panelFeedback.style.color = type === 'success' ? 'var(--success)' : 'var(--danger)';
    if (message && els.statusBadge) {
      els.statusBadge.textContent = type === 'success' ? '已保存' : '需处理';
      setTimeout(() => {
        if (els.statusBadge) els.statusBadge.textContent = (i18n[currentUiLang] || i18n.zh).statusReady;
      }, 1800);
    }
  }

  function validateApiUrl(value) {
    let url;
    try { url = new URL(value); } catch { return false; }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && local));
  }

  function normalizeChatCompletionsUrl(value) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (/\/(?:compatible-mode\/)?v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
    return trimmed;
  }

  function compareVersions(left, right) {
    const a = String(left).split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
    const b = String(right).split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
    }
    return 0;
  }

  function normalizeUpdateInfo(data) {
    if (!data || !/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(String(data.version || ''))) return null;
    let downloadUrl;
    try { downloadUrl = new URL(data.downloadUrl); } catch { return null; }
    if (downloadUrl.protocol !== 'https:' || downloadUrl.origin !== UPDATE_ORIGIN) return null;
    return {
      version: String(data.version),
      downloadUrl: downloadUrl.href,
      sha256: /^[a-f0-9]{64}$/i.test(String(data.sha256 || '')) ? String(data.sha256).toLowerCase() : '',
      releaseNotes: String(data.releaseNotes || '').slice(0, 800)
    };
  }

  function renderUpdateState(state, info = availableUpdate) {
    updateState = state;
    const t = i18n[currentUiLang] || i18n.zh;
    if (els.updateTitle) els.updateTitle.textContent = t.updateTitle;
    if (!els.updateButton || !els.updateStatus) return;
    els.updateButton.disabled = state === 'checking';
    els.updateButton.classList.toggle('available', state === 'available');
    els.updateNotes?.classList.add('hidden');

    if (state === 'checking') {
      els.updateStatus.textContent = t.updateChecking;
      els.updateButton.textContent = t.updateCheck;
    } else if (state === 'available' && info) {
      els.updateStatus.textContent = t.updateAvailable.replace('{{version}}', info.version);
      els.updateButton.textContent = t.updateDownload.replace('{{version}}', info.version);
      if (info.releaseNotes && els.updateNotes) {
        els.updateNotes.textContent = info.releaseNotes;
        els.updateNotes.classList.remove('hidden');
      }
    } else if (state === 'downloaded') {
      els.updateStatus.textContent = t.updateDownloaded;
      els.updateButton.textContent = t.updateCheck;
    } else if (state === 'error') {
      els.updateStatus.textContent = t.updateFailed;
      els.updateButton.textContent = t.updateCheck;
    } else {
      els.updateStatus.textContent = t.updateLatest.replace('{{version}}', installedVersion);
      els.updateButton.textContent = t.updateCheck;
    }
  }

  async function checkForUpdates(force = false) {
    renderUpdateState('checking');
    try {
      let info = null;
      if (!force) {
        const cached = await chrome.storage.local.get(['updateInfoV1', 'updateCheckedAt']);
        if (Date.now() - Number(cached.updateCheckedAt || 0) < UPDATE_CACHE_TTL_MS) {
          info = normalizeUpdateInfo(cached.updateInfoV1);
        }
      }
      if (!info) {
        const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
          method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        info = normalizeUpdateInfo(await response.json());
        if (!info) throw new Error('Invalid update manifest');
        await chrome.storage.local.set({ updateInfoV1: info, updateCheckedAt: Date.now() });
      }
      availableUpdate = compareVersions(info.version, installedVersion) > 0 ? info : null;
      renderUpdateState(availableUpdate ? 'available' : 'current', availableUpdate);
    } catch {
      availableUpdate = null;
      renderUpdateState('error');
    }
  }

  function updateUILanguage(lang) {
    currentUiLang = lang;
    const selectedProvider = els.providerSelect?.value || PROVIDER_CATALOG.defaultProvider;
    populateProviderSelect();
    if (els.providerSelect) els.providerSelect.value = selectedProvider;
    updateProviderEndpoint(selectedProvider);
    const t = i18n[lang];
    if (!t) return;
    if (els.appTitle) els.appTitle.textContent = t.appTitle;
    if (els.statusBadge) els.statusBadge.textContent = t.statusReady;
    if (els.langToggle) els.langToggle.textContent = t.langBtn;
    if (els.lblTarget) els.lblTarget.textContent = t.lblTarget;
    if (els.lblBiMode) els.lblBiMode.textContent = t.lblBiMode;
    if (els.lblStyle) els.lblStyle.textContent = t.lblStyle;
    if (els.optMinimal) els.optMinimal.textContent = t.optMinimal;
    if (els.optHighlight) els.optHighlight.textContent = t.optHighlight;
    if (els.lblBubble) els.lblBubble.textContent = t.lblBubble;
    if (els.lblAutoText) els.lblAutoText.textContent = t.lblAuto;
    if (els.headerApi) els.headerApi.textContent = t.headerApi;
    if (els.apiKey) els.apiKey.placeholder = t.placeholderKey;
    if (els.saveKeyBtn) els.saveKeyBtn.textContent = t.btnSave;
    if (els.apiTips) els.apiTips.textContent = t.tipsKey;
    if (els.lblProvider) els.lblProvider.textContent = t.lblProvider;
    if (els.lblModelName) els.lblModelName.textContent = t.lblModelName;
    const curProvider = els.providerSelect ? els.providerSelect.value : '';
    const curConfig = PROVIDERS[curProvider];
    if (curConfig && curConfig.isBuiltin) {
      updateModelTips(t.tipsModelBuiltin || '内置免费模型，无需配置 API Key', 'success');
    } else {
      updateModelTips(t.tipsModel);
    }
    renderUpdateState(updateState, availableUpdate);
    const isRestoring = els.mainBtn && els.mainBtn.classList.contains('restoring');
    if (els.btnText) els.btnText.textContent = isRestoring ? t.btnRestore : t.btnTrans;
    chrome.storage.local.get(['modelName', 'provider'], (res) => {
      updateModelSubtitle(res.modelName, res.provider);
    });
  }

  function updateMainButtonUI(isTranslating) {
    if (!els.mainBtn) return;
    const t = i18n[currentUiLang] || i18n['zh'];
    if (isTranslating) {
      els.mainBtn.classList.add('restoring');
      if (els.btnText) els.btnText.textContent = t.btnRestore;
    } else {
      els.mainBtn.classList.remove('restoring');
      if (els.btnText) els.btnText.textContent = t.btnTrans;
    }
  }

  function updateModelSubtitle(savedModelName, provider) {
    if (!els.btnSubtitle) return;
    const t = i18n[currentUiLang] || i18n['zh'];
    let displayModel = savedModelName;
    if (!displayModel && provider && PROVIDERS[provider]) {
      displayModel = PROVIDERS[provider].model;
    }
    els.btnSubtitle.textContent = `${t.lblCurrentModel}${displayModel || 'Default'}`;
  }

  function toggleStyleRow(show) {
    if (els.styleRow) els.styleRow.classList.toggle('visible', show);
  }

  function populateModelDatalist(models) {
    availableModels = models || [];
    const isOpen = els.modelDropdown && !els.modelDropdown.classList.contains('hidden');
    if (isOpen) {
      renderModelDropdown(availableModels, els.customModel ? els.customModel.value : '');
    }
  }

  function renderModelDropdown(models, filterText) {
    if (!els.modelDropdown) return;
    els.modelDropdown.innerHTML = '';
    const t = i18n[currentUiLang] || i18n['zh'];
    const filter = (filterText || '').toLowerCase().trim();
    const filtered = filter
      ? models.filter(m => m.toLowerCase().includes(filter))
      : models;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'model-dropdown-item empty';
      empty.textContent = t.dropdownEmpty || '暂无可用模型';
      els.modelDropdown.appendChild(empty);
      return;
    }

    filtered.forEach((m, idx) => {
      const item = document.createElement('div');
      item.className = 'model-dropdown-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(idx === dropdownActiveIndex));
      if (idx === dropdownActiveIndex) item.classList.add('active');
      item.textContent = m;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectModel(m);
      });
      item.addEventListener('mouseenter', () => {
        if (isKeyboardNav) return;
        dropdownActiveIndex = idx;
        updateDropdownActive();
      });
      els.modelDropdown.appendChild(item);
    });
  }

  function updateDropdownActive() {
    if (!els.modelDropdown) return;
    const items = els.modelDropdown.querySelectorAll('.model-dropdown-item:not(.empty)');
    items.forEach((item, idx) => {
      item.classList.toggle('active', idx === dropdownActiveIndex);
      item.setAttribute('aria-selected', String(idx === dropdownActiveIndex));
      if (idx === dropdownActiveIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
    setTimeout(() => { isKeyboardNav = false; }, 50);
  }

  function showModelDropdown() {
    if (!els.modelDropdown) return;
    if (suppressFocusOpen) { suppressFocusOpen = false; return; }
    dropdownActiveIndex = -1;
    renderModelDropdown(availableModels, els.customModel ? els.customModel.value : '');
    els.modelDropdown.classList.remove('hidden');
    if (els.customModel) els.customModel.setAttribute('aria-expanded', 'true');
  }

  function hideModelDropdown() {
    if (!els.modelDropdown) return;
    els.modelDropdown.classList.add('hidden');
    if (els.customModel) els.customModel.setAttribute('aria-expanded', 'false');
    dropdownActiveIndex = -1;
  }

  function selectModel(modelName) {
    if (els.customModel) {
      isSelectingModel = true;
      els.customModel.value = modelName;
      els.customModel.dispatchEvent(new Event('input'));
      isSelectingModel = false;
    }
    hideModelDropdown();
    suppressFocusOpen = true;
    setTimeout(() => { suppressFocusOpen = false; }, 100);
  }

  function setRefreshBtnState(state) {
    if (!els.refreshModelsBtn) return;
    els.refreshModelsBtn.classList.remove('loading', 'success', 'error');
    if (state) els.refreshModelsBtn.classList.add(state);
  }

  function updateModelTips(text, state) {
    if (!els.tipsModel) return;
    els.tipsModel.textContent = text;
    if (state === 'success') {
      els.tipsModel.style.color = '#10b981';
    } else if (state === true || state === 'error') {
      els.tipsModel.style.color = '#ef4444';
    } else {
      els.tipsModel.style.color = '';
    }
  }

  async function fetchModelsFromAPI(provider) {
    const config = PROVIDERS[provider];
    if (!config || !config.modelsUrl || provider === 'custom') {
      if (config && config.commonModels) populateModelDatalist(config.commonModels);
      setRefreshBtnState(null);
      return;
    }

    setRefreshBtnState('loading');
    const t = i18n[currentUiLang] || i18n['zh'];
    updateModelTips(t.tipsModelFetching || '正在获取模型列表...');

    try {
      const apiKey = els.apiKey ? els.apiKey.value.trim() : '';
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const response = await fetch(config.modelsUrl, {
        method: "GET",
        headers,
        mode: "cors",
        credentials: 'omit'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      let models = [];

      models = (data.data || []).map(m => m.id || m.name).filter(Boolean);

      if (models.length === 0) {
        models = config.commonModels || [];
      }

      const combined = [];
      if (config.model && !combined.includes(config.model)) combined.push(config.model);
      models.forEach(m => { if (!combined.includes(m)) combined.push(m); });
      if (config.commonModels) {
        config.commonModels.forEach(m => { if (!combined.includes(m)) combined.push(m); });
      }

      populateModelDatalist(combined);
      setRefreshBtnState('success');
      updateModelTips((t.tipsModelFetched || '已获取 {{count}} 个模型 · 可手动输入').replace('{{count}}', combined.length));
      setTimeout(() => setRefreshBtnState(null), 1500);
    } catch (err) {
      const fallback = config.commonModels || [];
      populateModelDatalist(fallback);
      setRefreshBtnState('error');
      updateModelTips((t.tipsModelFetchError || '获取失败，使用推荐模型 · 可手动输入'), true);
      setTimeout(() => setRefreshBtnState(null), 2000);
    }
  }

  function applyProviderChange(provider, preserveModel) {
    const config = PROVIDERS[provider] || PROVIDERS['deepseek'];
    const isBuiltin = !!config.isBuiltin;
    hideModelDropdown();
    updateProviderEndpoint(provider);

    if (provider === 'custom' || config.requiresCustomUrl) {
      if (els.customUrl && !preserveModel) els.customUrl.value = "";
      if (els.customModel && !preserveModel) els.customModel.value = provider === 'custom' ? "" : config.model;
      populateModelDatalist(provider === 'custom' ? [] : (config.commonModels || []));
    } else {
      if (els.customUrl) els.customUrl.value = config.url;
      if (els.customModel && !preserveModel) els.customModel.value = config.model;
      populateModelDatalist(config.commonModels || []);
    }
    if (els.customUrl) els.customUrl.placeholder = config.urlPlaceholder || 'https://...';

    if (els.customUrlRow) els.customUrlRow.classList.toggle('hidden', isBuiltin);

    if (els.modelNameRow) els.modelNameRow.classList.remove('hidden');

    const apiKeyArea = document.querySelector('.api-key-area');
    if (isBuiltin) {
      if (els.apiKey) { els.apiKey.disabled = true; els.apiKey.value = ''; }
      if (els.customModel) els.customModel.disabled = true;
      if (els.modelDropdownBtn) els.modelDropdownBtn.style.display = 'none';
      if (els.refreshModelsBtn) els.refreshModelsBtn.style.display = 'none';
      const modelClearBtn = document.querySelector('.clear-btn[data-target="custom-model-name"]');
      if (modelClearBtn) modelClearBtn.classList.remove('visible');
      if (apiKeyArea) apiKeyArea.classList.add('hidden');
    } else {
      if (els.apiKey) els.apiKey.disabled = false;
      if (els.customModel) els.customModel.disabled = false;
      if (els.modelDropdownBtn) els.modelDropdownBtn.style.display = '';
      if (els.refreshModelsBtn) els.refreshModelsBtn.style.display = config.modelsUrl ? '' : 'none';
      if (apiKeyArea) apiKeyArea.classList.remove('hidden');
    }

    const t = i18n[currentUiLang] || i18n['zh'];
    if (isBuiltin) {
      updateModelTips(t.tipsModelBuiltin || '内置免费模型，无需配置 API Key', 'success');
    } else {
      updateModelTips(t.tipsModel || '留空则使用默认模型 · 点击 ▾ 选择或 ↻ 刷新');
    }
  }

  chrome.storage.local.get(
    ['apiKey', 'provider', 'apiUrl', 'modelName', 'providerProfiles', 'providerConfigVersion', 'targetLang', 'bilingualMode', 'transStyle', 'showBubble', 'autoSites', 'uiLang'],
    (stored) => {
      const res = migrateProviderSettings(stored);
      if (JSON.stringify(res) !== JSON.stringify(stored)) chrome.storage.local.set({
        provider: res.provider,
        apiUrl: res.apiUrl || '',
        modelName: res.modelName || '',
        providerProfiles: res.providerProfiles || {},
        providerConfigVersion: res.providerConfigVersion
      });
      providerProfiles = res.providerProfiles || {};
      currentUiLang = res.uiLang || 'zh';
      populateProviderSelect();
      const currentProvider = res.provider || 'deepseek';
      if (els.providerSelect) els.providerSelect.value = currentProvider;
      const activeProfile = providerProfiles[currentProvider] || {};
      if (els.apiKey) els.apiKey.value = activeProfile.apiKey || res.apiKey || '';

      const initConfig = PROVIDERS[currentProvider];
      const initIsBuiltin = initConfig && initConfig.isBuiltin;

      const savedModelName = initIsBuiltin ? '' : (activeProfile.modelName || res.modelName || '');
      const savedApiUrl = initIsBuiltin ? '' : (activeProfile.apiUrl || res.apiUrl || '');
      applyProviderChange(currentProvider, true);

      if (els.customUrl) els.customUrl.value = savedApiUrl || (PROVIDERS[currentProvider] ? PROVIDERS[currentProvider].url : '');
      if (els.customModel) els.customModel.value = initIsBuiltin ? (PROVIDERS[currentProvider].model) : (savedModelName || (PROVIDERS[currentProvider] ? PROVIDERS[currentProvider].model : ''));
      if (els.targetLang && res.targetLang) els.targetLang.value = res.targetLang;
      if (els.bilingualMode) els.bilingualMode.checked = res.bilingualMode !== false;
      if (els.transStyle) els.transStyle.value = res.transStyle || 'minimal';
      if (els.bubbleCheck) els.bubbleCheck.checked = res.showBubble !== false;

      updateUILanguage(res.uiLang || 'zh');
      toggleStyleRow(els.bilingualMode && els.bilingualMode.checked);
      updateModelSubtitle(savedModelName, currentProvider);

      if (PROVIDERS[currentProvider]) populateModelDatalist(PROVIDERS[currentProvider].commonModels || []);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url) {
          try {
            const url = new URL(tab.url);
            currentDomain = url.hostname;
            if (els.currentHostLabel) els.currentHostLabel.textContent = currentDomain;
            const autoSites = res.autoSites || [];
            if (els.autoTranslateSite) els.autoTranslateSite.checked = autoSites.includes(currentDomain);
            chrome.tabs.sendMessage(tab.id, { action: "GET_STATE" }, (response) => {
              if (chrome.runtime.lastError) return;
              if (response && response.isTranslating) updateMainButtonUI(true);
            });
          } catch (e) {}
        }
      });

      ['custom-api-url', 'custom-model-name', 'api-key'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.dispatchEvent(new Event('input'));
      });

      isInitializing = false;
    }
  );

  if (els.mainBtn) {
    els.mainBtn.addEventListener('click', async () => {
      const isCurrentlyRestoring = els.mainBtn.classList.contains('restoring');
      updateMainButtonUI(!isCurrentlyRestoring);
      showFeedback('');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        updateMainButtonUI(isCurrentlyRestoring);
        showFeedback('未找到当前网页。');
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "START_TRANSLATION" });
      } catch (err) {
        updateMainButtonUI(isCurrentlyRestoring);
        showFeedback('无法连接当前页面，请刷新网页后重试。');
      }
    });
  }

  if (els.langToggle) {
    els.langToggle.addEventListener('click', () => {
      const newLang = currentUiLang === 'zh' ? 'en' : 'zh';
      updateUILanguage(newLang);
      chrome.storage.local.set({ uiLang: newLang });
    });
  }

  if (els.targetLang) {
    els.targetLang.addEventListener('change', () => {
      chrome.storage.local.set({ targetLang: els.targetLang.value });
    });
  }

  if (els.bilingualMode) {
    els.bilingualMode.addEventListener('change', () => {
      chrome.storage.local.set({ bilingualMode: els.bilingualMode.checked });
      toggleStyleRow(els.bilingualMode.checked);
    });
  }

  if (els.transStyle) {
    els.transStyle.addEventListener('change', () => {
      chrome.storage.local.set({ transStyle: els.transStyle.value });
    });
  }

  if (els.bubbleCheck) {
    els.bubbleCheck.addEventListener('change', () => {
      chrome.storage.local.set({ showBubble: els.bubbleCheck.checked });
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "UPDATE_SETTINGS", payload: { showBubble: els.bubbleCheck.checked } });
      });
    });
  }

  if (els.providerSelect) {
    els.providerSelect.addEventListener('change', (e) => {
      const newProvider = e.target.value;
      const config = PROVIDERS[newProvider];
      applyProviderChange(newProvider);
      const profile = providerProfiles[newProvider] || {};
      if (els.apiKey && !config?.isBuiltin) els.apiKey.value = profile.apiKey || '';
      if (els.customUrl && !config?.isBuiltin) els.customUrl.value = profile.apiUrl || config?.url || '';
      if (els.customModel && !config?.isBuiltin) els.customModel.value = profile.modelName || config?.model || '';
      if (config) populateModelDatalist(config.commonModels || []);
      if (els.customModel) els.customModel.dispatchEvent(new Event('input'));
      if (els.customUrl) els.customUrl.dispatchEvent(new Event('input'));

      if (config && config.isBuiltin) {
        chrome.storage.local.set({
          provider: newProvider,
          apiKey: '',
          apiUrl: '',
          modelName: ''
        }, () => {
          updateModelSubtitle(config.model, newProvider);
        });
      }
    });
  }

  if (els.refreshModelsBtn) {
    els.refreshModelsBtn.addEventListener('click', () => {
      const provider = els.providerSelect ? els.providerSelect.value : 'deepseek';
      const config = PROVIDERS[provider];
      if (provider !== 'custom' && config && config.modelsUrl && !config.isBuiltin) {
        fetchModelsFromAPI(provider);
      }
    });
  }

  if (els.autoTranslateSite) {
    els.autoTranslateSite.addEventListener('change', () => {
      chrome.storage.local.get(['autoSites'], (res) => {
        let sites = res.autoSites || [];
        const isChecked = els.autoTranslateSite.checked;
        if (isChecked) {
          if (!sites.includes(currentDomain)) sites.push(currentDomain);
        } else {
          sites = sites.filter(s => s !== currentDomain);
        }
        chrome.storage.local.set({ autoSites: sites }, () => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "AUTO_TRANSLATE_SETTING_CHANGED",
              enabled: isChecked
            });
          });
        });
      });
    });
  }

  if (els.saveKeyBtn) {
    els.saveKeyBtn.addEventListener('click', () => {
      const key = els.apiKey ? els.apiKey.value.trim() : '';
      const provider = els.providerSelect ? els.providerSelect.value : 'deepseek';
      let apiUrl = normalizeChatCompletionsUrl(els.customUrl ? els.customUrl.value : '');
      let modelName = els.customModel ? els.customModel.value.trim() : '';

      if (provider !== 'custom' && PROVIDERS[provider]) {
        if (!apiUrl) apiUrl = PROVIDERS[provider].url;
        if (!modelName) modelName = PROVIDERS[provider].model;
      }

      const pConfig = PROVIDERS[provider];
      const pIsBuiltin = pConfig && pConfig.isBuiltin;
      const requiresCustomUrl = provider === 'custom' || !!pConfig?.requiresCustomUrl;

      if (!pIsBuiltin && provider !== 'custom' && !key) {
        activatePanel('model');
        showFeedback('请填写 API Key 后再保存。');
        els.apiKey?.focus();
        return;
      }
      if (requiresCustomUrl && !validateApiUrl(apiUrl)) {
        activatePanel('model');
        showFeedback(pConfig?.requiresCustomUrl ? '请填写有效的百炼工作空间 Chat Completions 地址。' : '自定义 API 地址必须使用 HTTPS，本地调试仅允许 localhost。');
        els.customUrl?.focus();
        return;
      }
      if (!modelName) {
        showFeedback('请填写模型名称。');
        els.customModel?.focus();
        return;
      }

      providerProfiles = {
        ...providerProfiles,
        [provider]: { apiKey: pIsBuiltin ? '' : key, apiUrl, modelName }
      };
      chrome.storage.local.set({
        apiKey: pIsBuiltin ? '' : key,
        provider,
        apiUrl,
        modelName,
        providerProfiles,
        providerConfigVersion: PROVIDER_CATALOG.version
      }, () => {
        const oldText = els.saveKeyBtn.textContent;
        els.saveKeyBtn.textContent = i18n[currentUiLang].btnSaved;
        els.saveKeyBtn.classList.add('saved');
        showFeedback('模型配置已保存。', 'success');
        updateModelSubtitle(modelName, provider);
        if (!pIsBuiltin && provider !== 'custom' && pConfig && pConfig.modelsUrl) {
          fetchModelsFromAPI(provider);
        }
        setTimeout(() => {
          els.saveKeyBtn.textContent = oldText;
          els.saveKeyBtn.classList.remove('saved');
        }, 1500);
      });
    });
  }

  if (els.toggleApi) {
    els.toggleApi.addEventListener('click', () => {
      els.toggleApi.classList.toggle('active');
      if (els.apiPanel) els.apiPanel.classList.toggle('hidden');
    });
  }

  if (els.toggleEye) {
    els.toggleEye.addEventListener('click', () => {
      if (els.apiKey) {
        const reveal = els.apiKey.type === 'password';
        els.apiKey.type = reveal ? 'text' : 'password';
        els.toggleEye.textContent = reveal ? '隐藏' : '显示';
        els.toggleEye.setAttribute('aria-pressed', String(reveal));
      }
    });
  }

  document.querySelectorAll('.clear-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget.dataset.target;
      const input = document.getElementById(target);
      if (input) { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); }
    });
  });

  ['custom-api-url', 'custom-model-name', 'api-key'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
      const clearBtn = document.querySelector(`.clear-btn[data-target="${id}"]`);
      if (clearBtn) clearBtn.classList.toggle('visible', input.value.length > 0);
    });
  });

  if (els.modelDropdownBtn) {
    els.modelDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (els.modelDropdown && !els.modelDropdown.classList.contains('hidden')) {
        hideModelDropdown();
      } else {
        if (els.customModel) els.customModel.focus();
        showModelDropdown();
      }
    });
  }

  if (els.customModel) {
    els.customModel.addEventListener('focus', () => {
      if (isInitializing) return;
      showModelDropdown();
    });

    els.customModel.addEventListener('blur', () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        const wrapper = els.customModel ? els.customModel.closest('.model-select-wrapper') : null;
        if (wrapper && activeEl && wrapper.contains(activeEl)) return;
        hideModelDropdown();
      }, 150);
    });

    els.customModel.addEventListener('input', () => {
      if (isSelectingModel || isInitializing) return;
      dropdownActiveIndex = -1;
      if (els.modelDropdown && els.modelDropdown.classList.contains('hidden')) {
        showModelDropdown();
      } else {
        renderModelDropdown(availableModels, els.customModel.value);
      }
    });

    els.customModel.addEventListener('keydown', (e) => {
      const isDropdownOpen = els.modelDropdown && !els.modelDropdown.classList.contains('hidden');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isDropdownOpen) {
          showModelDropdown();
        }
        isKeyboardNav = true;
        const items = els.modelDropdown.querySelectorAll('.model-dropdown-item:not(.empty)');
        if (items.length > 0) {
          dropdownActiveIndex = dropdownActiveIndex < 0 ? 0 : Math.min(dropdownActiveIndex + 1, items.length - 1);
          updateDropdownActive();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (isDropdownOpen) {
          isKeyboardNav = true;
          const items = els.modelDropdown.querySelectorAll('.model-dropdown-item:not(.empty)');
          if (items.length > 0) {
            dropdownActiveIndex = dropdownActiveIndex <= 0 ? items.length - 1 : dropdownActiveIndex - 1;
            updateDropdownActive();
          }
        }
      } else if (e.key === 'Enter') {
        if (dropdownActiveIndex >= 0 && isDropdownOpen) {
          e.preventDefault();
          const items = els.modelDropdown.querySelectorAll('.model-dropdown-item:not(.empty)');
          if (items[dropdownActiveIndex]) {
            selectModel(items[dropdownActiveIndex].textContent);
          }
        }
      } else if (e.key === 'Escape') {
        if (isDropdownOpen) {
          e.preventDefault();
          hideModelDropdown();
        }
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (els.modelDropdown && !els.modelDropdown.classList.contains('hidden')) {
      const wrapper = els.customModel ? els.customModel.closest('.model-select-wrapper') : null;
      if (wrapper && !wrapper.contains(e.target)) {
        hideModelDropdown();
      }
    }
  });

  panelTabs.forEach(tab => tab.addEventListener('click', () => activatePanel(tab.dataset.panelTarget)));
  if (els.updateButton) {
    els.updateButton.addEventListener('click', async () => {
      if (availableUpdate && updateState === 'available') {
        await chrome.tabs.create({ url: availableUpdate.downloadUrl });
        renderUpdateState('downloaded', availableUpdate);
        return;
      }
      await checkForUpdates(true);
    });
  }
  checkForUpdates(false);
  const copyQq = document.getElementById('copy-qq');
  if (copyQq) {
    copyQq.addEventListener('click', async () => {
      const action = copyQq.querySelector('.contact-action');
      try {
        await navigator.clipboard.writeText('376556413');
        if (action) action.textContent = '已复制';
      } catch {
        if (action) action.textContent = '复制失败';
      }
      setTimeout(() => { if (action) action.textContent = '复制群号'; }, 1200);
    });
  }
});
