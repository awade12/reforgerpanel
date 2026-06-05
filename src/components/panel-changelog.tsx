import type { ChangelogRelease } from "@/lib/shared/changelog";
import { PANEL_NAME } from "@/lib/shared/panel-brand";
import { getPanelVersion, getRepositoryUrl } from "@/lib/shared/panel-version";
import { Card } from "@/components/Shell";

export function PanelChangelog({ releases }: { releases: ChangelogRelease[] }) {
  const version = getPanelVersion();
  const repo = getRepositoryUrl();

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] text-muted-foreground">Release notes</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {PANEL_NAME} v{version}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <a href={repo} target="_blank" rel="noreferrer" className="text-foreground underline-offset-2 hover:underline">
            {repo.replace("https://", "")}
          </a>
          {" · "}
          <a href={`${repo}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
            CHANGELOG.md
          </a>
        </p>
      </div>
      <div className="divide-y divide-border">
        {releases.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No release notes found.</p>
        ) : (
          releases.map((release) => (
            <div key={release.version} className="px-4 py-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="font-mono text-sm font-medium text-foreground">v{release.version}</h3>
                {release.date && (
                  <span className="font-mono text-[11px] text-muted-foreground">{release.date}</span>
                )}
              </div>
              <div className="mt-3 space-y-3">
                {release.sections.map((section) => (
                  <div key={section.title}>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
