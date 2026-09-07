// Ensures a Mongo connection exists. Falls back to spinning up the local Docker
// container when .env has no MONGODB_URI.
const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ENV_PATH = path.join(ROOT, '.env')
const LOCAL_URI = 'mongodb://127.0.0.1:27017/reynoldsbuilt'

function readEnv() {
	if (!fs.existsSync(ENV_PATH)) return {}
	return Object.fromEntries(
		fs
			.readFileSync(ENV_PATH, 'utf8')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'))
			.map((line) => {
				const eq = line.indexOf('=')
				return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()]
			}),
	)
}

function appendEnv(key, value) {
	const existing = fs.existsSync(ENV_PATH)
		? fs.readFileSync(ENV_PATH, 'utf8').replace(/\n*$/, '\n')
		: ''
	fs.writeFileSync(ENV_PATH, `${existing}${key}=${value}\n`)
	console.log(`  wrote ${key} to .env`)
}

function has(command) {
	try {
		execSync(command, { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}

function containerRunning() {
	try {
		const out = execSync(
			'docker ps --filter name=reynoldsbuilt-mongo --format "{{.Names}}"',
			{ encoding: 'utf8' },
		)
		return out.includes('reynoldsbuilt-mongo')
	} catch {
		return false
	}
}

async function reachable(uri) {
	const { MongoClient } = require('mongodb')
	const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 })
	try {
		await client.connect()
		await client.db().admin().command({ ping: 1 })
		return true
	} catch {
		return false
	} finally {
		await client.close().catch(() => {})
	}
}

async function main() {
	const env = readEnv()
	let uri = env.MONGODB_URI

	if (uri) {
		console.log('MONGODB_URI found in .env')
		if (await reachable(uri)) {
			console.log('Mongo reachable. Nothing to do.')
			return
		}
		console.log('Mongo NOT reachable at the configured URI.')
		if (!uri.includes('127.0.0.1') && !uri.includes('localhost')) {
			console.error(
				'\nThe URI points at a remote host. Fix it or remove it from .env to use local Docker.',
			)
			process.exit(1)
		}
	} else {
		console.log('No MONGODB_URI in .env — using local Docker.')
		uri = LOCAL_URI
	}

	if (!has('docker --version')) {
		console.error('\nDocker is not on PATH. Install Docker Desktop and retry.')
		process.exit(1)
	}

	if (!containerRunning()) {
		console.log('Starting the mongo container...')
		const up = spawnSync('docker', ['compose', 'up', '-d', 'mongo'], {
			cwd: ROOT,
			stdio: 'inherit',
		})
		if (up.status !== 0) process.exit(up.status ?? 1)
	}

	process.stdout.write('Waiting for Mongo')
	for (let i = 0; i < 30; i++) {
		if (await reachable(uri)) {
			console.log('\nMongo is up at ' + uri)
			if (!env.MONGODB_URI) appendEnv('MONGODB_URI', uri)
			return
		}
		process.stdout.write('.')
		await new Promise((r) => setTimeout(r, 1000))
	}

	console.error(
		'\nMongo did not come up in 30s. Check `docker compose logs mongo`.',
	)
	process.exit(1)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
