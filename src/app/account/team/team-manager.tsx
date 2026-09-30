'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, Plus, Shield, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { PERMISSION_GROUPS, type Permission } from '@/lib/workspace/permissions'

type Member = {
	id: string
	userId: string
	email: string
	roleId: string
	roleName: string
	isOwner: boolean
	joinedAt: string
}

type Invite = {
	id: string
	email: string
	roleName: string
	expiresAt: string
}

type Role = {
	id: string
	name: string
	permissions: Permission[]
	system: boolean
	members: number
}

export function TeamManager({
	can,
	you,
}: {
	can: { invite: boolean; manage: boolean; roles: boolean }
	you: string
}) {
	const [members, setMembers] = useState<Member[] | null>(null)
	const [invites, setInvites] = useState<Invite[]>([])
	const [roles, setRoles] = useState<Role[]>([])
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)

	const refresh = async () => {
		const [teamResponse, rolesResponse] = await Promise.all([
			fetch('/api/account/team', { cache: 'no-store' }),
			fetch('/api/account/roles', { cache: 'no-store' }),
		])
		if (!teamResponse.ok || !rolesResponse.ok) {
			setError('Could not load your team.')
			setMembers([])
			return
		}
		const team = await teamResponse.json()
		setMembers(team.members)
		setInvites(team.invites)
		setRoles((await rolesResponse.json()).roles)
	}

	useEffect(() => {
		void refresh()
	}, [])

	if (members === null)
		return (
			<div className='flex items-center gap-2 py-20 text-sm text-slate-500'>
				<Loader2 className='size-4 animate-spin' /> Loading your team…
			</div>
		)

	return (
		<div className='space-y-12'>
			<div className='flex flex-wrap items-end justify-between gap-4'>
				<div>
					<h1 className='font-display text-3xl font-semibold text-white'>
						Team
					</h1>
					<p className='mt-2 leading-7 text-slate-400'>
						Everyone on this account, and what their role lets them do.
					</p>
				</div>
				{can.invite && (
					<InviteDialog
						roles={roles}
						onInvited={(email) => {
							setNotice(`Invitation sent to ${email}.`)
							void refresh()
						}}
						onError={setError}
					/>
				)}
			</div>

			{error && <p className='text-sm text-destructive'>{error}</p>}
			{notice && <p className='text-sm text-brand'>{notice}</p>}

			<section>
				<h2 className='font-display text-lg font-semibold text-white'>
					People
				</h2>
				<div className='-mx-6 mt-4 overflow-x-auto px-6 sm:mx-0 sm:px-0'>
					<table className='w-full min-w-[34rem] border-collapse text-sm'>
						<thead>
							<tr className='border-b border-white/10 text-left text-xs font-semibold uppercase tracking-widest text-slate-500'>
								<th className='py-3 pr-4 font-semibold'>Person</th>
								<th className='py-3 pr-4 font-semibold'>Role</th>
								<th className='py-3 font-semibold'>
									<span className='sr-only'>Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{members.map((member) => (
								<tr key={member.id} className='border-b border-white/5'>
									<td className='py-3 pr-4'>
										<span className='text-white'>{member.email}</span>
										{member.userId === you && (
											<span className='ml-2 text-xs text-slate-500'>you</span>
										)}
									</td>
									<td className='py-3 pr-4'>
										{member.isOwner || !can.manage ? (
											<span className='text-slate-400'>
												{member.isOwner ? 'Account owner' : member.roleName}
											</span>
										) : (
											<Select
												value={member.roleId}
												onValueChange={async (roleId) => {
													const response = await fetch(
														`/api/account/team/${member.id}`,
														{
															method: 'PATCH',
															headers: {
																'Content-Type': 'application/json',
															},
															body: JSON.stringify({ roleId }),
														},
													)
													if (!response.ok) {
														const body = await response.json().catch(() => ({}))
														setError(
															body.error ?? 'Could not change that role.',
														)
													}
													void refresh()
												}}>
												<SelectTrigger className='h-8 w-44'>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{roles.map((role) => (
														<SelectItem key={role.id} value={role.id}>
															{role.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									</td>
									<td className='py-3 text-right'>
										{can.manage && !member.isOwner && (
											<button
												type='button'
												aria-label={`Remove ${member.email}`}
												onClick={async () => {
													if (!confirm(`Remove ${member.email}?`)) return
													await fetch(`/api/account/team/${member.id}`, {
														method: 'DELETE',
													})
													void refresh()
												}}
												className='text-slate-600 transition-colors hover:text-destructive'>
												<Trash2 className='size-4' />
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{invites.length > 0 && (
				<section>
					<h2 className='font-display text-lg font-semibold text-white'>
						Pending invitations
					</h2>
					<ul className='mt-4 space-y-2'>
						{invites.map((invite) => (
							<li
								key={invite.id}
								className='flex items-center gap-3 rounded-lg border border-white/10 bg-white/3 px-4 py-3 text-sm'>
								<Mail className='size-4 shrink-0 text-slate-500' />
								<span className='min-w-0 flex-1 truncate text-white'>
									{invite.email}
								</span>
								<span className='shrink-0 text-xs text-slate-500'>
									{invite.roleName} · expires{' '}
									{new Date(invite.expiresAt).toLocaleDateString()}
								</span>
								{can.invite && (
									<button
										type='button'
										aria-label={`Revoke the invitation for ${invite.email}`}
										onClick={async () => {
											await fetch(`/api/account/invites?id=${invite.id}`, {
												method: 'DELETE',
											})
											void refresh()
										}}
										className='shrink-0 text-slate-600 transition-colors hover:text-destructive'>
										<X className='size-4' />
									</button>
								)}
							</li>
						))}
					</ul>
				</section>
			)}

			<RolesSection
				roles={roles}
				canManage={can.roles}
				onChanged={refresh}
				onError={setError}
			/>
		</div>
	)
}

function InviteDialog({
	roles,
	onInvited,
	onError,
}: {
	roles: Role[]
	onInvited: (email: string) => void
	onError: (message: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [email, setEmail] = useState('')
	const [roleId, setRoleId] = useState('')
	const [busy, setBusy] = useState(false)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		const response = await fetch('/api/account/invites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, roleId: roleId || roles[0]?.id }),
		})
		setBusy(false)
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			onError(body.error ?? 'That invitation could not be sent.')
			return
		}
		setOpen(false)
		setEmail('')
		onInvited(email)
	}

	return (
		<>
			<Button
				onClick={() => setOpen(true)}
				className='bg-brand font-bold text-ink hover:bg-brand-strong'>
				<Plus /> Invite someone
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>Invite someone to this account</DialogTitle>
						<DialogDescription>
							They get an emailed link that works once and expires in seven
							days.
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={submit} className='space-y-4'>
						<div className='space-y-2'>
							<Label htmlFor='invite-email'>Email</Label>
							<Input
								id='invite-email'
								type='email'
								required
								value={email}
								onChange={(event) => setEmail(event.target.value)}
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='invite-role'>Role</Label>
							<Select value={roleId || roles[0]?.id} onValueChange={setRoleId}>
								<SelectTrigger id='invite-role'>
									<SelectValue placeholder='Pick a role' />
								</SelectTrigger>
								<SelectContent>
									{roles.map((role) => (
										<SelectItem key={role.id} value={role.id}>
											{role.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<DialogFooter>
							<Button
								type='button'
								variant='outline'
								onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button
								type='submit'
								disabled={busy || roles.length === 0}
								className='bg-brand font-bold text-ink hover:bg-brand-strong'>
								{busy && <Loader2 className='animate-spin' />} Send invitation
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	)
}

function RolesSection({
	roles,
	canManage,
	onChanged,
	onError,
}: {
	roles: Role[]
	canManage: boolean
	onChanged: () => Promise<void>
	onError: (message: string) => void
}) {
	const [editing, setEditing] = useState<Role | 'new' | null>(null)

	return (
		<section>
			<div className='flex flex-wrap items-end justify-between gap-4'>
				<div>
					<h2 className='font-display text-lg font-semibold text-white'>
						Roles
					</h2>
					<p className='mt-1 text-sm leading-6 text-slate-400'>
						A role is a set of permissions. Build as many as you need.
					</p>
				</div>
				{canManage && (
					<Button
						variant='outline'
						onClick={() => setEditing('new')}
						className='border-white/15 bg-transparent text-white hover:bg-white/5'>
						<Plus /> New role
					</Button>
				)}
			</div>

			<ul className='mt-4 grid gap-3 sm:grid-cols-2'>
				{roles.map((role) => (
					<li
						key={role.id}
						className='rounded-xl border border-white/10 bg-white/3 p-4'>
						<div className='flex items-start justify-between gap-3'>
							<div className='min-w-0'>
								<p className='flex items-center gap-1.5 font-medium text-white'>
									{role.system && <Shield className='size-3.5 text-brand' />}
									{role.name}
								</p>
								<p className='mt-1 text-xs text-slate-500'>
									{role.system
										? 'Every permission'
										: `${role.permissions.length} permissions`}{' '}
									· {role.members} {role.members === 1 ? 'person' : 'people'}
								</p>
							</div>
							{canManage && !role.system && (
								<div className='flex shrink-0 items-center gap-1'>
									<button
										type='button'
										onClick={() => setEditing(role)}
										className='rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white'>
										Edit
									</button>
									<button
										type='button'
										aria-label={`Delete ${role.name}`}
										onClick={async () => {
											const response = await fetch(
												`/api/account/roles/${role.id}`,
												{ method: 'DELETE' },
											)
											if (!response.ok) {
												const body = await response.json().catch(() => ({}))
												onError(body.error ?? 'Could not delete that role.')
											}
											await onChanged()
										}}
										className='text-slate-600 transition-colors hover:text-destructive'>
										<Trash2 className='size-3.5' />
									</button>
								</div>
							)}
						</div>
					</li>
				))}
			</ul>

			{editing && (
				<RoleDialog
					role={editing === 'new' ? null : editing}
					onClose={() => setEditing(null)}
					onSaved={async () => {
						setEditing(null)
						await onChanged()
					}}
					onError={onError}
				/>
			)}
		</section>
	)
}

function RoleDialog({
	role,
	onClose,
	onSaved,
	onError,
}: {
	role: Role | null
	onClose: () => void
	onSaved: () => Promise<void>
	onError: (message: string) => void
}) {
	const [name, setName] = useState(role?.name ?? '')
	const [selected, setSelected] = useState<Set<string>>(
		new Set(role?.permissions ?? []),
	)
	const [busy, setBusy] = useState(false)

	const toggle = (key: string) =>
		setSelected((current) => {
			const next = new Set(current)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		const response = await fetch(
			role ? `/api/account/roles/${role.id}` : '/api/account/roles',
			{
				method: role ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, permissions: [...selected] }),
			},
		)
		setBusy(false)
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			onError(body.error ?? 'Could not save that role.')
			return
		}
		await onSaved()
	}

	return (
		<Dialog open onOpenChange={(next) => !next && onClose()}>
			<DialogContent className='flex h-[85vh] flex-col sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>{role ? `Edit ${role.name}` : 'New role'}</DialogTitle>
					<DialogDescription>
						Pick exactly what this role can do.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={submit} className='flex min-h-0 flex-1 flex-col gap-4'>
					<div className='space-y-2'>
						<Label htmlFor='role-name'>Name</Label>
						<Input
							id='role-name'
							required
							value={name}
							placeholder='Editor'
							onChange={(event) => setName(event.target.value)}
						/>
					</div>

					<div className='min-h-0 flex-1 space-y-5 overflow-y-auto pr-1'>
						{PERMISSION_GROUPS.map((group) => (
							<fieldset key={group.id}>
								<legend className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
									{group.label}
								</legend>
								<ul className='mt-2 space-y-1'>
									{group.permissions.map((permission) => (
										<li key={permission.key}>
											<label className='flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5'>
												<input
													type='checkbox'
													checked={selected.has(permission.key)}
													onChange={() => toggle(permission.key)}
													className='size-4 accent-brand'
												/>
												{permission.label}
											</label>
										</li>
									))}
								</ul>
							</fieldset>
						))}
					</div>

					<DialogFooter className='shrink-0'>
						<Button type='button' variant='outline' onClick={onClose}>
							Cancel
						</Button>
						<Button
							type='submit'
							disabled={busy}
							className='bg-brand font-bold text-ink hover:bg-brand-strong'>
							{busy && <Loader2 className='animate-spin' />} Save role
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
