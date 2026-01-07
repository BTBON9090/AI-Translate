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
        
        // 【解决问题 3】默认厂商改为 "builtin_glm" (速度快，体验好)
        const provider = settings.provider || 'builtin_glm'; 
        
        let modelName = settings.modelName; 
        let targetApiUrl = settings.apiUrl;
        let useBuiltIn = false;

        // --- 2. 路由逻辑 ---
        if (provider.startsWith('builtin_')) {
          console.log(`[Mode] 启用内置线路: ${provider}`);
          useBuiltIn = true;
          targetApiUrl = BUILTIN_PROXY_URL; 
          
          if (provider === 'builtin_deepseek') modelName = "deepseek-ai/DeepSeek-V3";
          else if (provider === 'builtin_glm') modelName = "glm-4-flash";
          else if (provider === 'builtin_kimi') modelName = "kimi-k2-turbo-preview";
        } 
        else {
          if (!apiKey && provider !== 'custom' && provider !== 'ollama') {
            port.postMessage({ error: "请配置 API Key，或切换到【内置免费线路】" });
            return;
          }

          // 兜底 URL
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
          
          if (!modelName) {
             if (provider === 'deepseek') modelName = "deepseek-chat";
             else if (provider === 'moonshot') modelName = "kimi-k2-turbo-preview";
             else if (provider === 'openai') modelName = "gpt-4o-mini";
          }
        }

        // --- 核心：提示词工程 ---
        
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

        // ★★★ 核心修复：判断输入文本是否包含分隔符 ★★★
        const isBatch = text.includes("|||"); 

        let systemPrompt = "";
        // 只有在 Batch 模式下，才给 AI 看分隔符示例，防止单句翻译时产生幻觉
        const batchInstruction = isBatch 
          ? `\nIMPORTANT: The input uses "|||" to separate parts. Output MUST use "|||" to separate translations. Count must match.\nExample: Hello world ||| 123 ||| Code: JS -> 你好世界 ||| 123 ||| 代码：JS`
          : ``;

        if (mode === 'precision') {
          // 精翻模式
          systemPrompt = `You are a professional translator. Translate the text to ${langName}.
Guidelines:
1. Nuance & Tone: Professional and authentic.${batchInstruction}
2. Content: Translate everything. Do not skip numbers or codes.
3. Output: Only the translated text.`;
        } else {
          // === 极速模式 ===
          systemPrompt = `Translate to ${langName}.${batchInstruction}
Rules:
1. Concise.${isBatch ? ' Keep "|||" structure.' : ''}
2. No missing parts.`;
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

            // 核心优化 2: 调整温度
            // 极速模式(0.3)更稳，精翻模式(0.7)更顺滑。原先的 1.3 太高了容易导致乱码或超时
            temperature: mode === 'precision' ? 0.6 : 0.3, 
            // 核心优化 3: 惩罚重复，防止 AI 卡住复读
            frequency_penalty: 0.2
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