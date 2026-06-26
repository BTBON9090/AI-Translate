document.addEventListener('DOMContentLoaded', () => {
  const i18n = {
    zh: {
      appTitle: "AI 极简翻译", statusReady: "就绪",
      btnTrans: "翻译当前页面", btnRestore: "显示原文",
      lblTarget: "目标语言", lblBiMode: "双语对照", lblStyle: "对照样式",
      optMinimal: "极简 (宋体/灰字)", optHighlight: "高亮 (蓝条/色块)",
      lblBubble: "悬浮球入口", lblAuto: "始终翻译此网站",
      headerApi: "模型 API 配置", placeholderKey: "请输入 API Key (sk-...)",
      btnSave: "保存配置", btnSaved: "已保存!",
      tipsKey: "Key 仅保存在本地，不会上传服务器。", langBtn: "EN",
      lblCurrentModel: "模型: ", lblProvider: "模型服务商",
      lblModelName: "模型名称", tipsModel: "留空则使用默认模型 · 点击 ▾ 选择或 ↻ 刷新",
      tipsModelFetching: "正在获取模型列表...",
      tipsModelFetched: "已获取 {{count}} 个模型 · 可手动输入",
      tipsModelFetchError: "获取失败，使用推荐模型 · 可手动输入",
      dropdownEmpty: "暂无可用模型"
    },
    en: {
      appTitle: "AI Translate", statusReady: "Ready",
      btnTrans: "Translate Page", btnRestore: "Show Original",
      lblTarget: "Target Lang", lblBiMode: "Bilingual", lblStyle: "Style",
      optMinimal: "Minimal (Italic/Gray)", optHighlight: "Highlight (Blue Block)",
      lblBubble: "Floating Bubble", lblAuto: "Always Translate",
      headerApi: "API Settings", placeholderKey: "Enter API Key (sk-...)",
      btnSave: "Save Key", btnSaved: "Saved!",
      tipsKey: "Key is stored locally, never uploaded.", langBtn: "中文",
      lblCurrentModel: "Model: ", lblProvider: "AI Provider",
      lblModelName: "Model Name", tipsModel: "Leave empty for default · Click ▾ to select or ↻ to refresh",
      tipsModelFetching: "Fetching model list...",
      tipsModelFetched: "{{count}} models fetched · Type to customize",
      tipsModelFetchError: "Fetch failed, using recommended models · Type to customize",
      dropdownEmpty: "No models available"
    }
  };

  const PROVIDERS = {
    deepseek:    {
      url: "https://api.deepseek.com/chat/completions",
      model: "deepseek-chat",
      modelsUrl: "https://api.deepseek.com/models",
      commonModels: ["deepseek-chat", "deepseek-reasoner"]
    },
    moonshot:    {
      url: "https://api.moonshot.cn/v1/chat/completions",
      model: "kimi-k2-turbo-preview",
      modelsUrl: "https://api.moonshot.cn/v1/models",
      commonModels: ["kimi-k2-turbo-preview", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]
    },
    siliconflow: {
      url: "https://api.siliconflow.cn/v1/chat/completions",
      model: "deepseek-ai/DeepSeek-V3",
      modelsUrl: "https://api.siliconflow.cn/v1/models",
      commonModels: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct", "THUDM/glm-4-9b-chat"]
    },
    qwen:        {
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      model: "qwen-turbo",
      modelsUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
      commonModels: ["qwen-turbo", "qwen-plus", "qwen-max", "qwen-long", "qwen2.5-72b-instruct"]
    },
    zhipu:       {
      url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      model: "glm-4-plus",
      modelsUrl: "https://open.bigmodel.cn/api/paas/v4/models",
      commonModels: ["glm-4-plus", "glm-4-air", "glm-4-airx", "glm-4-long", "glm-4-flash"]
    },
    zhipu_free:  {
      url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      model: "glm-4-flash",
      modelsUrl: "https://open.bigmodel.cn/api/paas/v4/models",
      commonModels: ["glm-4-flash", "glm-4-flashx"]
    },
    custom:      {
      url: "", model: "", modelsUrl: "", commonModels: []
    }
  };

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
    modelDropdown: document.getElementById('model-dropdown')
  };

  let currentDomain = '';
  let currentUiLang = 'zh';
  let availableModels = [];
  let dropdownActiveIndex = -1;
  let isSelectingModel = false;
  let isInitializing = true;
  let isKeyboardNav = false;
  let suppressFocusOpen = false;

  function updateUILanguage(lang) {
    currentUiLang = lang;
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
    updateModelTips(t.tipsModel);
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
  }

  function hideModelDropdown() {
    if (!els.modelDropdown) return;
    els.modelDropdown.classList.add('hidden');
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

  function updateModelTips(text, isError) {
    if (!els.tipsModel) return;
    els.tipsModel.textContent = text;
    els.tipsModel.style.color = isError ? '#ef4444' : '';
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
    hideModelDropdown();
    if (provider === 'custom') {
      if (els.customUrl && !preserveModel) els.customUrl.value = "";
      if (els.customModel && !preserveModel) els.customModel.value = "";
      if (els.customUrlRow) els.customUrlRow.classList.remove('hidden');
      populateModelDatalist([]);
    } else {
      if (els.customUrl) els.customUrl.value = config.url;
      if (els.customModel && !preserveModel) els.customModel.value = config.model;
      if (els.customUrlRow) els.customUrlRow.classList.add('hidden');
      populateModelDatalist(config.commonModels || []);
    }
    if (els.modelNameRow) els.modelNameRow.classList.remove('hidden');
    if (els.apiKey) els.apiKey.disabled = false;

    const t = i18n[currentUiLang] || i18n['zh'];
    updateModelTips(t.tipsModel || '留空则使用服务商默认模型 · 点击 ▾ 选择或 ↻ 刷新');
  }

  chrome.storage.local.get(
    ['apiKey', 'provider', 'apiUrl', 'modelName', 'targetLang', 'bilingualMode', 'transStyle', 'showBubble', 'autoSites', 'uiLang'],
    (res) => {
      const currentProvider = res.provider || 'deepseek';
      if (els.providerSelect) els.providerSelect.value = currentProvider;
      if (els.apiKey) els.apiKey.value = res.apiKey || '';

      if (!res.apiKey && currentProvider !== 'custom' && els.apiPanel) {
        els.apiPanel.classList.remove('hidden');
        if (els.toggleApi) els.toggleApi.classList.add('active');
      }

      const savedModelName = res.modelName || '';
      const savedApiUrl = res.apiUrl || '';
      applyProviderChange(currentProvider, true);

      if (els.customUrl) els.customUrl.value = savedApiUrl || (PROVIDERS[currentProvider] ? PROVIDERS[currentProvider].url : '');
      if (els.customModel) els.customModel.value = savedModelName || (PROVIDERS[currentProvider] ? PROVIDERS[currentProvider].model : '');
      if (els.targetLang && res.targetLang) els.targetLang.value = res.targetLang;
      if (els.bilingualMode) els.bilingualMode.checked = res.bilingualMode !== false;
      if (els.transStyle) els.transStyle.value = res.transStyle || 'minimal';
      if (els.bubbleCheck) els.bubbleCheck.checked = res.showBubble !== false;

      updateUILanguage(res.uiLang || 'zh');
      toggleStyleRow(els.bilingualMode && els.bilingualMode.checked);
      updateModelSubtitle(savedModelName, currentProvider);

      if (currentProvider !== 'custom' && PROVIDERS[currentProvider] && PROVIDERS[currentProvider].modelsUrl) {
        fetchModelsFromAPI(currentProvider);
      }

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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "START_TRANSLATION" });
      } catch (err) {
        alert("无法连接页面，请刷新网页后重试。");
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
      applyProviderChange(newProvider);
      if (newProvider !== 'custom' && PROVIDERS[newProvider] && PROVIDERS[newProvider].modelsUrl) {
        fetchModelsFromAPI(newProvider);
      }
      if (els.customModel) els.customModel.dispatchEvent(new Event('input'));
      if (els.customUrl) els.customUrl.dispatchEvent(new Event('input'));
    });
  }

  if (els.refreshModelsBtn) {
    els.refreshModelsBtn.addEventListener('click', () => {
      const provider = els.providerSelect ? els.providerSelect.value : 'deepseek';
      if (provider !== 'custom') {
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
          if (isChecked) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "CHECK_AUTO_TRANSLATE" });
            });
          }
        });
      });
    });
  }

  if (els.saveKeyBtn) {
    els.saveKeyBtn.addEventListener('click', () => {
      const key = els.apiKey ? els.apiKey.value.trim() : '';
      const provider = els.providerSelect ? els.providerSelect.value : 'deepseek';
      let apiUrl = els.customUrl ? els.customUrl.value.trim() : '';
      let modelName = els.customModel ? els.customModel.value.trim() : '';

      if (provider !== 'custom' && PROVIDERS[provider]) {
        if (!apiUrl) apiUrl = PROVIDERS[provider].url;
        if (!modelName) modelName = PROVIDERS[provider].model;
      }

      chrome.storage.local.set({ apiKey: key, provider, apiUrl, modelName }, () => {
        const oldText = els.saveKeyBtn.textContent;
        els.saveKeyBtn.textContent = i18n[currentUiLang].btnSaved;
        els.saveKeyBtn.classList.add('saved');
        updateModelSubtitle(modelName, provider);
        if (provider !== 'custom' && PROVIDERS[provider] && PROVIDERS[provider].modelsUrl) {
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
      if (els.apiKey) els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password';
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
});
