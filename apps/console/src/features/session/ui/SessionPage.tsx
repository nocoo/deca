"use client";

import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { useSessionViewModel } from "@/viewmodel/useSessionViewModel";
import React from "react";

export default function SessionPage() {
  const { state, actions } = useSessionViewModel();

  return (
    <div>
      <PageBreadcrumb pageTitle="Session" />
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
            <h4 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {state.status}
            </h4>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Session ID
            </p>
            <h4 className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90 break-all">
              {state.sessionId || "pending"}
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
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Health</p>
            <h4 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {state.healthOk === null
                ? "pending"
                : state.healthOk
                  ? "ok"
                  : "failed"}
            </h4>
          </div>
        </div>

        <ComponentCard title="Session Timeline" desc="Realtime startup events">
          <div className="space-y-3">
            {state.events.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Waiting for events...
              </p>
            ) : (
              state.events.map((event, index) => (
                <div
                  key={`${event}-${String(state.startedAt)}-${index}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/80"
                >
                  <span>{event}</span>
                  <span className="text-xs text-gray-400">{index + 1}</span>
                </div>
              ))
            )}
          </div>
        </ComponentCard>

        {state.errorMessage ? (
          <ComponentCard title="Session Error">
            <p className="text-sm text-red-500">{state.errorMessage}</p>
          </ComponentCard>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={actions.startSession} variant="outline" size="sm">
            Restart Session
          </Button>
        </div>
      </div>
    </div>
  );
}
