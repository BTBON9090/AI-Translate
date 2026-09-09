// --- START OF FILE content.js ---
const TRANSLATION_MARK_ATTR = 'data-ai-translated';
const ORIGIN_MARK_ATTR = 'data-ai-origin';
const ICONS = {
  translate: `<svg aria-hidden="true" viewBox="0 0 256 256"><path fill="currentColor" d="m247.15 212.42-56-112a8 8 0 0 0-14.31 0l-21.71 43.43A88 88 0 0 1 108 126.93 103.65 103.65 0 0 0 135.69 64H160a8 8 0 0 0 0-16h-56V32a8 8 0 0 0-16 0v16H32a8 8 0 0 0 0 16h87.63A87.76 87.76 0 0 1 96 116.35a87.7 87.7 0 0 1-19-31 8 8 0 1 0-15.08 5.34A103.6 103.6 0 0 0 84 127a87.55 87.55 0 0 1-52 17 8 8 0 0 0 0 16 103.46 103.46 0 0 0 64-22.08 104.2 104.2 0 0 0 51.44 21.31l-26.6 53.19a8 8 0 0 0 14.31 7.16L148.94 192h70.11l13.79 27.58A8 8 0 0 0 240 224a8 8 0 0 0 7.15-11.58M156.94 176 184 121.89 211.05 176Z"/></svg>`,
  close: `<svg aria-hidden="true" viewBox="0 0 256 256"><path fill="currentColor" d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"/></svg>`,
  copy: `<svg aria-hidden="true" viewBox="0 0 256 256"><path fill="currentColor" d="M216 32H88a8 8 0 0 0-8 8v40H40a8 8 0 0 0-8 8v128a8 8 0 0 0 8 8h128a8 8 0 0 0 8-8v-40h40a8 8 0 0 0 8-8V40a8 8 0 0 0-8-8m-56 176H48V96h112Zm48-48h-32V88a8 8 0 0 0-8-8H96V48h112Z"/></svg>`,
  lightbulb: `<svg aria-hidden="true" viewBox="0 0 256 256"><path fill="currentColor" d="M176 232a8 8 0 0 1-8 8H88a8 8 0 0 1 0-16h80a8 8 0 0 1 8 8m40-128a87.55 87.55 0 0 1-33.64 69.21A16.24 16.24 0 0 0 176 186v6a16 16 0 0 1-16 16H96a16 16 0 0 1-16-16v-6a16 16 0 0 0-6.23-12.66A87.59 87.59 0 0 1 40 104.49C39.74 56.83 78.26 17.14 125.88 16A88 88 0 0 1 216 104m-16 0a72 72 0 0 0-73.74-72c-39 .92-70.47 33.39-70.26 72.39a71.65 71.65 0 0 0 27.64 56.3A32 32 0 0 1 96 186v6h64v-6a32.15 32.15 0 0 1 12.47-25.35A71.65 71.65 0 0 0 200 104"/></svg>`
};
const ICON_SVG = `<span class="ai-icon-svg">${ICONS.translate}</span>`;

let isTranslating = false; 
let lastUrl = window.location.href; // 记录当前 URL，用于检测 SPA 跳转
let translationSource = null;
let translationUrl = null;
let translationSessionId = 0;
let navigationEpoch = 0;
let autoCheckTimers = [];
let autoTranslatePausedUrl = null;
let autoCheckEpoch = 0;
let progressiveScrollTimer = null;
let progressiveScrollHandler = null;
const PROGRESSIVE_SCAN_DELAY_MS = 120;
const PROGRESSIVE_PRELOAD_SCREENS = 1;
const EXTENSION_RECOVERY_KEY = '__ai_translator_resume_after_extension_reload__';
let extensionRecoveryStarted = false;
let uiLang = 'zh';
let selectionManager = null;
const tr = (zh, en) => uiLang === 'en' ? en : zh;
let scanRunning = false;
let scanAgain = false;
const blockRecords = new WeakMap();

function hasLiveExtensionContext() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function isExtensionContextError(error) {
  return /extension context invalidated|context invalidated/i.test(String(error?.message || error || ''));
}

function recoverInvalidatedExtensionContext(error = null) {
  if (hasLiveExtensionContext() && !isExtensionContextError(error)) return false;
  if (extensionRecoveryStarted) return true;
  extensionRecoveryStarted = true;
  if (isTranslating) disablePageTranslation();
  removeBubble();
  console.info('AI Translate updated. Reload this page to use the new extension.');
  return true;
}

async function getLocalSettings(keys) {
  if (recoverInvalidatedExtensionContext()) return null;
  try {
    return await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });
  } catch (error) {
    if (!recoverInvalidatedExtensionContext(error)) {
      console.warn('读取插件设置失败', error);
    }
    return null;
  }
}

function consumeExtensionRecoveryRequest() {
  try {
    const shouldResume = sessionStorage.getItem(EXTENSION_RECOVERY_KEY) === 'translate';
    sessionStorage.removeItem(EXTENSION_RECOVERY_KEY);
    return shouldResume;
  } catch {
    return false;
  }
}

function init() {
  const shouldResumeTranslation = consumeExtensionRecoveryRequest();
  try {
    getLocalSettings().then((result) => {
      if (!result) return;
      uiLang = result.uiLang || 'zh';
      if (result.showBubble !== false) createBubble();
      if (shouldResumeTranslation) enablePageTranslation('manual');
      else checkAutoTranslate();
    });
  } catch {
    recoverInvalidatedExtensionContext();
    return;
  }
  
  selectionManager = new ModernSelectionManager();

  setupMutationObserver();

  const notifyNavigation = () => {
    if (window.location.href === lastUrl) return;
    lastUrl = window.location.href;
    handleUrlChange();
  };
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      queueMicrotask(notifyNavigation);
      return result;
    };
  }
  window.addEventListener('popstate', notifyNavigation, { passive: true });
  window.addEventListener('hashchange', notifyNavigation, { passive: true });
  window.addEventListener('pageshow', notifyNavigation, { passive: true });
  if (globalThis.navigation?.addEventListener) {
    globalThis.navigation.addEventListener('navigatesuccess', notifyNavigation);
  }

  // 页面唤醒时继续处理队列
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isTranslating && pageManager) {
      if (window.location.href !== translationUrl) {
        notifyNavigation();
        return;
      }
      pageManager.processQueue();
      scheduleProgressiveScan();
    }
  });
}

