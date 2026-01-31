import { useEffect, useMemo, useState } from 'react';

import { createConsoleViewModel } from '../viewmodel/consoleViewModel';

export function ConsoleApp() {
  const baseViewModel = useMemo(
    () =>
      createConsoleViewModel(fetch, {
        apiBaseUrl: 'https://deca.dev.hexly.ai',
        apiKey: '',
      }),
    []
  );
  const [message, setMessage] = useState(baseViewModel.getState().title);
  const [apiKey, setApiKey] = useState('');
  const [providers, setProviders] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [script, setScript] = useState('display dialog "Hello from Deca"');
  const [result, setResult] = useState('');

  useEffect(() => {
    let mounted = true;
    if (!apiKey) {
      setProviders([]);
      return () => undefined;
    }
    const configured = createConsoleViewModel(fetch, {
      apiBaseUrl: 'https://deca.dev.hexly.ai',
      apiKey,
    });
    configured
      .fetchProviders()
      .then((data) => {
        if (!mounted) return;
        const list = data.providers.map((provider) => provider.type);
        setProviders(list);
        if (!selectedProvider && list.length > 0) {
          setSelectedProvider(list[0]);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setProviders([]);
      });
    return () => {
      mounted = false;
    };
  }, [apiKey, selectedProvider]);

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>{message}</h1>
      <button
        type="button"
        onClick={() => {
          baseViewModel.setTitle('Deca Console Ready');
          setMessage(baseViewModel.getState().title);
        }}
      >
        Start
      </button>
      <div style={{ marginTop: 16 }}>
        <label>
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={() => {
            setApiKey('');
            setProviders([]);
            setSelectedProvider('');
            setResult('');
          }}
        >
          Reset Key
        </button>
      </div>
      <div style={{ marginTop: 16 }}>
        <label>
          Provider
          <select
            value={selectedProvider}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedProvider(value);
            }}
          >
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <label>
          AppleScript
          <textarea
            rows={4}
            value={script}
            onChange={(event) => {
              const value = event.target.value;
              viewModel.setScript(value);
              setScript(value);
            }}
          />
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={async () => {
            viewModel.setScript(script);
            viewModel.setSelectedProvider(selectedProvider);
            try {
              if (!apiKey) {
                setResult('missing_api_key');
                return;
              }
              const configured = createConsoleViewModel(fetch, {
                apiBaseUrl: 'https://deca.dev.hexly.ai',
                apiKey,
              });
              configured.setScript(script);
              configured.setSelectedProvider(selectedProvider);
              const response = await configured.execScript();
              const output = response.stdout || response.stderr || 'no output';
              setResult(output);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'exec_failed';
              setResult(message);
            }
          }}
        >
          Run
        </button>
      </div>
      <div style={{ marginTop: 16 }}>
        <label>
          Result
          <textarea rows={4} readOnly value={result} />
        </label>
      </div>
    </div>
  );
}
