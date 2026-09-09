/* Runs in both popup and worker. Model discovery must not depend on a worker message receiver. */
(function (global) {
  'use strict';
  const catalog = () => global.AI_TRANSLATE_PROVIDER_CATALOG.providers;
  const protocolAPI = () => global.AITranslateProtocol;
  class ConnectionError extends Error {
    constructor(code, detail = {}) { super(code); this.name = 'ConnectionError'; this.code = code; Object.assign(this, detail); }
  }
  function resolve(settings, requireModel = false) {
    const provider = settings.provider || global.AI_TRANSLATE_PROVIDER_CATALOG.defaultProvider;
    const defaults = catalog()[provider] || catalog().custom;
    const protocol = settings.protocol || defaults.protocol || 'openai';
    let apiUrl;
    try { apiUrl = defaults.isBuiltin ? defaults.url : protocolAPI().endpoint(settings.apiUrl || defaults.url || defaults.baseUrl, protocol); }
    catch { throw new ConnectionError('INVALID_URL'); }
    const apiKey = defaults.isBuiltin ? '' : String(settings.apiKey || '').trim();
    const model = settings.modelName || defaults.model || '';
    if (!apiKey && !defaults.isBuiltin && provider !== 'custom') throw new ConnectionError('KEY_REQUIRED');
    if (requireModel && !model) throw new ConnectionError('MODEL_REQUIRED');
    return { provider, defaults, protocol, apiUrl, apiKey, model };
  }
  // Match the actual endpoint, not the selected label. Never send credentials to a second origin.
  function endpointProvider(apiUrl) {
    const target = new URL(apiUrl);
    for (const [id, provider] of Object.entries(catalog())) {
      if (!provider.url || provider.isBuiltin) continue;
      const known = new URL(provider.url);
      if (known.origin !== target.origin) continue;
      for (const protocol of ['openai', 'anthropic', 'responses']) {
        if (protocolAPI().endpoint(known.href, protocol) === protocolAPI().endpoint(target.href, protocol)) return id;
      }
    }
    return null;
  }
  function modelEndpoints(config) {
    const p = protocolAPI();
    const urls = [p.modelsUrl(config.apiUrl, config.protocol)];
    const id = endpointProvider(config.apiUrl), defaults = id && catalog()[id];
    if (defaults?.modelsUrl && new URL(defaults.modelsUrl).origin === new URL(config.apiUrl).origin) urls.push(defaults.modelsUrl);
    return [...new Set(urls)];
  }
  async function requestJSON(url, options, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, 15000);
    let reader;
    try {
      const response = await fetch(url, { ...options, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) throw new ConnectionError([401, 403].includes(response.status) ? 'AUTH' : [404, 405, 501].includes(response.status) ? 'UNSUPPORTED' : 'HTTP', { status: response.status, url });
      if (!response.body) throw new ConnectionError('FORMAT', { url });
      reader = response.body.getReader();
      const decoder = new TextDecoder(); let text = '', bytes = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new ConnectionError('TOO_LARGE', { url });
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      try { return JSON.parse(text); } catch { throw new ConnectionError('FORMAT', { url }); }
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (timedOut) throw new ConnectionError('TIMEOUT', { url });
      if (error instanceof ConnectionError) throw error;
      throw new ConnectionError('NETWORK', { url });
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (reader) { try { await reader.cancel(); } catch {} }
    }
  }
  async function discover(settings, { signal } = {}) {
    const config = resolve(settings);
    if (config.defaults.isBuiltin) return { models: config.defaults.commonModels, source: 'builtin' };
    let lastError;
    for (const candidate of modelEndpoints(config)) {
      const url = new URL(candidate), models = new Set(), cursors = new Set();
      let partial = false;
      try {
        for (let page = 0; page < 20; page++) {
          const auth = candidate === modelEndpoints(config)[0] ? config.protocol : 'openai';
          const data = await requestJSON(url.href, { headers: protocolAPI().headers(config.apiKey, auth) }, signal);
          if (data.error) throw new ConnectionError('API_ERROR', { url: url.href });
          const list = Array.isArray(data) ? data : data.data || data.models;
          if (!Array.isArray(list)) throw new ConnectionError('FORMAT', { url: url.href });
          for (const model of list) { const id = typeof model === 'string' ? model : model?.id || model?.name; if (typeof id === 'string' && id.length < 300 && id.trim()) models.add(id); }
          if (!data.has_more) break;
          if (!data.last_id || cursors.has(data.last_id) || page === 19) { partial = true; break; }
          cursors.add(data.last_id); url.searchParams.set('after_id', data.last_id); url.searchParams.set('limit', '1000');
        }
        if (!models.size) throw new ConnectionError('EMPTY', { url: candidate });
        return { models: [...models].sort(), source: 'api', url: candidate, partial };
      } catch (error) {
        lastError = error;
        // Do not hide authorization, quota, timeout or network errors by trying unrelated endpoints.
        if (!['UNSUPPORTED', 'FORMAT', 'EMPTY'].includes(error.code)) throw error;
      }
    }
    const id = endpointProvider(config.apiUrl), defaults = id && catalog()[id];
    if (defaults?.commonModels?.length) return { models: defaults.commonModels, source: 'catalog', url: lastError.url, reason: lastError.code, status: lastError.status, docsUrl: defaults.docsUrl };
    throw lastError;
  }
  async function probe(settings, { signal } = {}) {
    const config = resolve(settings, true);
    const options = { ...config.defaults.requestOptions, ...config.defaults.modelRequestOptions?.[config.model] };
    const body = protocolAPI().body({ ...config, system: 'Reply only with OK.', text: 'Connection test.', requestOptions: options });
    body.stream = false;
    if (config.protocol === 'responses') body.max_output_tokens = 32;
    else if (config.protocol === 'anthropic') body.max_tokens = 32;
    else if (/^(gpt-5|gpt-6|o\d)/.test(config.model)) body.max_completion_tokens = 32;
    else body.max_tokens = 32;
    let data;
    try { data = await requestJSON(config.apiUrl, { method: 'POST', headers: protocolAPI().headers(config.apiKey, config.protocol), body: JSON.stringify(body) }, signal); }
    catch (error) { if (error.code === 'UNSUPPORTED') error.code = 'MODEL_ENDPOINT'; throw error; }
    if (data.error || data.type === 'error' || data.status === 'failed') throw new ConnectionError('API_ERROR', { url: config.apiUrl });
    const recognized = config.protocol === 'responses' ? Array.isArray(data.output) : config.protocol === 'anthropic' ? Array.isArray(data.content) : Array.isArray(data.choices) && data.choices.length > 0;
    if (!recognized) throw new ConnectionError('FORMAT', { url: config.apiUrl });
    return { ok: true, model: config.model, url: config.apiUrl };
  }
  function describe(error, lang = 'zh') {
    const en = lang === 'en';
    const messages = {
      INVALID_URL: ['请输入有效的 HTTPS API 地址；localhost 可使用 HTTP。', 'Enter a valid HTTPS API URL; localhost may use HTTP.'],
      KEY_REQUIRED: ['请填写与当前地址配套的 API Key。', 'Enter the API key issued for this endpoint.'],
      MODEL_ENDPOINT: ['模型调用地址不可用，请核对协议和完整 API 地址。', 'The model endpoint is unavailable. Check the protocol and full API URL.'],
      MODEL_REQUIRED: ['请先选择或填写模型 ID。', 'Choose or enter a model ID first.'],
      AUTH: ['服务商拒绝认证或访问。请核对 Key、计费方案、地域及模型权限。', 'The provider rejected authentication or access. Check the key, plan, region and model permissions.'],
      UNSUPPORTED: ['该地址不提供模型列表。可手动填写 ID，再测试模型连接。', 'This endpoint does not provide a model list. Enter an ID and test the model connection.'],
      FORMAT: ['接口返回格式不符合协议。请核对 API 地址和协议；可手动填写模型 ID。', 'Unexpected response format. Check the API URL and protocol; you can enter a model ID manually.'],
      EMPTY: ['接口返回的模型列表为空。可手动填写模型 ID。', 'The API returned an empty model list. You can enter an ID manually.'],
      TIMEOUT: ['服务商响应超时，请检查网络后重试。', 'The provider timed out. Check the network and retry.'],
      NETWORK: ['无法访问服务商，请检查网络、代理、地址及浏览器权限。', 'Cannot reach the provider. Check network, proxy, URL and browser permissions.'],
      TOO_LARGE: ['模型列表过大，已停止读取。', 'The model list is too large. Reading was stopped.'],
      API_ERROR: ['服务商返回 API 错误，请检查账号额度和模型配置。', 'The provider returned an API error. Check quota and model settings.'],
      HTTP: ['服务商请求失败，请稍后重试。', 'The provider request failed. Please retry later.']
    };
    const message = (messages[error.code] || messages.NETWORK)[en ? 1 : 0];
    return `${error.status ? `HTTP ${error.status} · ` : ''}${message}`;
  }
  global.AITranslateConnection = { resolve, discover, probe, describe, modelEndpoints, endpointProvider, ConnectionError };
})(globalThis);
