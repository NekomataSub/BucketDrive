/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import { useState } from "react"
import {
  useAddMember,
  useInvitations,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useTransferOwnership,
  useUpdateMemberRole,
   } from "@/lib/api"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import { can, type WorkspaceRole } from "@bucketdrive/shared"

const editableRoles: WorkspaceRole[] = ["owner", "admin", "manager", "editor", "viewer"]
const inviteRoles: Array<Exclude<WorkspaceRole, "owner">> = ["admin", "manager", "editor", "viewer"]
const ownershipTransferRecipientRoles = new Set<WorkspaceRole>(["admin"])

type Tab = "members" | "invitations"

export function MembersPage() {
  const { workspace, workspaceId, isLoading: workspacesLoading } = useCurrentWorkspace()
  const currentUserRole = workspace?.role ?? "viewer"
  const isOwner = can(currentUserRole, "workspace.transfer")
  const canManageMembers = can(currentUserRole, "users.update_roles")

  const membersQuery = useMembers(workspaceId)
  const invitationsQuery = useInvitations(workspaceId)
  const addMember = useAddMember(workspaceId)
  const updateMemberRole = useUpdateMemberRole(workspaceId)
  const removeMember = useRemoveMember(workspaceId)
  const revokeInvitation = useRevokeInvitation(workspaceId)
  const transferOwnership = useTransferOwnership(workspaceId)

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Exclude<WorkspaceRole, "owner">>("editor")
  const [activeTab, setActiveTab] = useState<Tab>("members")
  const [createdInvite, setCreatedInvite] = useState<{ inviteLink: string; email: string } | null>(null)
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null)

  if (workspacesLoading || membersQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-text-tertiary">No workspace found</p>
      </div>
    )
  }

  const members = membersQuery.data?.data ?? []
  const invitations = invitationsQuery.data?.data ?? []

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Members</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Invite members by email, manage roles, and transfer workspace ownership.
        </p>
      </div>

      <div className="rounded-2xl border border-border-default bg-surface-default p-5">
        <h2 className="text-base font-semibold text-text-primary">Invite Member</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Send an invitation link by email. The recipient can join by signing in with the invited email.
        </p>

        <form
          className="mt-4 flex flex-col gap-3 md:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            if (!email.trim()) return
            addMember.mutate(
              { email: email.trim(), role },
              {
                onSuccess: (data) => {
                  setEmail("")
                  setRole("editor")
                  setCreatedInvite({ inviteLink: data.inviteLink, email: data.email })
                },
              },
            )
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@company.com"
            className="flex-1 rounded-xl border border-border-default bg-bg-tertiary px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Exclude<WorkspaceRole, "owner">)}
            className="rounded-xl border border-border-default bg-bg-tertiary px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {inviteRoles.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addMember.isPending}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {addMember.isPending ? "Sending..." : "Send invite"}
          </button>
        </form>

        {createdInvite && (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-4">
            <p className="text-sm font-medium text-text-primary">
              Invitation sent to {createdInvite.email}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={createdInvite.inviteLink}
                className="flex-1 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-xs text-text-secondary outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(createdInvite.inviteLink)
                  setCreatedInvite(null)
                }}
                className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                Copy link
              </button>
            </div>
          </div>
        )}

        {addMember.isError && (
          <p className="mt-3 text-sm text-error">{addMember.error.message}</p>
        )}
      </div>

      <div className="flex items-center gap-4 border-b border-border-default">
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
            activeTab === "members"
              ? "border-accent text-accent"
              : "border-transparent text-text-tertiary hover:text-text-secondary"
          }`}
        >
          Members ({members.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("invitations")}
          className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
            activeTab === "invitations"
              ? "border-accent text-accent"
              : "border-transparent text-text-tertiary hover:text-text-secondary"
          }`}
        >
          Pending Invitations ({invitations.length})
        </button>
      </div>

      {activeTab === "members" && (
        <div className="overflow-hidden rounded-2xl border border-border-default bg-surface-default">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-muted bg-bg-tertiary">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Role</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-tertiary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border-muted last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {entry.image ? (
                        <img src={entry.image} alt={entry.name} className="h-9 w-9 rounded-full" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
                          {entry.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium text-text-primary">{entry.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{entry.email}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={entry.role}
                      onChange={(event) =>
                        updateMemberRole.mutate({
                          memberId: entry.id,
                          role: event.target.value as WorkspaceRole,
                        })
                      }
                      disabled={!canManageMembers}
                      className="rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm capitalize text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                    >
                      {editableRoles.map((availableRole) => (
                        <option key={availableRole} value={availableRole}>
                          {availableRole}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isOwner && ownershipTransferRecipientRoles.has(entry.role) && (
                        <button
                          onClick={() => setTransferTargetId(entry.userId)}
                          className="rounded-lg border border-accent/40 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                        >
                          Transfer ownership
                        </button>
                      )}
                      {can(currentUserRole, "users.remove") && (
                        <button
                          onClick={() => {
                            const confirmed = window.confirm(`Remove ${entry.name} from this workspace?`)
                            if (confirmed) {
                              removeMember.mutate({ memberId: entry.id })
                            }
                          }}
                          className="rounded-lg border border-error/40 px-3 py-2 text-xs font-medium text-error transition-colors hover:bg-error/10"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {members.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              No members found.
            </div>
          )}
        </div>
      )}

      {activeTab === "invitations" && (
        <div className="overflow-hidden rounded-2xl border border-border-default bg-surface-default">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-muted bg-bg-tertiary">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Invited by</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">Expires</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-tertiary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border-muted last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 text-sm text-text-primary">{entry.email}</td>
                  <td className="px-4 py-3 text-sm capitalize text-text-secondary">{entry.role}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{entry.invitedByName}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {new Date(entry.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          const baseUrl = window.location.origin
                          const link = `${baseUrl}/join?token=${entry.id}`
                          void navigator.clipboard.writeText(link)
                        }}
                        className="rounded-lg border border-border-default px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover"
                      >
                        Copy link
                      </button>
                      <button
                        onClick={() => {
                          const confirmed = window.confirm(`Revoke invitation for ${entry.email}?`)
                          if (confirmed) {
                            revokeInvitation.mutate({ invitationId: entry.id })
                          }
                        }}
                        className="rounded-lg border border-error/40 px-3 py-2 text-xs font-medium text-error transition-colors hover:bg-error/10"
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {invitations.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              No pending invitations.
            </div>
          )}
        </div>
      )}

      {transferTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl border border-border-default bg-surface-default p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-text-primary">Transfer Ownership</h3>
            <p className="mt-2 text-sm text-text-secondary">
              You are about to transfer ownership of this workspace. You will be downgraded to admin.
              This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setTransferTargetId(null)}
                className="rounded-xl border border-border-default px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  transferOwnership.mutate(
                    { newOwnerId: transferTargetId },
                    {
                      onSuccess: () => {
                        setTransferTargetId(null)
                      },
                    },
                  )
                }}
                disabled={transferOwnership.isPending}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {transferOwnership.isPending ? "Transferring..." : "Confirm Transfer"}
              </button>
            </div>
            {transferOwnership.isError && (
              <p className="mt-3 text-sm text-error">{transferOwnership.error.message}</p>
            )}
          </div>
        </div>
      )}

      {(membersQuery.isError || updateMemberRole.isError || removeMember.isError || revokeInvitation.isError) && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {membersQuery.error?.message ??
            updateMemberRole.error?.message ??
            removeMember.error?.message ??
            revokeInvitation.error?.message}
        </div>
      )}
    </div>
  )
}
