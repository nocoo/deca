import ExecPage from "@/features/exec/ui/ExecPage";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Deca Console",
  description: "Execute commands with Deca providers",
};

export default function ConsoleRoute() {
  return <ExecPage />;
}
