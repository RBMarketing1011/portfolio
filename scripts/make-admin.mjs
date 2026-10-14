/**
 * Bootstraps the first platform admin, since nobody can invite one until one exists.
 *
 *   pnpm admin:grant you@example.com            promote an existing login
 *   pnpm admin:grant you@example.com "password" create the login (10+ chars) if missing
 */
import { MongoClient } from 'mongodb'
import { hash } from '@node-rs/argon2'

const [email, password] = process.argv.slice(2)
if (!email) {
	console.error('Usage: pnpm admin:grant <email> [password]')
	process.exit(1)
}
if (!process.env.MONGODB_URI) {
	console.error('MONGODB_URI is not set.')
	process.exit(1)
}

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const users = client.db().collection('users')
const address = email.toLowerCase().trim()

const existing = await users.findOne({ email: address })
if (existing) {
	await users.updateOne(
		{ _id: existing._id },
		{ $set: { role: 'admin', updatedAt: new Date() } },
	)
	console.log(`${address} is now an admin.`)
} else if (password && password.length >= 10) {
	const now = new Date()
	await users.insertOne({
		email: address,
		emailVerified: now,
		passwordHash: await hash(password),
		role: 'admin',
		createdAt: now,
		updatedAt: now,
	})
	console.log(`Created ${address} as an admin.`)
} else {
	console.error(
		`No login for ${address}. Pass a password of at least 10 characters to create one.`,
	)
	process.exitCode = 1
}

await client.close()
