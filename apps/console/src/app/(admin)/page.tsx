import ConsolePage from "@/features/console/ui/ConsolePage";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Deca Console",
  description: "Local-first Deca control console",
};

export default function Ecommerce() {
  return <ConsolePage />;
}
