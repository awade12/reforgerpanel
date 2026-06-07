# Changelog

All notable changes to Reforger Host are documented here.

## [Unreleased]

### Added

- Refresh workshop mods on scheduled game update (clears cached mod files before instances restart)
- Manual **Refresh workshop mods** uses Reforger mod IDs and restarts running instances to pull latest files

### Fixed

- Fix workshop mod refresh not updating mods: stop the server before clearing cache, purge temp download dirs, and remove pinned mod versions from config
- Fix panel auto-update leaving the site on HTTP 503: split systemd restarts (combined restart was blocked by sudoers), wait for the web UI, reload Caddy, and ensure the panel starts on script exit

### Changed

- Game update **Refresh workshop mods and restart instances after update** setting clears mod cache by mod ID, not Steam numeric workshop IDs
- Hosting guide and Mods tab explain that the game downloads latest mods on start after cache refresh

## [0.2.0] - 2026-06-05

### Added

- Add smooth page transitions when navigating the panel (Framer Motion)
- Add a Hosting guide on Help with solo-VPS troubleshooting and in-app release notes
- Add a live server list in the sidebar with status dots for each instance
- Add the Panel agent health card on Metrics → Agent (not on Dashboard)
- Add panel version in the sidebar footer
- Add optional `NEXT_PUBLIC_PANEL_TITLE` to customize the sidebar header (footer stays Reforger Host)

### Changed

- Move the Panel agent health card from Dashboard to Metrics → Agent (Dashboard is servers only)
- Replace the sidebar header server icon with a crosshair mark for Reforger Host branding
- Speed up page changes with route prefetch, cached GET requests, and lighter auth checks in middleware
- Move host alerts bell into the sidebar and remove the sticky top bar
- Show page titles and instance actions in the main content area instead of the top bar
- Show only running or starting servers in the sidebar Instances list
- Rename the panel to **Reforger Host** in the UI, Discord messages, and install output
- Reorganize the sidebar into Overview, Host, Instances, and System with Reforger Host fixed in the footer
- Keep the sidebar mounted when changing pages so the server list does not reload or flicker
- Move instance tabs back onto instance pages (Settings, Network, Mods, Players, Logs, Admin)
- Simplify the Metrics Agent tab and host metrics header layout

### Fixed

- Fix pages flashing empty content then reloading data after navigation (missions and cached routes)
- Remove the extra loading skeleton that appeared on top of page transitions
- Fix instance settings, alerts, and advanced options resetting while you edit during status polling
- Fix mission rotation crash when checking whether a game update was running
- Improve dashboard and metrics agent status when polling is slow or briefly fails

## [0.1.0] - 2026-06-04

### Added

- Web UI and local agent for Ubuntu VPS dedicated servers
- SteamCMD install for stable and experimental server branches
- Multi-instance management with systemd (`reforger@` units)
- Server config editor (form and JSON) with network, scenario, mods, and BattlEye fields
- Game Install page, mission library, and mission rotation
- Live logs, crash detection, and optional auto-restart
- Host and per-instance metrics with PostgreSQL history
- Discord webhooks, status embeds, and optional Discord bot
- UFW firewall helpers and network preflight checks
- Instance backups, templates, and clone
- HTTPS production install via Caddy (`install-vps.sh`)
- Panel users, roles, audit log, and encrypted secrets in PostgreSQL
