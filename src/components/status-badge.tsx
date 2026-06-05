import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const running = status === "running";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide",
        running && "text-chart-1",
        status === "crashed" && "text-destructive",
        !running && status !== "crashed" && "text-muted-foreground",
      )}
    >
      {running && <span className="size-1.5 bg-chart-1" />}
      {status}
    </span>
  );
}
