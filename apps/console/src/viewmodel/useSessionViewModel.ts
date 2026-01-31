"use client";

import { useEffect, useMemo, useState } from "react";

import { type SessionState, createSessionViewModel } from "./sessionViewModel";

export const useSessionViewModel = () => {
  const viewModel = useMemo(() => createSessionViewModel(fetch), []);
  const [state, setState] = useState<SessionState>(viewModel.getState());

  const syncState = () => setState({ ...viewModel.getState() });

  const startSession = async () => {
    await viewModel.actions.startSession();
    syncState();
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await viewModel.actions.startSession();
      if (mounted) {
        setState({ ...viewModel.getState() });
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [viewModel]);

  return {
    state,
    actions: {
      startSession,
    },
  };
};
