// --- START OF FILE content.js ---
console.log("AI Minimal Translator: Content Script Loaded");

const TRANSLATION_MARK_ATTR = 'data-ai-translated';
const ORIGIN_MARK_ATTR = 'data-ai-origin';
const ICON_SVG = `<svg class="ai-icon-svg" viewBox="0 0 24 24"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`;

let isTranslating = false; 
let lastUrl = window.location.href; // 记录当前 URL，用于检测 SPA 跳转

function init() {
  chrome.storage.local.get(['showBubble'], (result) => {
    if (result.showBubble !== false) createBubble();
    checkAutoTranslate();
  });
  
  new SelectionManager();

  setupMutationObserver();

  // SPA 跳转检测
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      handleUrlChange();
    }
  }, 1000);

  // 页面唤醒时继续处理队列
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isTranslating && pageManager) {
      pageManager.processQueue();
    }
  });
}

function handleUrlChange() {
  if (isTranslating) disablePageTranslation();
  setTimeout(checkAutoTranslate, 1000);
  setTimeout(checkAutoTranslate, 3000);
}

function checkAutoTranslate() {
  chrome.storage.local.get(['autoSites'], (result) => {
    const currentHost = window.location.hostname;
    const autoSites = result.autoSites || [];
    if (autoSites.includes(currentHost) && !isTranslating) {
      togglePageTranslation();
    }
  });
}

// 防抖定时器（闭包私有，避免 this 指向问题）
let mutationDebounceTimer = null;

function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    if (document.hidden || !isTranslating) return;

    let hasMeaningfulChange = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'HR'].includes(node.tagName)) continue;
          if (node.classList && (
            node.classList.contains('ai-translator-bubble') ||
            node.classList.contains('ai-trans-minimal') ||
            node.getAttribute(TRANSLATION_MARK_ATTR)
          )) continue;
          hasMeaningfulChange = true;
          break;
        }
      }
      if (hasMeaningfulChange) break;
    }

    if (!hasMeaningfulChange) return;

    if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = setTimeout(() => {
       if (!document.hidden && isTranslating) {
         enablePageTranslation();
       }
    }, 2000);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
}

function createBubble() {
  if (document.querySelector('.ai-translator-bubble')) return;
  const bubble = document.createElement('div');
  bubble.className = 'ai-translator-bubble';
  if (isTranslating) bubble.classList.add('active'); 
  bubble.innerHTML = ICON_SVG;
  document.body.appendChild(bubble);
  requestAnimationFrame(() => bubble.classList.add('visible'));
  setupDrag(bubble);
  bubble.addEventListener('click', (e) => {
    if (bubble.dataset.isDragging === 'true') return;
    togglePageTranslation();
  });
}

function updateBubbleState(active) {
  const bubble = document.querySelector('.ai-translator-bubble');
  if (bubble) {
    if (active) bubble.classList.add('active');
    else bubble.classList.remove('active');
  }
}

function removeBubble() {
  const bubble = document.querySelector('.ai-translator-bubble');
  if (bubble) bubble.remove();
}

function setBubbleLoading(isLoading) {
  const bubble = document.querySelector('.ai-translator-bubble');
  if (bubble) {
    if (isLoading) bubble.classList.add('translating');
    else bubble.classList.remove('translating');
  }
}

function setupDrag(el) {
  let isDragging = false, startX, startY, initialLeft, initialTop, moveDistance = 0;
  el.addEventListener('mousedown', (e) => {
    isDragging = true; moveDistance = 0; el.style.transition = 'none';
    startX = e.clientX; startY = e.clientY;
    const rect = el.getBoundingClientRect();
    initialLeft = rect.left; initialTop = rect.top; el.dataset.isDragging = 'false';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    moveDistance += Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
    if (moveDistance > 5) el.dataset.isDragging = 'true';
    el.style.left = `${initialLeft + (e.clientX - startX)}px`;
    el.style.top = `${initialTop + (e.clientY - startY)}px`;
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false; el.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    const rect = el.getBoundingClientRect();
    el.style.left = rect.left + rect.width / 2 < window.innerWidth / 2 ? '16px' : `${window.innerWidth - rect.width - 16}px`;
  });
}

class SelectionManager {
  constructor() {
    this.btn = null;
    this.card = null;
    this.selectionText = "";
    
    // 强制绑定 this，防止事件丢失上下文
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('mousedown', this.handleMouseDown);
  }

