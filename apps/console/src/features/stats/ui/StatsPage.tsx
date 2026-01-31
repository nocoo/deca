"use client";

import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { useStatsViewModel } from "@/viewmodel/useStatsViewModel";
import React from "react";

export default function StatsPage() {
  const { state, actions } = useStatsViewModel();

  return (
    <div>
      <PageBreadcrumb pageTitle="Stats & Logs" />
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Total Runs
            </p>
            <h4 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {state.totalRuns}
            </h4>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Success Rate
            </p>
            <h4 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {state.successRate}%
            </h4>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Avg Latency
            </p>
            <h4 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {state.avgLatencyMs} ms
            </h4>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Providers
            </p>
            <h4 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {state.providers.length}
            </h4>
          </div>
        </div>

        <ComponentCard title="Execution Logs" desc="Recent Deca activity">
          <div className="space-y-3">
            {state.logs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No logs recorded yet.
              </p>
            ) : (
              state.logs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/80"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {log.provider}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{log.summary}</span>
                    <span className="text-xs text-gray-400">
                      {log.durationMs} ms
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ComponentCard>

        {state.errorMessage ? (
          <ComponentCard title="Stats Error">
            <p className="text-sm text-red-500">{state.errorMessage}</p>
          </ComponentCard>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={actions.refresh} variant="outline" size="sm">
            Refresh Stats
          </Button>
        </div>
      </div>
    </div>
  );
}