function handleUrlChange() {
  navigationEpoch += 1;
  autoTranslatePausedUrl = null;
  autoCheckEpoch += 1;
  autoCheckTimers.forEach(timer => clearTimeout(timer));
  autoCheckTimers = [];
  if (isTranslating) disablePageTranslation();
  scheduleAutoTranslateCheck(350);
  scheduleAutoTranslateCheck(1500);
}

function scheduleAutoTranslateCheck(delay) {
  const expectedUrl = window.location.href;
  const expectedEpoch = navigationEpoch;
  const timer = setTimeout(() => {
    autoCheckTimers = autoCheckTimers.filter(item => item !== timer);
    checkAutoTranslate(expectedUrl, expectedEpoch);
  }, delay);
  autoCheckTimers.push(timer);
}

function checkAutoTranslate(expectedUrl = window.location.href, expectedEpoch = navigationEpoch) {
  if (!hasLiveExtensionContext() || autoTranslatePausedUrl === expectedUrl) return;
  const expectedAutoEpoch = autoCheckEpoch;
  try {
    getLocalSettings().then((result) => {
      if (!result || expectedAutoEpoch !== autoCheckEpoch || autoTranslatePausedUrl === expectedUrl) return;
      if (expectedEpoch !== navigationEpoch || expectedUrl !== window.location.href) return;
      const currentHost = window.location.hostname;
      const autoSites = result.autoSites || [];
      if (autoSites.includes(currentHost) && !isTranslating) {
        enablePageTranslation('auto');
      }
    });
  } catch {
    // 扩展更新后旧页面会短暂保留失效的内容脚本，等待用户操作时自动恢复。
  }
}

// 防抖定时器（闭包私有，避免 this 指向问题）
let mutationDebounceTimer = null;
const pendingMutationRoots = new Set();

function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    if (!isTranslating) return;
    if (window.location.href !== translationUrl) {
      lastUrl = window.location.href;
      handleUrlChange();
      return;
    }

    const queueMutationRoot = (node) => {
      const root = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!(root instanceof Element) || !root.isConnected) return false;
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'HR'].includes(root.tagName)) return false;
      if (root.closest(`
        .ai-translator-bubble,
        .ai-trans-minimal,
        .ai-trans-minimal-block-display,
        .ai-translate-block,
        .ai-trans-replacement,
        .ai-card,
        .ai-selection-btn
      `)) return false;
      const marked = root.closest('[data-ai-translated]');
      const record = marked && blockRecords.get(marked);
      if (record) {
        const currentText = record.nodes.filter(n => n.isConnected).map(n => n.nodeValue).join('').trim();
        if (currentText !== record.source || !record.ui.isConnected || (node.nodeType === Node.TEXT_NODE && !record.nodes.includes(node)) || (root !== marked && !record.nodes.some(n => root.contains(n)))) {
          record.ui.remove(); marked.removeAttribute(TRANSLATION_MARK_ATTR);
          marked.querySelectorAll('.ai-origin-text').forEach(el => { el.classList.remove('hidden'); el.replaceWith(...el.childNodes); });
        } else return false;
      }
      if (pendingMutationRoots.size < 100) pendingMutationRoots.add(root);
      return true;
    };

    let hasMeaningfulChange = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (queueMutationRoot(node)) hasMeaningfulChange = true;
        }
      } else if (mutation.type === 'childList' && mutation.removedNodes.length && queueMutationRoot(mutation.target)) {
        hasMeaningfulChange = true;
      } else if (mutation.type === 'characterData' && queueMutationRoot(mutation.target)) {
        hasMeaningfulChange = true;
      } else if (mutation.type === 'attributes' && queueMutationRoot(mutation.target)) {
        hasMeaningfulChange = true;
      }
    }

    if (!hasMeaningfulChange) return;

    if (mutationDebounceTimer) return;
    mutationDebounceTimer = setTimeout(() => {
       mutationDebounceTimer = null;
       if (isTranslating) {
         const roots = [...pendingMutationRoots];
         pendingMutationRoots.clear();
         if (roots.some(root => root.isConnected)) {
           scheduleProgressiveScan(translationSessionId, 60);
         }
       }
    }, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: true
  });
}

