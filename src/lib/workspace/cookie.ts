/** Their own module so the auth config can clear them without importing
 *  `./current`, which imports the auth config. */

/** A member's choice among the accounts they belong to. Kept for a year. */
export const WORKSPACE_COOKIE = 'rb.workspace'

/**
 * The account an admin is viewing on someone else's behalf. Separate from the
 * member cookie so nothing a member flow writes, and nothing left over in the
 * browser, can put an admin inside an account: only "View account" in the admin
 * area sets it. A session cookie, so it dies with the browser.
 */
export const ADMIN_VIEW_COOKIE = 'rb.admin-view'
