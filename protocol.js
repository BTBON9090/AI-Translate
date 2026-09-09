/* Shared by the service worker and popup. Never infer credentials from a provider label. */
(function (global) {
  'use strict';
  const paths = { openai: '/chat/completions', anthropic: '/messages', responses: '/responses' };
  function endpoint(value, protocol = 'openai') {
    if (!paths[protocol]) throw new Error('Unsupported protocol / 不支持的协议');
    const url = new URL(String(value).trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
      throw new Error('Use HTTPS (localhost HTTP allowed) / 请使用 HTTPS');
    }
    let path = url.pathname.replace(/\/+$/, '');
    const alibaba = /(^|\.)(?:dashscope(?:-intl|-us)?\.aliyuncs\.com|maas\.aliyuncs\.com)$/.test(url.hostname);
    if (alibaba && protocol === 'anthropic' && /^\/compatible-mode\/v1(?:\/chat\/completions)?$/.test(path)) path = '/apps/anthropic/v1/messages';
    if (alibaba && protocol === 'openai' && /^\/apps\/anthropic(?:\/v1(?:\/messages)?)?$/.test(path)) path = '/compatible-mode/v1/chat/completions';
    if (url.hostname === 'api.deepseek.com') {
      if (protocol === 'anthropic' && /^\/(?:v1\/)?(?:chat\/completions|responses)$/.test(path)) path = '/anthropic/v1/messages';
      if (protocol !== 'anthropic' && /^\/anthropic(?:\/v1(?:\/messages)?)?$/.test(path)) path = paths[protocol];
    }
    if (!/\/(chat\/completions|messages|responses)$/.test(path)) {
      if (!path) path = '/v1';
      if (protocol === 'anthropic' && path.endsWith('/anthropic')) path += '/v1';
      path += paths[protocol];
    } else {
      path = path.replace(/\/(chat\/completions|messages|responses)$/, paths[protocol]);
    }
    url.pathname = path;
    return url.href;
  }
  function modelsUrl(value, protocol) {
    const url = new URL(endpoint(value, protocol));
    url.pathname = url.pathname.replace(/\/(chat\/completions|messages|responses)$/, '/models');
    return url.href;
  }
  function headers(apiKey, protocol) {
    const h = { 'Content-Type': 'application/json' };
    if (protocol === 'anthropic') {
      h['anthropic-version'] = '2023-06-01';
      h['anthropic-dangerous-direct-browser-access'] = 'true';
      if (apiKey) h['x-api-key'] = apiKey;
    } else if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    return h;
  }
  function body({ protocol, model, system, text, requestOptions = {} }) {
    if (protocol === 'responses') return { model, instructions: system, input: text, stream: true, store: false };
    if (protocol === 'anthropic') return { model, system, max_tokens: 8192, messages: [{ role: 'user', content: text }], stream: true };
    return { ...requestOptions, model, messages: [{ role: 'system', content: system }, { role: 'user', content: text }], stream: true };
  }
  global.AITranslateProtocol = { endpoint, modelsUrl, headers, body };
})(globalThis);
