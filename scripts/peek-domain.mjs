const token = process.env.VERCEL_TOKEN
const teamId = process.env.VERCEL_TEAM_ID
const domain = process.argv[2]

if (!token || !domain) {
	console.error('usage: VERCEL_TOKEN=... node scripts/peek-domain.mjs <domain>')
	process.exit(1)
}

const url = new URL(`https://api.vercel.com/v6/domains/${domain}/config`)
if (teamId) url.searchParams.set('teamId', teamId)

const response = await fetch(url, {
	headers: { Authorization: `Bearer ${token}` },
})

console.log('status:', response.status)
console.log(JSON.stringify(await response.json(), null, 2))
