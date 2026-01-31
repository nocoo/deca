"use client";

import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { useKeyManagementViewModel } from "@/viewmodel/useKeyManagementViewModel";
import React, { useEffect } from "react";

export default function KeyManagementPage() {
  const { state, actions } = useKeyManagementViewModel();

  useEffect(() => {
    if (!state.apiKey) {
      actions.loadKey();
    }
  }, [actions, state.apiKey]);

  return (
    <div>
      <PageBreadcrumb pageTitle="Key Management" />
      <div className="space-y-6">
        <ComponentCard
          title="Active Key"
          desc="Deca console uses this key for all API requests."
        >
          <div className="grid gap-4">
            <div>
              <Label>Current Key</Label>
              <Input
                type="password"
                value={state.apiKey}
                onChange={(event) => actions.setKey(event.target.value)}
                placeholder="sk-..."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={actions.loadKey} variant="outline" size="sm">
                Refresh
              </Button>
              <Button onClick={actions.resetKey} variant="outline" size="sm">
                Reset Key
              </Button>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Status:{" "}
              <span className="text-gray-800 dark:text-white/90">
                {state.status}
              </span>
              {state.lastFetchedAt ? (
                <span className="ml-2">
                  Last fetched: {new Date(state.lastFetchedAt).toLocaleString()}
                </span>
              ) : null}
            </div>
            {state.errorMessage ? (
              <div className="text-sm text-red-500">{state.errorMessage}</div>
            ) : null}
          </div>
        </ComponentCard>
      </div>
    </div>
  );
}
