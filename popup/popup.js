document.addEventListener('DOMContentLoaded', () => {
  const els = {
    apiKey: document.getElementById('api-key'),
    saveKeyBtn: document.getElementById('save-key-btn'),
    toggleApi: document.getElementById('toggle-api'),
    apiPanel: document.getElementById('api-panel'),
    toggleEye: document.getElementById('toggle-visibility'),
    
    targetLang: document.getElementById('target-lang'),
    autoTranslateSite: document.getElementById('auto-translate-site'), // 新增
    currentHostLabel: document.getElementById('current-host'), // 新增
    
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

  // 1. 获取当前 Tab 信息 & 域名
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        currentDomain = url.hostname;
        els.currentHostLabel.textContent = currentDomain;
      } catch (e) {
        currentDomain = '未知域名';
      }
      
      // 询问 Content Script 当前翻译状态，以更新按钮 UI
      chrome.tabs.sendMessage(tab.id, { action: "GET_STATE" }, (response) => {
        if (response && response.isTranslating) {
          updateMainButton(true);
        }
      });
    }
  });

  // 2. 初始化设置
  chrome.storage.local.get(
    ['apiKey', 'targetLang', 'bilingualMode', 'transStyle', 'precisionMode', 'showBubble', 'autoSites'], 
    (res) => {
      if (res.apiKey) els.apiKey.value = res.apiKey;
      else els.apiPanel.classList.remove('hidden');

      if (res.targetLang) els.targetLang.value = res.targetLang;
      els.bilingualMode.checked = res.bilingualMode !== false;
      els.transStyle.value = res.transStyle || 'minimal';
      els.precisionMode.checked = res.precisionMode === true;
      els.bubbleCheck.checked = res.showBubble !== false;
      
      // 检查当前域名是否在自动翻译列表中
      const autoSites = res.autoSites || [];
      els.autoTranslateSite.checked = autoSites.includes(currentDomain);

      toggleStyleRow(els.bilingualMode.checked);
    }
  );

  function toggleStyleRow(show) {
    if (show) els.styleRow.classList.add('visible');
    else els.styleRow.classList.remove('visible');
  }

  function updateMainButton(isTranslating) {
    if (isTranslating) {
      els.mainBtn.classList.add('restoring');
      els.btnText.textContent = '显示原文';
      els.btnIcon.textContent = '↩️';
    } else {
      els.mainBtn.classList.remove('restoring');
      els.btnText.textContent = '翻译当前页面';
      els.btnIcon.textContent = '✨';
    }
  }

  // 3. 自动翻译开关逻辑 (修复：支持即时生效)
  els.autoTranslateSite.addEventListener('change', () => {
    chrome.storage.local.get(['autoSites'], (res) => {
      let sites = res.autoSites || [];
      const isChecked = els.autoTranslateSite.checked;
      
      if (isChecked) {
        if (!sites.includes(currentDomain)) sites.push(currentDomain);
      } else {
        sites = sites.filter(s => s !== currentDomain);
      }
      
      // 保存并通知当前页面
      chrome.storage.local.set({ autoSites: sites }, () => {
        // 如果开启了，立即发送指令让当前页面检查是否需要翻译
        if (isChecked) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, { action: "CHECK_AUTO_TRANSLATE" });
            }
          });
        }
      });
    });
  });

  // 4. 即时生效逻辑
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
    
    // 通知 content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "UPDATE_SETTINGS", payload: settings });
      }
    });
  };

  [els.targetLang, els.bilingualMode, els.transStyle, els.precisionMode, els.bubbleCheck].forEach(el => {
    el.addEventListener('change', updateSettings);
  });

  // ... (API Key 保存逻辑保持不变，略) ...
  els.toggleApi.addEventListener('click', () => { els.apiPanel.classList.toggle('hidden'); els.toggleApi.classList.toggle('active'); });
  els.toggleEye.addEventListener('click', () => { els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password'; });
  els.saveKeyBtn.addEventListener('click', () => {
    const key = els.apiKey.value.trim();
    if(!key) return;
    chrome.storage.local.set({apiKey:key},()=>{
        els.saveKeyBtn.textContent='已保存';
        setTimeout(()=>{els.saveKeyBtn.textContent='保存配置';els.apiPanel.classList.add('hidden');},1000);
    });
  });

  // 5. 点击主按钮
  els.mainBtn.addEventListener('click', () => {
    // 切换按钮状态 UI
    const isNowTranslating = !els.mainBtn.classList.contains('restoring');
    updateMainButton(isNowTranslating);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "START_TRANSLATION" });
    });
  });
});