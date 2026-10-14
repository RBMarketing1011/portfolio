import { redirect } from 'next/navigation'

// Registration is by invitation only. Kept as a route so old links land on the
// sign-in page instead of a 404.
export default function SignUpPage() {
	redirect('/sign-in')
}