  handleMouseUp(e) {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (!text || text.length < 1) return;
      
      let target = e.target;
      if (target.nodeType === Node.TEXT_NODE) target = target.parentElement;
      if (target && (target.closest('.ai-card') || target.closest('.ai-selection-btn'))) return;

      this.selectionText = text;
      this.showButton(selection);
    }, 150);
  }

  handleMouseDown(e) {
    let target = e.target;
    if (target.nodeType === Node.TEXT_NODE) target = target.parentElement;

    if (!target.closest('.ai-selection-btn') && !target.closest('.ai-card')) {
      this.hideButton();
      if (this.card) {
        this.card.remove();
        this.card = null;
      }
    }
  }

  showButton(selection) {
    this.hideButton(); 

    let rect;
    try {
      const range = selection.getRangeAt(0);
      rect = range.getBoundingClientRect();
    } catch (err) { return; }

    this.btn = document.createElement('div');
    this.btn.className = 'ai-selection-btn';
    this.btn.innerHTML = '🌐'; 
    
    Object.assign(this.btn.style, {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      backgroundColor: '#1e293b', 
      color: '#ffffff',           
      borderRadius: '6px',
      zIndex: '2147483647',      
      cursor: 'pointer',
      fontSize: '18px',
      boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
      userSelect: 'none'
    });

    const top = rect.bottom + window.scrollY + 8;
    const left = rect.right + window.scrollX + 8;
    
    this.btn.style.top = `${top}px`;
    this.btn.style.left = `${left}px`;

    this.btn.onmousedown = (e) => {
      e.preventDefault(); 
      e.stopPropagation();
      this.showCard(rect);
      this.hideButton();
    };

    document.body.appendChild(this.btn);
  }

  hideButton() {
    if (this.btn) {
      this.btn.remove();
      this.btn = null;
    }
  }
  
  async showCard(selectionRect) {
    if (this.card) this.card.remove();

    this.card = document.createElement('div');
    this.card.className = 'ai-card';

    const settings = await chrome.storage.local.get(['targetLang', 'precisionMode', 'provider', 'modelName']);
    const provider = settings.provider || 'deepseek';
    const currentModel = settings.modelName || ""; // 获取具体模型名

    const titlePrefixMap = {
        'deepseek': "✨",
        'qwen': "🟣",
        'siliconflow': "🚀",
        'moonshot': "�",
        'zhipu': "🎓",
        'zhipu_free': "�",
        'custom': "⚙️"
    };

    let prefix = titlePrefixMap[provider] || "🤖";
    let displayModel = currentModel;

    if (!displayModel) {
       const providerNames = {
          'deepseek': "DeepSeek",
          'qwen': "Qwen",
          'siliconflow': "SiliconFlow",
          'moonshot': "Kimi",
          'zhipu': "GLM-4 Plus",
          'zhipu_free': "GLM-4 Flash (免费)",
          'custom': "Custom Model"
       };
       displayModel = providerNames[provider] || "AI Translator";
    }

    const cardTitle = `${prefix} ${displayModel}`;
    
    Object.assign(this.card.style, {
      position: 'absolute',
      width: '320px',
      maxWidth: '90vw',
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
      zIndex: '2147483648',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      border: '1px solid #e2e8f0',
      animation: 'fadeIn 0.2s ease-out'
    });

    this.card.innerHTML = `
      <div class="ai-card-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;cursor:grab;">
        <span style="font-weight:600;color:#475569;font-size:13px;display:flex;align-items:center;gap:6px;">${cardTitle}</span>
        <div style="display:flex;gap:10px;align-items:center;">
           <button id="ai-btn-explain" class="ai-action-btn" style="border:none;background:none;cursor:pointer;font-size:13px;color:#64748b;padding:2px 6px;border-radius:4px;display:flex;align-items:center;gap:4px;transition:all 0.2s;">
             <span>💡</span> 解读
           </button>
           <span class="ai-card-close" style="cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;">×</span>
        </div>
      </div>
      <div class="ai-card-body" style="padding:16px;font-size:14px;color:#334155;line-height:1.6;max-height:500px;overflow-y:auto;">
        <div style="color:#94a3b8;font-style:italic;">Thinking...</div>
      </div>
    `;

    let top = selectionRect.bottom + window.scrollY + 12;
    let left = selectionRect.left + window.scrollX;
    
    if (left + 320 > document.body.clientWidth) left = document.body.clientWidth - 340;
    if (left < 10) left = 10;

    this.card.style.top = `${top}px`;
    this.card.style.left = `${left}px`;
    
    document.body.appendChild(this.card);

    this.card.querySelector('.ai-card-close').onclick = () => this.card.remove();
    
    // --- 新增：解读按钮点击逻辑 ---
    const btnExplain = this.card.querySelector('#ai-btn-explain');
    btnExplain.onmouseover = () => btnExplain.style.backgroundColor = '#e2e8f0';
    btnExplain.onmouseout = () => btnExplain.style.backgroundColor = 'transparent';
    
    btnExplain.onclick = () => {
       btnExplain.disabled = true;
       btnExplain.style.opacity = '0.5';
       btnExplain.innerHTML = '<span>⏳</span> 解读中...';

       const body = this.card.querySelector('.ai-card-body');
       const separator = document.createElement('hr');
       separator.style.margin = '16px 0';
       separator.style.border = 'none';
       separator.style.borderTop = '1px dashed #e2e8f0';
       body.appendChild(separator);

       const explainBox = document.createElement('div');
       explainBox.style.fontSize = '13px';
       explainBox.style.color = '#475569';
       explainBox.style.backgroundColor = '#f8fafc';
       explainBox.style.padding = '12px';
       explainBox.style.borderRadius = '8px';
       explainBox.innerHTML = '<span style="color:#94a3b8;font-style:italic;">正在深度解读...</span>';
       body.appendChild(explainBox);

       body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });

       if (typeof pageManager !== 'undefined') {
          pageManager.addDirectTask(this.selectionText, explainBox, settings.targetLang || 'zh', false, 'explain');
       }
    };

    this.setupCardDrag(this.card);

    this.streamTranslate(this.selectionText, settings.targetLang || 'zh', settings.precisionMode, this.card.querySelector('.ai-card-body'));
  }

  setupCardDrag(card) {
    const header = card.querySelector('.ai-card-header');
    let isDragging = false, startX, startY, startLeft, startTop;

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      card.style.left = `${startLeft + dx}px`;
      card.style.top = `${startTop + dy}px`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      card.style.cursor = 'default';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = card.offsetLeft;
      startTop = card.offsetTop;
      card.style.cursor = 'grabbing';
      e.stopPropagation();
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  streamTranslate(text, targetLang, precisionMode, outputEl) {
    // 1. 初始化 loading 状态，不要直接清空
    outputEl.innerHTML = '<div style="color:#94a3b8;font-style:italic;">Thinking...</div>';

    if (typeof pageManager !== 'undefined') {
       pageManager.addDirectTask(text, outputEl, targetLang, precisionMode);
    }
  }
}

