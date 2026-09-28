import { handlers } from '@/lib/auth'

// The adapter and argon2 are Node-only.
export const runtime = 'nodejs'

export const { GET, POST } = handlers
