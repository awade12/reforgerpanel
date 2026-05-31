# Secrets rotation

Rotate credentials without taking the panel offline. Run these on the host where the agent and panel run.

## AGENT_TOKEN

1. Generate a new token: `openssl rand -hex 32`
2. Set `AGENT_TOKEN` in `.env.local` (panel) and the agent environment (systemd unit or `deploy/reforgerpanel.env`).
3. Restart the agent, then the panel: `systemctl restart reforgerpanel-agent reforgerpanel` (or `npm run agent` / `npm run dev` in development).
4. Restart the Discord bot if it calls the agent.

The panel proxy and bot must use the same token as the agent.

## SECRETS_ENCRYPTION_KEY

Used to encrypt Discord, Resend, and RCON secrets at rest. Rotating requires re-encrypting stored settings.

1. Generate a new 32-byte key: `openssl rand -hex 32`
2. Keep the old key available as `SECRETS_ENCRYPTION_KEY_OLD` (add to env temporarily).
3. Run: `npm run secrets:rotate`
4. Remove `SECRETS_ENCRYPTION_KEY_OLD` from env after success.
5. Restart the agent.

Without the old key, encrypted values cannot be decrypted.

## Discord bot token

1. In the Discord Developer Portal, reset the bot token.
2. Open **Settings → Discord** in the panel and paste the new token (master/admin).
3. Save settings, then restart the bot service.

No agent restart is required if `SECRETS_ENCRYPTION_KEY` is unchanged.

## Panel session secret

`PANEL_SESSION_SECRET` (or `SESSION_SECRET`) signs login cookies. Rotating it logs everyone out but does not require database migration.

1. Set a new secret in panel env.
2. Restart the panel.
3. Users sign in again.

For immediate lockout of a user, disable the account or use **Log out everywhere** (master) instead of rotating this secret.
