/**
 * Deliberately not in @/lib/site: that module reaches the browser through the
 * header, so anything in it ships in the client bundle. Server code only —
 * this address must never render into HTML, JSON-LD, llms.txt, or JS.
 */
export const contactEmail = 'anthony@reynoldsbuilt.dev'
