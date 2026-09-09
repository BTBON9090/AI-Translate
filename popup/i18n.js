(function (global) {
  'use strict';
  const en = {
    '保存设置并重新加载插件': 'Save settings and reload extension',
    '测试此模型连接（少量用量）': 'Test model connection (uses tokens)',
    '正在测试模型连接…': 'Testing model connection…',
    '模型接口已接受测试请求；可保存使用。': 'The model API accepted the test request. Ready to save.',
    '插件后台未就绪或版本不一致。模型列表仍可检测；翻译前请重新加载插件。': 'The extension background is unavailable or outdated. Model discovery still works; reload before translating.',
    '官方文档参考模型，未验证当前 Key 或模型权限': 'Models from official docs; your key and access are unverified',
    '接口未提供可读取的模型列表；已显示官方参考模型，尚未验证 Key。可选择模型后测试连接。': 'The API did not provide a readable model list. Showing official reference IDs without validating your key. Select a model to test the connection.',

    'AI 极简翻译': 'AI Translate', 'AI 极简翻译 v': 'AI Translate v', '读懂网页，不打断阅读': 'Read naturally, stay in the flow',
    '就绪': 'Ready', '切换界面语言': 'Switch interface language', '插件面板': 'Extension panels',
    '输入翻译': 'Text', '网页': 'Page', '模型': 'Models', '关于': 'About',
    '随手输入，即刻读懂': 'A little clarity, in any language', '单词查释义，句子看翻译': 'Look up a word or translate a passage',
    '原文': 'Source text', '输入或粘贴文字…': 'Type or paste text…', '清空': 'Clear', '目标语言': 'Target language',
    '翻译': 'Translate', '精细解释': 'Explain', '停止': 'Stop', 'Ctrl / ⌘ + Enter 翻译': 'Ctrl / ⌘ + Enter to translate',
    '翻译结果': 'Translation', '复制': 'Copy', '翻译当前页面': 'Translate this page', '显示原文': 'Show original',
    '翻译偏好': 'Reading preferences', '当前网页': 'Current page', '自动保留专有名词与格式': 'Preserve names and formatting',
    '始终翻译此网站': 'Always translate this site', '再次访问时自动启动': 'Reuse translations on return visits',
    '双语对照': 'Bilingual view', '原文与译文同时显示': 'Read the original and translation together', '对照样式': 'Translation style',
    '选择译文的强调程度': 'Choose how translations stand out', '轻量': 'Light', '高亮': 'Highlight',
    '悬浮翻译入口': 'Floating shortcut', '在网页右侧显示快捷按钮': 'Dock a shortcut at the screen edge',
    '模型连接': 'Model connection', '连接一次，网页与划词翻译共用': 'One connection for all translations',
    '官方文档': 'Official docs', '模型服务商': 'Provider', '接口协议': 'API protocol', 'API 地址 / Base URL': 'API URL / Base URL',
    '清除': 'Clear', '仅允许 HTTPS，本地调试可使用 localhost': 'HTTPS required; HTTP is allowed for localhost',
    '显示': 'Show', '隐藏': 'Hide', 'Key 仅保存在浏览器本地。网页文本会发送到你选择的模型服务商。': 'Your key stays in this browser. Text is sent to your selected provider.',
    '检测并获取模型': 'Detect available models', '模型名称': 'Model ID', '例如 deepseek-v4-flash': 'e.g. deepseek-v4-flash',
    '选择模型': 'Choose model', '选择': 'Choose', '刷新模型列表': 'Refresh model list', '检测': 'Detect',
    '可选择推荐模型，也可直接输入': 'Choose a suggested model or enter an ID', '保存并使用': 'Save and use',
    'BTBON 绘制的 AI 极简翻译图标': 'AI Translate icon by BTBON',
    '个人 vibe coding 独立开发者、UI 设计师': 'Independent developer and UI designer',
    '我在独立开发中持续打磨更自然、更轻量的工具体验。遇到问题或有建议，欢迎来交流。': 'I build thoughtful, lightweight tools. Get in touch with questions or ideas.',
    'QQ 交流群': 'QQ community', '复制群号': 'Copy group ID', '小红书': 'Xiaohongshu', '查看更新与设计分享': 'Updates and design notes',
    '打开': 'Open', '个人网站': 'Website', '访问': 'Visit', '版本更新': 'Updates', '正在检查最新版…': 'Checking for updates…',
    '检查更新': 'Check updates', '隐私说明：API Key 保存在本地。翻译时，所选文字或网页文本会发送至当前配置的模型服务商。': 'Privacy: API keys stay in this browser. Text you translate is sent to your configured provider.',
    '翻译缓存': 'Translation cache', '清除缓存': 'Clear cache', '已完成的段落在本地复用，最长保留 90 天。': 'Completed paragraphs are reused locally for up to 90 days.',
    '地址与 API Key 必须来自同一服务商和地域。': 'The URL and API key must match the provider and region.',
    '接口已返回模型': 'Models returned by API', '可搜索或手动输入 ID': 'Search or enter an ID', '内置免费代理，无需 API Key': 'Built-in free proxy; no API key required',
    '推荐模型（未经检测），也可手动输入 ID': 'Suggested models (unverified); you can enter an ID',
    '没有匹配模型，可手动填写 ID': 'No matching model; enter an ID manually', '正在检测…': 'Detecting…',
    '请填写 API Key。': 'Enter an API key.', '请填写模型 ID。': 'Enter a model ID.',
    '已获取模型列表；请选择模型后保存。列表可见不代表该模型支持当前协议。': 'Models found. Choose one and save. Listing does not confirm support for this protocol.',
    '检测失败': 'Detection failed', '模型配置已保存。': 'Model settings saved.',
    '此页面无法翻译，请打开普通网页。': 'Open a regular web page to translate.', '请刷新网页后重试；浏览器内部页面不支持翻译。': 'Reload the page and try again. Browser internal pages cannot be translated.',
    '已停止': 'Stopped', '正在翻译…': 'Translating…', '连接失败，请重试。': 'Connection failed. Try again.',
    '已完成 · 复用已有结果': 'Done · Reused existing result', '已完成': 'Done', '翻译失败': 'Translation failed',
    '连接中断，请重试。': 'Connection interrupted. Try again.', '已复制': 'Copied', '复制失败，请手动选择文字。': 'Copy failed. Select the text to copy it.',
    '条段落': 'paragraphs', '本地写入失败': 'Local save failed', '下载': 'Download', '发现新版本': 'New version',
    '暂时无法连接更新服务器': 'Update server unavailable', '已是最新版': 'Up to date', '当前版本': 'Installed version',
    '解压下载文件后，请在扩展管理页重新加载。': 'Unzip the download, then reload it from the extensions page.'
  };
  const reverse = Object.fromEntries(Object.entries(en).map(([zh, value]) => [value, zh]));
  function text(value, lang) { const zh = reverse[value] || value; return lang === 'en' ? en[zh] || value : zh; }
  function apply(root, lang) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('#text-result,textarea,#model-dropdown,#provider-select,#target-lang,#text-target,script')) continue;
      const trimmed = node.nodeValue.trim();
      if (en[trimmed] || reverse[trimmed]) node.nodeValue = node.nodeValue.replace(trimmed, text(trimmed, lang));
    }
    root.querySelectorAll('[title],[aria-label],[placeholder],[alt]').forEach(el => {
      for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) { const value = el.getAttribute(attr); if (value) el.setAttribute(attr, text(value, lang)); }
    });
  }
  global.AITranslateI18n = { text, apply, translateMessage: text };
})(globalThis);
