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
let progressiveScrollTimer = null;
let progressiveScrollHandler = null;
const PROGRESSIVE_SCAN_DELAY_MS = 120;
const PROGRESSIVE_PRELOAD_SCREENS = 1;
const EXTENSION_RECOVERY_KEY = '__ai_translator_resume_after_extension_reload__';
let extensionRecoveryStarted = false;

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
  try { sessionStorage.setItem(EXTENSION_RECOVERY_KEY, 'translate'); } catch {}
  window.location.reload();
  return true;
}

async function getLocalSettings(keys) {
  if (recoverInvalidatedExtensionContext()) return null;
  try {
    return await chrome.storage.local.get(keys);
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
    chrome.storage.local.get(['showBubble'], (result) => {
      if (result.showBubble !== false) createBubble();
      if (shouldResumeTranslation) enablePageTranslation('manual');
      else checkAutoTranslate();
    });
  } catch {
    recoverInvalidatedExtensionContext();
    return;
  }
  
  new ModernSelectionManager();

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
    }
  });
}

function handleUrlChange() {
  navigationEpoch += 1;
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
  if (!hasLiveExtensionContext()) return;
  try {
    chrome.storage.local.get(['autoSites'], (result) => {
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
        .ai-origin-text,
        .ai-card,
        .ai-selection-btn
      `)) return false;
      pendingMutationRoots.add(root);
      return true;
    };

    let hasMeaningfulChange = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (queueMutationRoot(node)) hasMeaningfulChange = true;
        }
      } else if (mutation.type === 'characterData' && queueMutationRoot(mutation.target)) {
        hasMeaningfulChange = true;
      } else if (mutation.type === 'attributes' && queueMutationRoot(mutation.target)) {
        hasMeaningfulChange = true;
      }
    }

    if (!hasMeaningfulChange) return;

    if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = setTimeout(() => {
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
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
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
  bubble.setAttribute('aria-label', '翻译当前页面');
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
    if (bubble.dataset.isDragging === 'true') return;
    void togglePageTranslation();
  });
  bubble.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
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

class ModernSelectionManager {
  constructor() {
    this.button = null;
    this.card = null;
    this.selectionText = '';
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    document.addEventListener('mouseup', this.handleMouseUp, { passive: true });
    document.addEventListener('mousedown', this.handlePointerDown, { passive: true });
  }

  handleMouseUp(event) {
    // 用微任务延后读取，避免某些浏览器在 mouseup 同步阶段 selection 尚未更新；
    // 不再用 80ms 长延时，防止全屏翻译的 DOM mutation 在延时窗口内干扰 selection。
    window.setTimeout(() => {
      const selection = window.getSelection();
      let text = selection?.toString().replace(/\s+/g, ' ').trim() || '';
      if (selection?.rangeCount === 0 && !text) return;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (target?.closest('.ai-card, .ai-selection-btn, input, textarea, [contenteditable="true"]')) return;

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
    button.setAttribute('aria-label', '翻译选中文字');
    button.innerHTML = ICONS.translate;
    const left = Math.min(window.innerWidth - 44, Math.max(8, selectionRect.right + 8));
    const top = Math.min(window.innerHeight - 44, Math.max(8, selectionRect.bottom + 8));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.addEventListener('mousedown', event => event.preventDefault());
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
    if (!this.card) return;
    pageManager.cancelTasksForElement(this.card);
    this.card.remove();
    this.card = null;
  }

  async showCard(selectionRect) {
    this.closeCard();
    const settings = await getLocalSettings(['targetLang', 'precisionMode', 'provider', 'modelName']);
    if (!settings) return;
    const providerLabels = {
      deepseek: 'DeepSeek', qwen: 'Qwen', siliconflow: 'SiliconFlow', moonshot: 'Kimi',
      zhipu: 'GLM', zhipu_free: 'GLM 免费模型', custom: '自定义模型'
    };
    const modelLabel = settings.modelName || providerLabels[settings.provider || 'deepseek'] || 'AI 翻译';

    const card = document.createElement('section');
    card.className = 'ai-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', '划词翻译结果');

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
    const explainButton = this.createActionButton('解读', ICONS.lightbulb, 'ai-explain-btn');
    const copyButton = this.createActionButton('复制', ICONS.copy, 'ai-copy-btn');
    const closeButton = this.createActionButton('', ICONS.close, 'ai-close-btn');
    closeButton.setAttribute('aria-label', '关闭');
    actions.append(explainButton, copyButton, closeButton);
    header.append(brand, actions);

    const body = document.createElement('div');
    body.className = 'ai-card-body';
    const translation = document.createElement('div');
    translation.className = 'ai-card-translation';
    this.renderLoading(translation, '正在翻译');
    body.appendChild(translation);
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

    closeButton.addEventListener('click', () => this.closeCard());
    copyButton.addEventListener('click', async () => {
      const value = translation.textContent.trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        copyButton.querySelector('span:last-child').textContent = '已复制';
        window.setTimeout(() => {
          if (copyButton.isConnected) copyButton.querySelector('span:last-child').textContent = '复制';
        }, 1200);
      } catch {
        copyButton.querySelector('span:last-child').textContent = '复制失败';
      }
    });
    explainButton.addEventListener('click', () => {
      if (explainButton.disabled) return;
      explainButton.disabled = true;
      explainButton.querySelector('span:last-child').textContent = '解读中';
      const explanation = document.createElement('div');
      explanation.className = 'ai-card-explanation';
      this.renderLoading(explanation, '正在分析语境');
      body.appendChild(explanation);
      const explainTask = pageManager.addDirectTask(this.selectionText, explanation, settings.targetLang || 'zh', false, 'explain');
      explainTask.onDone = success => {
        if (!explainButton.isConnected) return;
        explainButton.disabled = false;
        explainButton.querySelector('span:last-child').textContent = success ? '已解读' : '重试解读';
      };
    });

    this.setupCardDrag(card, header);
    pageManager.addDirectTask(this.selectionText, translation, settings.targetLang || 'zh', settings.precisionMode === true);
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
      const nextLeft = Math.min(window.innerWidth - card.offsetWidth - 8, Math.max(8, startLeft + event.clientX - startX));
      const nextTop = Math.min(window.innerHeight - card.offsetHeight - 8, Math.max(8, startTop + event.clientY - startY));
      card.style.left = `${nextLeft}px`;
      card.style.top = `${nextTop}px`;
    };
    const onUp = () => {
      dragging = false;
      card.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
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

function scanTranslatableElements(root = document.body) {
  const rawBlocks = [];
  let currentBlock = null;

  if (!(root instanceof Element) || root.closest('.ai-card, .ai-selection-btn, .ai-translator-bubble')) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (parent.closest('script, style, noscript, code, pre, svg, math, textarea, audio, video, canvas, input, select, button')) {
        return NodeFilter.FILTER_REJECT;
      }
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

function getProgressiveBlocks(root = document.body) {
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const topLimit = -Math.round(viewportHeight * 0.35);
  const bottomLimit = viewportHeight * (1 + PROGRESSIVE_PRELOAD_SCREENS);

  return scanTranslatableElements(root)
    .filter(block => {
      const rect = block.container.getBoundingClientRect();
      return rect.bottom >= topLimit && rect.top <= bottomLimit;
    })
    .sort((a, b) => a.container.getBoundingClientRect().top - b.container.getBoundingClientRect().top);
}

function runProgressiveScan(sessionId) {
  progressiveScrollTimer = null;
  if (!progressiveScrollHandler || !isTranslating || sessionId !== translationSessionId || translationUrl !== window.location.href) return;
  const blocks = getProgressiveBlocks(document.body);
  if (blocks.length) {
    pageManager.addTasks(blocks, pageManager.settings, false, crypto.randomUUID());
  } else {
    pageManager.processQueue();
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
    this.concurrency = 4;
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

    // 不再因 document.hidden 停止消费队列：翻译请求本身是 fetch，不依赖前台；
    // 渲染层已通过 scheduleRender 在后台标签页降级为同步写入，保证 CHUNK 不会丢失。
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const nextTaskIdx = this.queue.findIndex(task => task.type !== 'card');
      if (nextTaskIdx === -1) break;
      const nextTask = this.queue.splice(nextTaskIdx, 1)[0];
      if (nextTask) {
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
    let accumulatedText = '';
    let settled = false;
    let completionNotified = false;
    let renderFrame = 0;

    const renderAccumulated = () => {
      renderFrame = 0;
      if (task.type === 'batch') {
        const parts = accumulatedText.split(this.BATCH_DELIMITER);
        task.items.forEach((item, index) => {
          if (parts[index]?.trim()) this.setItemText(item, parts[index].trim());
        });
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

    this.activePorts.set(port, { task, cancel: cancelTask });

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
        renderAccumulated();
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
        mode: task.mode, traceId: task.traceId
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
      item.ui.textContent = '翻译失败';
      item.ui.title = `翻译失败: ${message}`;
      item.ui.classList.add('ai-translation-error');
      return;
    }
    item.ui.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = '翻译失败';
    const detail = document.createElement('span');
    detail.textContent = message;
    const hint = document.createElement('small');
    hint.textContent = '请检查 API 配置或稍后重试。';
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
  if (isTranslating) disablePageTranslation();
  else await enablePageTranslation('manual');
}

async function enablePageTranslation(source = 'manual') {
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

  if (request.action === "AUTO_TRANSLATE_SETTING_CHANGED") {
    if (request.enabled) {
      checkAutoTranslate();
    } else if (translationSource === 'auto') {
      // 关闭自动翻译时保留当前结果，下一次 URL 变化会严格停止。
      translationSource = 'manual';
      translationUrl = window.location.href;
    }
  }
});

init();
