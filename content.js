/* ==============================================
   模块 1: 全局变量与初始化
   ============================================== */
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
  
  // --- 划词功能重新实例化 ---
  new SelectionManager(); 
  
  // --- 启动动态内容监听 ---
  setupMutationObserver();

  // --- 监听 SPA 跳转 ---
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      console.log("AI翻译: 检测到页面跳转 (SPA)");
      lastUrl = window.location.href;
      handleUrlChange();
    }
  }, 1000);

  // --- 页面唤醒监听 (防后台偷跑优化) ---
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isTranslating && pageManager) {
      console.log("页面唤醒，继续处理翻译队列...");
      pageManager.processQueue();
    }
  });
}

// --- [修改] SPA 跳转处理 ---
function handleUrlChange() {
  console.log("正在处理 SPA 跳转清理...");
  
  // 1. 强制关闭并清理当前页面的翻译垃圾
  // 注意：这里不要直接设 isTranslating = false，而是调用清理函数
  if (isTranslating) {
    disablePageTranslation(); 
  }
  
  // 2. 重新初始化检测
  // Medium 跳转后内容加载较慢，建议多检测几次或延长时间
  setTimeout(() => {
    checkAutoTranslate();
  }, 1000);
  
  // 双重保险：有的 SPA 渲染很慢，3秒后再查一次
  setTimeout(() => {
    checkAutoTranslate();
  }, 3000);
}

function checkAutoTranslate() {
  chrome.storage.local.get(['autoSites'], (result) => {
    const currentHost = window.location.hostname;
    const autoSites = result.autoSites || [];
    
    if (autoSites.includes(currentHost)) {
      console.log("AI翻译: 触发自动翻译 ->", currentHost);
      if (!isTranslating) {
         togglePageTranslation();
      }
    }
  });
}

// --- [修改] 动态监听 ---
function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    if (document.hidden) return;
    if (!isTranslating) return; // 没开启翻译就不管

    let hasMeaningfulChange = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) { 
             // ... (这里保留你原来的排除逻辑: SCRIPT, STYLE, 插件自身的类名等) ...
             if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'HR'].includes(node.tagName)) continue;
             if (node.classList && (
               node.classList.contains('ai-translator-bubble') ||
               node.classList.contains('ai-trans-minimal') ||
               node.getAttribute(TRANSLATION_MARK_ATTR) 
               // ... 其他排除项保持不变
             )) continue;
             
             hasMeaningfulChange = true;
             break; 
          }
        }
      }
      if (hasMeaningfulChange) break;
    }

    if (!hasMeaningfulChange) return;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
       if (!document.hidden && isTranslating) {
         console.log("页面变动稳定，触发增量翻译...");
         // ★★★ 关键修改：绝对不要调用 toggle，要调用 enable ★★★
         enablePageTranslation(); 
       }
    }, 2000); // Medium 这种网站建议稍微长一点，2秒比较稳
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
}

/* ==============================================
   模块 2: 悬浮球 (UI更新：支持 Active 状态)
   ============================================== */
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

/* ==============================================
   模块 3: 划词翻译 (Selection)
   ============================================== */
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

    const settings = await chrome.storage.local.get(['targetLang', 'precisionMode', 'provider']);
    const provider = settings.provider || 'builtin_glm'; 
    
    const titleMap = {
        'deepseek': "✨ DeepSeek",
        'openai': "🤖 OpenAI",
        'qwen': "🟣 Qwen",
        'siliconflow': "🚀 SiliconFlow",
        'zhipu': "🎓 GLM-4",
        'groq': "⚡️ Llama 3 (Groq)",
        'openrouter': "🌐 OpenRouter",
        'ollama': "🏠 Local Ollama",
        // 新增内置线路映射
        'builtin_deepseek': "🚀 DeepSeek (Built-in)",
        'builtin_glm': "⚡️ GLM-4 (Built-in)",
        'builtin_kimi': "🌙 Kimi (Built-in)",
        'custom': "⚙️ Custom Model"
    };
    let cardTitle = titleMap[provider] || "AI Translator";

    if (titleMap[provider]) {
        cardTitle = titleMap[provider];
    }
    
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
        <span class="ai-card-close" style="cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;">×</span>
      </div>
      <div class="ai-card-body" style="padding:16px;font-size:14px;color:#334155;line-height:1.6;max-height:300px;overflow-y:auto;">
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
    this.setupCardDrag(this.card);

    this.streamTranslate(this.selectionText, settings.targetLang || 'zh', settings.precisionMode, this.card.querySelector('.ai-card-body'));
  }

  setupCardDrag(card) {
    const header = card.querySelector('.ai-card-header');
    let isDragging = false, startX, startY, startLeft, startTop;

    header.onmousedown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = card.offsetLeft;
      startTop = card.offsetTop;
      card.style.cursor = 'grabbing';
      e.stopPropagation();
    };

    document.onmousemove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      card.style.left = `${startLeft + dx}px`;
      card.style.top = `${startTop + dy}px`;
    };

    document.onmouseup = () => {
      isDragging = false;
      card.style.cursor = 'default';
    };
  }

  streamTranslate(text, targetLang, precisionMode, outputEl) {
    outputEl.textContent = '';
    const port = chrome.runtime.connect({ name: "stream-translate" });
    port.postMessage({ action: "TRANSLATE", text: text, targetLang: targetLang, mode: precisionMode ? 'precision' : 'fast' });
    port.onMessage.addListener((msg) => {
      if (msg.action === "CHUNK") outputEl.textContent += msg.content;
      if (msg.action === "DONE" || msg.error) {
        if (msg.error) outputEl.textContent = "Error: " + msg.error;
        port.disconnect();
      }
    });
  }
}

