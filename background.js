// --- START OF FILE background.js ---
// === 配置常量 ===
const CACHE_LIMIT = 500;
const CACHE_MAX_LENGTH = 100;
const DEFAULT_PROVIDER = "deepseek";

const BUILTIN_PROXY_URL = "https://1317980685-d62rkq4tfd.ap-guangzhou.tencentscf.com";
const BUILTIN_PROXY_MODEL = "glm-4-flash";

const PROVIDER_DEFAULTS = {
  deepseek:    { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
  moonshot:    { url: "https://api.moonshot.cn/v1/chat/completions", model: "kimi-k2-turbo-preview" },
  siliconflow: { url: "https://api.siliconflow.cn/v1/chat/completions", model: "deepseek-ai/DeepSeek-V3" },
  qwen:        { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-turbo" },
  zhipu:       { url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-plus" },
  zhipu_free:  { url: BUILTIN_PROXY_URL, model: BUILTIN_PROXY_MODEL, isBuiltin: true },
  custom:      { url: "", model: "" }
};

// === 缓存系统 ===
const translationCache = new Map();

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

    if (text.length <= CACHE_MAX_LENGTH && translationCache.has(cacheKey)) {
      port.postMessage({ action: "CHUNK", content: translationCache.get(cacheKey) });
      port.postMessage({ action: "DONE" });
      return;
    }

    try {
      const settings = await chrome.storage.local.get(['apiKey', 'apiUrl', 'modelName', 'provider']);
      const apiKey = settings.apiKey;
      const provider = settings.provider || DEFAULT_PROVIDER;
      const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS['deepseek'];
      const isBuiltin = !!defaults.isBuiltin;

      if (!apiKey && !isBuiltin && provider !== 'custom') {
        throw new Error("请点击插件图标配置 API Key");
      }

      let apiUrl, model;
      if (isBuiltin) {
        apiUrl = defaults.url;
        model = defaults.model;
      } else {
        apiUrl = settings.apiUrl || defaults.url;
        model = settings.modelName || defaults.model;
      }

      const isBatch = text.includes("|||");
      const systemPrompt = buildSystemPrompt(targetLang, mode, isBatch);

      const headers = { "Content-Type": "application/json" };
      if (apiKey && !isBuiltin) headers["Authorization"] = `Bearer ${apiKey}`;

      const requestBody = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        stream: true,
        temperature: 0.3
      };
      if (!isBuiltin) requestBody.frequency_penalty = 0.5;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        mode: "cors",
        credentials: 'omit',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API Error: ${response.status}`);
      }

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
            let data = trimmed;
            if (data.startsWith("data: ")) data = data.slice(6);
            else if (data.startsWith("data:")) data = data.slice(5);
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || "";
            if (content) {
              fullText += content;
              port.postMessage({ action: "CHUNK", content });
            }
          } catch (e) {}
        }
      }

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

function getLangName(code) {
  const map = {
    "zh": "Simplified Chinese (简体中文). NEVER use Traditional Chinese.",
    "en": "English", "zh-TW": "Traditional Chinese", "ja": "Japanese", "ko": "Korean",
    "fr": "French", "de": "German", "es": "Spanish", "ru": "Russian", "pt": "Portuguese",
    "it": "Italian", "nl": "Dutch", "sv": "Swedish", "tr": "Turkish", "pl": "Polish",
    "id": "Indonesian", "th": "Thai", "vi": "Vietnamese", "ms": "Malay", "ar": "Arabic", "hi": "Hindi"
  };
  return map[code] || "the target language";
}

function buildSystemPrompt(lang, mode, isBatch) {
  const langName = getLangName(lang);

  if (mode === 'explain') {
    return `You are a smart reading assistant. Explain the selected text in ${langName}. Tell what's the text about.

REQUIREMENTS:
1. Explain Meaning: If it's a word, define it. If it's a sentence, summarize it.
2. Provide Context: If it's an acronym, give the Full Name. If it's a poem/idiom, give the Source/Author. If neither, write "无".
3. Keep it Concise.

OUTPUT FORMAT:
【解释】 <explanation>
【全称/出处】 <full name or source>

EXAMPLES:
Input: "VPN"
【解释】 虚拟专用网络，用于加密网络连接的技术。
【全称/出处】 Virtual Private Network

Input: "轻舟已过万重山"
【解释】 形容船行极快，也比喻战胜困难后的畅快心情。
【全称/出处】 《早发白帝城》 [唐] 李白`;
  }

  const common = `Rules:\n1. Translate directly to ${langName}.\n2. Do NOT repeat original.\n3. Do NOT explain.\n4. Do NOT use markdown.`;
  const batchRule = isBatch ? `\n5. Keep "|||" separators.` : '';
  return `You are a professional translator.\nTask: Translate into ${langName}.\n${common}\nStyle: Concise & Professional.${batchRule}`;
}
