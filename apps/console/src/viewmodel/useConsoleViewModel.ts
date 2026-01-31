"use client";

import { useMemo, useState } from "react";

import { consoleConfig } from "../config/consoleConfig";
import { readKeyStore } from "../state/consoleKeyStore";
import {
  createConsoleViewModel,
  getDefaultConsoleState,
} from "./consoleViewModel";
import type { ConsoleState } from "./consoleViewModel";

export const useConsoleViewModel = () => {
  const [state, setState] = useState<ConsoleState>(() => {
    const storedKey = readKeyStore();
    return { ...getDefaultConsoleState(), apiKey: storedKey.key };
  });
  const viewModel = useMemo(
    () =>
      createConsoleViewModel(fetch, {
        apiBaseUrl: consoleConfig.apiBaseUrl,
        apiKey: state.apiKey,
      }),
    [state.apiKey],
  );

  const updateState = (updater: (current: ConsoleState) => ConsoleState) => {
    setState((current) => updater(current));
  };

  const setTitle = (value: string) =>
    updateState((current) => ({ ...current, title: value }));
  const setScript = (value: string) =>
    updateState((current) => ({ ...current, script: value }));
  const setSelectedProvider = (value: string) =>
    updateState((current) => ({ ...current, selectedProvider: value }));
  const setResult = (value: string) =>
    updateState((current) => ({ ...current, result: value }));
  const setApiKey = (value: string) => {
    updateState((current) => ({ ...current, apiKey: value }));
  };
  const setLoading = (value: boolean) =>
    updateState((current) => ({ ...current, loading: value }));
  const setProviders = (value: string[]) =>
    updateState((current) => ({ ...current, providers: value }));
  const setProvidersLoaded = (value: boolean) =>
    updateState((current) => ({ ...current, providersLoaded: value }));

  const resetSession = () =>
    updateState((current) => ({
      ...current,
      apiKey: "",
      providers: [],
      selectedProvider: "",
      result: "",
      providersLoaded: false,
    }));

  const loadProviders = async () => {
    const normalizedKey = state.apiKey.trim();
    if (!normalizedKey) {
      setResult("missing_api_key");
      return;
    }
    const configured = createConsoleViewModel(fetch, {
      apiBaseUrl: consoleConfig.apiBaseUrl,
      apiKey: normalizedKey,
    });
    try {
      setLoading(true);
      const data = await configured.fetchProviders();
      const list = data.providers.map((provider) => provider.type);
      setProviders(list);
      if (!state.selectedProvider && list.length > 0) {
        setSelectedProvider(list[0]);
      }
      setProvidersLoaded(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "providers_failed";
      setResult(message);
      setProviders([]);
      setProvidersLoaded(false);
    } finally {
      setLoading(false);
    }
  };

  const loadAuthKey = async () => {
    const configured = createConsoleViewModel(fetch, {
      apiBaseUrl: consoleConfig.apiBaseUrl,
      apiKey: "",
    });
    try {
      setLoading(true);
      const data = await configured.fetchAuthKey();
      setApiKey(data.key);
      setResult("auth_key_loaded");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "auth_key_failed";
      setResult(message);
    } finally {
      setLoading(false);
    }
  };

  const runScript = async () => {
    try {
      const normalizedKey = state.apiKey.trim();
      if (!normalizedKey) {
        setResult("missing_api_key");
        return;
      }
      const configured = createConsoleViewModel(fetch, {
        apiBaseUrl: consoleConfig.apiBaseUrl,
        apiKey: normalizedKey,
      });
      configured.setScript(state.script);
      configured.setSelectedProvider(state.selectedProvider);
      setLoading(true);
      const response = await configured.execScript();
      const output = response.stdout || response.stderr || "no output";
      setResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : "exec_failed";
      setResult(message);
    } finally {
      setLoading(false);
    }
  };

  return {
    state,
    actions: {
      setTitle,
      setScript,
      setSelectedProvider,
      setResult,
      setApiKey,
      setLoading,
      setProviders,
      setProvidersLoaded,
      resetSession,
      loadProviders,
      loadAuthKey,
      runScript,
    },
  };
};
