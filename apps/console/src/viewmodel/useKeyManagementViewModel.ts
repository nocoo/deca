"use client";

import { useMemo, useState } from "react";

import {
  type KeyManagementState,
  createKeyManagementViewModel,
} from "./keyManagementViewModel";

export const useKeyManagementViewModel = () => {
  const [state, setState] = useState<KeyManagementState>(
    createKeyManagementViewModel(fetch).getState(),
  );

  const viewModel = useMemo(() => createKeyManagementViewModel(fetch), []);

  const syncState = () => setState({ ...viewModel.getState() });

  const loadKey = async () => {
    await viewModel.actions.loadKey();
    syncState();
  };

  const resetKey = async () => {
    await viewModel.actions.resetKey();
    syncState();
  };

  const setKey = (value: string) => {
    viewModel.actions.setKey(value);
    syncState();
  };

  return {
    state,
    actions: {
      loadKey,
      resetKey,
      setKey,
    },
  };
};
