import ExecPage from "@/features/exec/ui/ExecPage";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Deca Execution",
  description: "Execute commands with Deca providers",
};

export default function ExecutionRoute() {
  return <ExecPage />;
}
