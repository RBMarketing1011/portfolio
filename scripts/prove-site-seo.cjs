/**
 * Proves the project profile (brand, SEO, business) and what a live site emits
 * from it: page metadata and schema.org structured data.
 *
 *   node scripts/prove-site-seo.cjs
 */
const assert = require('node:assert/strict')
const { loadTs } = require('./lib/load-ts.cjs')

const P = loadTs('src/lib/builder/site-profile.ts')
const S = loadTs('src/lib/builder/site-seo.ts')

let passed = 0
const check = (name, fn) => {
	fn()
	passed++
	console.log(`PASS  ${name}`)
}

const site = {
	version: 1,
	chrome: { header: 'bar', footer: 'columns', ctaLabel: '', ctaHref: '', menu: [] },
	pages: [
		{ id: 'a', name: 'Home', slug: '/', inHeader: true, blocks: [], createdAt: '', updatedAt: '' },
		{ id: 'b', name: 'Services', slug: 'services', inHeader: true, blocks: [], createdAt: '', updatedAt: '' },
	],
}
const origin = 'https://acme.example'
const input = (profile, slug) => ({ profile, siteName: 'Acme Project', site, slug, origin })

check('a project with no profile reads as the defaults', () => {
	assert.deepEqual(P.readSiteProfile(undefined), P.siteProfileDefaults())
	assert.deepEqual(P.readSiteProfile(null), P.siteProfileDefaults())
})

check('junk is repaired field by field, never rejected', () => {
	const repaired = P.readSiteProfile({
		brand: { logo: 'not a url', favicon: 5 },
		seo: { noindex: 'yes', description: 42 },
		business: { type: 'Spaceship', hours: [{ days: ['Monday', 'Funday'], opens: '25:00' }], profiles: ['nope'], latitude: 200 },
	})
	assert.equal(repaired.brand.logo, null)
	assert.equal(repaired.seo.noindex, false)
	assert.equal(repaired.business.type, 'LocalBusiness')
	assert.equal(repaired.business.latitude, null)
	assert.deepEqual(repaired.business.profiles, [])
})

check('profileImages lists exactly the image fields that are set', () => {
	const profile = P.siteProfileDefaults()
	profile.brand.logo = 'https://cdn.example/logo.png'
	profile.seo.shareImage = 'https://cdn.example/share.png'
	assert.deepEqual(P.profileImages(profile), ['https://cdn.example/logo.png', 'https://cdn.example/share.png'])
})

check('titles: home is the site name, other pages are "Page | Site"', () => {
	const profile = P.siteProfileDefaults()
	assert.deepEqual(S.siteMetadata(input(profile)).title, { absolute: 'Acme Project' })
	assert.deepEqual(S.siteMetadata(input(profile, ['services'])).title, { absolute: 'Services | Acme Project' })
	profile.seo.siteTitle = 'Acme Plumbing'
	profile.seo.homeTitle = 'Acme Plumbing | 24/7 Plumbers in Austin'
	assert.deepEqual(S.siteMetadata(input(profile)).title, { absolute: 'Acme Plumbing | 24/7 Plumbers in Austin' })
	assert.deepEqual(S.siteMetadata(input(profile, ['services'])).title, { absolute: 'Services | Acme Plumbing' })
})

check('canonical URL, description, robots', () => {
	const profile = P.siteProfileDefaults()
	profile.seo.description = 'Plumbers in Austin.'
	const meta = S.siteMetadata(input(profile, ['services']))
	assert.equal(meta.alternates.canonical, 'https://acme.example/services')
	assert.equal(S.siteMetadata(input(profile)).alternates.canonical, 'https://acme.example/')
	assert.equal(meta.description, 'Plumbers in Austin.')
	assert.deepEqual(meta.robots, { index: true, follow: true })
	profile.seo.noindex = true
	assert.deepEqual(S.siteMetadata(input(profile)).robots, { index: false, follow: false })
})

check('favicon: the upload, or a letter tile, never the app’s own icon', () => {
	const profile = P.siteProfileDefaults()
	const fallback = S.siteMetadata(input(profile)).icons.icon
	assert.match(fallback, /^data:image\/svg\+xml,/)
	assert.match(decodeURIComponent(fallback), />A<\/text>/)
	profile.brand.favicon = 'https://cdn.example/icon.png'
	assert.equal(S.siteMetadata(input(profile)).icons.icon, 'https://cdn.example/icon.png')
	assert.equal(S.siteMetadata(input(profile)).icons.apple, 'https://cdn.example/icon.png')
})