function createBubble() {
  if (document.querySelector('.ai-translator-bubble')) return;
  const bubble = document.createElement('div');
  bubble.className = 'ai-translator-bubble';
  if (isTranslating) bubble.classList.add('active'); 
  bubble.innerHTML = ICON_SVG;
  bubble.setAttribute('role', 'button');
  bubble.setAttribute('tabindex', '0');
  bubble.setAttribute('aria-label', tr('翻译当前页面', 'Translate page'));
  // 同时写入关键几何属性，避免网页的高权重样式把圆形气泡覆盖成圆角方形。
  bubble.style.setProperty('width', '42px', 'important');
  bubble.style.setProperty('height', '42px', 'important');
  bubble.style.setProperty('min-width', '42px', 'important');
  bubble.style.setProperty('min-height', '42px', 'important');
  bubble.style.setProperty('max-width', '42px', 'important');
  bubble.style.setProperty('max-height', '42px', 'important');
  bubble.style.setProperty('border-radius', '9999px', 'important');
  document.body.appendChild(bubble);
  requestAnimationFrame(() => bubble.classList.add('visible'));
  setupDrag(bubble);
  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!e.isTrusted || e.button !== 0 || bubble.dataset.isDragging === 'true') return;
    void togglePageTranslation();
  });
  bubble.addEventListener('keydown', (e) => {
    if (e.isTrusted && (e.key === 'Enter' || e.key === ' ') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      void togglePageTranslation();
    }
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
  if (bubble) { bubble.cleanupDrag?.(); bubble.remove(); }
}

function setBubbleLoading(isLoading) {
  const bubble = document.querySelector('.ai-translator-bubble');
  if (bubble) {
    if (isLoading) bubble.classList.add('translating');
    else bubble.classList.remove('translating');
  }
}

function setupDrag(el) {
  let start = null;
  let side = 'right';
  let y = .7;
  const set = (key, value) => el.style.setProperty(key, value, 'important');
  function dock() {
    const maxY = Math.max(8, window.innerHeight - 50);
    set('right', 'auto'); set('bottom', 'auto');
    set('left', side === 'left' ? '0px' : `${Math.max(0, window.innerWidth - 42)}px`);
    set('top', `${Math.min(maxY, Math.max(8, y * maxY))}px`);
    el.dataset.edge = side;
    el.classList.remove('is-dragging');
  }
  getLocalSettings().then(settings => { if (!el.isConnected || start) return; side = settings?.bubblePosition?.side || side; y = settings?.bubblePosition?.y ?? y; dock(); });
  el.addEventListener('pointerdown', event => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const rect = el.getBoundingClientRect();
    start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    el.dataset.isDragging = 'false';
    el.setPointerCapture(event.pointerId);
  });
  el.addEventListener('pointermove', event => {
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < 5 && el.dataset.isDragging !== 'true') return;
    el.dataset.isDragging = 'true'; el.classList.add('is-dragging');
    set('left', `${Math.max(0, Math.min(window.innerWidth - 42, start.left + dx))}px`);
    set('top', `${Math.max(8, Math.min(window.innerHeight - 50, start.top + dy))}px`);
  });
  const finish = () => {
    if (!start) return;
    start = null;
    side = el.offsetLeft + 21 < window.innerWidth / 2 ? 'left' : 'right';
    y = el.offsetTop / Math.max(8, window.innerHeight - 50);
    dock();
    chrome.runtime.sendMessage({ action: 'SAVE_BUBBLE_POSITION', position: { side, y } }).catch(() => {});
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', () => { el.dataset.isDragging = 'true'; finish(); });
  const resize = () => { if (el.isConnected) dock(); else window.removeEventListener('resize', resize); };
  window.addEventListener('resize', resize, { passive: true });
  el.cleanupDrag = () => window.removeEventListener('resize', resize);
  dock();
}

