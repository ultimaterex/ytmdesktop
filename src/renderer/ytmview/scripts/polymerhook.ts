export class PolymerHook {
  private _ytmStore;
  public get ytmStore(): unknown {
    return this._ytmStore;
  }

  public init() {
    // It's OK to alias this here as we're hooking YTMs passed `this`
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const fakeBaseClass = function () {
      try {
        if (!self._ytmStore) {
          if (this.store && !!this.store.getState && !!this.store.dispatch && !!this.store.subscribe) {
            const ytmdHook = {
              ytmStore: this.store
            };
            Object.freeze(ytmdHook);
            window.__YTMD_HOOK__ = ytmdHook;
            self._ytmStore = this.store;
          }
        }
      } catch {
        /* empty */
      }
    };
    Object.defineProperty(window, "PolymerFakeBaseClassWithoutHtml", {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      set: _value => {},
      get: () => {
        return fakeBaseClass;
      }
    });
  }

  public async ready(): Promise<void> {
    if (this._ytmStore) return Promise.resolve();

    return new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (this._ytmStore) {
          resolve();
          clearInterval(interval);
        }
      });
    });
  }
}

export default new PolymerHook();
