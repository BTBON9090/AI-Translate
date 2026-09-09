# 服务商与协议核对（2026-09-10）

模型检测只向用户填写的服务地址发起模型列表请求，不消耗生成 token。列表按接口原样返回 ID；它不能证明每个模型都支持当前协议或当前账号有推理额度。已知官方接口不提供列表时显示“官方参考模型，未验证 Key”，保留手动填写入口；认证或网络错误不会伪装成检测成功。检测直接在扩展面板中运行，不依赖后台消息接收端。单独点击“测试此模型连接（少量用量）”才会产生限额 32 输出 token 的探测请求。用户保存的模型 ID 不会自动替换为其他模型。

| 服务商 | Base URL / 配置 | 官方依据 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | [Models](https://developers.openai.com/api/reference/resources/models/methods/list)、[Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses) |
| Anthropic | `https://api.anthropic.com/v1` | [Models](https://platform.claude.com/docs/en/api/models-list)、[Messages streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) |
| DeepSeek | `https://api.deepseek.com`（保留官方完整端点） | [接入](https://api-docs.deepseek.com/)、[Models](https://api-docs.deepseek.com/api/list-models/) |
| Kimi | `https://api.moonshot.cn/v1` | [API 概述](https://platform.kimi.com/docs/api/overview)、[Models](https://platform.kimi.com/docs/api/list-models) |
| SiliconFlow | `https://api.siliconflow.cn/v1` | [Models](https://docs.siliconflow.cn/cn/api-reference/models/get-model-list) |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | [GLM API 示例](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2) |
| 百炼 / 千问 · Token Plan 套餐 | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`；Anthropic Base URL 为同域名的 `/apps/anthropic` | [Base URL 总览](https://help.aliyun.com/zh/model-studio/base-url)、[套餐参考模型与适用范围](https://help.aliyun.com/zh/model-studio/token-plan-personal-overview) |
| 百炼 / 千问 · 北京公共接口 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | [Base URL 总览](https://help.aliyun.com/zh/model-studio/base-url) |
| 百炼 / 千问 · 新加坡公共接口 | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | [Base URL 总览](https://help.aliyun.com/zh/model-studio/base-url) |
| 百炼 / 千问 · 工作空间 | `https://{WorkspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1`，需在控制台复制真实地址 | [地域及接入域名](https://help.aliyun.com/zh/model-studio/beijing-access-information)、[首次调用](https://help.aliyun.com/zh/model-studio/first-api-call-to-qwen) |

千问是模型系列；百炼提供其 API。Qwen 官网的 [API 页面](https://qwen.ai/apiplatform) 与 [Qwen 官方开发文档](https://qwen.readthedocs.io/en/stable/framework/function_call.html) 也涉及部署和其他服务入口，不能将网站域名直接当成 API 地址。插件分别提供百炼公共及工作空间配置，也允许填写其他实际模型服务 URL。各地域、计费方案的 API Key 不可混用；Coding Plan 地址不作为普通翻译预设。

OpenAI Chat Completions、Anthropic Messages、OpenAI Responses 的请求体、鉴权头和流事件分别处理。切换协议会替换端点路径，但服务商仍需支持所选协议；例如百炼 Anthropic 兼容服务使用另外的 `/apps/anthropic` 路径，插件会对已知官方域名自动切换该路径；其他地址需按文档填写对应协议的完整端点。API Key 不被发往未经用户配置的模型服务，重定向被禁用。

内置免费入口保留为项目原有的非官方代理，不冒充智谱官方接口。

Token Plan 的套餐 Key 与按量付费 Key 不可混用；模型权限以所购套餐为准。其官方文档限定在受支持的编程/智能体工具中交互式使用，不适用于非交互式批量调用。本插件提供地址配置与协议连接能力，不代表套餐允许任意应用或自动网页翻译；自动翻译应使用适合该场景的按量付费接口。

`Could not establish connection. Receiving end does not exist.` 是扩展内部消息无接收端的错误，不是服务商 HTTP 错误。旧后台与新面板混用、后台未加载等场景可能出现。本次回归使用无消息监听器的独立扩展复现该错误，并验证模型检测仍可完成。
