// --- START OF FILE background.js ---

// 你的腾讯云代理地址 (确保末尾有 /proxy)
const BUILTIN_PROXY_URL = "https://translate-deepseek-7dgwa0a2a0e41-1317980685.ap-shanghai.app.tcloudbase.com/proxy";

// 默认 API 地址 (改为 Kimi)
const DEFAULT_API_URL = "https://api.moonshot.cn/v1/chat/completions";
const DEFAULT_MODEL = "kimi-k2-turbo-preview";
const DEFAULT_PROVIDER = "moonshot"; // 默认厂商改为 moonshot

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "stream-translate") return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action === "TRANSLATE") {
      const { text, targetLang, mode } = msg;
      
      try {
        const settings = await chrome.storage.local.get(['apiKey', 'apiUrl', 'modelName', 'provider']);
        
        const apiKey = settings.apiKey;
        // 如果没有设置 provider，默认为 moonshot
        const provider = settings.provider || DEFAULT_PROVIDER;
        let modelName = settings.modelName || DEFAULT_MODEL;
        
        // 智能判断逻辑
        let targetApiUrl = settings.apiUrl || DEFAULT_API_URL;
        let useBuiltIn = false;

        // ★★★ 修改：如果厂商是 Moonshot (Kimi) 且没填 Key -> 启用内置代理 ★★★
        // 或者 provider 为空（初次使用），也走内置
        if ((provider === 'moonshot' || !provider) && !apiKey) {
          console.log("启用内置 Kimi 代理模式");
          useBuiltIn = true;
          targetApiUrl = BUILTIN_PROXY_URL;
          // 这里的 modelName 即使前端传了 moonshot-v1-8k，云函数那边也会强制覆盖，但保持一致更好
          modelName = "kimi-k2-turbo-preview"; 
        } else if (provider === 'deepseek' && !apiKey) {
           // 兼容旧逻辑：如果用户非要选 DeepSeek 但没填 Key，也可以走代理（前提是你云函数支持或你想支持）
           // 这里建议：没填 Key 一律走 Kimi 代理
           console.log("DeepSeek 未填 Key，自动切换至 Kimi 内置代理");
           useBuiltIn = true;
           targetApiUrl = BUILTIN_PROXY_URL;
        } else {
          // 自定义模式或填了 Key，必须校验
          if (!apiKey && provider !== 'custom') {
            port.postMessage({ error: "请在插件设置中配置 API Key" });
            return;
          }
        }

        // --- 核心：提示词工程 (保持不变) ---
        let systemPrompt;
        // --- 修复：完整的语言映射表 ---
        const langMap = {
          "zh": "Simplified Chinese",
          "en": "English",
          "zh-TW": "Traditional Chinese",
          "ja": "Japanese",
          "ko": "Korean",
          "fr": "French",
          "de": "German",
          "es": "Spanish",
          "ru": "Russian",
          "pt": "Portuguese",
          "it": "Italian",
          "nl": "Dutch",
          "sv": "Swedish",
          "tr": "Turkish",
          "pl": "Polish",
          "id": "Indonesian",
          "th": "Thai",
          "vi": "Vietnamese",
          "ms": "Malay",
          "ar": "Arabic",
          "hi": "Hindi"
        };
        
        // 如果找不到对应的，默认使用 Simplified Chinese
        const langName = langMap[targetLang] || "Simplified Chinese";

        if (mode === 'precision') {
          systemPrompt = `You are a professional translator and editor. 
          Translate the following text into ${langName}.
          Guidelines:
          1. Analyze the context and tone. Ensure the translation is natural and fluent.
          2. Use appropriate terminology for the subject matter.
          3. Rephrase if necessary to make it sound like a native speaker wrote it.
          4. Output ONLY the translated text, no explanations.`;
        } else {
          systemPrompt = `Translate into ${langName}. Keep it concise and literal. Output only the translation.`;
        }

        // === 修正 3：构建请求头 ===
        const headers = {
          "Content-Type": "application/json"
        };
        
        // 只有【不是】内置模式时，才发送 Key
        // 内置模式下，Key 在腾讯云后台，前端不发，防止泄露
        if (!useBuiltIn) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(targetApiUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ],
            stream: true,
            temperature: mode === 'precision' ? 1.3 : 1.0 
          })
        });

        if (!response.ok) {
            const err = await response.json().catch(()=>({}));
            throw new Error(err.error?.message || response.statusText);
        }

        // --- 流式处理 (保持不变) ---
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); 

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") continue;
            try {
              const json = JSON.parse(dataStr);
              const content = json.choices[0]?.delta?.content || "";
              if (content) port.postMessage({ action: "CHUNK", content: content });
            } catch (e) {}
          }
        }
        port.postMessage({ action: "DONE" });

      } catch (error) {
        port.postMessage({ error: error.message });
      }
    }
  });
});