check('share image: the share image, else the logo; large card only with a share image', () => {
	const profile = P.siteProfileDefaults()
	assert.equal(S.siteMetadata(input(profile)).openGraph.images, undefined)
	profile.brand.logo = 'https://cdn.example/logo.png'
	assert.equal(S.siteMetadata(input(profile)).openGraph.images[0].url, 'https://cdn.example/logo.png')
	assert.equal(S.siteMetadata(input(profile)).twitter.card, 'summary')
	profile.seo.shareImage = 'https://cdn.example/share.png'
	profile.seo.twitter = '@acme'
	const meta = S.siteMetadata(input(profile))
	assert.equal(meta.openGraph.images[0].url, 'https://cdn.example/share.png')
	assert.equal(meta.twitter.card, 'summary_large_image')
	assert.equal(meta.twitter.site, '@acme')
})

check('structured data: WebSite only, until business details are switched on', () => {
	const profile = P.siteProfileDefaults()
	profile.business.name = 'Acme Plumbing'
	const data = S.siteJsonLd(input(profile))
	assert.equal(data.length, 1)
	assert.equal(data[0]['@type'], 'WebSite')
	assert.equal(data[0].url, 'https://acme.example/')
})

check('structured data: a local business with address, hours, areas, profiles', () => {
	const profile = P.siteProfileDefaults()
	Object.assign(profile.business, {
		enabled: true,
		type: 'Plumber',
		name: 'Acme Plumbing',
		phone: '(555) 010-0000',
		street: '1 Main St',
		city: 'Austin',
		region: 'TX',
		postalCode: '78701',
		country: 'us',
		serviceArea: ['Austin', 'Round Rock'],
		hours: [
			{ days: ['Monday', 'Friday'], opens: '08:00', closes: '18:00' },
			{ days: [], opens: '09:00', closes: '12:00' },
		],
		priceRange: '$$',
		profiles: ['https://www.facebook.com/acme'],
		latitude: 30.27,
		longitude: -97.74,
	})
	profile.brand.logo = 'https://cdn.example/logo.png'
	const business = S.siteJsonLd(input(profile))[1]
	assert.equal(business['@type'], 'Plumber')
	assert.equal(business.name, 'Acme Plumbing')
	assert.equal(business.telephone, '(555) 010-0000')
	assert.deepEqual(business.address, {
		'@type': 'PostalAddress',
		streetAddress: '1 Main St',
		addressLocality: 'Austin',
		addressRegion: 'TX',
		postalCode: '78701',
		addressCountry: 'US',
	})
	assert.equal(business.openingHoursSpecification.length, 1, 'a row with no days is not published')
	assert.deepEqual(business.openingHoursSpecification[0].dayOfWeek, ['Monday', 'Friday'])
	assert.deepEqual(business.areaServed.map((p) => p.name), ['Austin', 'Round Rock'])
	assert.deepEqual(business.sameAs, ['https://www.facebook.com/acme'])
	assert.deepEqual(business.geo, { '@type': 'GeoCoordinates', latitude: 30.27, longitude: -97.74 })
	assert.equal(business.logo, 'https://cdn.example/logo.png')
	assert.equal(business.priceRange, '$$')
})

check('structured data: empty fields are left out, not published blank', () => {
	const profile = P.siteProfileDefaults()
	profile.business.enabled = true
	const business = S.siteJsonLd(input(profile))[1]
	assert.equal(business.name, 'Acme Project', 'falls back to the project name')
	for (const key of ['telephone', 'email', 'address', 'sameAs', 'openingHoursSpecification', 'areaServed', 'geo', 'priceRange', 'logo'])
		assert.ok(!(key in business), `${key} should be absent`)
})

check('structured data: an organisation gets no hours, price range or map pin', () => {
	const profile = P.siteProfileDefaults()
	Object.assign(profile.business, {
		enabled: true,
		type: 'Organization',
		city: 'Austin',
		hours: [{ days: ['Monday'], opens: '09:00', closes: '17:00' }],
		priceRange: '$$',
		latitude: 1,
		longitude: 1,
	})
	const org = S.siteJsonLd(input(profile))[1]
	assert.equal(org['@type'], 'Organization')
	assert.ok(org.address)
	for (const key of ['openingHoursSpecification', 'priceRange', 'geo', 'areaServed']) assert.ok(!(key in org), key)
})

check('the JSON-LD script cannot be closed by the data', () => {
	const profile = P.siteProfileDefaults()
	profile.business.enabled = true
	profile.business.name = '</script><script>alert(1)</script>'
	const script = S.jsonLdScript(S.siteJsonLd(input(profile)))
	assert.ok(!script.includes('</script>'))
	assert.equal(JSON.parse(script)[1].name, '</script><script>alert(1)</script>', 'still the same data once parsed')
})

check('brand: business name, then site title, then project name', () => {
	const profile = P.siteProfileDefaults()
	assert.equal(P.brandFromProfile(profile, 'Acme Project').name, 'Acme Project')
	profile.seo.siteTitle = 'Acme'
	assert.equal(P.brandFromProfile(profile, 'Acme Project').name, 'Acme')
	profile.business.name = 'Acme Plumbing LLC'
	assert.equal(P.brandFromProfile(profile, 'Acme Project').name, 'Acme Plumbing LLC')
})

console.log(`\n${passed} checks passed`)
