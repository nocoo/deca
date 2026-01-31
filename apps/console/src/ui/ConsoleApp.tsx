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
  const [apiKey, setApiKey] = useState('');
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

  const loadAuthKey = async () => {
    const configured = createConsoleViewModel(fetch, {
      apiBaseUrl: 'https://deca.dev.hexly.ai',
      apiKey: '',
    });
    try {
      const data = await configured.fetchAuthKey();
      setApiKey(data.key);
      setResult('auth_key_loaded');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'auth_key_failed';
      setResult(message);
    }
  };

  return (
    <div className="console-shell">
      <header className="console-hero">
        <div>
          <div className="status-pill">Local-only • HTTPS enabled</div>
          <h1 className="console-title">{message}</h1>
          <p className="console-subtitle">
            Deca Console is a local control surface for macOS automation. Load
            the key, pick a provider, and run AppleScript safely.
          </p>
        </div>
        <div className="button-row">
          <button
            className="btn"
            type="button"
            onClick={() => {
              baseViewModel.setTitle('Deca Console Ready');
              setMessage(baseViewModel.getState().title);
            }}
          >
            Start Session
          </button>
          <button className="btn secondary" type="button" onClick={loadAuthKey}>
            Load Key
          </button>
          <button className="btn ghost" type="button" onClick={loadProviders}>
            Load Providers
          </button>
        </div>
      </header>

      <div className="console-grid">
        <section className="console-card">
          <h2 className="card-title">Connection</h2>
          <div className="field">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
            />
            <div className="hint">
              Key prefix: {apiKey.trim().slice(0, 6)}...{apiKey.trim().slice(-6)}
            </div>
          </div>
          <div className="button-row">
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setApiKey('');
                setProviders([]);
                setSelectedProvider('');
                setResult('');
              }}
            >
              Reset
            </button>
          </div>
          <div className="divider" />
          <div className="field">
            <label>Provider</label>
            <select
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value)}
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="console-card">
          <h2 className="card-title">AppleScript Runner</h2>
          <div className="field">
            <label>Script</label>
            <textarea
              rows={6}
              value={script}
              onChange={(event) => setScript(event.target.value)}
            />
            <div className="hint">
              Default script uses AppleScript dialog. Ensure Accessibility
              permissions are granted.
            </div>
          </div>
          <div className="button-row">
            <button
              className="btn"
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
              Run Script
            </button>
          </div>
        </section>

        <section className="console-card">
          <h2 className="card-title">Result</h2>
          <div className="result-box">{result || 'Awaiting output...'}</div>
        </section>
      </div>
    </div>
  );
}