class ModernSelectionManager {
  constructor() {
    this.button = null;
    this.card = null;
    this.selectionText = '';
    this.context = '';
    this.openId = 0;
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { this.hideButton(); this.closeCard(); } });
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    document.addEventListener('mouseup', this.handleMouseUp, { passive: true });
    document.addEventListener('mousedown', this.handlePointerDown, { passive: true });
  }

  handleMouseUp(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (target?.closest('.ai-card, .ai-selection-btn, .ai-translator-bubble, input, textarea, select, [contenteditable]')) return;
    // 用微任务延后读取，避免某些浏览器在 mouseup 同步阶段 selection 尚未更新；
    // 不再用 80ms 长延时，防止全屏翻译的 DOM mutation 在延时窗口内干扰 selection。
    window.setTimeout(() => {
      const selection = window.getSelection();
      let text = selection?.toString().replace(/\s+/g, ' ').trim() || '';
      if (selection?.rangeCount === 0 && !text) return;

      // 全屏翻译后划词失效修复：优先原文，选不到原文则用译文。
      // 当选中节点落在译文元素内时，向上找同级的 .ai-origin-text 取原文。
      let sourceText = text;
      const anchorNode = selection?.anchorNode;
      if (anchorNode) {
        const translationEl = anchorNode.parentElement?.closest('.ai-trans-minimal, .ai-trans-replacement, .ai-translate-block');
        if (translationEl) {
          // 在译文元素所属容器内查找原文
          const container = translationEl.parentElement;
          const originEl = container?.querySelector(`[${ORIGIN_MARK_ATTR}]`);
          let resolvedFromOrigin = false;
          if (originEl && !originEl.classList.contains('hidden')) {
            const originText = originEl.textContent.replace(/\s+/g, ' ').trim();
            if (originText) {
              sourceText = originText;
              resolvedFromOrigin = true;
            }
          }
          // 原文取不到（被隐藏或为空）时，回退到用户实际选中的译文文本
          if (!resolvedFromOrigin) {
            const selectedTranslation = text || translationEl.textContent.replace(/\s+/g, ' ').trim();
            if (!selectedTranslation) return;
            sourceText = selectedTranslation;
          }
        }
      }

      if (!sourceText || sourceText.length > 12000) return;

      let rect = null;
      if (selection?.rangeCount > 0) {
        rect = selection.getRangeAt(0).getBoundingClientRect();
      }
      // 0 尺寸兜底：回退到事件目标的位置，避免译文重排导致按钮不出现。
      if ((!rect || (!rect.width && !rect.height)) && target instanceof Element) {
        rect = target.getBoundingClientRect();
      }
      if (!rect || (!rect.width && !rect.height)) return;
      this.selectionText = sourceText;
      const contextElement = selection?.anchorNode?.parentElement?.closest('p,li,blockquote,h1,h2,h3');
      const contextCopy = contextElement?.cloneNode(true);
      contextCopy?.querySelectorAll('.ai-trans-minimal,.ai-trans-replacement,.ai-translate-block').forEach(el => el.remove());
      this.context = contextCopy?.textContent?.replace(/\s+/g, ' ').slice(0, 800) || '';
      if (this.context === sourceText || sourceText.length > 160) this.context = '';
      this.showButton(rect);
    }, 0);
  }

  handlePointerDown(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (target?.closest('.ai-card, .ai-selection-btn')) return;
    this.hideButton();
    this.closeCard();
  }

  showButton(selectionRect) {
    this.hideButton();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-selection-btn';
    button.setAttribute('aria-label', tr('翻译选中文字', 'Translate selection'));
    button.innerHTML = ICONS.translate;
    const left = Math.min(window.innerWidth - 44, Math.max(8, selectionRect.right + 8));
    const top = Math.min(window.innerHeight - 44, Math.max(8, selectionRect.bottom + 8));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.addEventListener('pointerdown', event => event.stopPropagation());
    button.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener('mouseup', event => event.stopPropagation());
    button.addEventListener('click', event => {
      event.stopPropagation();
      this.showCard(selectionRect);
      this.hideButton();
    });
    document.documentElement.appendChild(button);
    this.button = button;
  }

  hideButton() {
    this.button?.remove();
    this.button = null;
  }

  closeCard() {
    this.openId++;
    this.card?.cleanup?.();
    if (!this.card) return;
    pageManager.cancelTasksForElement(this.card);
    this.card.remove();
    this.card = null;
  }

  async showCard(selectionRect) {
    this.closeCard();
    const openId = this.openId;
    const selectedText = this.selectionText;
    const selectedContext = this.context;
    const settings = await getLocalSettings(['targetLang', 'precisionMode', 'provider', 'modelName']);
    if (!settings || openId !== this.openId) return;
    uiLang = settings.uiLang || uiLang;
    const providerLabels = {
      deepseek: 'DeepSeek', qwen: 'Qwen', siliconflow: 'SiliconFlow', moonshot: 'Kimi',
      zhipu: 'GLM', zhipu_free: 'GLM 免费模型', custom: '自定义模型'
    };
    const modelLabel = settings.modelName || providerLabels[settings.provider || 'deepseek'] || 'AI 翻译';

    const card = document.createElement('section');
    card.className = 'ai-card';
    // Keep card gestures out of the host page's delegated click handlers.
    for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick']) {
      card.addEventListener(type, event => event.stopPropagation());
    }
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', tr('划词翻译结果', 'Translation result'));

    const header = document.createElement('header');
    header.className = 'ai-card-header';
    const brand = document.createElement('div');
    brand.className = 'ai-card-brand';
    const brandIcon = document.createElement('span');
    brandIcon.className = 'ai-card-logo';
    brandIcon.innerHTML = ICONS.translate;
    const brandText = document.createElement('span');
    brandText.textContent = modelLabel;
    brand.append(brandIcon, brandText);

    const actions = document.createElement('div');
    actions.className = 'ai-card-actions';
    const explainButton = this.createActionButton(tr('解读', 'Explain'), ICONS.lightbulb, 'ai-explain-btn');
    const copyButton = this.createActionButton(tr('复制', 'Copy'), ICONS.copy, 'ai-copy-btn');
    const closeButton = this.createActionButton('', ICONS.close, 'ai-close-btn');
    closeButton.setAttribute('aria-label', tr('关闭', 'Close'));
    actions.append(explainButton, copyButton, closeButton);
    header.append(brand, actions);

    const body = document.createElement('div');
    body.className = 'ai-card-body';
    const translation = document.createElement('div');
    translation.className = 'ai-card-translation';
    this.renderLoading(translation, tr('正在翻译', 'Translating'));
    const source = document.createElement('div');
    source.className = 'ai-card-source'; source.textContent = selectedText; source.dir = 'auto';
    translation.dir = 'auto';
    body.append(source, translation);
    card.append(header, body);

    const cardWidth = Math.min(380, window.innerWidth - 16);
    const estimatedHeight = 250;
    const left = Math.min(window.innerWidth - cardWidth - 8, Math.max(8, selectionRect.left));
    const below = selectionRect.bottom + 10;
    const top = below + estimatedHeight <= window.innerHeight
      ? below
      : Math.max(8, selectionRect.top - estimatedHeight - 10);
    card.style.width = `${cardWidth}px`;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    document.documentElement.appendChild(card);
    this.card = card;
    card.tabIndex = -1; card.focus({ preventScroll: true });
    const fit = () => { card.style.top = `${Math.max(8, Math.min(parseFloat(card.style.top), window.innerHeight - card.offsetHeight - 8))}px`; card.style.left = `${Math.max(8, Math.min(parseFloat(card.style.left), window.innerWidth - card.offsetWidth - 8))}px`; };
    const sizeObserver = new ResizeObserver(fit); sizeObserver.observe(card);
    window.addEventListener('resize', fit);
    card.cleanup = () => { sizeObserver.disconnect(); window.removeEventListener('resize', fit); };
    let explanation = null;
    let explained = false;

    closeButton.addEventListener('click', () => this.closeCard());
    copyButton.addEventListener('click', async () => {
      const value = translation.textContent.trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        copyButton.querySelector('span:last-child').textContent = tr('已复制', 'Copied');
        window.setTimeout(() => {
          if (copyButton.isConnected) copyButton.querySelector('span:last-child').textContent = tr('复制', 'Copy');
        }, 1200);
      } catch {
        copyButton.querySelector('span:last-child').textContent = tr('复制失败', 'Copy failed');
      }
    });
    explainButton.addEventListener('click', () => {
      if (explainButton.disabled) return;
      if (explained) { explanation.hidden = !explanation.hidden; return; }
      explainButton.disabled = true;
      explainButton.querySelector('span:last-child').textContent = tr('解读中', 'Explaining');
      if (!explanation) explanation = document.createElement('div');
      explanation.className = 'ai-card-explanation';
      this.renderLoading(explanation, tr('正在分析语境', 'Analyzing context'));
      body.appendChild(explanation);
      const explainTask = pageManager.addDirectTask(selectedText, explanation, settings.targetLang || 'zh', false, 'explain', selectedContext);
      explainTask.onDone = success => {
        if (!explainButton.isConnected) return;
        explainButton.disabled = false;
        explained = success;
        explainButton.querySelector('span:last-child').textContent = success ? tr('已解读', 'Explained') : tr('重试解读', 'Retry explanation');
      };
    });

    this.setupCardDrag(card, header);
    pageManager.addDirectTask(selectedText, translation, settings.targetLang || 'zh', false, 'dictionary', selectedContext);
  }

  createActionButton(label, icon, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ai-card-action ${className}`;
    const iconWrap = document.createElement('span');
    iconWrap.className = 'ai-action-icon';
    iconWrap.innerHTML = icon;
    button.appendChild(iconWrap);
    if (label) {
      const text = document.createElement('span');
      text.textContent = label;
      button.appendChild(text);
    }
    return button;
  }

  renderLoading(container, label) {
    container.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'ai-card-loading';
    loading.setAttribute('aria-live', 'polite');
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const bars = document.createElement('span');
    bars.className = 'ai-loading-bars';
    bars.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    loading.append(labelEl, bars);
    container.appendChild(loading);
  }

  setupCardDrag(card, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const onMove = event => {
      if (!dragging) return;
      const nextLeft = Math.max(8, Math.min(window.innerWidth - card.offsetWidth - 8, startLeft + event.clientX - startX));
      const nextTop = Math.max(8, Math.min(window.innerHeight - card.offsetHeight - 8, startTop + event.clientY - startY));
      card.style.left = `${nextLeft}px`;
      card.style.top = `${nextTop}px`;
    };
    const onUp = () => {
      dragging = false;
      card.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    const cleanup = card.cleanup; card.cleanup = () => { onUp(); cleanup?.(); };
    handle.addEventListener('mousedown', event => {
      if (event.target.closest('button')) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = card.offsetLeft;
      startTop = card.offsetTop;
      card.classList.add('is-dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      event.preventDefault();
    });
  }
}

// 注意：HEADER/FOOTER 不在此列表中。它们只是语义标签，里面的 <p>/<h2> 仍是
// 可翻译的块级容器；若放进 INVALID_TAGS，getLogicalBlock 遇到它们会返回 null，
// 导致位于 <header>/<footer> 后代的正文（如 Medium 文章正文区）被整体跳过。
const INVALID_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'MATH', 'TITLE', 'IMG', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'];

function isBlockContainer(el) {
  if (!el || !el.tagName) return false;
  const display = window.getComputedStyle(el).display;
  const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'MAIN', 'TD', 'TH', 'FIGCAP'];
  return blockTags.includes(el.tagName) || display === 'block' || display === 'flex' || display === 'grid' || display === 'table-cell';
}

function getLogicalBlock(node) {
  let curr = node.parentElement;
  const semantic = curr?.closest('p,h1,h2,h3,h4,h5,h6,td,th,figcaption,blockquote');
  if (semantic && !curr.closest('[data-ai-translated],script,style,code,pre,button,textarea,input')) return semantic;
  while (curr && curr !== document.body) {
    if (INVALID_TAGS.includes(curr.tagName)) return null;
    if (curr.getAttribute(TRANSLATION_MARK_ATTR)) return null;
    if (curr.tagName === 'A') return curr;
    if (isBlockContainer(curr)) return curr;
    curr = curr.parentElement;
  }
  // 不把整个 BODY 标记为已翻译，避免后续懒加载内容被祖先标记拦截。
  return node.parentElement !== document.body ? node.parentElement : null;
}

async function scanTranslatableElements(root = document.body, sessionId = translationSessionId) {
  const rawBlocks = [];
  const groups = new Map();

  if (!(root instanceof Element) || root.closest('.ai-card, .ai-selection-btn, .ai-translator-bubble')) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches('script,style,noscript,code,pre,svg,math,textarea,input,select,button,[contenteditable],[data-ai-translated],.ai-card,.ai-selection-btn,.ai-translator-bubble,.ai-trans-minimal,.ai-trans-replacement,.ai-translate-block,.ai-origin-text')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
      if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (parent.closest('script, style, noscript, code, pre, svg, math, textarea, audio, video, canvas, input, select, button')) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest('[data-ai-translated],.ai-card,.ai-translator-bubble,.ai-selection-btn')) return NodeFilter.FILTER_REJECT;
      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'AUDIO', 'VIDEO', 'CANVAS'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (parent.getAttribute(TRANSLATION_MARK_ATTR)) return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains('ai-trans-replacement') || parent.classList.contains('ai-trans-minimal')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let currentNode;
  let sliceStart = performance.now();
  while (currentNode = walker.nextNode()) {
    if (performance.now() - sliceStart > 8) {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (sessionId !== translationSessionId || !isTranslating) return [];
      sliceStart = performance.now();
    }
    if (currentNode.nodeType !== Node.TEXT_NODE) continue;
    const container = getLogicalBlock(currentNode);
    if (!container) continue;
    const rect = container.getBoundingClientRect();
    if (rect.bottom < -window.innerHeight * .35 || rect.top > window.innerHeight * 2) continue;

    let block = groups.get(container);
    if (!block) { block = { container, textNodes: [] }; groups.set(container, block); rawBlocks.push(block); }
    block.textNodes.push(currentNode);
  }

  // --- 过滤与组装 ---
  const validBlocks = [];
  
  rawBlocks.forEach(block => {
    if (block.textNodes.length > 500) return; 
    const fullText = block.textNodes.map(n => n.nodeValue).join('').trim();
    
    // 长度太短的跳过 (小于2个字符通常是无意义的，除非是中文)
    if (fullText.length > 16000) return;
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

async function getProgressiveBlocks(root = document.body, sessionId) {
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const topLimit = -Math.round(viewportHeight * 0.35);
  const bottomLimit = viewportHeight * (1 + PROGRESSIVE_PRELOAD_SCREENS);

  return (await scanTranslatableElements(root, sessionId))
    .filter(block => {
      const rect = block.container.getBoundingClientRect();
      return rect.bottom >= topLimit && rect.top <= bottomLimit;
    })
    .sort((a, b) => a.container.getBoundingClientRect().top - b.container.getBoundingClientRect().top);
}

async function runProgressiveScan(sessionId) {
  progressiveScrollTimer = null;
  if (!progressiveScrollHandler || !isTranslating || sessionId !== translationSessionId || translationUrl !== window.location.href) return;
  if (document.hidden || pageManager.queue.length > 12) return;
  if (scanRunning) { scanAgain = true; return; }
  scanRunning = true;
  try {
    const blocks = await getProgressiveBlocks(document.body, sessionId);
    if (sessionId !== translationSessionId || !isTranslating) return;
    if (blocks.length) pageManager.addTasks(blocks.slice(0, 120), pageManager.settings, false, crypto.randomUUID());
    else pageManager.processQueue();
  } finally {
    scanRunning = false;
    if (scanAgain) { scanAgain = false; scheduleProgressiveScan(translationSessionId, 300); }
  }
}

function scheduleProgressiveScan(sessionId = translationSessionId, delay = PROGRESSIVE_SCAN_DELAY_MS) {
  if (progressiveScrollTimer) return;
  progressiveScrollTimer = window.setTimeout(() => runProgressiveScan(sessionId), delay);
}

function startProgressiveTranslation(sessionId) {
  stopProgressiveTranslation();
  progressiveScrollHandler = () => scheduleProgressiveScan(sessionId);
  window.addEventListener('scroll', progressiveScrollHandler, { passive: true });
  window.addEventListener('resize', progressiveScrollHandler, { passive: true });
  // 捕获页面内部滚动容器的 scroll；Medium 等站点不一定只滚动 window。
  document.addEventListener('scroll', progressiveScrollHandler, { passive: true, capture: true });
  scheduleProgressiveScan(sessionId, 0);
}

function stopProgressiveTranslation() {
  if (progressiveScrollTimer) clearTimeout(progressiveScrollTimer);
  progressiveScrollTimer = null;
  if (!progressiveScrollHandler) return;
  window.removeEventListener('scroll', progressiveScrollHandler);
  window.removeEventListener('resize', progressiveScrollHandler);
  document.removeEventListener('scroll', progressiveScrollHandler, true);
  progressiveScrollHandler = null;
}

class TranslationManager {
  constructor() {
    this.queue = [];
    this.activeCount = 0;
    this.concurrency = 2;
    // 为划词翻译预留独立名额，全屏翻译再忙也能立即响应划词。
    this.cardConcurrency = 1;
    this.activeCardCount = 0;
    this.settings = {};
    this.BATCH_DELIMITER = "<<<TRANSLATE_SEGMENT>>>";
    this.activePorts = new Map();
    this.retryTimers = new Set();
    this.generation = 0;
  }

  // 添加任务（包含 UI 生成、打包、入队）
  addTasks(blocks, settings, isPriority = false, traceId = null) {
    this.settings = settings;
    if (!isPriority) setBubbleLoading(true);

    const rawTasks = []; 

    // 先登记译文位置；任务真正开始前保持为空，不遮挡原文。
    blocks.forEach(block => {
      if (block.container.getAttribute(TRANSLATION_MARK_ATTR)) return;

      let originElements = [];
      if (!settings.bilingualMode) {
        block.textNodes.forEach(node => {
          if (node.parentNode.classList && node.parentNode.classList.contains('ai-origin-text')) return;
          const span = document.createElement('span');
          span.className = 'ai-origin-text';
          span.setAttribute(ORIGIN_MARK_ATTR, 'true');
          node.parentElement.insertBefore(span, node);
          span.appendChild(node);
        });
        originElements = [...block.container.querySelectorAll(`[${ORIGIN_MARK_ATTR}]`)];
      }

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
      transUi.textContent = '';
      transUi.classList.add('ai-translation-pending');
      transUi.setAttribute('aria-busy', 'false');

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
      blockRecords.set(block.container, { ui: transUi, nodes: block.textNodes, source: block.originalText });

      rawTasks.push({
        text: block.originalText,
        ui: transUi,
        container: block.container,
        originElements,
        targetLang: settings.targetLang,
        mode: settings.precisionMode ? 'precision' : 'fast',
        traceId
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

  pushBatchTask(batchItems, isPriority = false, traceId) {
    if(!batchItems.length) return;

    const combinedText = batchItems.map(i => i.text).join(`\n${this.BATCH_DELIMITER}\n`);

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

  addDirectTask(text, outputEl, targetLang, precisionMode, modeOverride = null, context = '') {
     const task = {
       type: 'card',
       context,
       text: text,
       ui: outputEl,
       targetLang: targetLang,
       mode: modeOverride ? modeOverride : (precisionMode ? 'precision' : 'fast'),
       retryCount: 0
     };

     this.queue.unshift(task);
     this.processQueue();
     return task;
  }

  processQueue() {
    // 以仍然存活的 Port 为准校正计数，避免异常断开后队列被错误地判定为“并发已满”。
    let activePagePorts = 0;
    let activeCardPorts = 0;
    this.activePorts.forEach(entry => {
      if (entry.task.type === 'card') activeCardPorts += 1;
      else activePagePorts += 1;
    });
    this.activeCount = activePagePorts;
    this.activeCardCount = activeCardPorts;

    // 划词翻译走独立并发名额，不被全屏翻译阻塞。
    while (this.activeCardCount < this.cardConcurrency) {
      const nextCardIdx = this.queue.findIndex(t => t.type === 'card');
      if (nextCardIdx === -1) break;
      const cardTask = this.queue.splice(nextCardIdx, 1)[0];
      if (cardTask) {
        this.runTask(cardTask, true);
      }
    }

    if (this.queue.length === 0 && this.activeCount === 0 && this.activeCardCount === 0) {
      setBubbleLoading(false); return;
    }

    // Only an active page-translation session may consume page tasks.
    while (isTranslating && !document.hidden && this.activeCount < this.concurrency && this.queue.length > 0) {
      const nextTaskIdx = this.queue.findIndex(task => task.type !== 'card');
      if (nextTaskIdx === -1) break;
      const nextTask = this.queue.splice(nextTaskIdx, 1)[0];
      if (nextTask) {
        const live = nextTask.type === 'batch' ? nextTask.items.some(item => item.ui?.isConnected) : nextTask.ui?.isConnected;
        if (!live) continue;
        this.runTask(nextTask, false);
      }
    }
  }

  setItemLoading(item) {
    if (!item.ui?.isConnected) return;
    item.ui.replaceChildren();
    item.ui.style.color = '';
    item.ui.classList.remove('ai-translation-pending', 'ai-translation-error');
    item.ui.classList.add('ai-translation-loading');
    item.ui.setAttribute('aria-busy', 'true');
  }

  setItemText(item, value) {
    if (!item.ui?.isConnected) return;
    if (value) item.originElements?.forEach(el => el.classList.add('hidden'));
    item.ui.classList.remove('ai-translation-pending', 'ai-translation-loading');
    item.ui.setAttribute('aria-busy', 'false');
    item.ui.textContent = value;
  }

  runTask(task, isCard = false) {
    if (!task || task.generation !== undefined && task.generation !== this.generation) {
      this.processQueue();
      return;
    }
    task.generation = this.generation;
    task.retryCount ??= 0;
    if (isCard) this.activeCardCount += 1;
    else this.activeCount += 1;
    const releaseSlot = () => {
      if (isCard) this.activeCardCount = Math.max(0, this.activeCardCount - 1);
      else this.activeCount = Math.max(0, this.activeCount - 1);
    };

    const targets = task.type === 'batch' ? task.items : [task];
    targets.forEach(item => this.setItemLoading(item));

    let port;
    try {
      port = chrome.runtime.connect({ name: 'stream-translate' });
    } catch (error) {
      releaseSlot();
      if (!recoverInvalidatedExtensionContext(error)) {
        const message = String(error?.message || '无法连接翻译服务，请重试').slice(0, 300);
        targets.forEach(item => this.renderError(item, task.type === 'batch' ? item.text : task.text, message, task.type === 'card'));
        task.onDone?.(false);
        this.processQueue();
      }
      return;
    }
    const heartbeat = setInterval(() => { try { port.postMessage({ action: 'PING' }); } catch {} }, 20000);
    let accumulatedText = '';
    let settled = false;
    let completionNotified = false;
    let renderFrame = 0;

    const renderAccumulated = () => {
      renderFrame = 0;
      if (settled || task.generation !== this.generation) return;
      if (task.type === 'batch') {
        // Batch output is committed only after DONE validates segment count and order.
        return;
      } else if (task.ui?.isConnected) {
        this.setItemText(task, accumulatedText);
      }
    };
    const scheduleRender = () => {
      if (renderFrame) return;
      // 后台标签页 requestAnimationFrame 被暂停，直接同步写入避免译文丢失。
      if (document.hidden) {
        renderAccumulated();
      } else {
        renderFrame = requestAnimationFrame(renderAccumulated);
      }
    };

    const finalize = (disconnectMessage = '') => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      if (renderFrame) cancelAnimationFrame(renderFrame);
      if (!completionNotified && task.generation === this.generation) {
        const contextInvalidated = /extension context invalidated|context invalidated/i.test(disconnectMessage) || !hasLiveExtensionContext();
        if (!contextInvalidated || !recoverInvalidatedExtensionContext(disconnectMessage)) {
          const message = disconnectMessage || '连接意外中断，请重试';
          targets.forEach(item => this.renderError(item, task.type === 'batch' ? item.text : task.text, message, task.type === 'card'));
          task.onDone?.(false);
        }
      }
      if (this.activePorts.delete(port)) releaseSlot();
      this.processQueue();
      if (isTranslating && this.queue.length === 0) scheduleProgressiveScan(translationSessionId, 500);
    };

    const disconnectAndFinalize = (disconnectMessage = '') => {
      try { port.disconnect(); } catch {}
      // 主动 disconnect 不保证在调用端触发 onDisconnect，因此必须在这里释放任务槽位。
      finalize(disconnectMessage);
    };

    const cancelTask = () => {
      completionNotified = true;
      disconnectAndFinalize();
    };

    this.activePorts.set(port, { task, cancel: cancelTask, heartbeat });

    port.onDisconnect.addListener(() => {
      let disconnectMessage = '';
      try { disconnectMessage = chrome.runtime.lastError?.message || ''; } catch {}
      finalize(disconnectMessage);
    });
    port.onMessage.addListener(msg => {
      if (task.generation !== this.generation) {
        completionNotified = true;
        disconnectAndFinalize();
        return;
      }

      if (msg.action === 'CHUNK') {
        accumulatedText += msg.content || '';
        scheduleRender();
        return;
      }

      if (msg.error) {
        const errorText = String(msg.error).slice(0, 300);
        const rateLimited = /429|concurr|rate.?limit|并发|频率/i.test(errorText);
        if (rateLimited && task.retryCount < 2) {
          task.retryCount += 1;
          const delay = 1200 * (2 ** task.retryCount) + Math.random() * 800;
          settled = true;
          clearInterval(heartbeat);
          if (this.activePorts.delete(port)) releaseSlot();
          port.disconnect();
          const timer = window.setTimeout(() => {
            this.retryTimers.delete(timer);
            if (task.generation === this.generation) {
              // 限流重试时按原优先级回到队列：划词仍优先
              if (isCard) this.queue.unshift(task);
              else this.queue.push(task);
              this.processQueue();
            }
          }, delay);
          this.retryTimers.add(timer);
          return;
        }
        completionNotified = true;
        if (renderFrame) cancelAnimationFrame(renderFrame);
        targets.forEach(item => this.renderError(item, task.type === 'batch' ? item.text : task.text, errorText, task.type === 'card'));
        task.onDone?.(false);
        disconnectAndFinalize();
        return;
      }

      if (msg.action === 'DONE') {
        completionNotified = true;
        if (renderFrame) cancelAnimationFrame(renderFrame);
        if (task.type === 'batch' && Array.isArray(msg.segments)) {
          task.items.forEach((item, index) => this.setItemText(item, msg.segments[index] || ''));
        } else renderAccumulated();
        targets.forEach(item => {
          if (item.ui?.isConnected && !item.ui.textContent.trim()) this.setItemText(item, item.text || task.text);
          else if (item.ui?.isConnected) {
            item.ui.classList.remove('ai-translation-loading');
            item.ui.setAttribute('aria-busy', 'false');
          }
        });
        task.onDone?.(true);
        disconnectAndFinalize();
      }
    });

    try {
      port.postMessage({
        action: 'TRANSLATE', text: task.text, targetLang: task.targetLang,
        mode: task.mode, traceId: task.traceId, context: task.context || '',
        segments: task.type === 'batch' ? task.items.map(item => item.text) : undefined
      });
    } catch (error) {
      disconnectAndFinalize(String(error?.message || '无法发送翻译请求'));
    }
  }

  renderError(item, original, message, isCard) {
    if (!item.ui?.isConnected) return;
    item.ui.classList.remove('ai-translation-pending', 'ai-translation-loading');
    item.ui.setAttribute('aria-busy', 'false');
    if (!isCard) {
      item.originElements?.forEach(el => el.classList.remove('hidden'));
      item.ui.textContent = tr('翻译失败', 'Translation failed');
      item.ui.title = `翻译失败: ${message}`;
      item.ui.classList.add('ai-translation-error');
      return;
    }
    item.ui.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = tr('翻译失败', 'Translation failed');
    const detail = document.createElement('span');
    detail.textContent = message;
    const hint = document.createElement('small');
    hint.textContent = tr('请检查 API 配置或稍后重试。', 'Check the API settings or try again.');
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-card-error';
    wrapper.append(title, detail, hint);
    item.ui.appendChild(wrapper);
  }

  cancelTasksForElement(root) {
    const belongsToRoot = task => {
      const items = task.type === 'batch' ? task.items : [task];
      return items.some(item => item.ui && (item.ui === root || root.contains(item.ui)));
    };
    this.queue = this.queue.filter(task => !belongsToRoot(task));
    [...this.activePorts.entries()].forEach(([_port, entry]) => {
      if (belongsToRoot(entry.task)) entry.cancel();
    });
  }

  cancelAll() {
    this.generation += 1;
    this.queue = [];
    this.retryTimers.forEach(timer => clearTimeout(timer));
    this.retryTimers.clear();
    this.activePorts.forEach(entry => clearInterval(entry.heartbeat));
    const ports = [...this.activePorts.keys()];
    this.activePorts.clear();
    this.activeCount = 0;
    this.activeCardCount = 0;
    ports.forEach(port => {
      try { port.disconnect(); } catch {}
    });
    setBubbleLoading(false);
  }
}

const pageManager = new TranslationManager();

async function togglePageTranslation() {
  if (recoverInvalidatedExtensionContext()) return;
  await setManualPageTranslation(!isTranslating);
}

async function setManualPageTranslation(enabled) {
  // Invalidate both scheduled checks and settings reads already in flight.
  autoCheckEpoch += 1;
  autoCheckTimers.forEach(timer => clearTimeout(timer));
  autoCheckTimers = [];
  autoTranslatePausedUrl = enabled ? null : window.location.href;
  if (enabled) await enablePageTranslation('manual');
  else disablePageTranslation();
}

async function enablePageTranslation(source = 'manual') {
  if (isTranslating && translationUrl === window.location.href) return;
  const sessionId = ++translationSessionId;
  isTranslating = true;
  translationSource = source;
  translationUrl = window.location.href;
  updateBubbleState(true);

  const settings = await getLocalSettings(['targetLang', 'bilingualMode', 'transStyle', 'precisionMode']);
  if (!settings) {
    isTranslating = false;
    translationSource = null;
    translationUrl = null;
    updateBubbleState(false);
    return;
  }
  if (!isTranslating || sessionId !== translationSessionId || translationUrl !== window.location.href) return;
  const lang = settings.targetLang || 'zh';
  const translationSettings = {
    targetLang: lang,
    bilingualMode: settings.bilingualMode !== false,
    transStyle: settings.transStyle || 'minimal',
    precisionMode: settings.precisionMode === true
  };
  pageManager.settings = translationSettings;

  startProgressiveTranslation(sessionId);
}

function disablePageTranslation() {
  translationSessionId += 1;
  isTranslating = false;
  translationSource = null;
  translationUrl = null;
  setBubbleLoading(false);
  updateBubbleState(false);

  stopProgressiveTranslation();
  clearTimeout(mutationDebounceTimer); mutationDebounceTimer = null; pendingMutationRoots.clear();
  pageManager.cancelAll();

  document.querySelectorAll('.ai-translate-block, .ai-trans-minimal, .ai-trans-minimal-block, .ai-trans-replacement').forEach(el => el.remove());

  document.querySelectorAll(`[${ORIGIN_MARK_ATTR}]`).forEach(el => {
    el.classList.remove('hidden');
    el.replaceWith(...el.childNodes);
  });

  document.querySelectorAll(`[${TRANSLATION_MARK_ATTR}]`).forEach(el => el.removeAttribute(TRANSLATION_MARK_ATTR));
  document.querySelectorAll('.ai-translation-error').forEach(el => el.classList.remove('ai-translation-error'));
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "SET_PAGE_TRANSLATION" && typeof request.enabled === 'boolean' && _sender.url === chrome.runtime.getURL('popup/popup.html')) {
    setManualPageTranslation(request.enabled).then(() => sendResponse({ isTranslating }));
    return true;
  }
  if (request.action === "START_TRANSLATION") {
    togglePageTranslation();
  }
  
  if (request.action === "UI_LANGUAGE_CHANGED") {
    uiLang = request.uiLang === 'en' ? 'en' : 'zh';
    document.querySelector('.ai-translator-bubble')?.setAttribute('aria-label', tr('翻译当前页面', 'Translate page'));
    document.querySelector('.ai-selection-btn')?.setAttribute('aria-label', tr('翻译选中文字', 'Translate selection'));
    const card = selectionManager?.card;
    if (card) {
      card.setAttribute('aria-label', tr('划词翻译结果', 'Translation result'));
      card.querySelector('.ai-close-btn')?.setAttribute('aria-label', tr('关闭', 'Close'));
      const copy = card.querySelector('.ai-copy-btn span:last-child'); if (copy) copy.textContent = tr('复制', 'Copy');
      const explain = card.querySelector('.ai-explain-btn span:last-child'); if (explain) explain.textContent = tr('解读', 'Explain');
    }
  }
  if (request.action === "TRANSLATION_SETTINGS_CHANGED" && isTranslating) { const source = translationSource; disablePageTranslation(); enablePageTranslation(source); }

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

  if (request.action === "AUTO_TRANSLATE_SETTING_CHANGED") {
    autoCheckEpoch += 1;
    if (request.enabled) {
      autoTranslatePausedUrl = null;
      checkAutoTranslate();
    } else if (translationSource === 'auto') {
      // 关闭自动翻译时保留当前结果，下一次 URL 变化会严格停止。
      translationSource = 'manual';
      translationUrl = window.location.href;
    }
  }
});

init();
