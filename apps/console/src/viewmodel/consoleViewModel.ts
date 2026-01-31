import type { HealthResponse } from '../model/api';

export type ConsoleState = {
  title: string;
};

export type ConsoleViewModel = {
  getState: () => ConsoleState;
  setTitle: (value: string) => void;
  fetchHealth: () => Promise<HealthResponse>;
};

export const createConsoleViewModel = (fetcher: typeof fetch): ConsoleViewModel => {
  let state: ConsoleState = { title: 'Deca Console' };

  const getState = () => state;
  const setTitle = (value: string) => {
    state = { ...state, title: value };
  };

  const fetchHealth = async () => {
    const response = await fetcher('http://127.0.0.1:3210/health');
    if (!response.ok) {
      throw new Error('health_check_failed');
    }
    return (await response.json()) as HealthResponse;
  };

  return { getState, setTitle, fetchHealth };
};
