if (import.meta.env.DEV) {
  if (!(window as any).__vite_plugin_react_preamble_installed__) {
    import('/@react-refresh' as any).then(({ default: RefreshRuntime }: any) => {
      RefreshRuntime.injectIntoGlobalHook(window);
      (window as any).$RefreshReg$ = () => {};
      (window as any).$RefreshSig$ = () => (type: any) => type;
      (window as any).__vite_plugin_react_preamble_installed__ = true;
    });
  }
}