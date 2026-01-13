// --- START OF FILE background.js ---
// 含有 AI 精翻部分的代码，谨慎删除

// --- 翻译缓存系统 ---
const CACHE_LIMIT = 500; // 最多缓存 500 条短语
const CACHE_MAX_LENGTH = 100; // 只缓存 100 字符以内的短文本 (UI 元素)
const translationCache = new Map(); // 内存缓存

// 加载本地存储的缓存 (启动时)
chrome.storage.local.get(['transCache'], (result) => {
  if (result.transCache) {
    Object.entries(result.transCache).forEach(([key, val]) => translationCache.set(key, val));
  }
});

function saveCacheToLocal() {
  // 转为对象存储
  const obj = Object.fromEntries(translationCache);
  chrome.storage.local.set({ transCache: obj });
}

// 默认设置 (DeepSeek 为默认推荐)
const DEFAULT_PROVIDER = "deepseek"; 
const DEFAULT_MODEL = "deepseek-chat";

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "stream-translate") return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action === "TRANSLATE") {
      const { text, targetLang, mode, traceId } = msg;
      
      // --- 1. 缓存命中检查 (只针对短文本 & 极速模式) ---
      const cacheKey = `${text}_${targetLang}`;
      
      // 如果文本较短，且缓存里有 -> 直接返回
      if (text.length <= CACHE_MAX_LENGTH && translationCache.has(cacheKey)) {
        console.log("🔥 命中缓存，省钱了:", text);
        port.postMessage({ action: "CHUNK", content: translationCache.get(cacheKey) });
        port.postMessage({ action: "DONE" });
        return; // 结束，不请求 API
      }

      try {
        const settings = await chrome.storage.local.get([
          'apiKey', 'apiUrl', 'modelName', 'provider'
        ]);
        
        const apiKey = settings.apiKey;
        const provider = settings.provider || DEFAULT_PROVIDER;
        
        let modelName = settings.modelName; 
        let targetApiUrl = settings.apiUrl;

        // --- 2. 权限与 Key 校验 (BYOK 模式) ---
        // 除非是 'custom' (可能没鉴权) 或 'ollama' (本地无鉴权)，否则必须有 Key
        if (!apiKey && provider !== 'custom' && provider !== 'ollama') {
          port.postMessage({ error: "请点击插件图标，配置您的 API Key 后使用。" });
          return;
        }

        // --- 3. 路由逻辑 (直连厂商) ---
        // 如果没有自定义 URL，则根据 provider 填充官方默认值
        if (!targetApiUrl) {
             if (provider === 'deepseek') targetApiUrl = "https://api.deepseek.com/chat/completions";
             else if (provider === 'moonshot') targetApiUrl = "https://api.moonshot.cn/v1/chat/completions";
             else if (provider === 'siliconflow') targetApiUrl = "https://api.siliconflow.cn/v1/chat/completions";
             else if (provider === 'qwen') targetApiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
             else if (provider === 'openai') targetApiUrl = "https://api.openai.com/v1/chat/completions";
             else if (provider === 'zhipu') targetApiUrl = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
             else if (provider === 'groq') targetApiUrl = "https://api.groq.com/openai/v1/chat/completions";
             else if (provider === 'openrouter') targetApiUrl = "https://openrouter.ai/api/v1/chat/completions";
             else if (provider === 'ollama') targetApiUrl = "http://localhost:11434/v1/chat/completions";
        }
        
        // 如果没有自定义模型名，填充默认值
        if (!modelName) {
             if (provider === 'deepseek') modelName = "deepseek-chat";
             else if (provider === 'moonshot') modelName = "kimi-k2-turbo-preview";
             else if (provider === 'siliconflow') modelName = "deepseek-ai/DeepSeek-V3"; // 硅基流动推荐 V3
             else if (provider === 'qwen') modelName = "qwen-turbo";
             else if (provider === 'zhipu') modelName = "glm-4-flash";
             else if (provider === 'openai') modelName = "gpt-4o-mini";
             else if (provider === 'groq') modelName = "llama-3.3-70b-versatile";
             else if (provider === 'ollama') modelName = "llama3";
        }

        // --- 核心：提示词工程 ---
        const langMap = {
          "zh": "Simplified Chinese", "en": "English", "zh-TW": "Traditional Chinese", "ja": "Japanese",
          "ko": "Korean", "fr": "French", "de": "German", "es": "Spanish", "ru": "Russian",
          "pt": "Portuguese", "it": "Italian", "nl": "Dutch", "sv": "Swedish", "tr": "Turkish",
          "pl": "Polish", "id": "Indonesian", "th": "Thai", "vi": "Vietnamese", "ms": "Malay",
          "ar": "Arabic", "hi": "Hindi"
        };
        
        const langName = langMap[targetLang] || "Simplified Chinese";
        const isBatch = text.includes("|||"); 

        let systemPrompt = "";

        const batchExample = isBatch 
          ? `\nExample Input:  Home ||| Contact Us\nExample Output: 首页 ||| 联系我们`
          : ``;

        const commonRules = `
Rules:
1. Translate directly to ${langName}.
2. Do NOT repeat the original text. Output ONLY the translation.
3. Do NOT explain.`;

        if (mode === 'precision') {
          // === 精翻模式 ===
          systemPrompt = `You are a professional translator.
Task: Translate the following text segments into ${langName}.
${commonRules}
4. Style: Professional, concise, and native.${isBatch ? '\n5. STRICTLY maintain "|||" separators. Item count must match input.' : ''}
${batchExample}`;

        } else {
          // === 极速模式 ===
          systemPrompt = `Translate to ${langName}.
${commonRules}${isBatch ? '\n4. Keep "|||" separators.' : ''}
${batchExample}`;
        }

        // --- 4. 构建请求头 ---
        const headers = {
          "Content-Type": "application/json"
        };
        
        // 只要有 Key 就发送 Authorization
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        console.log(`[Fetch] Provider:${provider} | Mode:${mode} | Target:${langName}`);

        // --- 5. 发起请求 ---
        // 使用标准 Fetch，移除所有非标准字段以兼容更多厂商
        const response = await fetch(targetApiUrl, {
          method: "POST", 
          headers: headers,
          credentials: 'omit', 
          referrerPolicy: "no-referrer",
          mode: "cors",
          body: JSON.stringify({
            model: modelName, 
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ],
            stream: true,
            temperature: mode === 'precision' ? 0.3 : 0.3, 
            frequency_penalty: 0.5
          })
        });

        if (!response.ok) {
            const err = await response.json().catch(()=>({}));
            throw new Error(err.error?.message || `API请求失败: ${response.status} ${response.statusText}`);
        }

        // --- 6. 流式处理响应 ---
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let fullTranslation = ""; // 用于收集完整结果存缓存

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk; 
          const lines = buffer.split('\n');
          buffer = lines.pop(); 

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            
            let dataStr = trimmed;
            if (trimmed.startsWith("data: ")) {
                dataStr = trimmed.slice(6);
            }

            try {
              const json = JSON.parse(dataStr);
              // 兼容不同厂商的字段结构 (delta 或 message)
              const content = json.choices[0]?.delta?.content || json.choices[0]?.message?.content || "";
              
              if (content) {
                fullTranslation += content; 
                port.postMessage({ action: "CHUNK", content: content }); // 发给前端
              }
            } catch (e) {
               // 忽略非 JSON 行
            }
          }
        }
        
        // --- 7. 请求结束后，写入缓存 ---
        if (text.length <= CACHE_MAX_LENGTH && fullTranslation.trim()) {
           console.log("💾 写入缓存:", text, "->", fullTranslation);
           
           // LRU 简单实现
           if (translationCache.size >= CACHE_LIMIT) {
             const firstKey = translationCache.keys().next().value;
             translationCache.delete(firstKey);
           }
           
           translationCache.set(cacheKey, fullTranslation);
           saveCacheToLocal();
        }

        port.postMessage({ action: "DONE" });

      } catch (error) {
        port.postMessage({ error: error.message });
      }
    }
  });
});