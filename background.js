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
// === 配置常量 ===
const CACHE_LIMIT = 500;
const CACHE_MAX_LENGTH = 100;
const DEFAULT_PROVIDER = "deepseek";

// 厂商默认配置表 (用于兜底)
const PROVIDER_DEFAULTS = {
  deepseek:    { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
  moonshot:    { url: "https://api.moonshot.cn/v1/chat/completions", model: "kimi-k2-turbo-preview" },
  siliconflow: { url: "https://api.siliconflow.cn/v1/chat/completions", model: "deepseek-ai/DeepSeek-V3" },
  qwen:        { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-turbo" },
  openai:      { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  zhipu:       { url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash" },
  zhipu_47_flash_x: { url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "GLM-4.7-FlashX" },
  zhipu_47_flash:   { url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "GLM-4.7-Flash" },
  groq:        { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  openrouter:  { url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-2.0-flash-exp:free" },
  ollama:      { url: "http://localhost:11434/v1/chat/completions", model: "llama3" }
};

// === 缓存系统 ===
const translationCache = new Map();

// 初始化加载缓存
chrome.storage.local.get(['transCache'], (result) => {
  if (result.transCache) {
    Object.entries(result.transCache).forEach(([k, v]) => translationCache.set(k, v));
  }
});
function saveCache() {
  chrome.storage.local.set({ transCache: Object.fromEntries(translationCache) });
}

// === 消息监听主逻辑 ===
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "stream-translate") return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action !== "TRANSLATE") return;

    const { text, targetLang, mode } = msg;
    const cacheKey = `${text}_${targetLang}`;

    // 1. 缓存检查 (仅限短文本)
    if (text.length <= CACHE_MAX_LENGTH && translationCache.has(cacheKey)) {
      port.postMessage({ action: "CHUNK", content: translationCache.get(cacheKey) });
      port.postMessage({ action: "DONE" });
      return;
    }

    try {
      // 2. 获取配置
      const settings = await chrome.storage.local.get(['apiKey', 'apiUrl', 'modelName', 'provider']);
      const apiKey = settings.apiKey;
      const provider = settings.provider || DEFAULT_PROVIDER;
      
      // 权限校验 (BYOK模式)
      if (!apiKey && provider !== 'custom' && provider !== 'ollama') {
        throw new Error("请点击插件图标配置 API Key");
      }

      // 确定 API 地址和模型
      const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS['deepseek'];
      const apiUrl = settings.apiUrl || defaults.url;
      const model = settings.modelName || defaults.model;

      // 3. 构建 Prompt
      const langName = getLangName(targetLang);
      const isBatch = text.includes("|||");
      const systemPrompt = buildSystemPrompt(langName, mode, isBatch);

      // 4. 发起请求
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      console.log(`[Fetch] ${provider} -> ${model}`);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: headers,
        mode: "cors",
        credentials: 'omit',
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ],
          stream: true,
          temperature: 0.3,
          frequency_penalty: 0.5
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API Error: ${response.status}`);
      }

      // 5. 流式处理
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          
          try {
            const data = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || "";
            if (content) {
              fullText += content;
              port.postMessage({ action: "CHUNK", content: content });
            }
          } catch (e) { /* 忽略非JSON数据 */ }
        }
      }

      // 6. 写入缓存
      if (text.length <= CACHE_MAX_LENGTH && fullText.trim()) {
        if (translationCache.size >= CACHE_LIMIT) {
          translationCache.delete(translationCache.keys().next().value);
        }
        translationCache.set(cacheKey, fullText);
        saveCache();
      }

      port.postMessage({ action: "DONE" });

    } catch (error) {
      port.postMessage({ error: error.message });
    }
  });
});

// === 辅助函数 ===
function getLangName(code) {
  const map = {
    "zh": "Simplified Chinese (简体中文). NEVER use Traditional Chinese.", "en": "English", "zh-TW": "Traditional Chinese",
    "ja": "Japanese", "ko": "Korean", "fr": "French", "de": "German", "es": "Spanish",
    "ru": "Russian", "pt": "Portuguese", "it": "Italian", "nl": "Dutch", "sv": "Swedish",
    "tr": "Turkish", "pl": "Polish", "id": "Indonesian", "th": "Thai", "vi": "Vietnamese",
    "ms": "Malay", "ar": "Arabic", "hi": "Hindi"
  };
  return map[code] || "the target language";
}

function buildSystemPrompt(lang, mode, isBatch) {
  const langName = getLangName(lang);

  // === 解读模式 (针对 glm-4-flash 深度优化版) ===
  if (mode === 'explain') {
    return `You are a smart reading assistant.Explain the selected text in ${langName}.tell what's the text about.

REQUIREMENTS:
1. **Explain Meaning**: If it's a word, define it. If it's a sentence, summarize it.
2. **Provide Context**: If it's an acronym, give the **Full Name**. If it's a poem/idiom, give the **Source/Author**. If neither, write "无" (None).
3. **Keep it Concise**: No philosophy, no long essays.

OUTPUT FORMAT (Strictly follow this layout):
【解释】 <Write explanation here>
【全称/出处】 <Write Full Name or Source here>

EXAMPLES:
Input: "VPN"
【解释】 虚拟专用网络，一种用于加密网络连接的技术，常用于保护隐私或远程办公。
【全称/出处】 Virtual Private Network

Input: "轻舟已过万重山"
【解释】 形容船行极快，也比喻战胜困难后的畅快心情。
【全称/出处】 《早发白帝城》 [唐] 李白

Input: "Google released a new AI model."
【解释】 谷歌发布了一个新的人工智能模型。
【全称/出处】 无`;
  }

  // ============================================================
  // 2. 翻译模式 (Translate Mode) - 保持纯净
  // ============================================================
  const common = `Rules:\n1. Translate directly to ${lang}.\n2. Do NOT repeat original.\n3. Do NOT explain.\n4. Do NOT use markdown.`;
  const batchRule = isBatch ? `\n5. Keep "|||" separators.` : '';
  
  return `You are a professional translator.\nTask: Translate into ${lang}.\n${common}\nStyle: Concise & Professional.${batchRule}`;
}