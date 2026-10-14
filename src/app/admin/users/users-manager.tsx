'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Role = 'admin' | 'member'

type Person = {
	id: string
	email: string
	name: string | null
	role: Role
	accounts: number
	memberships: { account: string; role: string; isOwner: boolean }[]
}

type Invite = {
	id: string
	email: string
	accountName: string | null
	role: Role
	expiresAt: string
}

type Status = 'all' | 'active' | 'pending'

export function UsersManager({
	you,
	people,
}: {
	you: string
	people: Person[]
}) {
	const router = useRouter()
	const [invites, setInvites] = useState<Invite[]>([])
	const [error, setError] = useState<string | null>(null)

	const loadInvites = useCallback(async () => {
		const response = await fetch('/api/admin/invites', { cache: 'no-store' })
		if (response.ok) setInvites((await response.json()).invites)
	}, [])

	useEffect(() => {
		void loadInvites()
	}, [loadInvites])

	const revoke = async (id: string) => {
		await fetch(`/api/admin/invites?id=${id}`, { method: 'DELETE' })
		void loadInvites()
	}

	const setPersonRole = async (id: string, next: Role) => {
		setError(null)
		const response = await fetch(`/api/admin/users/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role: next }),
		})
		if (!response.ok) {
			const body = await response.json().catch(() => ({}))
			setError(body.error ?? 'That change could not be saved.')
			return
		}
		router.refresh()
	}

	const panel = (role: Role) => (
		<UsersPanel
			role={role}
			you={you}
			people={people.filter((p) => p.role === role)}
			invites={invites.filter((i) => i.role === role)}
			onSent={loadInvites}
			onRevoke={revoke}
			onRole={setPersonRole}
		/>
	)

	return (
		<div className='space-y-6'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Users
				</h1>
				<p className='mt-2 text-muted-foreground'>
					Only people you invite can sign in.
				</p>
			</div>

			{error && <FormAlert>{error}</FormAlert>}

			<Tabs defaultValue='admin'>
				<TabsList>
					<TabsTrigger value='admin'>Admin</TabsTrigger>
					<TabsTrigger value='accounts'>Accounts</TabsTrigger>
				</TabsList>
				<TabsContent value='admin' className='pt-4'>
					{panel('admin')}
				</TabsContent>
				<TabsContent value='accounts' className='pt-4'>
					{panel('member')}
				</TabsContent>
			</Tabs>
		</div>
	)
}

function UsersPanel({
	role,
	you,
	people,
	invites,
	onSent,
	onRevoke,
	onRole,
}: {
	role: Role
	you: string
	people: Person[]
	invites: Invite[]
	onSent: () => void
	onRevoke: (id: string) => void
	onRole: (id: string, role: Role) => void
}) {
	const [status, setStatus] = useState<Status>('all')
	const isAdmin = role === 'admin'

	const showActive = status !== 'pending'
	const showPending = status !== 'active'

	return (
		<div className='space-y-4'>
			<p className='text-sm text-slate-400'>
				{isAdmin
					? 'Your administrative team. They run the platform and can open any account, but have no account of their own to build in.'
					: 'Account holders and the people on their teams. Each holder has their own account to build websites in.'}
			</p>

			<InviteForm role={role} onSent={onSent} />

			<Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
				<TabsList>
					<TabsTrigger value='all'>
						All ({people.length + invites.length})
					</TabsTrigger>
					<TabsTrigger value='active'>Active ({people.length})</TabsTrigger>
					<TabsTrigger value='pending'>Pending ({invites.length})</TabsTrigger>
				</TabsList>
			</Tabs>

			<Card className='py-0'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>User</TableHead>
							<TableHead>Status</TableHead>
							{!isAdmin && <TableHead>Account</TableHead>}
							<TableHead className='w-44'>Access</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{showActive &&
							people.map((person) => (
								<TableRow key={person.id}>
									<TableCell>
										<div className='font-medium'>
											{person.name ?? person.email}
										</div>
										{person.name && (
											<div className='text-muted-foreground text-xs'>
												{person.email}
											</div>
										)}
									</TableCell>
									<TableCell>
										<Badge>Active</Badge>
									</TableCell>
									{!isAdmin && (
										<TableCell>
											<div className='flex flex-wrap gap-1.5'>
												{person.memberships.map((m) => (
													<Badge
														key={m.account}
														variant={m.isOwner ? 'default' : 'secondary'}>
														{m.account} · {m.role}
													</Badge>
												))}
												{!person.memberships.length && (
													<span className='text-muted-foreground'>—</span>
												)}
											</div>
										</TableCell>
									)}
									<TableCell>
										{person.id === you ? (
											<Badge variant='outline'>You</Badge>
										) : (
											<Select
												value={person.role}
												onValueChange={(value) =>
													onRole(person.id, value as Role)
												}>
												<SelectTrigger
													aria-label={`Access for ${person.email}`}>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value='member'>Account holder</SelectItem>
													<SelectItem value='admin'>Admin</SelectItem>
												</SelectContent>
											</Select>
										)}
									</TableCell>
								</TableRow>
							))}

						{showPending &&
							invites.map((invite) => (
								<TableRow key={invite.id}>
									<TableCell className='font-medium'>{invite.email}</TableCell>
									<TableCell>
										<Badge variant='outline'>Pending</Badge>
									</TableCell>
									{!isAdmin && <TableCell>{invite.accountName ?? '—'}</TableCell>}
									<TableCell>
										<Button
											variant='ghost'
											size='sm'
											onClick={() => onRevoke(invite.id)}>
											<X /> Revoke
										</Button>
									</TableCell>
								</TableRow>
							))}

						{(showActive ? people.length : 0) +
							(showPending ? invites.length : 0) ===
							0 && (
							<TableRow>
								<TableCell
									colSpan={isAdmin ? 3 : 4}
									className='text-muted-foreground py-8 text-center'>
									{status === 'pending'
										? 'No pending invitations.'
										: 'No one here yet.'}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</Card>
		</div>
	)
}

function InviteForm({ role, onSent }: { role: Role; onSent: () => void }) {
	const [email, setEmail] = useState('')
	const [accountName, setAccountName] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setBusy(true)
		setError(null)
		setNotice(null)
		const response = await fetch('/api/admin/invites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				role,
				accountName: role === 'member' ? accountName || null : null,
			}),
		})
		setBusy(false)
		const body = await response.json().catch(() => ({}))
		if (!response.ok) {
			setError(body.error ?? 'That invitation could not be sent.')
			return
		}
		setNotice(`Invitation sent to ${body.email}.`)
		setEmail('')
		setAccountName('')
		onSent()
	}

	return (
		<div className='space-y-2'>
			<Card>
				<CardContent>
			<form onSubmit={submit} className='grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end'>
				<div className='space-y-2'>
					<Label htmlFor={`invite-email-${role}`}>Email</Label>
					<Input
						id={`invite-email-${role}`}
						type='email'
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
					/>
				</div>
				{role === 'member' ? (
					<div className='space-y-2'>
						<Label htmlFor='invite-account'>Account name (optional)</Label>
						<Input
							id='invite-account'
							maxLength={80}
							value={accountName}
							onChange={(event) => setAccountName(event.target.value)}
						/>
					</div>
				) : (
					<div />
				)}
				<Button
					type='submit'
					disabled={busy}>
					{busy ? <Loader2 className='animate-spin' /> : <Send />}
					Invite {role === 'admin' ? 'admin' : 'account holder'}
				</Button>
			</form>
				</CardContent>
			</Card>
			{error && <FormAlert>{error}</FormAlert>}
			{notice && <FormAlert tone='success'>{notice}</FormAlert>}
		</div>
	)
}
