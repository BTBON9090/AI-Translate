// --- START OF FILE background.js ---

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

// 你的腾讯云代理地址 (确保末尾有 /proxy)
const BUILTIN_PROXY_URL = "https://https://translate-deepseek-7dgwa0a2a0e41-1317980685.ap-shanghai.app.tcloudbase.com/vip-server";

// 默认 API 地址 (改为 Kimi)
const DEFAULT_API_URL = "https://api.moonshot.cn/v1/chat/completions";
const DEFAULT_MODEL = "kimi-k2-turbo-preview";
const DEFAULT_PROVIDER = "moonshot"; // 默认厂商改为 moonshot

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "stream-translate") return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action === "TRANSLATE") {
      const { text, targetLang, mode, traceId } = msg;
      
      // --- 1. 缓存命中检查 (只针对短文本 & 极速模式) ---
      // 精翻模式通常需要上下文，所以不走缓存或者谨慎走
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
          'apiKey', 'apiUrl', 'modelName', 'provider',
          'licenseKey', 'installTimestamp'
        ]);
        
        // 确保有 installTimestamp (防止意外)
        const installTime = settings.installTimestamp || Date.now();

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

        // ★★★ 核心修复 1: 更加直观的 One-Shot 示例 ★★★
        // 明确展示：输入是"英文"，输出"只有中文"，绝对不带英文
        const batchExample = isBatch 
          ? `\nExample Input:  Home ||| Contact Us\nExample Output: 首页 ||| 联系我们`
          : ``;

        // ★★★ 核心修复 2: 负面约束 (Negative Constraints) ★★★
        // 增加了 "Do NOT repeat original text" (绝不重复原文)
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

        // === 修正 3：构建请求头 ===
        const headers = {
          "Content-Type": "application/json"
        };
        
        // 只有【不是】内置模式时，才发送 Key
        // 内置模式下，Key 在腾讯云后台，前端不发，防止泄露
        if (!useBuiltIn) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        // 打印日志，方便你在 Service Worker 控制台看 AI 到底回了什么垃圾
        console.log(`[Prompt] Mode:${mode} | Batch:${isBatch} | Target:${langName}`);

        const response = await fetch(targetApiUrl, {
          method: "POST", headers: headers,
          body: JSON.stringify({
            model: modelName, traceId: traceId,
            // 【解决问题 4】增加激活码校验
            licenseKey: settings.licenseKey || '',
            installTimestamp: installTime,// 告诉云端我是什么时候装的
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ],
            stream: true,

            // 核心优化 2: 调整温度
            // 极速模式(0.3)更稳，精翻模式(0.7)更顺滑。原先的 1.3 太高了容易导致乱码或超时
            temperature: mode === 'precision' ? 0.4 : 0.4, 
            // 核心优化 3: 惩罚重复，防止 AI 卡住复读
            frequency_penalty: 0.5
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
            // 兼容性处理：有的代理返回可能不带 "data: "，或者格式略有不同
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
                fullTranslation += content; // 【新增】把碎片拼起来
                port.postMessage({ action: "CHUNK", content: content }); // 发给前端
              }
            } catch (e) {
               // 忽略非 JSON 行
            }
          }
        }
        // --- 3. 请求结束后，写入缓存 (关键步骤) ---
        // 只有翻译成功、且原文比较短 (UI元素/短句) 时才缓存，长文章不缓存占内存
        if (text.length <= CACHE_MAX_LENGTH && fullTranslation.trim()) {
           console.log("💾 写入缓存:", text, "->", fullTranslation);
           
           // LRU 简单实现：如果缓存满了 (500条)，删掉最早存进去的一个
           if (translationCache.size >= CACHE_LIMIT) {
             const firstKey = translationCache.keys().next().value;
             translationCache.delete(firstKey);
           }
           
           translationCache.set(cacheKey, fullTranslation);
           saveCacheToLocal(); // 保存到本地存储，下次打开浏览器还有效
        }

        port.postMessage({ action: "DONE" });

      } catch (error) {
        port.postMessage({ error: error.message });
      }
    }
  });
});