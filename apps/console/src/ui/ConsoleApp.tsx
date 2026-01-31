import { useMemo, useState } from "react";
import {
  Activity,
  TerminalSquare,
  KeyRound,
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

import { createConsoleViewModel } from "../viewmodel/consoleViewModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ActivityList } from "@/components/dashboard/ActivityList";
import { ProjectsTable } from "@/components/dashboard/ProjectsTable";
import { AreaChartCard } from "@/components/dashboard/AreaChartCard";
import { BarChartCard } from "@/components/dashboard/BarChartCard";

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
  const [apiKey, setApiKey] = useState("");
  const [providers, setProviders] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [script, setScript] = useState('display dialog "Hello from Deca"');
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [providersLoaded, setProvidersLoaded] = useState(false);

  const loadProviders = async () => {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      setResult('missing_api_key');
      return;
    }
    const configured = createConsoleViewModel(fetch, {
      apiBaseUrl: "https://deca.dev.hexly.ai",
      apiKey: normalizedKey,
    });
    try {
      setLoading(true);
      const data = await configured.fetchProviders();
      const list = data.providers.map((provider) => provider.type);
      setProviders(list);
      if (!selectedProvider && list.length > 0) {
        setSelectedProvider(list[0]);
      }
      setProvidersLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'providers_failed';
      setResult(message);
      setProviders([]);
      setProvidersLoaded(false);
    } finally {
      setLoading(false);
    }
  };

  const loadAuthKey = async () => {
    const configured = createConsoleViewModel(fetch, {
      apiBaseUrl: "https://deca.dev.hexly.ai",
      apiKey: "",
    });
    try {
      setLoading(true);
      const data = await configured.fetchAuthKey();
      setApiKey(data.key);
      setResult('auth_key_loaded');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'auth_key_failed';
      setResult(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    try {
      const normalizedKey = apiKey.trim();
      if (!normalizedKey) {
        setResult("missing_api_key");
        return;
      }
      const configured = createConsoleViewModel(fetch, {
        apiBaseUrl: "https://deca.dev.hexly.ai",
        apiKey: normalizedKey,
      });
      configured.setScript(script);
      configured.setSelectedProvider(selectedProvider);
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

  const activityItems = [
    {
      id: "1",
      user: "Console",
      action: providersLoaded ? "loaded" : "waiting for",
      target: "providers",
      time: providersLoaded ? "just now" : "pending",
    },
    {
      id: "2",
      user: "Runner",
      action: result ? "executed" : "idle",
      target: result ? "AppleScript" : "command",
      time: result ? "moments ago" : "standby",
    },
  ];

  const projects = [
    {
      id: "1",
      name: "Deca API",
      domain: "deca.dev.hexly.ai",
      status: "live" as const,
      lastDeployed: "today",
      branch: "main",
    },
    {
      id: "2",
      name: "Console UI",
      domain: "deca-console.dev.hexly.ai",
      status: providersLoaded ? (result ? "live" : "building") : "building",
      lastDeployed: providersLoaded ? "just now" : "waiting",
      branch: "main",
    },
  ];

  const traffic = [
    { name: "Mon", value: 12 },
    { name: "Tue", value: 24 },
    { name: "Wed", value: 18 },
    { name: "Thu", value: 32 },
    { name: "Fri", value: 28 },
    { name: "Sat", value: 16 },
    { name: "Sun", value: 22 },
  ];

  const runs = [
    { name: "Jan", value: 6 },
    { name: "Feb", value: 9 },
    { name: "Mar", value: 12 },
    { name: "Apr", value: 16 },
    { name: "May", value: 14 },
    { name: "Jun", value: 18 },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl space-y-8 py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Local-only control</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {message}
            </h1>
            <p className="text-sm text-muted-foreground">
              Control your macOS environment via Deca. Load an auth key, select a
              provider, and run AppleScript with confidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                baseViewModel.setTitle("Deca Console Ready");
                setMessage(baseViewModel.getState().title);
              }}
            >
              Start Session
            </Button>
            <Button variant="secondary" onClick={loadAuthKey}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Load Key
            </Button>
            <Button variant="outline" onClick={loadProviders}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              Load Providers
            </Button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Providers"
            value={providers.length ? String(providers.length) : "0"}
            icon={Activity}
            description="available"
            trend={{ value: providers.length ? 12 : 0, isPositive: true }}
          />
          <StatsCard
            title="Auth Key"
            value={apiKey ? "Loaded" : "Missing"}
            icon={KeyRound}
            trend={{ value: apiKey ? 100 : 0, isPositive: Boolean(apiKey) }}
            description="status"
          />
          <StatsCard
            title="Last Run"
            value={result ? "Success" : "Pending"}
            icon={TerminalSquare}
            trend={{ value: result ? 35 : 0, isPositive: Boolean(result) }}
            description="latest"
          />
          <StatsCard
            title="Mode"
            value="Local"
            icon={Play}
            description="HTTPS proxy"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Connection</CardTitle>
              <CardDescription>Manage auth key and provider selection.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-..."
                />
                <p className="text-xs text-muted-foreground">
                  Key prefix: {apiKey.trim().slice(0, 6)}...{apiKey.trim().slice(-6)}
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Provider</Label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={loadProviders}>
                  Refresh Providers
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setApiKey("");
                    setProviders([]);
                    setSelectedProvider("");
                    setResult("");
                    setProvidersLoaded(false);
                  }}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader>
              <CardTitle>Runner Status</CardTitle>
              <CardDescription>Recent console activity</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityList activities={activityItems} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>AppleScript Runner</CardTitle>
              <CardDescription>Run a script through the selected provider.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Script</Label>
                <Textarea rows={6} value={script} onChange={(event) => setScript(event.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Default script uses a dialog. Ensure Accessibility permissions are granted.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRun}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run Script
                </Button>
                {result ? (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle className="h-4 w-4" />
                    Latest run complete
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    Awaiting run
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
              <CardDescription>Latest command output</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground min-h-[180px] whitespace-pre-wrap">
                {result || "Awaiting output..."}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <AreaChartCard title="Console Traffic" description="Weekly activity" data={traffic} />
          <BarChartCard title="Runs" description="Monthly executions" data={runs} />
        </div>

        <ProjectsTable projects={projects} />
      </div>
    </div>
  );
}
