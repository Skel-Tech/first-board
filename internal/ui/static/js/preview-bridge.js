const CHANNEL = "grok-preview-bridge";
const VERSION = 1;
const ROOT = "__grokPreviewBridgeRoot";

function safeOrigin(value) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function grokHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "grok.com" || host.endsWith(".grok.com") || host === "localhost" || host === "127.0.0.1";
}

function parentOrigin() {
  if (window.parent === window) return null;
  const guest = window.location.hostname.toLowerCase();
  const candidates = [document.referrer];
  if (location.ancestorOrigins && location.ancestorOrigins.length) candidates.push(location.ancestorOrigins[0]);
  for (const candidate of candidates) {
    if (!candidate) continue;
    const url = safeOrigin(candidate);
    if (!url) continue;
    if (grokHost(url.hostname)) return url.origin;
    if (guest === "grok-sandbox.com" || guest.endsWith(".grok-sandbox.com")) return url.origin;
  }
  return null;
}

function safePath(path) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  try {
    const resolved = new URL(path, "https://preview.invalid");
    return resolved.origin === "https://preview.invalid";
  } catch {
    return false;
  }
}

const origin = parentOrigin();
if (origin) {
  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);
  const isRoot = () => {
    const state = history.state;
    return Boolean(state && typeof state === "object" && state[ROOT] === true);
  };
  try {
    const current = history.state;
    const tagged = current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT);
    if (!tagged) {
      const marked = current && typeof current === "object" ? { ...current } : {};
      marked[ROOT] = history.length <= 1;
      originalReplace(marked, "", location.href);
    }
  } catch {
    /* ignore */
  }
  const post = (message) => window.parent.postMessage(message, origin);
  const report = () => {
    post({
      channel: CHANNEL,
      version: VERSION,
      type: "location",
      path: location.pathname || "/",
      search: location.search,
      hash: location.hash,
    });
  };
  const announce = () => {
    report();
    post({
      channel: CHANNEL,
      version: VERSION,
      type: "routes",
      paths: ["/", "/drills", "/play", "/account", "/learn/board", "/learn/pawns", "/learn/mate"],
    });
    post({ channel: CHANNEL, version: VERSION, type: "ready" });
  };
  history.pushState = (data, unused, url) => {
    const next = data && typeof data === "object" ? { ...data, [ROOT]: false } : data;
    originalPush(next, unused, url);
    report();
  };
  history.replaceState = (data, unused, url) => {
    const next = isRoot()
      ? { ...(data && typeof data === "object" ? data : {}), [ROOT]: true }
      : data;
    originalReplace(next, unused, url);
    report();
  };
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== origin) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL || data.version !== VERSION) return;
    if (data.type === "hello") announce();
    if (data.type === "navigate" && typeof data.path === "string" && safePath(data.path)) {
      const url = new URL(data.path, location.origin);
      history.pushState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    if (data.type === "history" && (data.delta === 1 || data.delta === -1)) {
      if (data.delta === -1 && isRoot()) return;
      history.go(data.delta);
    }
  });
  window.addEventListener("popstate", report);
  window.addEventListener("hashchange", report);
  announce();
}
