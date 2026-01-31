import { useMemo, useState } from 'react';

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
  const [apiKey, setApiKey] = useState('sk-1980b0682f8648988a083ff5e8967ac7');
  const [providers, setProviders] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [script, setScript] = useState('display dialog "Hello from Deca"');
  const [result, setResult] = useState('');

  const loadProviders = async () => {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      setResult('missing_api_key');
      return;
    }
    const configured = createConsoleViewModel(fetch, {
      apiBaseUrl: 'https://deca.dev.hexly.ai',
      apiKey: normalizedKey,
    });
    try {
      const data = await configured.fetchProviders();
      const list = data.providers.map((provider) => provider.type);
      setProviders(list);
      if (!selectedProvider && list.length > 0) {
        setSelectedProvider(list[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'providers_failed';
      setResult(message);
      setProviders([]);
    }
  };

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
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
          Key length: {apiKey.trim().length}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" onClick={loadProviders}>
          Load Providers
        </button>
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
            onChange={(event) => setScript(event.target.value)}
          />
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={async () => {
            try {
              const normalizedKey = apiKey.trim();
              if (!normalizedKey) {
                setResult('missing_api_key');
                return;
              }
              const configured = createConsoleViewModel(fetch, {
                apiBaseUrl: 'https://deca.dev.hexly.ai',
                apiKey: normalizedKey,
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
