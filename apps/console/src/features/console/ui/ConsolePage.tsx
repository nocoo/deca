"use client";

import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Button from "@/components/ui/button/Button";
import { useConsoleViewModel } from "@/viewmodel/useConsoleViewModel";
import React from "react";

const metrics = [
  {
    label: "Providers",
    getValue: (providers: string[]) => String(providers.length),
    hint: "available",
  },
  {
    label: "Auth Key",
    getValue: (apiKey: string) => (apiKey ? "Loaded" : "Missing"),
    hint: "status",
  },
  {
    label: "Last Run",
    getValue: (result: string) => (result ? "Success" : "Pending"),
    hint: "latest",
  },
  {
    label: "Mode",
    value: "Local",
    hint: "HTTPS proxy",
  },
];

export default function ConsolePage() {
  const { state, actions } = useConsoleViewModel();

  const providerOptions = state.providers.map((provider) => ({
    value: provider,
    label: provider,
  }));

  return (
    <div>
      <PageBreadcrumb pageTitle="Deca Console" />
      <div className="space-y-6">
        <ComponentCard
          title="Session"
          desc="Load key, providers, and run commands against Deca API."
        >
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => actions.setTitle("Deca Console Ready")}
              size="md"
            >
              Start Session
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {state.title}
            </span>
            <Button onClick={actions.loadAuthKey} variant="outline" size="md">
              Load Key
            </Button>
            <Button onClick={actions.loadProviders} variant="outline" size="md">
              Load Providers
            </Button>
          </div>
        </ComponentCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => {
            const value = metric.value
              ? metric.value
              : metric.getValue
                ? metric.getValue(
                    metric.label === "Providers"
                      ? state.providers
                      : metric.label === "Auth Key"
                        ? state.apiKey
                        : state.result,
                  )
                : "";

            return (
              <div
                key={metric.label}
                className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {metric.label}
                </p>
                <h4 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
                  {value}
                </h4>
                <span className="text-xs text-gray-400">{metric.hint}</span>
              </div>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <ComponentCard
            title="Connection"
            desc="Manage auth key and provider selection."
          >
            <div className="grid gap-4">
              <div>
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={state.apiKey}
                  onChange={(event) => actions.setApiKey(event.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <Label>Provider</Label>
                <Select
                  options={providerOptions}
                  placeholder="Select provider"
                  value={state.selectedProvider}
                  onChange={actions.setSelectedProvider}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={actions.loadProviders}
                  variant="outline"
                  size="sm"
                >
                  Refresh Providers
                </Button>
                <Button
                  onClick={actions.resetSession}
                  variant="outline"
                  size="sm"
                >
                  Reset
                </Button>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard title="Runner Status" desc="Recent console activity">
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  Providers
                </span>
                <span className="font-medium text-gray-800 dark:text-white/90">
                  {state.providersLoaded ? "loaded" : "waiting"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  Last run
                </span>
                <span className="font-medium text-gray-800 dark:text-white/90">
                  {state.result ? "executed" : "idle"}
                </span>
              </div>
            </div>
          </ComponentCard>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <ComponentCard
            title="Command Runner"
            desc="Run a script through the selected provider."
          >
            <div className="space-y-4">
              <div>
                <Label>Script</Label>
                <TextArea
                  rows={6}
                  value={state.script}
                  onChange={actions.setScript}
                  placeholder='display dialog "Hello from Deca"'
                />
              </div>
              <Button onClick={actions.runScript} size="md">
                Run Script
              </Button>
            </div>
          </ComponentCard>

          <ComponentCard title="Result" desc="Latest command output">
            <div className="min-h-[180px] whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/80">
              {state.result || "Awaiting output..."}
            </div>
          </ComponentCard>
        </div>
      </div>
    </div>
  );
}
