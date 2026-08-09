(function initProviderCatalog(global) {
  "use strict";

  const catalog = {
    version: 20260809,
    defaultProvider: "deepseek",
    providers: {
      deepseek: {
        labelZh: "DeepSeek 官方",
        labelEn: "DeepSeek Official",
        baseUrl: "https://api.deepseek.com",
        url: "https://api.deepseek.com/chat/completions",
        modelsUrl: "https://api.deepseek.com/models",
        model: "deepseek-v4-flash",
        commonModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
        modelMigrations: {
          "deepseek-chat": "deepseek-v4-flash",
          "deepseek-reasoner": "deepseek-v4-pro"
        },
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
        modelMigrations: { "kimi-k2-turbo-preview": "kimi-k2.6" },
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
        modelMigrations: { "deepseek-ai/DeepSeek-V3": "deepseek-ai/DeepSeek-V3.2" },
        requestOptions: { temperature: 0, enable_thinking: false },
        docsUrl: "https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions"
      },
      qwen: {
        labelZh: "阿里云百炼（公共接口）",
        labelEn: "Alibaba Model Studio (Public)",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        modelsUrl: "",
        model: "qwen-plus",
        commonModels: ["qwen-plus", "qwen-max", "qwen-turbo"],
        modelMigrations: {
          "qwen3.7-max": "qwen-plus",
          "qwen3.7-plus": "qwen-plus",
          "qwen3.7-flash": "qwen-plus",
          "qwen3.6-plus": "qwen-plus",
          "qwen3.6-flash": "qwen-plus"
        },
        requestOptions: { enable_thinking: false },
        docsUrl: "https://help.aliyun.com/zh/model-studio/base-url",
        endpointNoteZh: "北京公共地址，适用于 qwen-plus 等公共模型",
        endpointNoteEn: "Beijing public endpoint for shared models such as qwen-plus"
      },
      qwen_workspace: {
        labelZh: "阿里云百炼工作空间（Qwen 3.8）",
        labelEn: "Alibaba Workspace (Qwen 3.8)",
        baseUrl: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        url: "",
        urlPlaceholder: "https://你的WorkspaceId.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
        modelsUrl: "",
        model: "qwen3.8-max",
        commonModels: ["qwen3.8-max", "qwen3.7-plus", "qwen3.7-flash"],
        modelMigrations: {},
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
        modelMigrations: { "glm-4-plus": "glm-5-turbo" },
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
        labelZh: "自定义 OpenAI 兼容接口",
        labelEn: "Custom OpenAI-compatible API",
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
