"use client";

import { useEffect, useState } from "react";
import { Shell, Card, Button, Input, api, ApiError } from "@/components/Shell";
import type { PanelRole, PanelUser } from "@/lib/shared/types";

const ROLES: PanelRole[] = ["admin", "operator", "viewer"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PanelRole>("operator");

  async function load() {
    setUsers(await api<PanelUser[]>("auth/users"));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load users"));
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setCreating(true);
    try {
      await api("auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, password, role }),
      });
      setEmail("");
      setName("");
      setPassword("");
      setRole("operator");
      setMessage("User created");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function toggleDisabled(user: PanelUser) {
    setMessage("");
    setError("");
    try {
      await api(`auth/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !user.disabled }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function removeUser(user: PanelUser) {
    if (!confirm(`Delete ${user.email}?`)) return;
    setMessage("");
    setError("");
    try {
      await api(`auth/users/${user.id}`, { method: "DELETE" });
      setMessage("User deleted");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <Shell header={{ title: "Users", meta: "Panel accounts and roles" }}>
      {message && <p className="mb-4 text-emerald-400">{message}</p>}
      {error && <p className="mb-4 text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Create user">
          <form onSubmit={(e) => void createUser(e)} className="grid gap-3">
            <Input label="Email" value={email} onChange={setEmail} />
            <Input label="Display name" value={name} onChange={setName} />
            <Input label="Password" type="password" value={password} onChange={setPassword} />
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as PanelRole)}
                className="border border-border bg-background px-3 py-2"
              >
                {ROLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={creating || !email || !password}>
              Create user
            </Button>
          </form>
        </Card>

        <Card title="Accounts">
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{user.name || user.email}</p>
                    <p className="text-muted-foreground">{user.email}</p>
                    <p className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                      {user.role}
                      {user.disabled ? " · disabled" : ""}
                    </p>
                  </div>
                  {user.role !== "master" && (
                    <div className="flex shrink-0 gap-2">
                      <Button variant="ghost" onClick={() => void toggleDisabled(user)}>
                        {user.disabled ? "Enable" : "Disable"}
                      </Button>
                      <Button variant="ghost" onClick={() => void removeUser(user)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
