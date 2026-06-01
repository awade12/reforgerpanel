"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function InstanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[instance page]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-12">
      <h1 className="text-lg font-medium text-foreground">Instance page failed to load</h1>
      <p className="text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred while rendering this page."}
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
        >
          Try again
        </button>
        <Link
          href="/"
          className="border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
