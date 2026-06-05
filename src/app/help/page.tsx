import { HostingGuideContent } from "@/components/hosting-guide-content";
import { PanelChangelog } from "@/components/panel-changelog";
import { loadChangelog } from "@/lib/shared/changelog";
import { getPanelVersion } from "@/lib/shared/panel-version";
import { PageHeader, Shell } from "@/components/Shell";

export default function HelpPage() {
  const releases = loadChangelog();
  const version = getPanelVersion();

  return (
    <Shell contentClassName="max-w-3xl">
      <PageHeader
        title="Hosting guide"
        description={`Operator manual for a solo VPS — panel v${version}, agent, firewall, and day-to-day tasks.`}
      />
      <HostingGuideContent />
      <div className="mt-10">
        <PanelChangelog releases={releases} />
      </div>
    </Shell>
  );
}
