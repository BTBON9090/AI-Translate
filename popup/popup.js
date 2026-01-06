document.addEventListener('DOMContentLoaded', () => {
  // === 1. 国际化字典 (i18n Dictionary) ===
  const i18n = {
    zh: {
      appTitle: "AI 精简翻译",
      statusReady: "就绪",
      btnTrans: "🪐 翻译当前页面",
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
      headerApi: "🔑 模型 API 配置",
      placeholderKey: "请输入 DeepSeek API Key (sk-...)",
      btnSave: "保存配置",
      btnSaved: "已保存!",
      tipsKey: "Key 仅保存在本地，不会上传服务器。",
      langBtn: "English", // 切换到英文的按钮文字
      // === 新增 ===
      msgDefaultUsed: "未配置 Key，将使用默认内置模型",
      msgSavedUsing: "配置已保存 (当前使用: {model})",
      lblCurrentModel: "模型: ",
      lblProvider: "模型服务商" // 确保有这行
    },
    en: {
      appTitle: "AI Translate",
      statusReady: "Ready",
      btnTrans: "🪐 Translate Page",
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
      langBtn: "中文", // 切换到中文的按钮文字
      // === 新增 ===
      msgDefaultUsed: "No Key set. Using Default Model",
      msgSavedUsing: "Saved (Using: {model})",
      lblCurrentModel: "Model: ",
      lblProvider: "AI Provider" // 确保有这行
    }
  };

  // === 新增：厂商预设数据 ===
  const PROVIDERS = {
    deepseek: { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
    openai:   { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
    moonshot: { url: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-8k" },
    qwen:     { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-turbo" },
    custom:   { url: "", model: "" }
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

    lblProvider: document.getElementById('lbl-provider'), // 新增这行

    // === 新增引用 ===
    providerSelect: document.getElementById('provider-select'),
    customOptions: document.getElementById('custom-options'),
    btnSubtitle: document.getElementById('btn-model-display'), // 新增
    clearBtns: document.querySelectorAll('.clear-btn'),        // 新增
    customUrl: document.getElementById('custom-api-url'),
    customModel: document.getElementById('custom-model-name'),

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

  // === 问题2 & 3: 清除按钮逻辑与输入监听 ===
  // 为所有输入框添加监听，有内容显示 X，无内容隐藏 X
  const inputsWithClear = ['custom-api-url', 'custom-model-name', 'api-key'];
  inputsWithClear.forEach(id => {
    const input = document.getElementById(id);
    const btn = document.querySelector(`.clear-btn[data-target="${id}"]`);
    
    if(input && btn) {
      // 监听输入，控制图标显示
      input.addEventListener('input', () => {
        if(input.value.length > 0) btn.classList.add('visible');
        else btn.classList.remove('visible');
      });

      // 点击 X 清空
      btn.addEventListener('click', () => {
        input.value = '';
        btn.classList.remove('visible');
        input.focus();
      });
    }
  });

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

    // 更新副标题的 "Model:" 前缀
    chrome.storage.local.get(['modelName', 'provider'], (res) => {
      updateModelSubtitle(res.modelName, res.provider);
    });

    if(els.lblProvider) els.lblProvider.textContent = t.lblProvider; // 新增这行，执行翻译
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
  chrome.storage.local.get(['apiKey', 'provider', 'apiUrl', 'modelName', 'targetLang', 'bilingualMode', 'transStyle', 'precisionMode', 'showBubble', 'autoSites', 'uiLang'], 
    (res) => {
      if (res.apiKey) els.apiKey.value = res.apiKey;
      else els.apiPanel.classList.remove('hidden');

      // 初始化厂商选择
      const currentProvider = res.provider || 'deepseek';
      els.providerSelect.value = currentProvider;
      
      // 初始化自定义输入框 (如果有存过，用存的；否则用预设)
      els.customUrl.value = res.apiUrl || PROVIDERS[currentProvider].url;
      els.customModel.value = res.modelName || PROVIDERS[currentProvider].model;
      
      // 控制自定义面板显示
      if (currentProvider === 'custom') els.customOptions.classList.remove('hidden');

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

      // === 问题5：回显当前模型名称到主按钮 ===
      updateModelSubtitle(res.modelName, res.provider);
      // 触发一次输入框检测，确保清除按钮状态正确
      inputsWithClear.forEach(id => 
        document.getElementById(id)?.dispatchEvent(new Event('input')));
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
  // 辅助函数：更新按钮上的模型文字
  function updateModelSubtitle(savedModelName, provider) {
    const t = i18n[currentUiLang];
    let displayModel = savedModelName;
    
    // 如果没有保存模型名，或者 provider 是 deepseek 且没填 key (使用内置)
    if (!savedModelName || (provider === 'deepseek' && !els.apiKey.value)) {
      displayModel = "DeepSeek (Built-in)";
    }
    
    els.btnSubtitle.textContent = `${t.lblCurrentModel}${displayModel}`;
  }

  // API 面板折叠
  els.toggleApi.addEventListener('click', () => {
    els.apiPanel.classList.toggle('hidden');
    els.toggleApi.classList.toggle('active');
  });

  // === 新增：厂商切换逻辑 ===
  els.providerSelect.addEventListener('change', (e) => {
    const provider = e.target.value;
    const config = PROVIDERS[provider];
    
    if (provider === 'custom') {
      els.customOptions.classList.remove('hidden');
      // === 问题3：切换到自定义时，清空输入框 (如果是从预设切过来的话) ===
      // 也可以选择不清空，看个人喜好。这里按需求“默认清空”
      els.customUrl.value = ""; 
      els.customModel.value = "";
      // 手动触发 input 事件以隐藏清除按钮
      els.customUrl.dispatchEvent(new Event('input'));
      els.customModel.dispatchEvent(new Event('input'));
    } else {
      els.customOptions.classList.add('hidden');
      els.customUrl.value = config.url;
      els.customModel.value = config.model;
    }
  });

  // 密码显隐
  els.toggleEye.addEventListener('click', () => {
    els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password';
  });

  // 保存 Key
  els.saveKeyBtn.addEventListener('click', () => {
    const key = els.apiKey.value.trim();
    const provider = els.providerSelect.value;
    let apiUrl = els.customUrl.value.trim();
    let modelName = els.customModel.value.trim();
    
    // 如果是预设厂商，确保使用预设值 (防止用户在自定义里清空后又切回预设)
    if (provider !== 'custom') {
      apiUrl = PROVIDERS[provider].url;
      modelName = PROVIDERS[provider].model;
    }

    // === 问题4：提示用户 ===
    const t = i18n[currentUiLang];
    let feedbackMsg = t.btnSaved;
    
    // 如果未填写 Key 且不是自定义 URL (通常意味着想用内置或者漏填)
    // 这里逻辑是：只要没 Key，且没有自定义 URL，就认为是回退到默认
    if (!key && provider === 'deepseek') {
      feedbackMsg = t.msgDefaultUsed;
    } else if (modelName) {
      feedbackMsg = t.msgSavedUsing.replace('{model}', modelName);
    }

    chrome.storage.local.set({ 
      apiKey: key,
      provider: provider,
      apiUrl: apiUrl,
      modelName: modelName
    }, () => {
      // 更新按钮上的回显
      updateModelSubtitle(modelName, provider);
      
      // 提示信息
      els.saveKeyBtn.textContent = feedbackMsg;
      // 稍微延长提示时间，因为字数多了
      setTimeout(() => {
        els.saveKeyBtn.textContent = t.btnSave;
        els.apiPanel.classList.add('hidden');
      }, 2000);
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