/**
 * Builds what the plan route builds before it calls the planner, from a plan fixture
 * (`plan-*.json`): the normalized request, the profile, the grounded business, the fact
 * corpus, the photo pool and the availability. The proofs and the replay generator use
 * it, so a fixture runs through exactly the code the route runs.
 *
 *   const { fixtureContext } = require('./fixtures/builder-ai/context.cjs')
 *   const { ctx, request, profile, business } = fixtureContext(fixture)
 */
const { loadTs } = require('../../lib/load-ts.cjs')

const brief = loadTs('src/lib/builder/ai/brief.ts')
const { readSiteProfile } = loadTs('src/lib/builder/site-profile.ts')
const { DEFAULT_PINS } = loadTs('src/lib/builder/ai/contract.ts')

// A 1×1 PNG: fixtures never point at a real host.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

/** A photo-pool entry as `loadPhotoPool` returns it, from a fixture's short form. */
function candidate(photo, index) {
	return {
		ref: photo.ref ?? `img${index + 1}`,
		source: photo.source ?? 'upload',
		value: photo.value ?? `media:md_${index + 1}`,
		url: photo.url ?? PIXEL,
		kind: photo.kind ?? 'photo',
		width: photo.width ?? null,
		height: photo.height ?? null,
		orientation: photo.orientation ?? 'unknown',
		light: photo.light ?? 'mid',
		caption: photo.caption ?? '',
		tags: photo.tags ?? [],
		colors: photo.colors ?? [],
		vision: photo.vision ?? true,
	}
}

/** The site's pages for the request checks: the existing pages, or none for an empty project. */
const sitePages = (fixture) => (fixture.existing?.pages ?? []).map((page) => ({ id: page.id }))

function fixtureContext(fixture, overrides = {}) {
	const body = {
		mode: 'site',
		placement: 'replace-site',
		targetPageId: null,
		pins: DEFAULT_PINS,
		business: { name: '', type: '', phone: '', email: '', city: '', region: '', areas: [] },
		reviews: [],
		photoIds: [],
		useLibrary: false,
		fast: false,
		...fixture.request,
		...overrides,
	}
	const parsed = brief.parseCreateBuild(body, { pages: sitePages(fixture) })
	if (!parsed.ok) throw new Error(`fixture request does not parse: ${parsed.error.field} ${parsed.error.message}`)
	const request = parsed.request
	const profile = readSiteProfile(fixture.profile ?? {})
	const projectName = fixture.projectName ?? 'My site'
	const business = brief.groundBusiness({ request, profile, projectName })
	const pool = (fixture.photos ?? []).map(candidate)
	const corpus = brief.factCorpus({ request, profile, projectName, reviews: request.reviews })
	const availability = brief.availability({ request, business, pool, profile })
	const existing = fixture.existing
		? {
				pages: fixture.existing.pages.map((page) => ({ id: page.id, name: page.name, slug: page.slug, archetype: page.archetype ?? null })),
				chrome: fixture.existing.chrome ?? { header: 'bar', footer: 'columns', ctaLabel: '', ctaHref: '', menu: [], footerDetails: false },
			}
		: null
	const ctx = { request, corpus, business, pool, availability, existing, now: '2026-10-25T12:00:00.000Z', projectName }
	return { ctx, request, profile, business, pool, projectName }
}

module.exports = { fixtureContext, candidate, PIXEL }
