

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "stream-translate") return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action === "TRANSLATE") {
      const { text, targetLang, mode } = msg; // 接收 mode 参数
      
      try {
        const settings = await chrome.storage.local.get(['apiKey', 'apiUrl', 'modelName']);
        const apiKey = settings.apiKey;
        const apiUrl = settings.apiUrl || "https://api.deepseek.com/chat/completions";
        const modelName = settings.modelName || "deepseek-chat";

        if (!apiKey) {
          port.postMessage({ error: "请在插件设置中配置 API Key" });
          return;
        }

        // --- 核心：提示词工程 (Prompt Engineering) ---
        let systemPrompt;
        // --- 核心：根据 mode 选择不同的提示词 ---
        const langName = targetLang === 'en' ? 'English' : targetLang === 'ja' ? 'Japanese' : 'Simplified Chinese';

        if (mode === 'precision') {
          // [AI 精翻模式]：强调语境、润色、通顺
          systemPrompt = `You are a professional translator and editor. 
          Translate the following text into ${langName}.
          Guidelines:
          1. Analyze the context and tone. Ensure the translation is natural and fluent.
          2. Use appropriate terminology for the subject matter.
          3. Rephrase if necessary to make it sound like a native speaker wrote it.
          4. Output ONLY the translated text, no explanations.`;
        } else {
          // [默认/快速模式]：强调直译、省 Token
          systemPrompt = `Translate into ${langName}. Keep it concise and literal. Output only the translation.`;
        }

        // --- 发送请求 ---
        // 注意：大多数模型（Kimi, Qwen, DeepSeek, OpenAI）都支持这个标准的 fetch 格式
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelName,// 模型名称
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text }
            ],
            stream: true,
            temperature: mode === 'precision' ? 1.3 : 1.0 // 精翻模式稍微增加创造性
          })
        });

        if (!response.ok) {
            const err = await response.json().catch(()=>({}));
            throw new Error(err.error?.message || err.message || response.statusText);
        }

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