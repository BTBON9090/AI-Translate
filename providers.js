(function initProviderCatalog(global) {
  "use strict";

  const catalog = {
    version: 20260909,
    defaultProvider: "deepseek",
    providers: {
      openai: {
        labelZh: "OpenAI 官方", labelEn: "OpenAI Official",
        baseUrl: "https://api.openai.com/v1", url: "https://api.openai.com/v1/chat/completions",
        modelsUrl: "https://api.openai.com/v1/models", protocol: "openai",
        model: "gpt-4.1-mini", commonModels: ["gpt-4.1-mini", "gpt-5-mini", "gpt-5.6-luna"],
        requestOptions: {}, docsUrl: "https://developers.openai.com/api/docs/models"
      },
      anthropic: {
        labelZh: "Anthropic 官方", labelEn: "Anthropic Official",
        baseUrl: "https://api.anthropic.com/v1", url: "https://api.anthropic.com/v1/messages",
        modelsUrl: "https://api.anthropic.com/v1/models", protocol: "anthropic",
        model: "claude-haiku-4-5-20251001", commonModels: ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5"],
        requestOptions: {}, docsUrl: "https://platform.claude.com/docs/en/api/models-list"
      },
      qwen_international: {
        labelZh: "阿里云百炼 · 新加坡公共接口", labelEn: "Alibaba · Singapore public endpoint",
        baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        modelsUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
        model: "qwen-plus", commonModels: ["qwen-plus", "qwen-turbo", "qwen-max"],
        requestOptions: { enable_thinking: false }, docsUrl: "https://help.aliyun.com/zh/model-studio/base-url",
        endpointNoteZh: "请使用新加坡地域的 API Key；可编辑为其他地域专属地址。",
        endpointNoteEn: "Use a Singapore API key; edit the URL for other regions."
      },
      deepseek: {
        labelZh: "DeepSeek 官方",
        labelEn: "DeepSeek Official",
        baseUrl: "https://api.deepseek.com",
        url: "https://api.deepseek.com/chat/completions",
        modelsUrl: "https://api.deepseek.com/models",
        model: "deepseek-v4-flash",
        commonModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
        requestOptions: { temperature: 0, thinking: { type: "disabled" } },
        docsUrl: "https://api-docs.deepseek.com/"
      },
      moonshot: {
        labelZh: "Kimi（月之暗面官方）",
        labelEn: "Kimi (Moonshot Official)",
        baseUrl: "https://api.moonshot.cn/v1",
        url: "https://api.moonshot.cn/v1/chat/completions",
        modelsUrl: "https://api.moonshot.cn/v1/models",
        model: "kimi-k3",
        commonModels: ["kimi-k3", "kimi-k2.7-code-highspeed", "kimi-k2.7-code", "kimi-k2.6", "kimi-k2.5", "moonshot-v1-auto"],
        requestOptions: {},
        modelRequestOptions: {
          "kimi-k3": { reasoning_effort: "low" },
          "kimi-k2.6": { thinking: { type: "disabled" } },
          "kimi-k2.5": { thinking: { type: "disabled" } }
        },
        docsUrl: "https://platform.kimi.com/docs/api/chat"
      },
      siliconflow: {
        labelZh: "硅基流动 SiliconFlow",
        labelEn: "SiliconFlow",
        baseUrl: "https://api.siliconflow.cn/v1",
        url: "https://api.siliconflow.cn/v1/chat/completions",
        modelsUrl: "https://api.siliconflow.cn/v1/models?type=text&sub_type=chat",
        model: "deepseek-ai/DeepSeek-V3.2",
        commonModels: [
          "deepseek-ai/DeepSeek-V3.2",
          "Pro/deepseek-ai/DeepSeek-V3.2",
          "Pro/zai-org/GLM-5",
          "Pro/zai-org/GLM-4.7",
          "Qwen/Qwen3.5-35B-A3B"
        ],
        requestOptions: { temperature: 0, enable_thinking: false },
        docsUrl: "https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions"
      },
      qwen: {
        labelZh: "阿里云百炼 · 北京公共接口",
        labelEn: "Alibaba Model Studio (Public)",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        modelsUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
        model: "qwen-plus",
        commonModels: ["qwen-plus", "qwen-max", "qwen-turbo"],
        requestOptions: { enable_thinking: false },
        docsUrl: "https://help.aliyun.com/zh/model-studio/base-url",
        endpointNoteZh: "北京公共地址，适用于 qwen-plus 等公共模型",
        endpointNoteEn: "Beijing public endpoint for shared models such as qwen-plus"
      },
      qwen_workspace: {
        labelZh: "阿里云百炼 · 工作空间专属",
        labelEn: "Alibaba · Dedicated workspace",
        baseUrl: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        url: "",
        urlPlaceholder: "https://你的WorkspaceId.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
        modelsUrl: "",
        model: "qwen3.8-max",
        commonModels: ["qwen3.8-max", "qwen3.7-plus", "qwen3.7-flash"],
        requestOptions: { enable_thinking: false },
        requiresCustomUrl: true,
        docsUrl: "https://help.aliyun.com/zh/model-studio/getting-started/models",
        endpointNoteZh: "需填写百炼工作空间专属 Chat Completions 地址，不能使用公共 Base URL",
        endpointNoteEn: "Requires your workspace Chat Completions URL; the public Base URL is not supported"
      },
      zhipu: {
        labelZh: "智谱 AI 开放平台",
        labelEn: "Zhipu AI Official",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        modelsUrl: "",
        model: "glm-5-turbo",
        commonModels: ["glm-5.2", "glm-5.1", "glm-5-turbo", "glm-5", "glm-4.7-flash", "glm-4.7-flashx"],
        requestOptions: { thinking: { type: "disabled" }, do_sample: false },
        docsUrl: "https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8"
      },
      zhipu_free: {
        labelZh: "内置免费代理（非官方直连）",
        labelEn: "Built-in Free Proxy (Unofficial)",
        baseUrl: "https://1317980685-d62rkq4tfd.ap-guangzhou.tencentscf.com",
        url: "https://1317980685-d62rkq4tfd.ap-guangzhou.tencentscf.com",
        modelsUrl: "",
        model: "glm-4-flash",
        commonModels: ["glm-4-flash"],
        requestOptions: { temperature: 0 },
        isBuiltin: true,
        isOfficial: false,
        endpointNoteZh: "项目自有代理，不属于智谱官方免费接口",
        endpointNoteEn: "Project proxy; not an official free Zhipu endpoint"
      },
      custom: {
        labelZh: "自定义接口",
        labelEn: "Custom API",
        baseUrl: "",
        url: "",
        modelsUrl: "",
        model: "",
        commonModels: [],
        requestOptions: { temperature: 0 },
        isOfficial: false
      }
    }
  };

  global.AI_TRANSLATE_PROVIDER_CATALOG = Object.freeze(catalog);
})(globalThis);
