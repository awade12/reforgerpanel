# Reforger Host

Arma Reforger dedicated server console for Ubuntu 22.04+.

**Repository:** [github.com/awade12/reforgerpanel](https://github.com/awade12/reforgerpanel)

## VPS deploy (production)

**Requires a domain.** HTTPS via Caddy + Let's Encrypt is mandatory — the panel is not exposed on port 3000 publicly.

```bash
# /opt is root-owned — create the target dir as your user first (do not sudo git clone)
sudo rm -rf /opt/reforgerpanel   # only if retrying after a failed install
sudo mkdir -p /opt/reforgerpanel
sudo chown "$USER:$USER" /opt/reforgerpanel
git clone https://github.com/awade12/reforgerpanel.git /opt/reforgerpanel
cd /opt/reforgerpanel
sudo bash scripts/install-vps.sh --domain panel.example.com --email admin@example.com
```

Then open **https://panel.example.com/setup** and create the master admin.

Full guide: [docs/VPS-DEPLOY.md](docs/VPS-DEPLOY.md)

**Already running dev on this machine?** Rehearse without stopping game servers:

```bash
sudo bash scripts/rehearse-install.sh --sslip          # dry run with auto test hostname
sudo bash scripts/rehearse-install.sh --domain panel.example.com --cutover --email you@example.com  # go live
```

Verify: `sudo bash scripts/check-install.sh`

## Features

- SteamCMD install/update (stable `1874900`, experimental `1890870`)
- Multi-instance management with systemd
- Full `config.json` editor
- Custom mission library with mod dependency merge
- BattlEye append-only RCon editor + repair helper
- Live log tailing
- Crash detection, auto-restart, Discord webhooks
- Discord bot (`npm run bot`) — slash-command dashboard for host + instances
- Scheduled stable updates
- Networking / port-forward help page

## Quick start

```bash
# 1. Host bootstrap (root)
sudo bash scripts/bootstrap-host.sh

# 2. Panel env (copy and edit secrets)
sudo cp deploy/reforgerpanel.env.example /etc/reforgerpanel/env
sudo chmod 600 /etc/reforgerpanel/env

# 3. Install deps & run (both processes required)
cd /home/ubuntu/reforgerpanel
npm install
npm run agent   # terminal 1 — host agent on 127.0.0.1:9100
npm run dev     # terminal 2 — web UI on :3000
npm run bot     # optional — Discord bot (needs DISCORD_* env vars)
# or: npm run dev:all
```

Default login: with PostgreSQL configured, first visit opens **Create master admin** at `/setup`. Without PostgreSQL, use `ADMIN_PASSWORD` from env (default `admin`).

## Production systemd

```bash
# Optional but recommended: PostgreSQL for panel/agent/bot state
sudo bash scripts/setup-postgres.sh
cd /home/ubuntu/reforgerpanel && npm run db:migrate

sudo cp deploy/reforgerpanel-agent.service /etc/systemd/system/
sudo cp deploy/reforgerpanel.service /etc/systemd/system/
sudo cp deploy/reforgerpanel-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now reforgerpanel-agent reforgerpanel reforgerpanel-bot
```

Local dev with Docker Postgres: `npm run db:up` then set `DATABASE_URL=postgresql://reforgerpanel:reforgerpanel@127.0.0.1:5432/reforgerpanel` and `SECRETS_ENCRYPTION_KEY` in `.env.local`.

Panel secrets (Discord token, webhooks, Resend API key) are encrypted at rest in PostgreSQL when `SECRETS_ENCRYPTION_KEY` is set. The browser never receives raw values — only masked placeholders.

Install the game from the **Game Install** page or:

```bash
steamcmd +runscript /opt/reforger/steamcmd/update_stable.txt
```

## Layout

```
/opt/reforger/
  server-stable/   # Steam app 1874900
  server-exp/      # Steam app 1890870
  instances/       # per-instance config/profile
  missions/        # custom missions
  local-mods/      # unpublished mods
```

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 2001+ | UDP | Game (per instance) |
| 17777 | UDP | A2S query (optional) |
| 19999 | UDP | RCON (optional) |
| 3000 | localhost only | Panel (Caddy proxies HTTPS) |
| 9100 | TCP | Agent (localhost only) |

Forward UDP game ports on your router for public access. Set `publicAddress` in each instance config.

## Custom missions

Register missions under **Missions** with:

- `scenarioId` (e.g. `{GUID}Missions/MyMission.conf`)
- Required mods JSON (`modId`, optional `name`, `version`)
- Optional `.conf` file upload

When creating an instance, select a custom mission to auto-merge its mods.

## systemd permissions

The agent writes `reforger@.service` units to `/etc/systemd/system`. Allow the panel user passwordless control:

```bash
sudo visudo -f /etc/sudoers.d/reforgerpanel
# ubuntu ALL=(root) NOPASSWD: /bin/systemctl, /bin/systemctl *
```

Or run `reforgerpanel-agent.service` as root (less ideal).

- Change `ADMIN_PASSWORD`, `AGENT_TOKEN`, and `SESSION_SECRET` before exposing the panel
- Keep the agent on `127.0.0.1`; put the web UI behind nginx/Caddy with TLS for remote access

## Agent architecture

HTTP routes live under `agent/routes/` (`instances`, `host`, `missions`, `settings`, `bot`, `auth`). `agent/router.ts` dispatches requests and enforces panel permissions from the signed session (`x-panel-session`), not only `AGENT_TOKEN`.

## Operations

**E2E smoke test** (login → list instances → status vs systemd):

```bash
export SMOKE_EMAIL=admin@example.com SMOKE_PASSWORD='your-password'
npm run smoke
```

**Secrets rotation** (encryption key, agent token, Discord): see [docs/SECRETS-ROTATION.md](docs/SECRETS-ROTATION.md). Re-encrypt stored settings with `SECRETS_ENCRYPTION_KEY_OLD` + `SECRETS_ENCRYPTION_KEY`, then `npm run secrets:rotate`.

**Sessions**: failed logins lock the account for 15 minutes after 5 failures. Logout revokes the server session; master admins can call `POST /auth/logout-all` (via agent) to invalidate every panel session.
