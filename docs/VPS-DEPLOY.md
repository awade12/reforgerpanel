# Reforger Panel — VPS deployment

Deploy on a fresh **Ubuntu 22.04 / 24.04** VPS (2 GB RAM minimum, 4 GB+ recommended for game server + build).

**Repository:** [github.com/awade12/reforgerpanel](https://github.com/awade12/reforgerpanel)

Production installs **require HTTPS**. The installer configures [Caddy](https://caddyserver.com/docs/automatic-https) as a reverse proxy with automatic Let's Encrypt certificates. The panel itself listens on **127.0.0.1:3000 only** — it is not exposed on the public internet.

## Before you start

1. **Domain** — e.g. `panel.example.com`
2. **DNS** — A record pointing at your VPS public IP (required for Let's Encrypt HTTP-01)
3. **Firewall** — ports **80** and **443** must reach the VPS (provider firewall + UFW)

Caddy automatically:
- Obtains and renews TLS certificates (Let's Encrypt / ZeroSSL)
- Redirects HTTP → HTTPS
- Sets `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` on upstream requests ([reverse_proxy docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy))

## Rehearse on a machine that already runs dev

If this VPS already has the panel running in dev (`npm run dev` / `npm run agent`) and live game servers, **do not** run the full installer blindly — it would conflict on ports 3000/9100.

### Step 1 — Safe dry run (nothing stopped)

```bash
sudo bash scripts/rehearse-install.sh --sslip
# or with your real domain:
sudo bash scripts/rehearse-install.sh --domain panel.example.com
```

This validates scripts, DNS, Caddy config, production build, and `db:migrate` without stopping dev servers or game instances.

### Step 2 — Go live on this VPS

When the dry run passes:

```bash
sudo bash scripts/rehearse-install.sh --domain panel.example.com --email you@example.com --cutover
```

Cutover stops dev panel/agent on 3000/9100, backs up `/etc/reforgerpanel/env`, and runs `install-vps.sh --existing` (systemd + Caddy + HTTPS). Game servers are untouched.

## Install

```bash
sudo rm -rf /opt/reforgerpanel   # only if retrying after a failed install
sudo mkdir -p /opt/reforgerpanel
sudo chown "$USER:$USER" /opt/reforgerpanel
git clone https://github.com/awade12/reforgerpanel.git /opt/reforgerpanel
cd /opt/reforgerpanel
sudo bash scripts/install-vps.sh --domain panel.example.com --email admin@example.com
```

`/opt` is owned by root — you cannot `git clone` there directly. Create the directory and `chown` it to your user first. Do **not** use `sudo git clone` (that leaves every file owned by root and breaks `npm`).

The script will:
1. Verify DNS resolves to this server
2. Install Node, SteamCMD, PostgreSQL, **Caddy**
3. Generate secrets, build the panel, run migrations
4. Bind the panel to `127.0.0.1:3000`
5. Configure Caddy + request a certificate
6. Wait until `https://panel.example.com/login` responds
7. Enable UFW (SSH + 80 + 443 only)

### Options

| Flag | Purpose |
|------|---------|
| `--domain HOST` | **Required** — public hostname |
| `--email ADDR` | ACME contact email (recommended) |
| `--with-bot` | Enable Discord bot systemd unit |
| `--no-ufw` | Skip UFW (you manage firewall elsewhere) |
| `--skip-game` | Skip ~10 GB SteamCMD download during install |
| `--skip-https-wait` | Skip post-install HTTPS verification |

## After install

1. Open **https://panel.example.com/setup**
2. Create the master admin account
3. **Game Install** → download server files if not already running in background
4. Configure Discord in the panel UI

Verify:

```bash
sudo bash scripts/check-install.sh
```

## Security model

| Component | Exposure |
|-----------|----------|
| Caddy | Public :80 / :443 |
| Panel (Next.js) | **127.0.0.1:3000** only |
| Agent | **127.0.0.1:9100** only |
| PostgreSQL | localhost only |
| Game UDP | Per-instance ports (forward separately) |

Session cookies use `Secure` + `HttpOnly` when `COOKIE_SECURE=true` (set automatically).

## Updating

```bash
cd /opt/reforgerpanel   # or: git clone https://github.com/awade12/reforgerpanel.git /opt/reforgerpanel
git pull
npm ci && npm run build && npm run db:migrate
sudo systemctl restart reforgerpanel-agent reforgerpanel
sudo bash scripts/caddy-setup.sh panel.example.com 3000 /opt/reforgerpanel/deploy/caddy/Caddyfile.template
```

## Troubleshooting

**DNS check failed during install**  
Wait for propagation, then re-run. Test: `dig +short A panel.example.com`

**HTTPS wait timed out**  
```bash
journalctl -u caddy -n 80
curl -v http://127.0.0.1:3000/login
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl restart caddy
sudo bash scripts/wait-for-https.sh panel.example.com
```

**Let's Encrypt rate limits**  
Use `--email` so Caddy can register an ACME account. For repeated failed attempts, wait or use [LE staging](https://caddyserver.com/docs/caddyfile/options#acme-ca) temporarily.

**Panel shows “agent not running”**  
`journalctl -u reforgerpanel-agent -f`

Install log: `/var/log/reforgerpanel-install.log`
