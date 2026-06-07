import Link from "next/link";
import { Card } from "@/components/Shell";
import { PANEL_NAME } from "@/lib/shared/panel-brand";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
      {children}
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-xs text-foreground">{children}</code>;
}

export function HostingGuideContent() {
  return (
    <div className="space-y-10">
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="font-mono text-[11px] text-muted-foreground">On this page</p>
        </div>
        <nav className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-2">
          {[
            ["#quick-start", "Quick start"],
            ["#architecture", "What runs where"],
            ["#public-access", "Public servers"],
            ["#daily-ops", "Day-to-day"],
            ["#updates", "Updates"],
            ["#troubleshooting", "Troubleshooting"],
            ["#battleye", "BattlEye"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="text-foreground underline-offset-2 hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </Card>

      <Section id="quick-start" title="Quick start (solo VPS)">
        <p>Use this checklist the first time you set up a single Ubuntu VPS:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Install the panel with HTTPS (see <InlineCode>docs/VPS-DEPLOY.md</InlineCode> in the repo): domain,
            ports 80/443 open, then <InlineCode>install-vps.sh</InlineCode>.
          </li>
          <li>
            Open <InlineCode>/setup</InlineCode> and create the master admin account.
          </li>
          <li>
            Confirm the agent is live on the <Link href="/">Dashboard</Link> (Panel agent card).
          </li>
          <li>
            <Link href="/game">Game Install</Link> — download stable (or experimental) server files.
          </li>
          <li>
            <Link href="/instances/new">New instance</Link> — pick a port, scenario, and name.
          </li>
          <li>
            Set <InlineCode>publicAddress</InlineCode> to your VPS public IP on the instance Network tab if
            auto-detect is wrong.
          </li>
          <li>Forward UDP game ports on your home router only if the game runs behind NAT at home — on a VPS, open UDP in the provider firewall instead.</li>
          <li>Start the instance and check <Link href="/instances">Logs</Link> for errors.</li>
        </ol>
      </Section>

      <Section id="architecture" title="What runs on this machine">
        <p>{PANEL_NAME} is two processes plus optional services:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Web UI</strong> — Next.js on <InlineCode>127.0.0.1:3000</InlineCode>
            . Caddy serves HTTPS to the internet.
          </li>
          <li>
            <strong className="text-foreground">Agent</strong> — <InlineCode>127.0.0.1:9100</InlineCode>, talks to
            systemd, reads/writes configs, collects metrics.
          </li>
          <li>
            <strong className="text-foreground">PostgreSQL</strong> — panel settings, users, metrics history (recommended
            for production).
          </li>
          <li>
            <strong className="text-foreground">Game servers</strong> — one systemd unit per instance (
            <InlineCode>reforger@slug.service</InlineCode>), binaries under <InlineCode>/opt/reforger</InlineCode>.
          </li>
        </ul>
        <p>
          Game data lives under <InlineCode>/opt/reforger/instances/&lt;slug&gt;/</InlineCode> (config, profile, logs).
          The panel does not replace your VPS provider firewall — you still open ports there.
        </p>
      </Section>

      <Section id="public-access" title="Making servers public">
        <p>Players need UDP reachability to your game port. On a typical VPS:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Provider firewall</strong> — allow UDP on each instance game port (and
            optional query/RCon ports).
          </li>
          <li>
            <strong className="text-foreground">UFW on the VPS</strong> — use the instance Network tab or Settings →
            enable firewall automation on start.
          </li>
          <li>
            <strong className="text-foreground">publicAddress</strong> — must be the IP players use to connect (your VPS
            public IP), not <InlineCode>0.0.0.0</InlineCode>.
          </li>
          <li>
            <strong className="text-foreground">bindAddress</strong> — usually empty (all interfaces). Only set a LAN IP
            if you have a specific bind requirement.
          </li>
        </ul>
        <p>Default port offsets (game port = publicPort, e.g. 2001):</p>
        <ul className="list-disc space-y-1 pl-5 font-mono text-xs text-foreground">
          <li>2001 /udp — game</li>
          <li>17777 /udp — A2S browser query (optional)</li>
          <li>19999 /udp — BattlEye RCon (optional)</li>
        </ul>
        <p>Example UFW rules for game port 2001:</p>
        <Code>{"sudo ufw allow 2001/udp\nsudo ufw allow 17777/udp\nsudo ufw allow 19999/udp"}</Code>
        <p>
          Home lab behind a router: forward the same UDP ports on the router to the machine running the server. See
          Bohemia&apos;s Server Hosting wiki for router brand guides.
        </p>
      </Section>

      <Section id="daily-ops" title="Day-to-day operations">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Link href="/">Dashboard</Link> — start, stop, restart instances; see status and resource use.
          </li>
          <li>
            <Link href="/metrics">Metrics</Link> — CPU, RAM, players, and history when the database is enabled.
          </li>
          <li>
            Instance <strong className="text-foreground">Logs</strong> — live console tail and FPS hint.
          </li>
          <li>
            <strong className="text-foreground">Backups</strong> — snapshot config + profile before big changes (Admin tab).
          </li>
          <li>
            <strong className="text-foreground">maxFPS</strong> — keep 60–120 in Advanced; stops the server from eating
            all CPU.
          </li>
          <li>
            <strong className="text-foreground">Crossplay</strong> — toggle in server settings when you want consoles to
            join.
          </li>
        </ul>
      </Section>

      <Section id="updates" title="Updates">
        <p>
          <strong className="text-foreground">Game files</strong> — Game Install page or scheduled update in Settings.
          Instances are stopped, server files are validated via SteamCMD, workshop mod cache is cleared for configured
          mods, then instances restart if that option is enabled.
        </p>
        <p>
          <strong className="text-foreground">Workshop mods</strong> — use Mods → Refresh workshop mods on an instance,
          or rely on the scheduled game update (clears cache before restart). The game downloads latest mod files on
          start.
        </p>
        <p>
          <strong className="text-foreground">Panel</strong> — Settings → Panel update (git pull + build + restart
          services). Run <InlineCode>check-install.sh</InlineCode> after deploy.
        </p>
        <p>
          <strong className="text-foreground">Config changes</strong> — scenario, ports, or network changes usually need
          an instance restart to apply.
        </p>
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Panel agent unreachable</strong> —{" "}
            <InlineCode>sudo systemctl status reforgerpanel-agent</InlineCode>, then{" "}
            <InlineCode>journalctl -u reforgerpanel-agent -n 50</InlineCode>.
          </li>
          <li>
            <strong className="text-foreground">UI loads but actions fail</strong> — agent not running or{" "}
            <InlineCode>AGENT_TOKEN</InlineCode> mismatch in <InlineCode>/etc/reforgerpanel/env</InlineCode>.
          </li>
          <li>
            <strong className="text-foreground">Server shows stopped but game still running</strong> — refresh Dashboard;
            status reconciles from systemd every few seconds.
          </li>
          <li>
            <strong className="text-foreground">Players cannot connect</strong> — wrong <InlineCode>publicAddress</InlineCode>
            , UDP blocked, or UFW inactive (check alerts bell and instance Network preflight).
          </li>
          <li>
            <strong className="text-foreground">Not listed in browser</strong> — <InlineCode>visible: true</InlineCode>, A2S
            port reachable, and firewall open; use Network tab A2S check.
          </li>
          <li>
            <strong className="text-foreground">Crashed status</strong> — read Logs; enable auto-restart in Advanced;
            fix mods/scenario if startup fails immediately.
          </li>
        </ul>
        <p>
          Verify install: <InlineCode>sudo bash scripts/check-install.sh</InlineCode>. Smoke test:{" "}
          <InlineCode>npm run smoke</InlineCode> with admin credentials.
        </p>
      </Section>

      <Section id="battleye" title="BattlEye">
        <p>
          The panel only <strong className="text-foreground">appends</strong> lines to{" "}
          <InlineCode>BEServer_x64.cfg</InlineCode>. Never delete existing lines (especially GameID / MasterPort) or
          players may see &quot;Missing GameID/MasterPort&quot; kicks.
        </p>
        <p>
          Use the instance BattlEye tab to set RCon and run <strong className="text-foreground">Repair</strong> if the
          file was edited by hand. For a broken install, verify game files in Steam on a workstation, or reinstall server
          files from Game Install.
        </p>
      </Section>
    </div>
  );
}
