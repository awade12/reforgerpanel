import { Shell, Card } from "@/components/Shell";

export default function HelpPage() {
  return (
    <Shell>
      <div className="grid gap-6">
        <Card title="Port forwarding & firewall">
          <div className="space-y-4 text-sm text-zinc-300">
            <p>For players outside your LAN to connect, forward these UDP ports on your router to this VPS:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>2001</strong> (or your custom game port) — game traffic / publicPort</li>
              <li><strong>17777</strong> — optional A2S Steam query</li>
              <li><strong>19999</strong> — optional RCON</li>
            </ul>
            <p>Set each instance config <code className="rounded bg-zinc-900 px-1">publicAddress</code> to this server&apos;s public IP (or leave empty for auto-detect).</p>
            <p>On Ubuntu with UFW:</p>
            <pre className="overflow-x-auto rounded-md bg-black/40 p-3 text-xs">sudo ufw allow 2001/udp{"\n"}sudo ufw allow 17777/udp{"\n"}sudo ufw allow 19999/udp</pre>
          </div>
        </Card>
        <Card title="Linux networking notes">
          <div className="space-y-3 text-sm text-zinc-300">
            <p>Use modern config keys: publicAddress, publicPort, bindAddress, supportedPlatforms.</p>
            <p>Always run with <code className="rounded bg-zinc-900 px-1">-maxFPS 60</code> (panel enforces this).</p>
            <p>Keep <code className="rounded bg-zinc-900 px-1">fastValidation: true</code> for public servers.</p>
            <p>Router guides: Cisco, D-Link, Netgear, TP-Link — see Bohemia wiki Server Hosting article.</p>
          </div>
        </Card>
        <Card title="BattlEye">
          <p className="text-sm text-zinc-300">
            Append-only edits to BEServer_x64.cfg. Never remove GameID/MasterPort lines. Use Repair action if config is broken.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
