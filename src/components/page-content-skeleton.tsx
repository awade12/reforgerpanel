export function PageContentSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-7 w-48 rounded bg-muted/50" />
      <div className="h-32 rounded border border-border bg-card/40" />
      <div className="h-48 rounded border border-border bg-card/40" />
    </div>
  );
}
