import { useMemo, useState } from 'react';

import { createConsoleViewModel } from '../viewmodel/consoleViewModel';

export function ConsoleApp() {
  const viewModel = useMemo(() => createConsoleViewModel(fetch), []);
  const [message, setMessage] = useState(viewModel.getState().title);

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>{message}</h1>
      <button
        type="button"
        onClick={() => {
          viewModel.setTitle('Deca Console Ready');
          setMessage(viewModel.getState().title);
        }}
      >
        Start
      </button>
    </div>
  );
}
