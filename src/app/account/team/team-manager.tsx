'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, Plus, Shield, Trash2, X } from 'lucide-react'
import { FormAlert } from '@/components/form-alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import {
	PERMISSION_GROUPS,
	ALL_PERMISSIONS,
	type Permission,
} from '@/lib/workspace/permissions'

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

	if (members === null) return <TeamSkeleton />

	return (
		<div className='space-y-8'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Team
				</h1>
				<p className='mt-2 text-muted-foreground'>
					The users on this account, and the roles that decide what they can do.
				</p>
			</div>
			{error && <FormAlert>{error}</FormAlert>}
			{notice && <FormAlert tone='success'>{notice}</FormAlert>}

			<Tabs defaultValue='users'>
				<TabsList>
					<TabsTrigger value='users'>Users ({members.length})</TabsTrigger>
					<TabsTrigger value='roles'>Roles ({roles.length})</TabsTrigger>
				</TabsList>

				<TabsContent value='users' className='space-y-6 pt-4'>
					{can.invite && (
						<div className='flex justify-end'>
							<InviteDialog
								roles={roles}
								onInvited={(email) => {
									setNotice(`Invitation sent to ${email}.`)
									void refresh()
								}}
								onError={setError}
							/>
						</div>
					)}

					<Card className='py-0'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Person</TableHead>
									<TableHead>Role</TableHead>
									<TableHead className='w-12'>
										<span className='sr-only'>Actions</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{members.map((member) => (
									<TableRow key={member.id}>
										<TableCell>
											<span className='font-medium'>{member.email}</span>
											{member.userId === you && (
												<Badge variant='outline' className='ml-2'>
													You
												</Badge>
											)}
										</TableCell>
										<TableCell>
											{member.isOwner || !can.manage ? (
												<span className='text-muted-foreground'>
													{member.isOwner ? 'Account owner' : member.roleName}
												</span>
											) : (
												<Select
													value={member.roleId}
													onValueChange={async (roleId) => {
														const response = await fetch(`/api/account/team/${member.id}`, {
															method: 'PATCH',
															headers: { 'Content-Type': 'application/json' },
															body: JSON.stringify({ roleId }),
														})
														if (!response.ok) {
															const body = await response.json().catch(() => ({}))
															setError(body.error ?? 'Could not change that role.')
														}
														void refresh()
													}}>
													<SelectTrigger size='sm' className='w-44'>
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
										</TableCell>
										<TableCell className='text-right'>
											{can.manage && !member.isOwner && (
												<ConfirmButton
													label={`Remove ${member.email}`}
													title={`Remove ${member.email}?`}
													description='They lose access to this account immediately. Anything they built stays.'
													action='Remove'
													onConfirm={async () => {
														const response = await fetch(`/api/account/team/${member.id}`, {
															method: 'DELETE',
														})
														if (!response.ok) {
															const body = await response.json().catch(() => ({}))
															setError(body.error ?? 'Could not remove them.')
														}
														await refresh()
													}}
												/>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Card>

					{invites.length > 0 && (
						<Card className='gap-0 pb-0'>
							<CardHeader className='pb-4'>
								<CardTitle>Pending invitations</CardTitle>
							</CardHeader>
							<Table>
								<TableBody>
									{invites.map((invite) => (
										<TableRow key={invite.id}>
											<TableCell>
												<span className='flex items-center gap-2 font-medium'>
													<Mail className='size-4 text-muted-foreground' />
													{invite.email}
												</span>
											</TableCell>
											<TableCell className='text-muted-foreground'>
												{invite.roleName} · expires{' '}
												{new Date(invite.expiresAt).toLocaleDateString()}
											</TableCell>
											<TableCell className='w-12 text-right'>
												{can.invite && (
													<Button
														variant='ghost'
														size='icon'
														aria-label={`Revoke the invitation for ${invite.email}`}
														onClick={async () => {
															await fetch(`/api/account/invites?id=${invite.id}`, {
																method: 'DELETE',
															})
															void refresh()
														}}>
														<X />
													</Button>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</Card>
					)}
				</TabsContent>

				<TabsContent value='roles' className='pt-4'>
					<RolesSection
						roles={roles}
						canManage={can.roles}
						onChanged={refresh}
						onError={setError}
					/>
				</TabsContent>
			</Tabs>
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
			<Button onClick={() => setOpen(true)}>
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
								<SelectTrigger id='invite-role' className='w-full'>
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
								disabled={busy || roles.length === 0}>
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
				<p className='text-sm text-muted-foreground'>
					A role is a set of permissions. Build as many as you need.
				</p>
				{canManage && (
					<Button variant='outline' onClick={() => setEditing('new')}>
						<Plus /> New role
					</Button>
				)}
			</div>

			<div className='mt-4 grid gap-3 sm:grid-cols-2'>
				{roles.map((role) => (
					<Card key={role.id} className='gap-0 py-4'>
						<CardHeader className='px-4'>
							<CardTitle className='flex items-center gap-1.5'>
								{role.system && <Shield className='size-3.5 text-primary' />}
								{role.name}
							</CardTitle>
							<CardDescription>
								{role.system ? 'Every permission' : `${role.permissions.length} permissions`} ·{' '}
								{role.members} {role.members === 1 ? 'person' : 'people'}
							</CardDescription>
							{canManage && !role.system && (
								<CardAction className='flex items-center gap-1'>
									<Button variant='ghost' size='sm' onClick={() => setEditing(role)}>
										Edit
									</Button>
									<ConfirmButton
										label={`Delete ${role.name}`}
										title={`Delete the ${role.name} role?`}
										description={
											role.members
												? `${role.members} ${role.members === 1 ? 'person holds' : 'people hold'} this role. Move them to another role first.`
												: 'This cannot be undone.'
										}
										action='Delete role'
										onConfirm={async () => {
											const response = await fetch(`/api/account/roles/${role.id}`, {
												method: 'DELETE',
											})
											if (!response.ok) {
												const body = await response.json().catch(() => ({}))
												onError(body.error ?? 'Could not delete that role.')
											}
											await onChanged()
										}}
									/>
								</CardAction>
							)}
						</CardHeader>
					</Card>
				))}
			</div>

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
			<DialogContent className='flex max-h-[90vh] flex-col sm:max-w-3xl'>
				<DialogHeader>
					<DialogTitle>{role ? `Edit ${role.name}` : 'New role'}</DialogTitle>
					<DialogDescription>
						Pick exactly what this role can do. Anything left unchecked is
						hidden from the people who hold it.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={submit} className='flex min-h-0 flex-1 flex-col gap-5'>
					<div className='grid gap-2 sm:max-w-sm'>
						<Label htmlFor='role-name'>Name</Label>
						<Input
							id='role-name'
							required
							value={name}
							placeholder='Editor'
							onChange={(event) => setName(event.target.value)}
						/>
					</div>

					<div className='min-h-0 flex-1 overflow-y-auto pr-1'>
						{/* Split explicitly rather than with CSS columns: a multicol box
						    mis-sizes inside the flex scroller and forces a scrollbar. */}
						<div className='grid gap-x-8 gap-y-5 sm:grid-cols-2'>
							{[PERMISSION_GROUPS.slice(0, 2), PERMISSION_GROUPS.slice(2)].map(
								(column, index) => (
									<div key={index} className='min-w-0 space-y-5'>
										{column.map((group) => (
											<fieldset key={group.id}>
												<legend className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>
													{group.label}
												</legend>
												<ul className='mt-2.5 space-y-2.5'>
													{group.permissions.map((permission) => (
														<li key={permission.key} className='flex items-start gap-3'>
															<Checkbox
																id={`perm-${permission.key}`}
																checked={selected.has(permission.key)}
																onCheckedChange={() => toggle(permission.key)}
																className='mt-0.5'
															/>
															<Label htmlFor={`perm-${permission.key}`} className='font-normal leading-5'>
																{permission.label}
															</Label>
														</li>
													))}
												</ul>
											</fieldset>
										))}
									</div>
								),
							)}
						</div>
					</div>

					<DialogFooter className='shrink-0 border-t pt-4'>
						<span className='mr-auto self-center text-xs text-muted-foreground'>
							{selected.size} of {ALL_PERMISSIONS.length} permissions
						</span>
						<Button type='button' variant='outline' onClick={onClose}>
							Cancel
						</Button>
						<Button
							type='submit'
							disabled={busy}>
							{busy && <Loader2 className='animate-spin' />} Save role
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function ConfirmButton({
	label,
	title,
	description,
	action,
	onConfirm,
}: {
	label: string
	title: string
	description: string
	action: string
	onConfirm: () => Promise<void>
}) {
	const [busy, setBusy] = useState(false)

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant='ghost' size='icon' aria-label={label}>
					<Trash2 />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={busy}
						onClick={async (event) => {
							event.preventDefault()
							setBusy(true)
							await onConfirm()
							setBusy(false)
						}}
						className={buttonVariants({ variant: 'destructive' })}>
						{busy && <Loader2 className='animate-spin' />} {action}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function TeamSkeleton() {
	return (
		<div role='status' aria-label='Loading your team' className='space-y-12'>
			<div className='flex flex-wrap items-end justify-between gap-4'>
				<div className='space-y-3'>
					<Skeleton className='h-9 w-32 rounded-md' />
					<Skeleton className='h-4 w-80 max-w-full rounded' />
				</div>
				<Skeleton className='h-9 w-36 rounded-md' />
			</div>

			<section className='space-y-4'>
				<Skeleton className='h-6 w-24 rounded-md' />
				<div className='border-b pb-3'>
					<Skeleton className='h-3 w-full max-w-md rounded' />
				</div>
				{Array.from({ length: 3 }, (_, index) => (
					<div
						key={index}
						className='flex items-center gap-4 border-b pb-4'>
						<Skeleton className='h-4 flex-1 rounded' />
						<Skeleton className='h-8 w-44 shrink-0 rounded-md' />
						<Skeleton className='size-4 shrink-0 rounded' />
					</div>
				))}
			</section>

			<section className='space-y-4'>
				<Skeleton className='h-6 w-20 rounded-md' />
				<div className='grid gap-3 sm:grid-cols-2'>
					{Array.from({ length: 2 }, (_, index) => (
						<Skeleton key={index} className='h-24 rounded-xl' />
					))}
				</div>
			</section>

			<span className='sr-only'>Loading your team</span>
		</div>
	)
}
