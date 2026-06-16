/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions */
import { useState } from "react"
import {
  useAddMember,
  useInvitations,
  useMembers,
  usePlatformMe,
  useRemoveMember,
  useRevokeInvitation,
  useTransferOwnership,
  useUpdateMemberRole,
} from "@/lib/api"
import { useCurrentWorkspace } from "@/hooks/use-current-workspace"
import {
  ActionButton,
  PageHeader,
  PageToolbar,
  SegmentedControl,
} from "@/components/shared/page-layout"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { StyledSelect } from "@/components/shared/styled-select"
import {
  can,
  canAssignWorkspaceRole,
  canManageWorkspaceRole,
  type WorkspaceRole,
} from "@bucketdrive/shared"

const editableRoles: Array<Exclude<WorkspaceRole, "owner">> = [
  "admin",
  "manager",
  "editor",
  "viewer",
  "guest",
]
const inviteRoles: Array<Exclude<WorkspaceRole, "owner">> = [
  "admin",
  "manager",
  "editor",
  "viewer",
  "guest",
]
const inviteRoleOptions = inviteRoles.map((entry) => ({ value: entry, label: entry }))

type Tab = "members" | "invitations"
type MemberConfirmAction =
  | { type: "member"; id: string; name: string }
  | { type: "invitation"; id: string; email: string }
  | { type: "transfer"; id: string; name: string }

