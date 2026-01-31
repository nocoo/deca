import StatsPage from "@/features/stats/ui/StatsPage";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Deca Stats & Logs",
  description: "Deca execution statistics and logs",
};

export default function StatsRoute() {
  return <StatsPage />;
}
