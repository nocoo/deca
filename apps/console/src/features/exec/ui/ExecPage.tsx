"use client";

import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import Button from "@/components/ui/button/Button";
import { useExecViewModel } from "@/viewmodel/useExecViewModel";
import React from "react";

export default function ExecPage() {
  const { state, actions } = useExecViewModel();

  const providerOptions = state.providers.map((provider) => ({
    value: provider,
    label: provider,
  }));

  return (
    <div>
      <PageBreadcrumb pageTitle="Execution" />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <ComponentCard
            title="Run Command"
            desc="Execute scripts against Deca providers with full output."
          >
            <div className="grid gap-4">
              <div>
                <Label>Provider</Label>
                <Select
                  options={providerOptions}
                  placeholder="Select provider"
                  value={state.provider}
                  onChange={actions.setProvider}
                />
              </div>
              <div>
                <Label>Script</Label>
                <TextArea
                  rows={8}
                  value={state.script}
                  onChange={actions.setScript}
                  placeholder='display dialog "Hello from Deca"'
                />
              </div>
              <div>
                <Label>Workspace</Label>
                <TextArea
                  rows={2}
                  value={state.workspace}
                  onChange={actions.setWorkspace}
                  placeholder="/Users/you/workspace/project"
                />
                <p className="mt-2 text-xs text-gray-400">
                  Required for OpenCode execution.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={actions.run} size="md">
                  Run
                </Button>
                <Button
                  onClick={actions.clearOutput}
                  variant="outline"
                  size="md"
                >
                  Clear Output
                </Button>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard title="Execution Output" desc="Latest response">
            <div className="min-h-[260px] whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/80">
              {state.output || "Awaiting output..."}
            </div>
            {state.lastRunAt ? (
              <p className="mt-3 text-xs text-gray-400">
                Last run: {new Date(state.lastRunAt).toLocaleString()}
              </p>
            ) : null}
            {state.errorMessage ? (
              <p className="mt-3 text-xs text-red-500">{state.errorMessage}</p>
            ) : null}
          </ComponentCard>
        </div>
      </div>
    </div>
  );
}