export function MembersPage() {
  const { workspace, workspaceId, isLoading: workspacesLoading } = useCurrentWorkspace()
  const currentUserRole = workspace?.role ?? "viewer"
  const canInviteMembers = can(currentUserRole, "users.invite")
  const canManageMembers = can(currentUserRole, "users.update_roles")

  const membersQuery = useMembers(workspaceId)
  const invitationsQuery = useInvitations(workspaceId)
  const addMember = useAddMember(workspaceId)
  const updateMemberRole = useUpdateMemberRole(workspaceId)
  const removeMember = useRemoveMember(workspaceId)
  const revokeInvitation = useRevokeInvitation(workspaceId)
  const transferOwnership = useTransferOwnership(workspaceId)
  const meQuery = usePlatformMe()

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Exclude<WorkspaceRole, "owner">>("editor")
  const [activeTab, setActiveTab] = useState<Tab>("members")
  const [createdInvite, setCreatedInvite] = useState<{ inviteLink: string; email: string } | null>(
    null,
  )
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<MemberConfirmAction | null>(null)

  if (workspacesLoading || membersQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-text-tertiary text-sm">No bucket found</p>
      </div>
    )
  }

  const members = membersQuery.data?.data ?? []
  const invitations = invitationsQuery.data?.data ?? []
  const currentUserId = meQuery.data?.id ?? null
  const editableRoleOptions = editableRoles
    .filter((entry) => canAssignWorkspaceRole(currentUserRole, entry))
    .map((entry) => ({ value: entry, label: entry }))
  const filteredInviteRoleOptions = inviteRoleOptions.filter((entry) =>
    canAssignWorkspaceRole(currentUserRole, entry.value),
  )

  const handleConfirmAction = () => {
    if (!confirmAction) return

    if (confirmAction.type === "member") {
      removeMember.mutate(
        { memberId: confirmAction.id },
        { onSuccess: () => setConfirmAction(null) },
      )
      return
    }

    if (confirmAction.type === "transfer") {
      transferOwnership.mutate(
        { newOwnerId: confirmAction.id },
        { onSuccess: () => setConfirmAction(null) },
      )
      return
    }

    revokeInvitation.mutate(
      { invitationId: confirmAction.id },
      { onSuccess: () => setConfirmAction(null) },
    )
  }

  const confirmCopy = (() => {
    if (!confirmAction) return null
    if (confirmAction.type === "member") {
      return {
        title: "Remove member?",
        description: `${confirmAction.name} will lose access to this bucket.`,
        confirmLabel: "Remove",
        loadingLabel: "Removing...",
      }
    }
    if (confirmAction.type === "transfer") {
      return {
        title: "Transfer ownership?",
        description: `${confirmAction.name} will become the bucket owner and you will become an admin.`,
        confirmLabel: "Transfer",
        loadingLabel: "Transferring...",
      }
    }
    return {
      title: "Revoke invitation?",
      description: `The invitation for ${confirmAction.email} will stop working immediately.`,
      confirmLabel: "Revoke",
      loadingLabel: "Revoking...",
    }
  })()

  return (
    <div className="flex h-full min-w-0 flex-col p-4 sm:p-6">
      <PageHeader
        title="Members"
        description="Invite bucket members by email and manage global bucket roles."
      />

      {canInviteMembers && (
        <div className="border-border-default bg-surface-default mb-4 rounded-xl border p-5">
          <h2 className="text-text-primary text-base font-semibold">Invite Member</h2>
          <p className="text-text-tertiary mt-1 text-xs">
            Send an invitation link by email. The recipient can join by signing in with the invited
            email.
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
              className="border-border-default bg-bg-tertiary text-text-primary placeholder:text-text-tertiary focus:border-accent focus:ring-accent flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-1"
            />
            <StyledSelect
              value={role}
              onValueChange={setRole}
              options={filteredInviteRoleOptions}
              triggerClassName="bg-bg-tertiary py-2.5"
            />
            <ActionButton
              type="submit"
              variant="primary"
              disabled={addMember.isPending}
              loading={addMember.isPending}
              loadingLabel="Sending..."
            >
              Send invite
            </ActionButton>
          </form>

          {createdInvite && (
            <div className="border-accent/30 bg-accent/10 mt-4 rounded-xl border p-4">
              <p className="text-text-primary text-sm font-medium">
                Invitation sent to {createdInvite.email}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={createdInvite.inviteLink}
                  className="border-border-default bg-bg-tertiary text-text-secondary flex-1 rounded-lg border px-3 py-2 text-xs outline-none"
                />
                <ActionButton
                  type="button"
                  variant="primary"
                  className="px-3 py-2 text-xs"
                  onClick={() => {
                    void navigator.clipboard.writeText(createdInvite.inviteLink)
                    setCopiedInviteId("created")
                    window.setTimeout(() => setCopiedInviteId(null), 2000)
                  }}
                >
                  {copiedInviteId === "created" ? "Copied" : "Copy link"}
                </ActionButton>
              </div>
            </div>
          )}

          {addMember.isError && (
            <p className="text-error mt-3 text-sm">{addMember.error.message}</p>
          )}
        </div>
      )}

      <PageToolbar>
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Member list"
          options={[
            { value: "members", label: `Members (${String(members.length)})` },
            {
              value: "invitations",
              label: `Pending Invitations (${String(invitations.length)})`,
            },
          ]}
        />
      </PageToolbar>

      {activeTab === "members" && (
        <div className="border-border-default bg-surface-default overflow-hidden rounded-2xl border">
          <div className="divide-border-muted divide-y md:hidden">
            {members.map((entry) => (
              <div key={entry.id} className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  {entry.image ? (
                    <img src={entry.image} alt={entry.name} className="h-10 w-10 rounded-full" />
                  ) : (
                    <div className="bg-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white">
                      {entry.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-text-primary truncate text-sm font-medium">{entry.name}</p>
                    <p className="text-text-secondary truncate text-xs">{entry.email}</p>
                    <p className="text-text-tertiary mt-1 text-xs">
                      Joined {new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <StyledSelect
                    value={entry.role}
                    onValueChange={(nextRole) =>
                      updateMemberRole.mutate({
                        memberId: entry.id,
                        role: nextRole,
                      })
                    }
                    disabled={
                      !canManageMembers ||
                      entry.id === currentUserId ||
                      !canManageWorkspaceRole(currentUserRole, entry.role)
                    }
                    options={editableRoleOptions}
                    triggerClassName="bg-bg-tertiary capitalize"
                    contentClassName="capitalize"
                  />
                  {can(currentUserRole, "users.remove") &&
                    entry.id !== currentUserId &&
                    canManageWorkspaceRole(currentUserRole, entry.role) && (
                      <button
                        onClick={() => {
                          setConfirmAction({ type: "member", id: entry.id, name: entry.name })
                        }}
                        className="border-error/40 text-error hover:bg-error/10 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  {currentUserRole === "owner" && entry.role === "admin" && (
                    <button
                      onClick={() => {
                        setConfirmAction({ type: "transfer", id: entry.id, name: entry.name })
                      }}
                      className="border-accent/40 text-accent hover:bg-accent/10 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    >
                      Transfer ownership
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-border-muted bg-bg-tertiary border-b">
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">User</th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  Email
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  Joined
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">Role</th>
                <th className="text-text-tertiary px-4 py-3 text-right text-xs font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-border-muted hover:bg-surface-hover border-b last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {entry.image ? (
                        <img src={entry.image} alt={entry.name} className="h-9 w-9 rounded-full" />
                      ) : (
                        <div className="bg-accent flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white">
                          {entry.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-text-primary text-sm font-medium">{entry.name}</span>
                    </div>
                  </td>
                  <td className="text-text-secondary px-4 py-3 text-sm">{entry.email}</td>
                  <td className="text-text-secondary px-4 py-3 text-sm">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <StyledSelect
                      value={entry.role}
                      onValueChange={(nextRole) =>
                        updateMemberRole.mutate({
                          memberId: entry.id,
                          role: nextRole,
                        })
                      }
                      disabled={
                        !canManageMembers ||
                        entry.id === currentUserId ||
                        !canManageWorkspaceRole(currentUserRole, entry.role)
                      }
                      options={editableRoleOptions}
                      triggerClassName="bg-bg-tertiary capitalize"
                      contentClassName="capitalize"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {currentUserRole === "owner" && entry.role === "admin" && (
                        <button
                          onClick={() => {
                            setConfirmAction({ type: "transfer", id: entry.id, name: entry.name })
                          }}
                          className="border-accent/40 text-accent hover:bg-accent/10 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                        >
                          Transfer
                        </button>
                      )}
                      {can(currentUserRole, "users.remove") &&
                        entry.id !== currentUserId &&
                        canManageWorkspaceRole(currentUserRole, entry.role) && (
                          <button
                            onClick={() => {
                              setConfirmAction({ type: "member", id: entry.id, name: entry.name })
                            }}
                            className="border-error/40 text-error hover:bg-error/10 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
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
            <div className="text-text-tertiary px-4 py-8 text-center text-sm">
              No members found.
            </div>
          )}
        </div>
      )}

      {activeTab === "invitations" && (
        <div className="border-border-default bg-surface-default overflow-hidden rounded-2xl border">
          <div className="divide-border-muted divide-y md:hidden">
            {invitations.map((entry) => (
              <div key={entry.id} className="space-y-3 p-4">
                <div className="min-w-0">
                  <p className="text-text-primary truncate text-sm font-medium">{entry.email}</p>
                  <p className="text-text-secondary mt-1 text-xs capitalize">Role: {entry.role}</p>
                  <p className="text-text-tertiary mt-1 text-xs">
                    Invited by {entry.invitedByName}
                  </p>
                  <p className="text-text-tertiary mt-1 text-xs">
                    Expires {new Date(entry.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => {
                      const link =
                        entry.inviteLink ?? `${window.location.origin}/join?token=${entry.id}`
                      void navigator.clipboard.writeText(link)
                      setCopiedInviteId(entry.id)
                      window.setTimeout(
                        () =>
                          setCopiedInviteId((current) => (current === entry.id ? null : current)),
                        2000,
                      )
                    }}
                    className="border-border-default text-text-secondary hover:bg-surface-hover rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                  >
                    {copiedInviteId === entry.id ? "Copied" : "Copy link"}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmAction({
                        type: "invitation",
                        id: entry.id,
                        email: entry.email,
                      })
                    }}
                    className="border-error/40 text-error hover:bg-error/10 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>

          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-border-muted bg-bg-tertiary border-b">
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  Email
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">Role</th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  Invited by
                </th>
                <th className="text-text-tertiary px-4 py-3 text-left text-xs font-medium">
                  Expires
                </th>
                <th className="text-text-tertiary px-4 py-3 text-right text-xs font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-border-muted hover:bg-surface-hover border-b last:border-b-0"
                >
                  <td className="text-text-primary px-4 py-3 text-sm">{entry.email}</td>
                  <td className="text-text-secondary px-4 py-3 text-sm capitalize">{entry.role}</td>
                  <td className="text-text-secondary px-4 py-3 text-sm">{entry.invitedByName}</td>
                  <td className="text-text-secondary px-4 py-3 text-sm">
                    {new Date(entry.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          const link =
                            entry.inviteLink ?? `${window.location.origin}/join?token=${entry.id}`
                          void navigator.clipboard.writeText(link)
                          setCopiedInviteId(entry.id)
                          window.setTimeout(
                            () =>
                              setCopiedInviteId((current) =>
                                current === entry.id ? null : current,
                              ),
                            2000,
                          )
                        }}
                        className="border-border-default text-text-secondary hover:bg-surface-hover rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                      >
                        {copiedInviteId === entry.id ? "Copied" : "Copy link"}
                      </button>
                      <button
                        onClick={() => {
                          setConfirmAction({
                            type: "invitation",
                            id: entry.id,
                            email: entry.email,
                          })
                        }}
                        className="border-error/40 text-error hover:bg-error/10 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
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
            <div className="text-text-tertiary px-4 py-8 text-center text-sm">
              No pending invitations.
            </div>
          )}
        </div>
      )}

      {(membersQuery.isError ||
        updateMemberRole.isError ||
        removeMember.isError ||
        revokeInvitation.isError ||
        transferOwnership.isError) && (
        <div className="border-error/40 bg-error/10 text-error rounded-xl border px-4 py-3 text-sm">
          {membersQuery.error?.message ??
            updateMemberRole.error?.message ??
            removeMember.error?.message ??
            revokeInvitation.error?.message ??
            transferOwnership.error?.message}
        </div>
      )}

      {confirmCopy && (
        <ConfirmDialog
          open={confirmAction !== null}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          loadingLabel={confirmCopy.loadingLabel}
          loading={
            removeMember.isPending || revokeInvitation.isPending || transferOwnership.isPending
          }
          onConfirm={handleConfirmAction}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null)
          }}
        />
      )}
    </div>
  )
}
