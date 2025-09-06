let handler: (() => void) | null = null;

export const setGlobalAuthErrorHandler = (h: () => void) => {
  handler = h;
};

export const triggerGlobalAuthErrorHandler = () => {
  if (handler) {
    console.warn('Global auth error handler triggered.');
    handler();
  } else {
    console.error('Auth error detected, but no global handler is set.');
  }
};