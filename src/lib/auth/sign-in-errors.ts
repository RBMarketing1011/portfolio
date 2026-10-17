/**
 * What to tell someone when `signIn('credentials', { redirect: false })` comes
 * back with an error. Auth.js reports a wrong password, a thrown
 * `CredentialsSignin` subclass (with its `code`), a blocked CSRF cookie and an
 * internal failure through the same `error` field; only the first two are the
 * person's fault, so only those may be worded as if they were.
 */
const CODES: Record<string, string> = {
	too_many_attempts:
		'Too many sign-in attempts. Wait fifteen minutes, reset your password, or use the email link instead.',
}

export function credentialsErrorMessage(result: {
	error?: string | null
	code?: string | null
}) {
	if (result.code && CODES[result.code]) return CODES[result.code]
	switch (result.error) {
		case 'CredentialsSignin':
			return 'That email and password combination did not work.'
		case 'MissingCSRF':
			return 'Your browser blocked a sign-in cookie. Refresh the page and try again.'
		default:
			return 'Sign-in is temporarily unavailable. Try again in a minute.'
	}
}
