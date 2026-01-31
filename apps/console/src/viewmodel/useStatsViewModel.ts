"use client";

import { useEffect, useMemo, useState } from "react";

import { type StatsState, createStatsViewModel } from "./statsViewModel";

export const useStatsViewModel = () => {
  const viewModel = useMemo(() => createStatsViewModel(fetch), []);
  const [state, setState] = useState<StatsState>(viewModel.getState());

  const syncState = () => setState({ ...viewModel.getState() });

  const refresh = async () => {
    await viewModel.actions.refresh();
    syncState();
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await viewModel.actions.refresh();
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
    actions: { refresh },
  };
};
