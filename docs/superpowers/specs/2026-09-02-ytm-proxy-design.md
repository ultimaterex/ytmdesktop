# YTM Desktop Proxy Support — Design

**Status:** draft for personal fork (`ultimaterex/ytmdesktop`), written so it can later be upstreamed  
**Date:** 2026-09-02  
**Upstream:** [ytmdesktop/ytmdesktop](https://github.com/ytmdesktop/ytmdesktop) @ `development` (`fd0e4a1`)

## Problem

YouTube Music performs a region/availability check early in the session. In some regions the `BrowserView` is redirected to `/premium` / `/musicpremium`, and the app already special-cases that path in `createYTMView` (`src/main/index.ts`). Routing the Music view’s network through a user-configured proxy lets personal use continue from a geo that fails the check, without forcing a system-wide VPN.

## Feasibility (probe findings)

| Finding | Detail |
| --- | --- |
| Stack | Electron 40 + Electron Forge + Vue 3 + `conf` store |
| Music surface | `BrowserView` with partition `persist:ytmview` (packaged) / `persist:ytmview-dev` (dev) |
| Existing proxy | None |
| Electron API | `session.setProxy({ mode, proxyRules, proxyBypassRules })` on that partition |
| Auth | `app.on('login', …)` when `authInfo.isProxy` — supply username/password |
| Leak risk | WebRTC can bypass HTTP proxies; mitigate with `webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` when proxy is on |
| DNS | Prefer **SOCKS5** for geo use (remote DNS via SOCKS). HTTP CONNECT proxies often resolve DNS locally and can still leak region |

**Verdict:** Feasible and a good fit. Scope proxy to the YTM partition only so settings UI, auto-updater, companion server, Last.fm, and Discord stay on the direct path.

## Goals

1. User can enable a proxy for YouTube Music traffic only.
2. Support HTTP and SOCKS5 endpoints (host + port), optional username/password.
3. Apply proxy **before** the first `music.youtube.com` navigation.
4. Changing proxy settings applies without a full app restart when possible (reload/recreate YTM view).
5. Keep the change upstream-friendly: isolated module, schema defaults, settings UI that matches existing patterns.

## Non-goals (v1)

- PAC scripts / per-host allowlists beyond Chromium `proxyBypassRules`
- System proxy auto-detect as the primary mode
- Proxying main-process Node traffic (companion API, Last.fm, Discord, updater)
- Built-in VPN / tunnel / fireproxy integration
- Automated E2E geo tests against live YouTube

## Approach (chosen)

**Partition-scoped `session.setProxy`** on the YTM `BrowserView` session.

Alternatives considered:

1. **App-wide `--proxy-server` / `defaultSession`** — simpler, but proxies settings, updater, and everything else. Rejected for personal use and for upstream.
2. **PAC that only matches `*youtube*` / `*googlevideo*`** — more selective, harder to maintain as Google hostnames change; partition scope already isolates Music.
3. **External system VPN** — works without a fork; out of scope (user wants in-app control).

## Data model

Add to `StoreSchema` (`src/shared/store/schema.ts`):

```ts
proxy: {
  enabled: boolean;
  protocol: "http" | "https" | "socks4" | "socks5";
  host: string;
  port: number;
  username: string;
  /** Encrypted via safeStorage when set; plaintext never written to disk if encryption available */
  passwordEncrypted: string | null;
  bypassRules: string; // Chromium bypass list; default "<local>"
};
```

Defaults: `enabled: false`, `protocol: "socks5"`, `host: ""`, `port: 1080`, `username: ""`, `passwordEncrypted: null`, `bypassRules: "<local>"`.

Add Conf migration `>=2.0.12` (or next app version) to ensure `proxy` exists for existing installs.

## Runtime behavior

1. Helper `getYtmSession()` → `session.fromPartition(packaged ? "persist:ytmview" : "persist:ytmview-dev")`.
2. `applyYtmProxy(store)`:
   - If disabled or host empty → `setProxy({ mode: "direct" })`.
   - Else → `setProxy({ mode: "fixed_servers", proxyRules, proxyBypassRules })` where `proxyRules` is built like `socks5://host:port` or `http://host:port`.
3. Call `applyYtmProxy` once during app ready **before** `createYTMView()` loads a URL.
4. On `store.onDidChange("proxy", …)` re-apply and reload/recreate the YTM view so the geo check sees the new egress.
5. Register `app.on("login", (event, _wc, _details, authInfo, callback) => { … })`: if `authInfo.isProxy` and credentials configured, `event.preventDefault()` and `callback(user, pass)`; else `callback()`.
6. When proxy enabled, after creating the view set `ytmView.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp")`.

Password decrypt uses existing `safeStorage` IPC patterns; if `safeStorage` unavailable, disable credential fields (same pattern as companion server).

## UI

New **Network** sidebar tab in `Settings.vue` (tab id `6`):

- Enable proxy (checkbox)
- Protocol (select) — extend `YTMDSetting` select or use string enum mapped to numbers carefully; prefer adding a `text`/`password` type to `YTMDSetting` for host/username/password and keep protocol as select
- Host, port
- Username, password (password input; only when safeStorage available)
- Bypass rules (advanced text; default `<local>`)
- Short description: “Applies only to YouTube Music. SOCKS5 recommended for region checks.”

Live apply on change; show restart banner only if apply/reload fails (prefer reload).

## Security / privacy

- Encrypt proxy password at rest with `safeStorage` when available.
- Do not log password or full `proxyRules` with credentials (Chromium rules do not embed user/pass anyway).
- Document that this is for lawful personal access to a service the user is entitled to use; fork is personal-first.

## Testing strategy

No unit test runner in upstream today. Add a tiny pure helper tested with Node’s built-in `node:test` / `node:assert` for `buildProxyRules` / config validation. Manual checklist for Electron:

1. Proxy off → Music loads as today.
2. SOCKS5 to a known egress → `https://music.youtube.com` loads; geo redirect to `/premium` no longer trips (or trips less) depending on egress region.
3. Bad host → view shows load error / timeout paths already in the app.
4. Auth proxy → `login` supplies credentials; wrong password fails predictably.
5. Settings window / companion still work without going through the proxy.

## Upstream notes

- Keep feature behind clear settings; default off.
- Avoid rewriting `createYTMView`; call one apply helper next to existing partition permission handlers.
- GPL-3.0 — fork remains GPL; upstream PR should be a focused Network settings + main-process helper.
