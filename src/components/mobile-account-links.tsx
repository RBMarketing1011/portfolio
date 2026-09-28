'use client'

import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'

/** Mobile sheet equivalent of the desktop account menu. */
export function MobileAccountLinks({
	onNavigate,
	className,
}: {
	onNavigate: () => void
	className: string
}) {
	const { data: session, status } = useSession()

	if (status !== 'authenticated')
		return (
			<div className='border-b border-white/10'>
				<Link href='/sign-in' onClick={onNavigate} className={className}>
					Sign In
				</Link>
			</div>
		)

	return (
		<>
			<div className='border-b border-white/10'>
				<Link
					href='/builder/sites'
					onClick={onNavigate}
					className={className}>
					My Sites
				</Link>
			</div>
			<div className='border-b border-white/10'>
				<Link href='/account' onClick={onNavigate} className={className}>
					Account
				</Link>
			</div>
			<div className='border-b border-white/10'>
				<button
					type='button'
					onClick={() => {
						onNavigate()
						void signOut({ callbackUrl: '/' })
					}}
					className={`${className} w-full`}>
					Sign Out
				</button>
			</div>
		</>
	)
}
