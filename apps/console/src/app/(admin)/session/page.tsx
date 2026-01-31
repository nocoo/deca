import SessionPage from "@/features/session/ui/SessionPage";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Deca Session",
  description: "Active Deca session status and events",
};

export default function SessionRoute() {
  return <SessionPage />;
}
