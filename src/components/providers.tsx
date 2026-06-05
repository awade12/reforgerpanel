"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PanelChrome } from "@/components/panel-chrome";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <PanelChrome>{children}</PanelChrome>
      <Toaster />
    </TooltipProvider>
  );
}
