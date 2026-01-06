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
  
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      console.log("AI翻译: 检测到页面跳转 (SPA)");
      lastUrl = window.location.href;
      handleUrlChange();
    }
  }, 1000);
}

function handleUrlChange() {
  isTranslating = false;
  updateBubbleState(false); 
  setTimeout(() => {
    checkAutoTranslate();
  }, 1500); 
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
   模块 3: 划词翻译 (Selection) - 强制可见修复版
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
    // 延迟执行，确保选区状态稳定
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      // 1. 基础校验：无文本或点击的是插件自身
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

    // 点击空白处，移除按钮和卡片
    if (!target.closest('.ai-selection-btn') && !target.closest('.ai-card')) {
      this.hideButton();
      if (this.card) {
        this.card.remove();
        this.card = null;
      }
    }
  }

  showButton(selection) {
    this.hideButton(); // 清除旧按钮

    let rect;
    try {
      const range = selection.getRangeAt(0);
      rect = range.getBoundingClientRect();
    } catch (err) { return; }

    // 创建按钮
    this.btn = document.createElement('div');
    this.btn.className = 'ai-selection-btn';
    this.btn.innerHTML = '🌐'; 
    
    // --- 核心修复：JS 强制注入样式，确保 100% 可见 ---
    Object.assign(this.btn.style, {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      backgroundColor: '#1e293b', // 深色背景
      color: '#ffffff',           // 白色图标
      borderRadius: '6px',
      zIndex: '2147483647',       // 极高层级
      cursor: 'pointer',
      fontSize: '18px',
      boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
      userSelect: 'none'
    });

    // 计算位置
    const top = rect.bottom + window.scrollY + 8;
    const left = rect.right + window.scrollX + 8;
    
    this.btn.style.top = `${top}px`;
    this.btn.style.left = `${left}px`;

    // 绑定点击事件 (使用 onmousedown 防止焦点丢失)
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

    // 获取当前设置，决定卡片标题显示什么
    const settings = await chrome.storage.local.get(['targetLang', 'precisionMode', 'provider']);
    const provider = settings.provider || 'moonshot'; // 默认 Kimi
    
    // ★★★ 动态标题：拉齐显示 ★★★
    let cardTitle = "🌙 Kimi (Moonshot)";
    if (provider === 'deepseek') cardTitle = "✨ DeepSeek";
    else if (provider === 'openai') cardTitle = "🤖 OpenAI";
    else if (provider === 'qwen') cardTitle = "🟣 Qwen";
    
    // 强制注入卡片样式 (Notion 风格)
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
        <span style="font-weight:600;color:#475569;font-size:13px;display:flex;align-items:center;gap:6px;">✨ DeepSeek</span>
        <span class="ai-card-close" style="cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;">×</span>
      </div>
      <div class="ai-card-body" style="padding:16px;font-size:14px;color:#334155;line-height:1.6;max-height:300px;overflow-y:auto;">
        <div style="color:#94a3b8;font-style:italic;">Thinking...</div>
      </div>
    `;

    // 智能定位
    let top = selectionRect.bottom + window.scrollY + 12;
    let left = selectionRect.left + window.scrollX;
    
    // 防止溢出右边界
    if (left + 320 > document.body.clientWidth) left = document.body.clientWidth - 340;
    if (left < 10) left = 10;

    this.card.style.top = `${top}px`;
    this.card.style.left = `${left}px`;
    
    document.body.appendChild(this.card);

    // 绑定关闭按钮事件
    this.card.querySelector('.ai-card-close').onclick = () => this.card.remove();// 点击关闭按钮时移除卡片
    this.setupCardDrag(this.card);

    // 开始翻译 //
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
      if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.offsetParent === null) return NodeFilter.FILTER_REJECT;
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
    if (fullText.length < 3) return;
    if (/^[\d\s.,!?@#$%^&*()_{}\[\]]+$/.test(fullText)) return;
    blocks.push({ container: container, textNodes: textNodes, originalText: fullText });
  });

  return blocks;
}

class TranslationManager {
  constructor() {
    this.queue = [];
    this.activeCount = 0;
    this.concurrency = 2;
    this.settings = {}; 
  }
  addTasks(blocks, settings) {
    this.settings = settings;
    setBubbleLoading(true);
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
        // [双语模式]
        if (settings.transStyle === 'highlight' && !useMinimalStyle) {
           // 情况A: 蓝条色块
           transUi = document.createElement('div');
           transUi.className = 'ai-translate-block'; 
        } else {
           // 情况B: 极简宋体
           transUi = document.createElement('span');
           transUi.className = 'ai-trans-minimal'; // 默认应用 CSS 中定义的样式 (含8px左间距)
           
           // 如果是块级元素（如段落、标题），强制换行显示在下方
           if (['P','DIV','LI','H1','H2','H3','H4','H5','H6'].includes(tag)) {
             transUi.classList.add('ai-trans-minimal-block-display'); // 添加这个类来去除左间距并换行
           }
        }
      }
      transUi.textContent = '...'; 
      transUi.style.color = '#94a3b8';
      block.container.appendChild(transUi);
      block.container.setAttribute(TRANSLATION_MARK_ATTR, 'true');
      this.queue.push({ 
        text: block.originalText, 
        ui: transUi, 
        targetLang: settings.targetLang,
        mode: settings.precisionMode ? 'precision' : 'fast'
      });
    });
    this.processQueue();
  }
  processQueue() {
    if (this.queue.length === 0 && this.activeCount === 0) {
      setBubbleLoading(false); return;
    }
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      this.runTask(this.queue.shift());
    }
  }
  runTask(task) {
    this.activeCount++;
    task.ui.textContent = ''; 
    task.ui.style.color = ''; 

    const port = chrome.runtime.connect({ name: "stream-translate" });
    
    // 监听断开连接（处理意外断开）
    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        console.warn("Port disconnected:", chrome.runtime.lastError.message);
      }// 处理断开连接后的逻辑
      // 遇到断开，也要延迟重试，防止死循环
      setTimeout(() => {
        this.activeCount--;
        this.processQueue();
      }, 2000); 
    });

    port.postMessage({ action: "TRANSLATE", text: task.text, targetLang: task.targetLang, mode: task.mode });
    
    port.onMessage.addListener((msg) => {
      if (msg.action === "CHUNK") {
        task.ui.textContent += msg.content;
      }
      else if (msg.action === "DONE" || msg.error) {
         if (msg.error) { 
           task.ui.textContent = "[Error]"; 
           task.ui.style.color = 'red'; 
           console.error("Task Error:", msg.error);
         }
         
         port.disconnect(); // 主动断开

         // ★★★ 核心修改：如果是报错了，延迟 2 秒再继续下一个 ★★★
         // 这样可以避免一瞬间发出几百个请求导致浏览器封锁
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

// --- 主控流程 ---
async function togglePageTranslation() {
  if (isTranslating) {
    // [还原]
    document.querySelectorAll('.ai-translate-block, .ai-trans-minimal, .ai-trans-minimal-block, .ai-trans-replacement').forEach(el => el.remove());
    document.querySelectorAll(`[${ORIGIN_MARK_ATTR}]`).forEach(el => {
      el.classList.remove('hidden');
      if (el.childNodes.length > 0) {
          const frag = document.createDocumentFragment();
          while(el.firstChild) frag.appendChild(el.firstChild);
          el.parentNode.replaceChild(frag, el);
      } else { el.remove(); }
    });
    document.querySelectorAll(`[${TRANSLATION_MARK_ATTR}]`).forEach(el => el.removeAttribute(TRANSLATION_MARK_ATTR));
    
    isTranslating = false;
    setBubbleLoading(false);
    updateBubbleState(false); 
  } else {
    // [开启翻译]
    const settings = await chrome.storage.local.get(['targetLang', 'bilingualMode', 'transStyle', 'precisionMode']);
    const lang = settings.targetLang || 'zh';
    const blocks = scanTranslatableElements();
    
    if (blocks.length === 0) { 
      console.log("未找到可翻译内容"); 
      return; 
    }
    
    pageManager.addTasks(blocks, {
      targetLang: lang,
      bilingualMode: settings.bilingualMode !== false,
      transStyle: settings.transStyle || 'minimal',
      precisionMode: settings.precisionMode === true
    });
    
    isTranslating = true;
    updateBubbleState(true); 
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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