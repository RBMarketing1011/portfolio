import { z } from 'zod'

/** The one password rule, with the message each limit produces. */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 200

export const passwordSchema = z
	.string()
	.min(PASSWORD_MIN, `Choose a password of at least ${PASSWORD_MIN} characters.`)
	.max(PASSWORD_MAX, `Passwords can be at most ${PASSWORD_MAX} characters.`)

export const nameSchema = z
	.string()
	.trim()
	.max(120, 'Names can be at most 120 characters.')
	.nullish()

/** The first thing wrong with a submission, in words meant for the person.
 *  Only the limits above carry authored wording; anything else (a missing
 *  field, the wrong type) gets the fallback rather than a parser's message. */
export const firstIssue = (error: z.ZodError, fallback: string) => {
	const issue = error.issues[0]
	return issue && (issue.code === 'too_small' || issue.code === 'too_big')
		? issue.message
		: fallback
}
