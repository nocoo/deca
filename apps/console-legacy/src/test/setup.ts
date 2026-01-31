import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
}

if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")) {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 1024,
  });
}

if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")) {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 768,
  });
}

if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, "getBoundingClientRect")) {
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width: 1024,
      height: 768,
      top: 0,
      left: 0,
      bottom: 768,
      right: 1024,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}
