// Security Stage 4: the "testing only" hooks (window.__tb, __tbLink, __hints, __say) are for tests that open the game from this computer. On the real site
// they are not there (they gave anybody with the browser's console a handle on the game's insides). They exist when the page is opened from localhost
// or a file, or with ?debug in the address.
export const TESTING = (() => {
  try {
    const h = location.hostname;
    return h === '' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || new URLSearchParams(location.search).has('debug');
  } catch (e) { return false; }
})();