/* ==============================================
   模块 4: 页面扫描与块级聚合 (Core Logic)
   ============================================== */
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
    if (isBlockContainer(curr)) return curr;
    curr = curr.parentElement;
  }
  return document.body;
}

function scanTranslatableElements() {
  const blockMap = new Map(); 
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // 1. 基础过滤：排除空文本
      if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      // 2. 排除不可见元素
      if (node.parentElement.offsetParent === null) return NodeFilter.FILTER_REJECT;
      
      const parent = node.parentElement;
      const tag = parent.tagName;
      // 3. 排除代码块、脚本样式等
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'AUDIO', 'VIDEO', 'CANVAS'].includes(tag)) return NodeFilter.FILTER_REJECT;

      // 4. 新增：如果父元素已经有翻译标记，或者已经是翻译相关的类，坚决跳过
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
    if (!blockMap.has(container)) blockMap.set(container, []);
    blockMap.get(container).push(currentNode);
  }

  const blocks = [];
  blockMap.forEach((textNodes, container) => {
    if (textNodes.length > 500) return; 
    const fullText = textNodes.map(n => n.nodeValue).join('').trim();
    
    // --- 【加强版过滤逻辑】 ---

    // 1. 长度太短的跳过 (小于2个字符通常是无意义的，除非是中文)
    if (fullText.length < 2 && !/[\u4e00-\u9fa5]/.test(fullText)) return;
    
    // 2. 纯数字/符号/单位 (保留原有逻辑)
    if (/^[\d\s.,!?@#$%^&*()_{}\[\]\-+=|\\/<>:;"'`~a-zA-Z]{1,8}$/.test(fullText)) {
       if (/^[\d\s\W_a-zA-Z]+$/.test(fullText)) {
         if (/\d/.test(fullText)) return;
       }
    }
    if (/^[\d\s.,!?@#$%^&*()_{}\[\]\-+=|\\/<>:;"'`~]+$/.test(fullText)) return;

    // 3. 【新增】排除纯日期格式 (如 2023-10-01, 10/01/2023, 2023年10月)
    if (/^\d{2,4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日]?(\s\d{1,2}:\d{2})?$/.test(fullText)) return;
    
    // 4. 【新增】排除邮箱和网址
    if (/^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/.test(fullText)) return; // 邮箱
    if (/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(fullText)) return; // 网址

    // 5. 【新增】排除看起来像代码变量名的 (驼峰或下划线，且没有空格)
    // 例如: userProfile, get_data_from_server (通常不需要翻译)
    if (/^[a-z]+[A-Z][a-zA-Z0-9]*$/.test(fullText) && fullText.length < 30) return;
    if (/^[a-z]+_[a-z0-9_]+$/.test(fullText) && fullText.length < 30) return;

    blocks.push({ container: container, textNodes: textNodes, originalText: fullText });
  });

  return blocks;
}

class TranslationManager {
  constructor() {
    this.queue = [];
    this.activeCount = 0;
    this.concurrency = 6; // 高并发
    this.settings = {}; 
    this.BATCH_DELIMITER = "|||"; // 强壮的分隔符
  }

  // 添加任务（包含 UI 生成、打包、入队）
  addTasks(blocks, settings, isPriority = false) {
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
      block.container.appendChild(transUi);
      block.container.setAttribute(TRANSLATION_MARK_ATTR, 'true');

      rawTasks.push({ 
        text: block.originalText, 
        ui: transUi, 
        targetLang: settings.targetLang,
        mode: settings.precisionMode ? 'precision' : 'fast'
      });
    });

    // 2. 打包逻辑 (Batching)
    const BATCH_SIZE_LIMIT = 2000;
    const BATCH_COUNT_LIMIT = 18;  // 数量限制
    let currentBatch = [];
    let currentBatchLen = 0;

    rawTasks.forEach(task => {
      if (task.text.length > 600 || task.mode === 'precision') {
        if (isPriority) this.queue.unshift(task);
        else this.queue.push(task); 
        return;
      }

      if (currentBatchLen + task.text.length > BATCH_SIZE_LIMIT || currentBatch.length >= BATCH_COUNT_LIMIT) {
        this.pushBatchTask(currentBatch, isPriority);
        currentBatch = [];
        currentBatchLen = 0;
      }

      currentBatch.push(task);
      currentBatchLen += task.text.length;
    });

    if (currentBatch.length > 0) {
      this.pushBatchTask(currentBatch, isPriority);
    }

    this.processQueue();
  }

  // 辅助：打包入队
  pushBatchTask(batchItems, isPriority) {
    if (!batchItems || batchItems.length === 0) return;
    
    let taskItem;
    if (batchItems.length === 1) {
      taskItem = batchItems[0];
    } else {
      const combinedText = batchItems.map(item => item.text).join(' ||| ');
      taskItem = {
        type: 'batch', 
        items: batchItems, 
        text: combinedText,
        targetLang: batchItems[0].targetLang,
        mode: 'fast' 
      };
    }

    if (isPriority) {
      this.queue.unshift(taskItem);
    } else {
      this.queue.push(taskItem);
    }
  }

  processQueue() {
    if (this.queue.length === 0 && this.activeCount === 0) {
      setBubbleLoading(false); return;
    }

    // 防御：如果页面在后台，暂停队列处理
    if (document.hidden) {
      console.log("页面在后台，暂停队列处理");
      return; 
    }

    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        this.runTask(nextTask);
      }
    }
  }

  runTask(task) {
    if (!task) {
      console.warn("Skipped empty task");
      this.processQueue();
      return;
    }

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
    
    port.onDisconnect.addListener(() => {
      setTimeout(() => {
        this.activeCount--;
        this.processQueue();
      }, 1000); 
    });

    port.postMessage({ action: "TRANSLATE", text: task.text, targetLang: task.targetLang, mode: task.mode });
    
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
         // --- 兜底回退机制 ---
         if (msg.error) { 
           console.error("API Error:", msg.error);
           const applyError = (item, original) => {
             if(item.ui) {
               item.ui.textContent = original; // 回填原文
               item.ui.title = "翻译失败: " + msg.error;
               item.ui.style.borderBottom = "2px solid red";
             }
           };

           if (task.type === 'batch') {
             task.items.forEach(item => applyError(item, item.text));
           } else {
             applyError(task, task.text);
           }
         } else {
           // 检查是否有漏翻（白板），强制回填
           if (task.type === 'batch') {
             task.items.forEach(item => {
               if (item.ui && !item.ui.textContent.trim()) {
                 console.warn("AI漏翻，回滚原文:", item.text);
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
         const delay = msg.error ? 2000 : 0;
         setTimeout(() => {
           this.activeCount--;
           this.processQueue();
         }, delay);
      }
    });
  }
}

const pageManager = new TranslationManager();

// --- [修改] 主控流程：拆分为 开启/关闭/切换 ---

// 1. 切换入口 (给按钮点击用)
async function togglePageTranslation() {
  if (isTranslating) {
    disablePageTranslation();
  } else {
    enablePageTranslation();
  }
}

// 2. 开启翻译 (或增量扫描) - 幂等操作，多次调用不会副作用
async function enablePageTranslation() {
  // 设置状态
  isTranslating = true; 
  updateBubbleState(true);
  
  // 获取设置
  const settings = await chrome.storage.local.get(['targetLang', 'bilingualMode', 'transStyle', 'precisionMode']);
  const lang = settings.targetLang || 'zh';
  
  // 1. 扫描所有文本块
  let blocks = scanTranslatableElements();
  
  if (blocks.length === 0) { 
    // console.log("当前未发现新增的可翻译内容"); 
    return; 
  }

  console.log(`[AI翻译] 发现 ${blocks.length} 个新文本块，加入队列...`);

  // --- 可视区域优先 (Viewport Priority) ---
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

// 3. 关闭翻译 (还原页面)
function disablePageTranslation() {
  isTranslating = false;
  setBubbleLoading(false);
  updateBubbleState(false);
  
  // 清空队列
  pageManager.queue = [];
  pageManager.activeCount = 0;

  // 移除所有翻译元素
  document.querySelectorAll('.ai-translate-block, .ai-trans-minimal, .ai-trans-minimal-block, .ai-trans-replacement').forEach(el => el.remove());
  
  // 恢复原文显示
  document.querySelectorAll(`[${ORIGIN_MARK_ATTR}]`).forEach(el => {
    el.classList.remove('hidden');
    // 如果之前为了结构把 textNode 包裹进了 span，这里可以不拆包，只显示即可，
    // 或者你可以选择彻底还原 DOM 结构 (可选，为了性能通常只移除 hidden 类)
    if (el.tagName === 'SPAN' && el.getAttribute(ORIGIN_MARK_ATTR)) {
        // 可选：彻底还原
        // const parent = el.parentNode;
        // while(el.firstChild) parent.insertBefore(el.firstChild, el);
        // parent.removeChild(el);
    }
  });

  // 移除标记
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