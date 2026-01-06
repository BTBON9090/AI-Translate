document.addEventListener('DOMContentLoaded', () => {
  // === 1. 国际化字典 (i18n Dictionary) ===
  const i18n = {
    zh: {
      appTitle: "AI 精简翻译",
      statusReady: "就绪",
      btnTrans: "翻译当前页面",
      btnRestore: "显示原文",
      lblTarget: "目标语言",
      lblBiMode: "双语对照模式",
      lblStyle: "对照样式",
      optMinimal: "极简 (宋体/灰字)",
      optHighlight: "高亮 (蓝条/色块)",
      lblPrecision: "AI 精翻模式",
      descPrecision: "深度理解语境，更通顺但稍慢",
      lblBubble: "悬浮球入口",
      lblAuto: "始终翻译此网站",
      lblAutoSub: "当前域名",
      headerApi: "🔑 DeepSeek API 配置",
      placeholderKey: "请输入 DeepSeek API Key (sk-...)",
      btnSave: "保存配置",
      btnSaved: "已保存!",
      tipsKey: "Key 仅保存在本地，不会上传服务器。",
      langBtn: "English" // 切换到英文的按钮文字
    },
    en: {
      appTitle: "AI Translate",
      statusReady: "Ready",
      btnTrans: "Translate Page",
      btnRestore: "Show Original",
      lblTarget: "Target Lang",
      lblBiMode: "Bilingual Mode",
      lblStyle: "Bilingual Style",
      optMinimal: "Minimal (Italic/Gray)",
      optHighlight: "Highlight (Blue Block)",
      lblPrecision: "AI Precision Mode",
      descPrecision: "Context-aware, better quality but slower",
      lblBubble: "Floating Bubble",
      lblAuto: "Always Translate Site",
      lblAutoSub: "Current Domain",
      headerApi: "🔑 API Settings",
      placeholderKey: "Enter DeepSeek API Key (sk-...)",
      btnSave: "Save Key",
      btnSaved: "Saved!",
      tipsKey: "Key is stored locally, never uploaded.",
      langBtn: "中文" // 切换到中文的按钮文字
    }
  };

  // DOM 元素引用
  const els = {
    appTitle: document.getElementById('app-title'),
    statusBadge: document.getElementById('status-badge'),
    langToggle: document.getElementById('lang-toggle'),
    
    // Labels (全部改用 getElementById)
    lblTarget: document.getElementById('lbl-target-main'),
    lblBiMode: document.getElementById('lbl-bi-mode'),
    lblStyle: document.getElementById('lbl-style'),
    
    // Precision Mode (分开获取主标题和副标题)
    lblPrecisionMain: document.getElementById('lbl-precision-main'), 
    lblPrecisionSub: document.getElementById('lbl-precision-sub'),

    lblBubble: document.getElementById('lbl-bubble'),
    
    // Auto Translate
    lblAutoText: document.getElementById('lbl-auto-main'),
    lblAutoSub: document.getElementById('current-host'),
    
    // API Section
    headerApi: document.getElementById('lbl-api-header'), // 改用 ID
    apiTips: document.getElementById('lbl-api-tips'),     // 改用 ID
    
    apiKey: document.getElementById('api-key'),
    saveKeyBtn: document.getElementById('save-key-btn'),

    // Options inside Select (Style)
    optMinimal: document.querySelector('#trans-style option[value="minimal"]'),
    optHighlight: document.querySelector('#trans-style option[value="highlight"]'),

    // Main Controls
    toggleApi: document.getElementById('toggle-api'),
    apiPanel: document.getElementById('api-panel'),
    toggleEye: document.getElementById('toggle-visibility'),
    targetLang: document.getElementById('target-lang'),
    autoTranslateSite: document.getElementById('auto-translate-site'),
    currentHostLabel: document.getElementById('current-host'),
    bilingualMode: document.getElementById('bilingual-mode'),
    transStyle: document.getElementById('trans-style'),
    styleRow: document.getElementById('style-setting-row'),
    precisionMode: document.getElementById('precision-mode'),
    bubbleCheck: document.getElementById('show-bubble'),
    mainBtn: document.getElementById('main-action-btn'),
    btnText: document.querySelector('#main-action-btn .btn-text'),
    btnIcon: document.querySelector('#main-action-btn .btn-icon')
  };

  let currentDomain = '';
  let currentUiLang = 'zh'; // 默认中文

  // === 2. 核心函数：更新界面语言 ===
  function updateUILanguage(lang) {
    currentUiLang = lang;
    const t = i18n[lang];

    els.appTitle.textContent = t.appTitle;
    els.statusBadge.textContent = t.statusReady;
    els.langToggle.textContent = t.langBtn;

    // Settings Labels
    if(els.lblTarget) els.lblTarget.textContent = t.lblTarget;
    if(els.lblBiMode) els.lblBiMode.textContent = t.lblBiMode;
    if(els.lblStyle) els.lblStyle.textContent = t.lblStyle;
    
    // Options
    if(els.optMinimal) els.optMinimal.textContent = t.optMinimal;
    if(els.optHighlight) els.optHighlight.textContent = t.optHighlight;

    // Complex Labels (Title + Subtitle)
    if(els.lblPrecisionMain) els.lblPrecisionMain.textContent = t.lblPrecision;
    if(els.lblPrecisionSub) els.lblPrecisionSub.textContent = t.descPrecision;
    
    if(els.lblBubble) els.lblBubble.textContent = t.lblBubble;

    if(els.lblAutoText) els.lblAutoText.textContent = t.lblAuto;
    // Current Host 动态显示，这里只更新提示文字（如果有的话），目前是动态域名无需翻译

    // API Section
    if(els.headerApi) els.headerApi.textContent = t.headerApi;
    els.apiKey.placeholder = t.placeholderKey;
    els.saveKeyBtn.textContent = t.btnSave;
    if(els.apiTips) els.apiTips.textContent = t.tipsKey;
    // 注意：apiTips 元素可能在 HTML 里没写 class，如果没有请手动在 HTML 里加 <div class="api-tips">...</div>
    // 这里简单处理：
    const tipEl = document.querySelector('.api-content > div:nth-child(2)'); // 尝试找 tips div
    if(tipEl && tipEl.classList.contains('api-tips')) tipEl.textContent = t.tipsKey;

    // Update Main Button based on current state (restoring or translating)
    const isRestoring = els.mainBtn.classList.contains('restoring');
    els.btnText.textContent = isRestoring ? t.btnRestore : t.btnTrans;
  }

  // === 3. 初始化逻辑 ===
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        currentDomain = url.hostname;
        els.currentHostLabel.textContent = currentDomain;
      } catch (e) { currentDomain = 'Unknown'; }
      
      chrome.tabs.sendMessage(tab.id, { action: "GET_STATE" }, (response) => {
        if (response && response.isTranslating) {
          updateMainButtonUI(true);
        }
      });
    }
  });

  // 读取设置
  chrome.storage.local.get(
    ['apiKey', 'targetLang', 'bilingualMode', 'transStyle', 'precisionMode', 'showBubble', 'autoSites', 'uiLang'], 
    (res) => {
      if (res.apiKey) els.apiKey.value = res.apiKey;
      else els.apiPanel.classList.remove('hidden');

      if (res.targetLang) els.targetLang.value = res.targetLang;
      els.bilingualMode.checked = res.bilingualMode !== false;
      els.transStyle.value = res.transStyle || 'minimal';
      els.precisionMode.checked = res.precisionMode === true;
      els.bubbleCheck.checked = res.showBubble !== false;
      
      const autoSites = res.autoSites || [];
      els.autoTranslateSite.checked = autoSites.includes(currentDomain);

      // 设置界面语言 (默认中文)
      const savedLang = res.uiLang || 'zh';
      updateUILanguage(savedLang);

      toggleStyleRow(els.bilingualMode.checked);
    }
  );

  // === 4. 交互绑定 ===

  // 语言切换点击
  els.langToggle.addEventListener('click', () => {
    const newLang = currentUiLang === 'zh' ? 'en' : 'zh';
    updateUILanguage(newLang);
    chrome.storage.local.set({ uiLang: newLang });
  });

  function toggleStyleRow(show) {
    if (show) els.styleRow.classList.add('visible');
    else els.styleRow.classList.remove('visible');
  }

  function updateMainButtonUI(isTranslating) {
    const t = i18n[currentUiLang];
    if (isTranslating) {
      els.mainBtn.classList.add('restoring');
      els.btnText.textContent = t.btnRestore;
      els.btnIcon.textContent = '↩️';
    } else {
      els.mainBtn.classList.remove('restoring');
      els.btnText.textContent = t.btnTrans;
      els.btnIcon.textContent = '✨';
    }
  }

  // API 面板折叠
  els.toggleApi.addEventListener('click', () => {
    els.apiPanel.classList.toggle('hidden');
    els.toggleApi.classList.toggle('active');
  });

  // 密码显隐
  els.toggleEye.addEventListener('click', () => {
    els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password';
  });

  // 保存 Key
  els.saveKeyBtn.addEventListener('click', () => {
    const key = els.apiKey.value.trim();
    if (!key) return;
    chrome.storage.local.set({ apiKey: key }, () => {
      els.saveKeyBtn.textContent = i18n[currentUiLang].btnSaved;
      setTimeout(() => {
        els.saveKeyBtn.textContent = i18n[currentUiLang].btnSave;
        els.apiPanel.classList.add('hidden');
      }, 1000);
    });
  });

  // 自动翻译开关
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

  // 设置即时生效
  const updateSettings = () => {
    const isBilingual = els.bilingualMode.checked;
    toggleStyleRow(isBilingual);

    const settings = {
      targetLang: els.targetLang.value,
      bilingualMode: isBilingual,
      transStyle: els.transStyle.value,
      precisionMode: els.precisionMode.checked,
      showBubble: els.bubbleCheck.checked
    };
    chrome.storage.local.set(settings);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "UPDATE_SETTINGS", payload: settings });
    });
  };

  [els.targetLang, els.bilingualMode, els.transStyle, els.precisionMode, els.bubbleCheck].forEach(el => {
    el.addEventListener('change', updateSettings);
  });

  // 主按钮点击
  els.mainBtn.addEventListener('click', () => {
    const isNowTranslating = !els.mainBtn.classList.contains('restoring');
    updateMainButtonUI(isNowTranslating);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "START_TRANSLATION" });
    });
  });
});