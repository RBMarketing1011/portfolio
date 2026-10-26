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

// A site whose pages carry their own search title and description (the AI writes them,
// the page dialog edits them).
const withSeo = (seo) => ({
	...site,
	pages: [
		{ ...site.pages[0], seo: seo.home },
		{ ...site.pages[1], seo: seo.services },
	],
})
const seoInput = (profile, seo, slug) => ({ profile, siteName: 'Acme Project', site: withSeo(seo), slug, origin })

check('SEO: a page’s own title and description win when set', () => {
	const profile = P.siteProfileDefaults()
	profile.seo.siteTitle = 'Acme Plumbing'
	profile.seo.homeTitle = 'Acme Plumbing | 24/7 Plumbers in Austin'
	profile.seo.description = 'Plumbers in Austin.'
	const seo = {
		home: { title: 'Emergency Plumbers in Austin | Acme', description: 'Burst pipes and leaks fixed around the clock.' },
		services: { title: 'Drain Cleaning and Repairs | Acme', description: 'Slow and clogged drains cleared at the source.' },
	}
	const home = S.siteMetadata(seoInput(profile, seo))
	assert.deepEqual(home.title, { absolute: 'Emergency Plumbers in Austin | Acme' })
	assert.equal(home.description, 'Burst pipes and leaks fixed around the clock.')
	assert.equal(home.openGraph.title, 'Emergency Plumbers in Austin | Acme')
	assert.equal(home.twitter.description, 'Burst pipes and leaks fixed around the clock.')
	const services = S.siteMetadata(seoInput(profile, seo, ['services']))
	assert.deepEqual(services.title, { absolute: 'Drain Cleaning and Repairs | Acme' })
	assert.equal(services.description, 'Slow and clogged drains cleared at the source.')
	assert.equal(services.alternates.canonical, 'https://acme.example/services', 'the address is unchanged')
})

check('SEO: today’s fallbacks apply when a page has none, or only one part', () => {
	const profile = P.siteProfileDefaults()
	profile.seo.siteTitle = 'Acme Plumbing'
	profile.seo.homeTitle = 'Acme Plumbing | 24/7 Plumbers in Austin'
	profile.business.description = 'Family plumbers since 1998.'
	const blank = { home: { title: '', description: '' }, services: { title: '  ', description: '' } }
	assert.deepEqual(S.siteMetadata(seoInput(profile, blank)).title, { absolute: 'Acme Plumbing | 24/7 Plumbers in Austin' })
	assert.deepEqual(S.siteMetadata(seoInput(profile, blank, ['services'])).title, { absolute: 'Services | Acme Plumbing' })
	assert.equal(S.siteMetadata(seoInput(profile, blank, ['services'])).description, 'Family plumbers since 1998.')
	const titleOnly = { home: undefined, services: { title: 'Drains | Acme', description: '' } }
	const services = S.siteMetadata(seoInput(profile, titleOnly, ['services']))
	assert.deepEqual(services.title, { absolute: 'Drains | Acme' })
	assert.equal(services.description, 'Family plumbers since 1998.', 'the description falls back on its own')
	assert.deepEqual(S.siteMetadata(seoInput(profile, titleOnly)).title, { absolute: 'Acme Plumbing | 24/7 Plumbers in Austin' })
})

check('BUSINESS_TYPE_VALUES: every type, in order, and the schema uses them', () => {
	assert.deepEqual(P.BUSINESS_TYPE_VALUES, P.BUSINESS_TYPES.map((t) => t.value))
	assert.equal(P.BUSINESS_TYPE_VALUES[0], 'LocalBusiness')
	const profile = P.readSiteProfile({ business: { type: 'Plumber' } })
	assert.equal(profile.business.type, 'Plumber')
})

check('brand: the contact details for the footer and the mobile menu', () => {
	const empty = P.brandFromProfile(P.siteProfileDefaults(), 'Acme Project').contact
	assert.deepEqual(empty, { phone: '', email: '', address: '', hours: [], areas: [] })
	const profile = P.siteProfileDefaults()
	Object.assign(profile.business, {
		phone: '(512) 555-0142',
		email: 'hello@acme.example',
		street: '1 Main St',
		city: 'Austin',
		region: 'TX',
		postalCode: '78701',
		serviceArea: ['Austin', 'Round Rock'],
		hours: [
			{ days: ['Friday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '07:00', closes: '18:00' },
			{ days: ['Saturday'], opens: '09:00', closes: '12:30' },
			{ days: [], opens: '09:00', closes: '12:00' },
		],
	})
	assert.deepEqual(P.brandFromProfile(profile, 'Acme Project').contact, {
		phone: '(512) 555-0142',
		email: 'hello@acme.example',
		address: '1 Main St, Austin, TX 78701',
		hours: ['Monday to Friday 7:00 to 18:00', 'Saturday 9:00 to 12:30'],
		areas: ['Austin', 'Round Rock'],
	})
	assert.equal(P.addressLine({ ...profile.business, street: '', postalCode: '' }), 'Austin, TX')
	const days = (list) => P.hoursLines({ ...profile.business, hours: [{ days: list, opens: '08:00', closes: '17:00' }] })[0]
	assert.equal(days(['Monday', 'Wednesday', 'Friday']), 'Monday, Wednesday and Friday 8:00 to 17:00')
	assert.equal(days(['Saturday', 'Sunday']), 'Saturday and Sunday 8:00 to 17:00')
	assert.equal(days([...P.WEEKDAYS]), 'Every day 8:00 to 17:00')
	assert.equal(days(['Monday', 'Tuesday', 'Wednesday', 'Saturday']), 'Monday to Wednesday and Saturday 8:00 to 17:00')
})

check('phoneHref: tel: links the way the AI writes them, nothing for non-numbers', () => {
	assert.equal(P.phoneHref('(512) 555-0142'), 'tel:+15125550142')
	assert.equal(P.phoneHref('1-512-555-0142'), 'tel:+15125550142')
	assert.equal(P.phoneHref('+44 20 7946 0018'), 'tel:+442079460018')
	assert.equal(P.phoneHref('512.555.0142 ext. 12'), 'tel:+15125550142')
	assert.equal(P.phoneHref('020 7946 0018'), 'tel:02079460018')
	assert.equal(P.phoneHref('call us'), '')
	assert.equal(P.phoneHref('911'), '')
})

console.log(`\n${passed} checks passed`)
