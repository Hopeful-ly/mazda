"use client";

import { Key, Plus, Save, Shield, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";

interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: "ADMIN" | "USER";
  createdAt: Date;
  _count: { books: number; collections: number };
}

export default function AdminPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: user, isLoading: meLoading } = trpc.auth.me.useQuery();

  // Redirect non-admins
  useEffect(() => {
    if (!meLoading && (!user || user.role !== "ADMIN")) {
      router.replace("/");
    }
  }, [meLoading, user, router]);

  const { data: users, isLoading: usersLoading } =
    trpc.admin.listUsers.useQuery(undefined, {
      enabled: user?.role === "ADMIN",
    });

  // ── Mutations ──────────────────────────────────────────────

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => utils.admin.listUsers.invalidate(),
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      setDeleteTarget(null);
    },
  });

  const resetPassword = trpc.admin.resetPassword.useMutation({
    onSuccess: () => {
      setResetTarget(null);
      setResetNewPassword("");
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3000);
    },
  });

  const createUser = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      setCreateForm({ email: "", username: "", password: "", role: "USER" });
      setCreateSuccess(true);
      setTimeout(() => setCreateSuccess(false), 3000);
    },
  });

  // ── Local state ────────────────────────────────────────────

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);

  const [resetTarget, setResetTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  const [createForm, setCreateForm] = useState({
    email: "",
    username: "",
    password: "",
    role: "USER" as "USER" | "ADMIN",
  });
  const [createSuccess, setCreateSuccess] = useState(false);

  // ── Guard ──────────────────────────────────────────────────

  if (meLoading || usersLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") return null;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Administration</h1>
      </div>

      {/* ── Users Table ───────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-border bg-background p-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Users</h2>
          <Badge className="ml-auto">{users?.length ?? 0} total</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Username</th>
                <th className="pb-3 pr-4 font-medium">Email</th>
                <th className="pb-3 pr-4 font-medium">Role</th>
                <th className="pb-3 pr-4 font-medium">Joined</th>
                <th className="pb-3 pr-4 font-medium">Books</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users?.map((u: AdminUser) => {
                const isSelf = u.id === user.id;
                return (
                  <tr key={u.id} className="group">
                    <td className="py-3 pr-4 font-medium text-foreground">
                      {u.username}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {u.email}
                    </td>
                    <td className="py-3 pr-4">
                      {isSelf ? (
                        <Badge color="primary">{u.role}</Badge>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) =>
                            updateRole.mutate({
                              userId: u.id,
                              role: e.target.value as "USER" | "ADMIN",
                            })
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                      {u._count.books}
                    </td>
                    <td className="py-3">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">
                          (you)
                        </span>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setResetTarget({
                                id: u.id,
                                username: u.username,
                              })
                            }
                            title="Reset password"
                          >
                            <Key className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDeleteTarget({
                                id: u.id,
                                username: u.username,
                              })
                            }
                            title="Delete user"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-danger" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {resetSuccess && (
          <p className="text-sm font-medium text-success">
            Password reset successfully.
          </p>
        )}
      </section>

      {/* ── Create User ───────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-border bg-background p-6">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Create User</h2>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate(createForm);
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Input
            label="Email"
            type="email"
            required
            value={createForm.email}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, email: e.target.value }))
            }
            placeholder="user@example.com"
          />
          <Input
            label="Username"
            required
            minLength={3}
            maxLength={32}
            value={createForm.username}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, username: e.target.value }))
            }
            placeholder="username"
          />
          <Input
            label="Password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            value={createForm.password}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, password: e.target.value }))
            }
            placeholder="Min 8 characters"
          />
          <div className="w-full">
            <label
              htmlFor="create-role"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Role
            </label>
            <select
              id="create-role"
              value={createForm.role}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  role: e.target.value as "USER" | "ADMIN",
                }))
              }
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>

          <div className="flex items-end gap-4 sm:col-span-2">
            <Button type="submit" loading={createUser.isPending}>
              <Save className="h-4 w-4" />
              Create User
            </Button>

            {createSuccess && (
              <span className="text-sm font-medium text-success">
                User created successfully.
              </span>
            )}

            {createUser.isError && (
              <span className="text-sm font-medium text-danger">
                {createUser.error.message}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* ── Delete Confirmation Modal ─────────────────────── */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete User"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-foreground">
            {deleteTarget?.username}
          </span>
          ? This action cannot be undone. All of their data will be permanently
          removed.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleteUser.isPending}
            onClick={() => {
              if (deleteTarget) {
                deleteUser.mutate({ userId: deleteTarget.id });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </Modal>

      {/* ── Reset Password Modal ──────────────────────────── */}
      <Modal
        open={resetTarget !== null}
        onClose={() => {
          setResetTarget(null);
          setResetNewPassword("");
        }}
        title="Reset Password"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Set a new password for{" "}
          <span className="font-semibold text-foreground">
            {resetTarget?.username}
          </span>
          .
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (resetTarget) {
              resetPassword.mutate({
                userId: resetTarget.id,
                newPassword: resetNewPassword,
              });
            }
          }}
          className="space-y-4"
        >
          <Input
            label="New Password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            value={resetNewPassword}
            onChange={(e) => setResetNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            error={
              resetPassword.isError ? resetPassword.error.message : undefined
            }
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setResetTarget(null);
                setResetNewPassword("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={resetPassword.isPending}>
              <Key className="h-4 w-4" />
              Reset Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
