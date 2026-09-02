// Keep in sync with sibling .ts/.mjs

/** @typedef {"http"|"https"|"socks4"|"socks5"} ProxyProtocol */

/**
 * @param {{ enabled: boolean, protocol: ProxyProtocol, host: string, port: number, bypassRules: string }} input
 */
export function isProxyConfigured(input) {
  const host = (input.host ?? "").trim();
  const port = Number(input.port);
  return Boolean(input.enabled && host && Number.isInteger(port) && port > 0 && port <= 65535);
}

/**
 * @param {{ enabled: boolean, protocol: ProxyProtocol, host: string, port: number, bypassRules: string }} input
 * @returns {{ mode: string, proxyRules?: string, proxyBypassRules?: string }}
 */
export function buildElectronProxyConfig(input) {
  if (!isProxyConfigured(input)) {
    return { mode: "direct" };
  }
  const host = input.host.trim();
  const protocol = input.protocol;
  return {
    mode: "fixed_servers",
    proxyRules: `${protocol}://${host}:${Number(input.port)}`,
    proxyBypassRules: (input.bypassRules ?? "").trim() || "<local>"
  };
}
