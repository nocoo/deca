export type ConsoleRuntimeConfig = {
  apiBaseUrl: string;
};

export const consoleConfig: ConsoleRuntimeConfig = {
  apiBaseUrl:
    process.env.NEXT_PUBLIC_DECA_API_BASE_URL || "http://127.0.0.1:7010",
};
