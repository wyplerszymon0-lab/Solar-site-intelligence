// ─── What "Clear" forgets ───────────────────────────────────
// The page restores the last dataset from localStorage on every visit, and a
// share link carries a dataset in the URL hash. Clear removes both, so a reload
// stays empty, and keeps the visitor's own settings and saved analyses.
// Works in the browser (window.SiteSession) and in Node (require).

(function (root) {
  const LAST_SESSION_KEY = 'solarSite.lastSession';
  // Left alone on purpose: saved analyses, the remembered API key, language, system losses.
  const KEPT_KEYS = ['solarSite.history', 'solarSite.apiKey', 'solarSite.lang', 'solarSite.systemLossPct', 'solarSite.crs'];

  /**
   * Forget the auto-restored dataset. `storage` is localStorage-like, `loc` and
   * `hist` are location/history-like (all injectable for tests). Storage errors
   * (private mode, blocked site data) are ignored. Returns what was removed.
   */
  function forgetSession(storage, loc, hist) {
    let removedSession = false;
    try {
      removedSession = storage.getItem(LAST_SESSION_KEY) !== null;
      storage.removeItem(LAST_SESSION_KEY);
    } catch { /* storage unavailable */ }

    let clearedShareLink = false;
    if (loc && typeof loc.hash === 'string' && loc.hash.startsWith('#s=')) {
      hist.replaceState(null, '', loc.pathname + loc.search);
      clearedShareLink = true;
    }
    return { removedSession, clearedShareLink };
  }

  const api = { forgetSession, LAST_SESSION_KEY, KEPT_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiteSession = api;
})(typeof window !== 'undefined' ? window : globalThis);