const INVALID_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'IMG', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'HEADER', 'FOOTER'];

function isBlockContainer(el) {
  if (!el || !el.tagName) return false;
  const display = window.getComputedStyle(el).display;
  const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'MAIN', 'TD', 'TH', 'FIGCAP'];
  return blockTags.includes(el.tagName) || display === 'block' || display === 'flex' || display === 'grid' || display === 'table-cell';
}

function getLogicalBlock(node) {
  let curr = node.parentElement;
  while (curr && curr !== document.body) {
    if (INVALID_TAGS.includes(curr.tagName)) return null;
    if (curr.getAttribute(TRANSLATION_MARK_ATTR)) return null;
    if (curr.tagName === 'A') return curr;
    if (isBlockContainer(curr)) return curr;
    curr = curr.parentElement;
  }
  return document.body;
}

function scanTranslatableElements() {
  const rawBlocks = [];
  let currentBlock = null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'AUDIO', 'VIDEO', 'CANVAS'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (parent.getAttribute(TRANSLATION_MARK_ATTR)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-ai-translated="true"]')) return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains('ai-trans-replacement') || parent.classList.contains('ai-trans-minimal')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let currentNode;
  while (currentNode = walker.nextNode()) {
    const container = getLogicalBlock(currentNode);
    if (!container) continue;

    // 线性扫描，连续归组：容器变化时开启新块
    if (currentBlock && currentBlock.container === container) {
       currentBlock.textNodes.push(currentNode);
    } else {
       currentBlock = { container: container, textNodes: [currentNode] };
       rawBlocks.push(currentBlock);
    }
  }

  // --- 过滤与组装 ---
  const validBlocks = [];
  
  rawBlocks.forEach(block => {
    if (block.textNodes.length > 500) return; 
    const fullText = block.textNodes.map(n => n.nodeValue).join('').trim();
    
    // 长度太短的跳过 (小于2个字符通常是无意义的，除非是中文)
    if (fullText.length < 2 && !/[\u4e00-\u9fa5]/.test(fullText)) return;

    // 纯数字/符号/单位
    if (/^[\d\s.,!?@#$%^&*()_{}\[\]\-+=|\\/<>:;"'`~a-zA-Z]{1,8}$/.test(fullText)) {
       if (/^[\d\s\W_a-zA-Z]+$/.test(fullText)) {
         if (/\d/.test(fullText)) return;
       }
    }
    if (/^[\d\s.,!?@#$%^&*()_{}\[\]\-+=|\\/<>:;"'`~]+$/.test(fullText)) return;

    // 排除纯日期格式
    if (/^\d{2,4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日]?(\s\d{1,2}:\d{2})?$/.test(fullText)) return;

    // 排除邮箱和网址
    if (/^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/.test(fullText)) return;
    if (/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(fullText)) return;

    // 排除代码变量名 (驼峰或下划线)
    if (/^[a-z]+[A-Z][a-zA-Z0-9]*$/.test(fullText) && fullText.length < 30) return;
    if (/^[a-z]+_[a-z0-9_]+$/.test(fullText) && fullText.length < 30) return;

    validBlocks.push({ container: block.container, textNodes: block.textNodes, originalText: fullText });
  });

  return validBlocks;
}

class TranslationManager {
  constructor() {
    this.queue = [];
    this.activeCount = 0;
    this.concurrency = 15;
    this.settings = {};
    this.BATCH_DELIMITER = "|||";
  }

  // 添加任务（包含 UI 生成、打包、入队）
  addTasks(blocks, settings, isPriority = false, traceId = null) {
    this.settings = settings;
    // 只有非优先任务才显示加载圈
    if (!isPriority) setBubbleLoading(true); 

    const rawTasks = []; 

    // 1. 生成 DOM 占位符
    blocks.forEach(block => {
      if (block.container.getAttribute(TRANSLATION_MARK_ATTR)) return;

      block.textNodes.forEach(node => {
        if (node.parentNode.classList && node.parentNode.classList.contains('ai-origin-text')) return;
        const span = document.createElement('span');
        span.className = 'ai-origin-text';
        span.setAttribute(ORIGIN_MARK_ATTR, 'true');
        node.parentElement.insertBefore(span, node);
        span.appendChild(node);
      });

      let transUi;
      const tag = block.container.tagName;
      const len = block.originalText.length;
      
      const FORCE_MINIMAL_TAGS = ['BUTTON', 'LABEL', 'A', 'TD', 'TH', 'FIGCAP', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'B', 'STRONG'];
      const FORCE_HIGHLIGHT_TAGS = ['P', 'BLOCKQUOTE', 'PRE', 'ARTICLE'];
      let useMinimalStyle = false;
      if (FORCE_MINIMAL_TAGS.includes(tag)) useMinimalStyle = true;
      else if (FORCE_HIGHLIGHT_TAGS.includes(tag)) useMinimalStyle = false;
      else useMinimalStyle = len < 60; 
      if (tag === 'LI' && len > 100) useMinimalStyle = false;

      if (!settings.bilingualMode) {
        block.container.querySelectorAll(`[${ORIGIN_MARK_ATTR}]`).forEach(el => el.classList.add('hidden'));
        transUi = document.createElement('span'); 
        transUi.className = 'ai-trans-replacement';
        transUi.style.display = useMinimalStyle ? 'inline' : 'block';
      } else {
        if (settings.transStyle === 'highlight' && !useMinimalStyle) {
           transUi = document.createElement('div');
           transUi.className = 'ai-translate-block'; 
        } else {
           transUi = document.createElement('span');
           transUi.className = 'ai-trans-minimal';
           if (['P','DIV','LI','H1','H2','H3','H4','H5','H6'].includes(tag)) {
             transUi.classList.add('ai-trans-minimal-block-display'); 
           }
        }
      }
      transUi.textContent = '...'; 
      transUi.style.color = '#94a3b8';

      const lastNode = block.textNodes[block.textNodes.length - 1];
      if (lastNode && lastNode.parentElement && lastNode.parentElement.tagName === 'SPAN') {
         const wrapperSpan = lastNode.parentElement;
         if (wrapperSpan.nextSibling) {
            wrapperSpan.parentNode.insertBefore(transUi, wrapperSpan.nextSibling);
         } else {
            wrapperSpan.parentNode.appendChild(transUi);
         }
      } else {
         block.container.appendChild(transUi);
      }

      block.container.setAttribute(TRANSLATION_MARK_ATTR, 'true');

      rawTasks.push({
        text: block.originalText,
        ui: transUi,
        targetLang: settings.targetLang,
        mode: settings.precisionMode ? 'precision' : 'fast'
      });
    });

    const BATCH_SIZE_LIMIT = 2000;
    const BATCH_COUNT_LIMIT = 18;
    let currentBatch = [];
    let currentBatchLen = 0;

    rawTasks.forEach(task => {
      if (task.text.length > 600 || task.mode === 'precision') {
        if (isPriority) this.queue.unshift(task);
        else this.queue.push(task); 
        return;
      }

      if (currentBatchLen + task.text.length > BATCH_SIZE_LIMIT || currentBatch.length >= BATCH_COUNT_LIMIT) {
        this.pushBatchTask(currentBatch, isPriority, traceId);
        currentBatch = [];
        currentBatchLen = 0;
      }

      currentBatch.push(task);
      currentBatchLen += task.text.length;
    });

    if (currentBatch.length > 0) {
      this.pushBatchTask(currentBatch, isPriority, traceId);
    }

    this.processQueue();
  }

  pushBatchTask(batchItems, isPriority, traceId) {
    if(!batchItems.length) return;

    const combinedText = batchItems.map(i => i.text).join(" " + this.BATCH_DELIMITER + " ");

    const task = {
      type: 'batch',
      text: combinedText,
      items: batchItems,
      targetLang: batchItems[0].targetLang,
      mode: batchItems[0].mode,
      traceId: traceId,
      retryCount: 0
    };

    if (isPriority) this.queue.unshift(task);
    else this.queue.push(task);

    this.processQueue();
  }

  addDirectTask(text, outputEl, targetLang, precisionMode, modeOverride = null) {
     const task = {
       type: 'card',
       text: text,
       ui: outputEl,
       targetLang: targetLang,
       mode: modeOverride ? modeOverride : (precisionMode ? 'precision' : 'fast'),
       retryCount: 0
     };

     this.queue.unshift(task);
     this.processQueue();
  }

  processQueue() {
    if (this.queue.length === 0 && this.activeCount === 0) {
      setBubbleLoading(false); return;
    }

    if (document.hidden) return;

    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        this.runTask(nextTask);
      }
    }
  }

  runTask(task) {
    if (!task) {
      this.processQueue();
      return;
    }

    if (task.retryCount === undefined) task.retryCount = 0;

    this.activeCount++;
    
    // UI 初始化
    if (task.type === 'batch') {
      task.items.forEach(item => {
        if(item.ui) { item.ui.textContent = ''; item.ui.style.color = ''; }
      });
    } else {
      if(task.ui) { task.ui.textContent = ''; task.ui.style.color = ''; }
    }

    const port = chrome.runtime.connect({ name: "stream-translate" });
    let accumulatedText = ""; 
    let hasError = false; // 标记是否发生错误
    
    port.onDisconnect.addListener(() => {
      if (!task.isRetrying) {
        setTimeout(() => {
           this.activeCount--;
           this.processQueue();
        }, 1000);
      }
    });

    port.postMessage({ action: "TRANSLATE", text: task.text, targetLang: task.targetLang, mode: task.mode, traceId: task.traceId });
    
    port.onMessage.addListener((msg) => {
      if (msg.action === "CHUNK") {
        if (task.type === 'batch') {
          accumulatedText += msg.content;
          const parts = accumulatedText.split(/\s*\|\|\|\s*/);
          for (let i = 0; i < parts.length; i++) {
            if (task.items[i] && task.items[i].ui && parts[i].trim()) {
              task.items[i].ui.textContent = parts[i].trim();
            }
          }
        } else {
          if(task.ui) task.ui.textContent += msg.content;
        }
      }
      else if (msg.action === "DONE" || msg.error) {
         if (msg.error) { 
           hasError = true;

           const isRateLimit = msg.error.includes("429") || msg.error.includes("concurrency") || msg.error.includes("limit") || msg.error.includes("并发");
           if (isRateLimit && task.retryCount < 3) {
              task.retryCount++;
              task.isRetrying = true;
              const backoff = 2000 + Math.random() * 3000;
              setTimeout(() => {
                 this.activeCount--;
                 task.isRetrying = false;
                 this.queue.unshift(task);
                 this.processQueue();
              }, backoff);
              port.disconnect();
              return;
           }
           
           const applyError = (item, original) => {
             if(item.ui) {
               if (task.type === 'card') {
                 item.ui.innerHTML = `<div style="color:#ef4444; padding:8px 0;">
                   <strong>Error:</strong> ${msg.error}
                   <div style="font-size:12px; margin-top:4px; color:#64748b;">请检查 API Key 或模型名称是否正确</div>
                 </div>`;
               } else {
                 item.ui.textContent = original;
                 item.ui.title = "翻译失败: " + msg.error;
                 item.ui.style.borderBottom = "2px solid red";
               }
             }
           };

           if (task.type === 'batch') {
             task.items.forEach(item => applyError(item, item.text));
           } else {
             applyError(task, task.text);
           }
         } else {
           if (task.type === 'batch') {
             task.items.forEach(item => {
               if (item.ui && !item.ui.textContent.trim()) {
                 item.ui.textContent = item.text;
                 item.ui.style.opacity = "0.7"; 
               }
             });
           } else {
             if (task.ui && !task.ui.textContent.trim()) {
               task.ui.textContent = task.text;
             }
           }
         }
         
         port.disconnect();
      }
    });
  }
}

const pageManager = new TranslationManager();

async function togglePageTranslation() {
  if (isTranslating) disablePageTranslation();
  else enablePageTranslation();
}

async function enablePageTranslation() {
  isTranslating = true;
  updateBubbleState(true);

  const traceId = crypto.randomUUID();

  const settings = await chrome.storage.local.get(['targetLang', 'bilingualMode', 'transStyle', 'precisionMode']);
  const lang = settings.targetLang || 'zh';

  let blocks = scanTranslatableElements();
  if (blocks.length === 0) return;

  const vh = window.innerHeight;
  blocks.sort((a, b) => {
    const rectA = a.container.getBoundingClientRect();
    const rectB = b.container.getBoundingClientRect();
    const visibleA = rectA.top < vh && rectA.bottom > 0;
    const visibleB = rectB.top < vh && rectB.bottom > 0;
    if (visibleA && !visibleB) return -1;
    if (!visibleA && visibleB) return 1;
    return rectA.top - rectB.top;
  });

  pageManager.addTasks(blocks, {
    targetLang: lang,
    bilingualMode: settings.bilingualMode !== false,
    transStyle: settings.transStyle || 'minimal',
    precisionMode: settings.precisionMode === true
  });
}

function disablePageTranslation() {
  isTranslating = false;
  setBubbleLoading(false);
  updateBubbleState(false);

  pageManager.queue = [];
  pageManager.activeCount = 0;

  document.querySelectorAll('.ai-translate-block, .ai-trans-minimal, .ai-trans-minimal-block, .ai-trans-replacement').forEach(el => el.remove());

  document.querySelectorAll(`[${ORIGIN_MARK_ATTR}]`).forEach(el => {
    el.classList.remove('hidden');
  });

  document.querySelectorAll(`[${TRANSLATION_MARK_ATTR}]`).forEach(el => el.removeAttribute(TRANSLATION_MARK_ATTR));
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "START_TRANSLATION") {
    togglePageTranslation();
  }
  
  if (request.action === "UPDATE_SETTINGS") {
    const { showBubble } = request.payload;
    if (showBubble) createBubble(); else removeBubble();
  }
  
  if (request.action === "GET_STATE") {
    sendResponse({ isTranslating: isTranslating });
  }

  if (request.action === "CHECK_AUTO_TRANSLATE") {
    checkAutoTranslate();
  }
});

init();