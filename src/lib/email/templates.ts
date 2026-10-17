import { linkOrigin } from '@/lib/app-url'
import { site } from '@/lib/site'
import { bold, renderEmail, type RenderedEmail } from './layout'

/**
 * Every message the platform sends, as data. Each returns the subject plus the
 * rendered HTML and text, so the caller only has to decide where it goes.
 */

const ONCE_7_DAYS = 'This link works once and expires in 7 days.'

export function welcomeEmail(input: {
	to: string
	link: string
	invitedBy: string
	accountName?: string | null
	/** Admins run the platform and get no account of their own to build in. */
	role?: 'member' | 'admin'
}): RenderedEmail {
	const admin = input.role === 'admin'
	const forAccount = input.accountName
		? ` to work on ${bold(input.accountName)}`
		: ''
	return {
		subject: `${input.invitedBy} invited you to ${site.name}`,
		...renderEmail({
			preheader: `Create your login and you're in. The link works once and expires in 7 days.`,
			eyebrow: admin ? "You're an administrator" : "You're invited",
			heading: "You're in. Let's set up your login.",
			paragraphs: [
				admin
					? `${bold(input.invitedBy)} made you an administrator on ${site.name}. Create your login and you're straight into the admin area, where you can open any account.`
					: `${bold(input.invitedBy)} invited you to ${site.name}${forAccount}. Create your login and you're straight into your account.`,
				'Pick a password, add your name, and you are done in under a minute.',
			],
			cta: { label: 'Create my login', url: input.link },
			details: [
				{ label: 'Signing in as', value: input.to },
				{ label: 'Invited by', value: input.invitedBy },
				...(admin ? [{ label: 'Access', value: 'Platform administrator' }] : []),
				...(input.accountName
					? [{ label: 'Account', value: input.accountName }]
					: []),
			],
			expiry: ONCE_7_DAYS,
			footnote:
				"Didn't expect this? You can ignore it. Nothing happens unless the link is used.",
			recipient: input.to,
		}),
	}
}

export function teamInviteEmail(input: {
	to: string
	link: string
	invitedBy: string
	accountName: string
	roleName: string
	hasLogin: boolean
}): RenderedEmail {
	return {
		subject: `${input.invitedBy} invited you to ${input.accountName} on ${site.name}`,
		...renderEmail({
			preheader: `You've been invited to ${input.accountName} as ${input.roleName}. The link works once and expires in 7 days.`,
			eyebrow: 'Team invitation',
			heading: `Join ${input.accountName}.`,
			paragraphs: [
				`${bold(input.invitedBy)} invited you to the ${bold(input.accountName)} account on ${site.name} as ${bold(input.roleName)}.`,
				input.hasLogin
					? 'Accept the invitation and the account shows up in your list straight away.'
					: "You don't have a login yet, so the link below sets one up and drops you straight into the account.",
			],
			cta: { label: 'Accept invitation', url: input.link },
			details: [
				{ label: 'Account', value: input.accountName },
				{ label: 'Your role', value: input.roleName },
				{ label: 'Invited by', value: input.invitedBy },
				{ label: 'Sent to', value: input.to },
			],
			expiry: ONCE_7_DAYS,
			footnote:
				"Didn't expect this? You can ignore it. Nothing happens unless the link is used.",
			recipient: input.to,
		}),
	}
}

export function magicLinkEmail(input: {
	to: string
	link: string
}): RenderedEmail {
	return {
		subject: `Your ${site.name} sign-in link`,
		...renderEmail({
			preheader: 'Tap to sign in. No password needed. Expires in 15 minutes.',
			eyebrow: 'Sign-in link',
			heading: "Here's your sign-in link.",
			paragraphs: [
				`Click the button to sign in to ${site.name} as ${bold(input.to)}. No password needed.`,
			],
			cta: { label: `Sign in to ${site.name}`, url: input.link },
			expiry: 'This link works once and expires in 15 minutes.',
			footnote:
				"If you didn't request this, ignore it. Nobody can sign in without opening this link from your inbox.",
			recipient: input.to,
		}),
	}
}

export function passwordResetEmail(input: {
	to: string
	link: string
	minutes: number
}): RenderedEmail {
	return {
		subject: `Reset your ${site.name} password`,
		...renderEmail({
			preheader: `Choose a new password. The link works once and expires in ${input.minutes} minutes.`,
			eyebrow: 'Password reset',
			heading: "Let's get you a new password.",
			paragraphs: [
				`We received a request to reset the password for ${bold(input.to)}. Click below to choose a new one.`,
			],
			cta: { label: 'Choose a new password', url: input.link },
			expiry: `This link works once and expires in ${input.minutes} minutes.`,
			footnote:
				"If you didn't ask for this, you can ignore it. Your password stays exactly as it is.",
			recipient: input.to,
		}),
	}
}

export function passwordChangedEmail(input: {
	to: string
	at: Date
}): RenderedEmail {
	const when = input.at.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'UTC',
		timeZoneName: 'short',
	})
	return {
		subject: `Your ${site.name} password was changed`,
		...renderEmail({
			preheader: `The password for ${input.to} was changed on ${when}.`,
			eyebrow: 'Security notice',
			heading: 'Your password was changed.',
			paragraphs: [
				`The password for ${bold(input.to)} was changed on ${bold(when)}. If that was you, there is nothing to do.`,
				"If it wasn't, reset your password right away. The reset link goes only to this inbox, and choosing a new password signs out every device that was using the account, including whoever changed it.",
			],
			cta: {
				label: 'Reset my password',
				url: `${linkOrigin()}/forgot-password?email=${encodeURIComponent(input.to)}`,
			},
			footnote: `You are receiving this because ${input.to} has a ${site.name} login.`,
			recipient: input.to,
		}),
	}
}
