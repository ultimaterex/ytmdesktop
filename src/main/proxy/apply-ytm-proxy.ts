import { app, safeStorage, session } from "electron";
import type { Session } from "electron";
import type Conf from "conf";
import log from "electron-log";

import type { StoreSchema } from "../../shared/store/schema";
import { buildElectronProxyConfig } from "./build-proxy-config";

export function getYtmPartitionName(isPackaged: boolean): string {
  return isPackaged ? "persist:ytmview" : "persist:ytmview-dev";
}

export function getYtmSession(isPackaged: boolean): Session {
  return session.fromPartition(getYtmPartitionName(isPackaged));
}

function decryptPassword(passwordEncrypted: string | null): string {
  if (!passwordEncrypted || !safeStorage.isEncryptionAvailable()) {
    return "";
  }

  try {
    return safeStorage.decryptString(Buffer.from(passwordEncrypted, "hex"));
  } catch (error) {
    log.error("Failed to decrypt proxy password", error);
    return "";
  }
}

export async function applyYtmProxyFromStore(store: Conf<StoreSchema>): Promise<void> {
  const config = buildElectronProxyConfig(store.get("proxy"));

  try {
    await getYtmSession(app.isPackaged).setProxy(config);
    log.info(`YTM proxy mode=${config.mode}${config.proxyRules ? ` rules=${config.proxyRules}` : ""}`);
  } catch (error) {
    log.error("Failed to apply YTM proxy configuration", error);
  }
}

export function resolveProxyCredentials(store: Conf<StoreSchema>): { username: string; password: string } | null {
  const proxy = store.get("proxy");
  if (!buildElectronProxyConfig(proxy).proxyRules) {
    return null;
  }

  const username = (proxy.username ?? "").trim();
  const password = decryptPassword(proxy.passwordEncrypted);
  if (!username && !password) {
    return null;
  }

  return { username, password };
}

let proxyAuthAttached = false;

export function attachProxyAuthHandler(store: Conf<StoreSchema>): void {
  if (proxyAuthAttached) {
    return;
  }

  proxyAuthAttached = true;
  app.on("login", (event, webContents, _details, authInfo, callback) => {
    if (!authInfo.isProxy || webContents?.session !== getYtmSession(app.isPackaged)) {
      return;
    }

    const credentials = resolveProxyCredentials(store);
    if (!credentials) {
      return;
    }

    event.preventDefault();
    callback(credentials.username, credentials.password);
  });
}
