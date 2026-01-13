/*
 * ==========================================================================
 * ⚠️ 版权声明 (Copyright Notice)
 * ==========================================================================
 * 
 * 本软件由 [BTBONN，倪城，nc0032@qq.com] 开发，受著作权法保护。
 * Copyright (c) 2024 [BTBONN，倪城，nc0032@qq.com]. All Rights Reserved.
 * 
 * 1. 授权范围：
 *    本软件仅供购买者个人使用。未经作者书面许可，严禁任何形式的
 *    复制、分发、破解、反编译或用于其他商业用途。
 * 
 * 2. 法律后果：
 *    擅自传播或修改本软件代码将构成侵权，作者保留追究法律责任的权利。
 * 
 * 3. 获取正版：
 *    获取更新或技术支持，请关注小红书作者：[BTBONN]
 *    小红书主页：https://www.xiaohongshu.com/user/profile/6252abd90000000010006abc?xsec_token=YB0uWUekOh2DpxdAhPqp-lvOau79DgGu2Xlp61H5MS4oY%3D&xsec_source=app_share&xhsshare=&shareRedId=ODg3MkRHSEI2NzUyOTgwNjczOTc6RkhM&apptime=1768037777&share_id=246ee3c596344bf59484ffc52815aa59&share_channel=copy_link
 * 
 * ==========================================================================
 */
