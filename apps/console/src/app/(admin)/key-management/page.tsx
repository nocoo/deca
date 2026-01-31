import KeyManagementPage from "@/features/key-management/ui/KeyManagementPage";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Deca Key Management",
  description: "Manage Deca API keys for local console",
};

export default function KeyManagementRoute() {
  return <KeyManagementPage />;
}
