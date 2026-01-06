document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. 国际化字典 (i18n)
  // ==========================================
  const i18n = {
    zh: {
      appTitle: "AI 极简翻译",
      statusReady: "就绪",
      btnTrans: "🪐 翻译当前页面",
      btnRestore: "↩️ 显示原文", // 必须有
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
      placeholderKey: "请输入 API Key (sk-...)",
      btnSave: "保存配置",
      btnSaved: "已保存!",
      tipsKey: "Key 仅保存在本地，不会上传服务器。",
      langBtn: "English",
      msgDefaultUsed: "未配置 Key，将使用内置模型",
      msgSavedUsing: "配置已保存 (当前使用: {model})",
      lblCurrentModel: "模型: ",
      lblProvider: "模型服务商"
    },
    en: {
      appTitle: "AI Translate",
      statusReady: "Ready",
      btnTrans: "🪐 Translate Page",
      btnRestore: "↩️ Show Original", // 必须有
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
      placeholderKey: "Enter API Key (sk-...)",
      btnSave: "Save Key",
      btnSaved: "Saved!",
      tipsKey: "Key is stored locally, never uploaded.",
      langBtn: "中文",
      msgDefaultUsed: "No Key set. Using Built-in Model",
      msgSavedUsing: "Saved (Using: {model})",
      lblCurrentModel: "Model: ",
      lblProvider: "AI Provider"
    }
  };

  // 厂商预设
  const PROVIDERS = {
    moonshot: { url: "https://api.moonshot.cn/v1/chat/completions", model: "kimi-k2-turbo-preview" },
    deepseek: { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
    openai:   { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
    qwen:     { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-turbo" },
    custom:   { url: "", model: "" }
  };

  // ==========================================
  // 2. DOM 元素获取 (带安全检查)
  // ==========================================
  const els = {
    appTitle: document.getElementById('app-title'),
    statusBadge: document.getElementById('status-badge'),
    langToggle: document.getElementById('lang-toggle'),
    lblTarget: document.getElementById('lbl-target-main'),
    lblBiMode: document.getElementById('lbl-bi-mode'),
    lblStyle: document.getElementById('lbl-style'),
    lblPrecisionMain: document.getElementById('lbl-precision-main'),
    lblPrecisionSub: document.getElementById('lbl-precision-sub'),
    lblBubble: document.getElementById('lbl-bubble'),
    lblAutoText: document.getElementById('lbl-auto-main'),
    lblAutoSub: document.getElementById('current-host'),
    headerApi: document.getElementById('lbl-api-header'),
    apiTips: document.getElementById('lbl-api-tips'),
    apiKey: document.getElementById('api-key'),
    saveKeyBtn: document.getElementById('save-key-btn'),
    lblProvider: document.getElementById('lbl-provider'),
    
    providerSelect: document.getElementById('provider-select'),
    customOptions: document.getElementById('custom-options'),
    
    // 主按钮相关
    mainBtn: document.getElementById('main-action-btn'),
    btnText: document.querySelector('#main-action-btn .btn-text'),
    btnIcon: document.querySelector('#main-action-btn .btn-icon'),
    btnSubtitle: document.getElementById('btn-model-display'), // 如果 HTML 里没有这个 ID，可能是 null

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
    precisionMode: document.getElementById('precision-mode'),
    bubbleCheck: document.getElementById('show-bubble'),
    
    optMinimal: document.querySelector('#trans-style option[value="minimal"]'),
    optHighlight: document.querySelector('#trans-style option[value="highlight"]')
  };

  let currentDomain = '';
  let currentUiLang = 'zh';

  // ==========================================
  // 3. 核心功能函数
  // ==========================================

  // 更新界面语言
  function updateUILanguage(lang) {
    currentUiLang = lang;
    const t = i18n[lang];
    if (!t) return;

    if(els.appTitle) els.appTitle.textContent = t.appTitle;
    if(els.statusBadge) els.statusBadge.textContent = t.statusReady;
    if(els.langToggle) els.langToggle.textContent = t.langBtn;
    if(els.lblTarget) els.lblTarget.textContent = t.lblTarget;
    if(els.lblBiMode) els.lblBiMode.textContent = t.lblBiMode;
    if(els.lblStyle) els.lblStyle.textContent = t.lblStyle;
    if(els.optMinimal) els.optMinimal.textContent = t.optMinimal;
    if(els.optHighlight) els.optHighlight.textContent = t.optHighlight;
    if(els.lblPrecisionMain) els.lblPrecisionMain.textContent = t.lblPrecision;
    if(els.lblPrecisionSub) els.lblPrecisionSub.textContent = t.descPrecision;
    if(els.lblBubble) els.lblBubble.textContent = t.lblBubble;
    if(els.lblAutoText) els.lblAutoText.textContent = t.lblAuto;
    if(els.headerApi) els.headerApi.textContent = t.headerApi;
    if(els.apiKey) els.apiKey.placeholder = t.placeholderKey;
    if(els.saveKeyBtn) els.saveKeyBtn.textContent = t.btnSave;
    if(els.apiTips) els.apiTips.textContent = t.tipsKey;
    if(els.lblProvider) els.lblProvider.textContent = t.lblProvider;

    // 更新主按钮文字
    const isRestoring = els.mainBtn && els.mainBtn.classList.contains('restoring');
    if (els.btnText) els.btnText.textContent = isRestoring ? t.btnRestore : t.btnTrans;

    // 更新模型副标题
    chrome.storage.local.get(['modelName', 'provider'], (res) => {
      updateModelSubtitle(res.modelName, res.provider);
    });
  }

  // === 修复版：主按钮 UI 更新函数 (容错增强) ===
  function updateMainButtonUI(isTranslating) {
    // 1. 只要主按钮还在，就继续执行，不要因为缺图标就罢工
    if (!els.mainBtn) return;

    const lang = currentUiLang || 'zh'; 
    const t = i18n[lang] || i18n['zh'];

    if (isTranslating) {
      // 切换为 [还原状态] (绿色)
      els.mainBtn.classList.add('restoring');
      
      // 如果有文字元素，才更新文字
      if (els.btnText) els.btnText.textContent = t.btnRestore;
      // 如果有图标元素，才更新图标
      if (els.btnIcon) els.btnIcon.textContent = '↩️';
      
    } else {
      // 切换为 [翻译状态] (蓝色)
      els.mainBtn.classList.remove('restoring');
      
      if (els.btnText) els.btnText.textContent = t.btnTrans;
      if (els.btnIcon) els.btnIcon.textContent = '✨';
    }
  }

  // 更新按钮下方的模型显示
  function updateModelSubtitle(savedModelName, provider) {
    if (!els.btnSubtitle) return; // 如果 HTML 里没这个元素，直接跳过，防止报错
    
    const t = i18n[currentUiLang] || i18n['zh'];
    let displayModel = savedModelName;
    
    // 如果是 Kimi 或 DeepSeek 且没填 Key
    const apiKeyVal = els.apiKey ? els.apiKey.value : '';
    if ((provider === 'moonshot' || !provider) && !apiKeyVal) {
      displayModel = "Kimi (Built-in)";
    } else if (provider === 'deepseek' && !apiKeyVal) {
      displayModel = "DeepSeek (Built-in)";
    }
    
    els.btnSubtitle.textContent = `${t.lblCurrentModel}${displayModel || 'Default'}`;
  }

  function toggleStyleRow(show) {
    if (els.styleRow) {
      if (show) els.styleRow.classList.add('visible');
      else els.styleRow.classList.remove('visible');
    }
  }

  function toggleCustomInputs(provider) {
    if (!els.customOptions) return;
    if (provider === 'custom') {
      els.customOptions.classList.remove('hidden');
    } else {
      els.customOptions.classList.add('hidden');
    }
  }

  // ==========================================
  // 4. 初始化加载
  // ==========================================
  chrome.storage.local.get(
    ['apiKey', 'provider', 'apiUrl', 'modelName', 'targetLang', 'bilingualMode', 'transStyle', 'precisionMode', 'showBubble', 'autoSites', 'uiLang'], 
    (res) => {
      // 1. 填充 API 设置
      if (els.apiKey && res.apiKey) els.apiKey.value = res.apiKey;
      else if (els.apiPanel) els.apiPanel.classList.remove('hidden'); // 没 Key 默认展开面板

      const currentProvider = res.provider || 'moonshot'; // 默认 Kimi
      if (els.providerSelect) els.providerSelect.value = currentProvider;
      
      const config = PROVIDERS[currentProvider];
      if (els.customUrl) els.customUrl.value = res.apiUrl || (config ? config.url : '');
      if (els.customModel) els.customModel.value = res.modelName || (config ? config.model : '');
      
      toggleCustomInputs(currentProvider);

      // 2. 填充常规设置
      if (els.targetLang && res.targetLang) els.targetLang.value = res.targetLang;
      if (els.bilingualMode) els.bilingualMode.checked = res.bilingualMode !== false;
      if (els.transStyle) els.transStyle.value = res.transStyle || 'minimal';
      if (els.precisionMode) els.precisionMode.checked = res.precisionMode === true;
      if (els.bubbleCheck) els.bubbleCheck.checked = res.showBubble !== false;
      
      // 3. 界面语言
      const savedLang = res.uiLang || 'zh';
      updateUILanguage(savedLang);
      
      // 4. 双语样式行显示
      toggleStyleRow(els.bilingualMode.checked);

      // 5. 模型副标题
      updateModelSubtitle(res.modelName, currentProvider);

      // 6. 自动翻译开关状态
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url) {
          try {
            const url = new URL(tab.url);
            currentDomain = url.hostname;
            if (els.currentHostLabel) els.currentHostLabel.textContent = currentDomain;
            
            const autoSites = res.autoSites || [];
            if (els.autoTranslateSite) els.autoTranslateSite.checked = autoSites.includes(currentDomain);
            
            // 7. 检查当前页面是否正在翻译中 (Sync State)
            chrome.tabs.sendMessage(tab.id, { action: "GET_STATE" }, (response) => {
              if (chrome.runtime.lastError) return; // 忽略错误
              if (response && response.isTranslating) {
                updateMainButtonUI(true);
              }
            });
          } catch (e) {}
        }
      });
      
      // 8. 触发一次输入框检测 (清除按钮显隐)
      ['custom-api-url', 'custom-model-name', 'api-key'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.dispatchEvent(new Event('input'));
      });
    }
  );

  // ==========================================
  // 5. 事件监听绑定
  // ==========================================

  // 主按钮点击 (修复版)
  if (els.mainBtn) {
    els.mainBtn.addEventListener('click', async () => {
      console.log("Button Clicked!"); // 调试日志
      // 获取当前状态 (UI为准)
      const isCurrentlyRestoring = els.mainBtn.classList.contains('restoring');
      const targetState = !isCurrentlyRestoring;

      console.log("Switching to state:", targetState ? "Restoring (Green)" : "Translating (Blue)");
      
      // 立即更新 UI
      updateMainButtonUI(targetState);
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      try {
        await chrome.tabs.sendMessage(tab.id, { action: "START_TRANSLATION" });
      } catch (err) {
        console.warn("第一次连接失败，尝试注入脚本...", err);
        // 脚本注入保底
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: "START_TRANSLATION" });
          }, 100);
        } catch (injectErr) {
          console.error("注入失败:", injectErr);
          alert("无法连接页面，请刷新网页后重试。");
        }
      }
    });
  }

  // 语言切换
  if (els.langToggle) {
    els.langToggle.addEventListener('click', () => {
      const newLang = currentUiLang === 'zh' ? 'en' : 'zh';
      updateUILanguage(newLang);
      chrome.storage.local.set({ uiLang: newLang });
    });
  }

  // 厂商切换
  if (els.providerSelect) {
    els.providerSelect.addEventListener('change', (e) => {
      const provider = e.target.value;
      const config = PROVIDERS[provider];
      
      if (provider === 'custom') {
        els.customOptions.classList.remove('hidden');
        if (els.customUrl) {
          els.customUrl.value = ""; 
          els.customUrl.dispatchEvent(new Event('input'));
        }
        if (els.customModel) {
          els.customModel.value = "";
          els.customModel.dispatchEvent(new Event('input'));
        }
      } else {
        els.customOptions.classList.add('hidden');
        if (els.customUrl) els.customUrl.value = config.url;
        if (els.customModel) els.customModel.value = config.model;
      }
    });
  }

  // 自动翻译开关
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

  // 保存 API 配置
  if (els.saveKeyBtn) {
    els.saveKeyBtn.addEventListener('click', () => {
      const key = els.apiKey ? els.apiKey.value.trim() : '';
      const provider = els.providerSelect ? els.providerSelect.value : 'moonshot';
      let apiUrl = els.customUrl ? els.customUrl.value.trim() : '';
      let modelName = els.customModel ? els.customModel.value.trim() : '';
      
      // 预设厂商强行修正 URL
      if (provider !== 'custom') {
        apiUrl = PROVIDERS[provider].url;
        modelName = PROVIDERS[provider].model;
      }

      // 验证
      if (!key && provider !== 'custom' && provider !== 'moonshot' && provider !== 'deepseek') {
        els.saveKeyBtn.textContent = "请填写 API Key";
        setTimeout(() => els.saveKeyBtn.textContent = i18n[currentUiLang].btnSave, 1500);
        return;
      }

      const t = i18n[currentUiLang] || i18n['zh'];
      let feedbackMsg = t.btnSaved;
      
      if (!key && (provider === 'moonshot' || provider === 'deepseek')) {
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
        updateModelSubtitle(modelName, provider);
        els.saveKeyBtn.textContent = feedbackMsg;
        setTimeout(() => {
          els.saveKeyBtn.textContent = t.btnSave;
          if (els.apiPanel) els.apiPanel.classList.add('hidden');
        }, 2000);
      });
    });
  }

  // 清除按钮逻辑
  const inputsWithClear = ['custom-api-url', 'custom-model-name', 'api-key'];
  inputsWithClear.forEach(id => {
    const input = document.getElementById(id);
    const btn = document.querySelector(`.clear-btn[data-target="${id}"]`);
    if(input && btn) {
      input.addEventListener('input', () => {
        if(input.value.length > 0) btn.classList.add('visible');
        else btn.classList.remove('visible');
      });
      btn.addEventListener('click', () => {
        input.value = '';
        btn.classList.remove('visible');
        input.focus();
      });
    }
  });

  // 密码/明文切换
  if (els.toggleEye && els.apiKey) {
    els.toggleEye.addEventListener('click', () => {
      els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password';
    });
  }

  // API 面板折叠
  if (els.toggleApi && els.apiPanel) {
    els.toggleApi.addEventListener('click', () => {
      els.apiPanel.classList.toggle('hidden');
      els.toggleApi.classList.toggle('active');
    });
  }

  // 即时保存的通用设置
  const updateSettings = () => {
    const isBilingual = els.bilingualMode ? els.bilingualMode.checked : true;
    toggleStyleRow(isBilingual);

    const settings = {
      targetLang: els.targetLang ? els.targetLang.value : 'zh',
      bilingualMode: isBilingual,
      transStyle: els.transStyle ? els.transStyle.value : 'minimal',
      precisionMode: els.precisionMode ? els.precisionMode.checked : false,
      showBubble: els.bubbleCheck ? els.bubbleCheck.checked : true
    };
    chrome.storage.local.set(settings);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "UPDATE_SETTINGS", payload: settings });
    });
  };

  [els.targetLang, els.bilingualMode, els.transStyle, els.precisionMode, els.bubbleCheck].forEach(el => {
    if (el) el.addEventListener('change', updateSettings);
  });
});