// --- START OF FILE background.js ---
console.log("如果你也喜欢这个插件，请关注作者小红书【BTBONN】获取最新模型配置与更新动态。");
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
    // === 内置线路 (Key 填在云函数里，前端无需填) ===
    // 注意：这里的 model 必须和云函数 index.js 里判断的字符串一致
    builtin_deepseek: { 
      url: "", // 内置模式不需要在这里填 URL，background.js 会处理
      model: "deepseek-ai/DeepSeek-V3" 
    },
    builtin_glm: { 
      url: "", 
      model: "glm-4-flash" 
    },
    builtin_kimi: { 
      url: "", 
      model: "kimi-k2-turbo-preview" 
    },

    // === 官方线路 (需要用户填 Key) ===
    deepseek: { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
    moonshot: { url: "https://api.moonshot.cn/v1/chat/completions", model: "kimi-k2-turbo-preview" },
    openai:   { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
    qwen:     { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-turbo" },
    siliconflow: { url: "https://api.siliconflow.cn/v1/chat/completions", model: "deepseek-ai/DeepSeek-V3" },
    zhipu:    { url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash" },
    groq:     { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
    openrouter:{ url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-2.0-flash-exp:free" },
    ollama:   { url: "http://localhost:11434/v1/chat/completions", model: "llama3" },
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
    precisionMode: document.getElementById('precision-mode'),
    bubbleCheck: document.getElementById('show-bubble'),
    
    optMinimal: document.querySelector('#trans-style option[value="minimal"]'),
    optHighlight: document.querySelector('#trans-style option[value="highlight"]'),

    statusLabel: document.getElementById('membership-status'),
    trialBar: document.getElementById('trial-progress-bar'),
    trialFill: document.getElementById('trial-progress-fill'),
    activationArea: document.getElementById('activation-area'),
    activeInfo: document.getElementById('active-info'),
    expireDateLabel: document.getElementById('expire-date'),
    licenseInput: document.getElementById('license-key-input'),
    activateBtn: document.getElementById('btn-activate')
    
  };

  // 2. 初始化逻辑 (放在 init 或 DOMContentLoaded 里)
  chrome.storage.local.get(['apiKey', 'provider', 'apiUrl', 'modelName', 'targetLang', 'bilingualMode', 'transStyle', 'precisionMode', 'showBubble', 'autoSites', 'uiLang'], 
    (res) => {
    // 1. 获取当前厂商，如果没存过，默认为 'deepseek'
    const currentProvider = res.provider || 'deepseek'; 
    if (els.providerSelect) els.providerSelect.value = currentProvider;

    // 2. 如果没有 Key，自动展开面板提醒用户
    if (els.apiKey) els.apiKey.value = res.apiKey || '';
    if (!res.apiKey && els.apiPanel) {
        els.apiPanel.classList.remove('hidden'); 
        if(els.toggleApi) els.toggleApi.classList.add('active'); 
    }
  });

  
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

  // 主按钮 UI 更新函数
  function updateMainButtonUI(isTranslating) {
    if (!els.mainBtn) return;

    const lang = currentUiLang || 'zh'; 
    const t = i18n[lang] || i18n['zh'];

    if (isTranslating) {
      // 切换为 [还原状态] (绿色)
      els.mainBtn.classList.add('restoring');
      if (els.btnText) els.btnText.textContent = t.btnRestore;
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
    if (!els.btnSubtitle) return; 
    
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
      // --- A. 处理服务商与面板状态 ---
      // 1. 获取当前厂商，如果没存过，默认为 'builtin_glm'
      const currentProvider = res.provider || 'builtin_glm'; 
      
      // 2. 回显下拉菜单选中项
      if (els.providerSelect) {
        els.providerSelect.value = currentProvider;
      }

      // 3. 智能展开面板逻辑：只有当 "不是内置" 且 "没有Key" 时，才自动展开提醒用户填 Key
      // (原来的逻辑是只要没 Key 就展开，导致内置模式也会展开，很烦人)
      if (els.apiKey) els.apiKey.value = res.apiKey || '';
      
      const isBuiltin = currentProvider.startsWith('builtin_');
      if (!isBuiltin && !res.apiKey && els.apiPanel) {
         els.apiPanel.classList.remove('hidden'); // 展开面板
         if(els.toggleApi) els.toggleApi.classList.add('active'); // 箭头旋转
      }

      // 4. 关键：手动触发一次 change 事件
      // 作用：让下方的监听器工作，自动禁用 Key 输入框、更新提示语
      if (els.providerSelect) {
        els.providerSelect.dispatchEvent(new Event('change'));
      }

      // --- B. 填充自定义 URL 和 模型名 ---
      // (即使是内置模式，这里 config 也会取到默认值，没关系，UI会自动隐藏)
      const config = PROVIDERS[currentProvider] || PROVIDERS['builtin_glm'];
      if (els.customUrl) els.customUrl.value = res.apiUrl || (config ? config.url : '');
      if (els.customModel) els.customModel.value = res.modelName || (config ? config.model : '');
      
      // --- C. 填充常规设置 (保持不变) ---
      if (els.targetLang && res.targetLang) els.targetLang.value = res.targetLang;
      if (els.bilingualMode) els.bilingualMode.checked = res.bilingualMode !== false;
      if (els.transStyle) els.transStyle.value = res.transStyle || 'minimal';
      if (els.precisionMode) els.precisionMode.checked = res.precisionMode === true;
      if (els.bubbleCheck) els.bubbleCheck.checked = res.showBubble !== false;
      
      // --- D. 界面语言与样式 ---
      const savedLang = res.uiLang || 'zh';
      updateUILanguage(savedLang);
      toggleStyleRow(els.bilingualMode.checked);

      // --- E. 模型副标题 ---
      updateModelSubtitle(res.modelName, currentProvider);

      // --- F. 自动翻译开关状态 (保持不变) ---
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
              if (response && response.isTranslating) {
                updateMainButtonUI(true);
              }
            });
          } catch (e) {}
        }
      });
      
      // --- G. 清除按钮显隐状态检测 ---
      ['custom-api-url', 'custom-model-name', 'api-key'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.dispatchEvent(new Event('input'));
      });
    }
  );

  // ==========================================
  // 5. 事件监听绑定
  // ==========================================

  // 主按钮点击
  if (els.mainBtn) {
    els.mainBtn.addEventListener('click', async () => {
      console.log("Button Clicked!"); 
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
        if (els.customUrl) els.customUrl.value = ""; 
        if (els.customModel) els.customModel.value = "";
      } else {
        els.customOptions.classList.add('hidden');
        if (els.customUrl) els.customUrl.value = config.url;
        if (els.customModel) els.customModel.value = config.model;
      }

      // 始终启用 Key 输入框
      els.apiKey.disabled = false;
      els.apiKey.placeholder = "请输入 API Key (sk-...)";
      els.apiTips.textContent = "Key 仅保存在本地，插件直接请求 API 厂商。";
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
      const provider = els.providerSelect ? els.providerSelect.value : 'deepseek';
      let apiUrl = els.customUrl ? els.customUrl.value.trim() : '';
      let modelName = els.customModel ? els.customModel.value.trim() : '';
      
      // 从配置表获取默认 URL 和 Model (防止用户改乱了)
      if (provider !== 'custom') {
        const config = PROVIDERS[provider];
        if(config) {
           apiUrl = config.url;
           modelName = config.model;
        }
      }

      // 验证：除非是 Ollama 或 Custom，否则必须有 Key
      if (!key && provider !== 'custom' && provider !== 'ollama') {
        els.saveKeyBtn.textContent = "请填写 API Key";
        setTimeout(() => els.saveKeyBtn.textContent = i18n[currentUiLang].btnSave, 1500);
        return;
      }
      
      const t = i18n[currentUiLang] || i18n['zh'];
      let feedbackMsg = t.btnSaved;
      
      chrome.storage.local.set({ 
        apiKey: key,
        provider: provider,
        apiUrl: apiUrl,
        modelName: modelName
      }, () => {
        // 更新 UI
        updateModelSubtitle(modelName, provider);
        els.saveKeyBtn.textContent = feedbackMsg;
        
        // ★★★ 新增：2秒后自动收起面板 ★★★
        setTimeout(() => {
          // 1. 恢复按钮文字
          els.saveKeyBtn.textContent = t.btnSave;
          
          // 2. 收起面板
          if (els.apiPanel) els.apiPanel.classList.add('hidden');
          
          // 3. 复位旋转箭头 (如果有的话)
          if (els.toggleApi) els.toggleApi.classList.remove('active');
          
        }, 2000); // 2秒后自动收起面板
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

  // 切换密码/明文显示
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