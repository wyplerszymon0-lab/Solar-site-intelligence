// ─── Claude API request for reports with the visitor's own key ───
// The models the Configuration panel offers, and the body of a request sent from the
// browser straight to the Claude API (issue #47). Kept out of app.js so it can be tested
// in Node. Works in the browser (window.ClaudeRequest) and in Node (require).

(function (root) {
  // Current generation (Anthropic's model table, November 2026). Prices in USD per million
  // input / output tokens; the Haiku price holds for prompts up to 100K tokens, which a
  // site report never reaches.
  const MODELS = [
    { id: 'claude-opus-5-5', key: 'opus', price: [4, 20], refusalFallback: true },
    { id: 'claude-sonnet-5-5', key: 'sonnet', price: [2, 10], refusalFallback: true, default: true },
    { id: 'claude-haiku-5-5', key: 'haiku', price: [0.1, 0.5], refusalFallback: false },
  ];
  const DEFAULT_MODEL = MODELS.find(m => m.default).id;

  // All three think adaptively when `thinking` is left out, and thinking tokens count
  // against max_tokens, so the cap leaves room for both the thinking and the report.
  // Nothing else is set on purpose: `thinking: {type: "disabled"}`, `budget_tokens`,
  // sampling parameters and an assistant prefill are all rejected by these models.
  const MAX_TOKENS = 16000;

  // headers and body for POST https://api.anthropic.com/v1/messages. Unknown models are
  // refused rather than sent.
  function directRequest(apiKey, modelId, system, messages) {
    const model = MODELS.find(m => m.id === modelId);
    if (!model) throw new Error(`unknown model: ${modelId}`);
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    const body = { model: model.id, max_tokens: MAX_TOKENS, stream: true, system, messages };
    if (model.refusalFallback) {
      // If the model's safety classifiers decline, the API re-runs the request on the
      // model Anthropic recommends for that kind of refusal. Haiku 5.5 has no
      // server-side fallback; its refusals are reported as an error.
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }
    return { url: 'https://api.anthropic.com/v1/messages', headers, body };
  }

  const api = { MODELS, DEFAULT_MODEL, MAX_TOKENS, directRequest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClaudeRequest = api;
})(typeof window !== 'undefined' ? window : globalThis);
