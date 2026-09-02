import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// During early iteration, duplicate the pure functions in this .mjs OR
// run after compiling. Prefer implementing the pure helper as .mjs-importable
// by keeping logic in build-proxy-config.ts and a thin .mjs re-export for tests.
// Simplest path for this repo: implement + test in .mjs, re-export from .ts.

import {
  buildElectronProxyConfig,
  isProxyConfigured
} from "./build-proxy-config.mjs";

test("disabled => direct mode", () => {
  const cfg = buildElectronProxyConfig({
    enabled: false,
    protocol: "socks5",
    host: "127.0.0.1",
    port: 1080,
    bypassRules: "<local>"
  });
  assert.equal(cfg.mode, "direct");
});

test("socks5 rules", () => {
  const cfg = buildElectronProxyConfig({
    enabled: true,
    protocol: "socks5",
    host: "10.0.0.2",
    port: 1080,
    bypassRules: "<local>"
  });
  assert.equal(cfg.mode, "fixed_servers");
  assert.equal(cfg.proxyRules, "socks5://10.0.0.2:1080");
  assert.equal(cfg.proxyBypassRules, "<local>");
});

test("http rules", () => {
  const cfg = buildElectronProxyConfig({
    enabled: true,
    protocol: "http",
    host: "proxy.example",
    port: 8080,
    bypassRules: "<local>;*.lan"
  });
  assert.equal(cfg.proxyRules, "http://proxy.example:8080");
  assert.equal(cfg.proxyBypassRules, "<local>;*.lan");
});

test("enabled but empty host => direct", () => {
  assert.equal(
    isProxyConfigured({
      enabled: true,
      protocol: "socks5",
      host: "  ",
      port: 1080,
      bypassRules: "<local>"
    }),
    false
  );
});

test("invalid port => direct / not configured", () => {
  assert.equal(
    isProxyConfigured({
      enabled: true,
      protocol: "socks5",
      host: "127.0.0.1",
      port: 0,
      bypassRules: "<local>"
    }),
    false
  );
});
