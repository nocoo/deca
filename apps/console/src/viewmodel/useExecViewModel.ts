"use client";

import { useEffect, useMemo, useState } from "react";

import { type ExecState, createExecViewModel } from "./execViewModel";

export const useExecViewModel = () => {
  const viewModel = useMemo(() => createExecViewModel(fetch), []);
  const [state, setState] = useState<ExecState>(viewModel.getState());

  const syncState = () => setState({ ...viewModel.getState() });

  const setProvider = (value: string) => {
    viewModel.actions.setProvider(value);
    syncState();
  };

  const setScript = (value: string) => {
    viewModel.actions.setScript(value);
    syncState();
  };

  const clearOutput = () => {
    viewModel.actions.clearOutput();
    syncState();
  };

  const loadProviders = async () => {
    await viewModel.actions.loadProviders();
    syncState();
  };

  const run = async () => {
    await viewModel.actions.run();
    syncState();
  };

  useEffect(() => {
    let mounted = true;
    const runLoad = async () => {
      await viewModel.actions.loadProviders();
      if (mounted) {
        setState({ ...viewModel.getState() });
      }
    };
    runLoad();
    return () => {
      mounted = false;
    };
  }, [viewModel]);

  return {
    state,
    actions: {
      setProvider,
      setScript,
      clearOutput,
      loadProviders,
      run,
    },
  };
};
