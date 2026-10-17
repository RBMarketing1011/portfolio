import { linkOrigin } from '@/lib/app-url'
import { site } from '@/lib/site'

/**
 * The one email layout. Every message the platform sends (invitations, sign-in
 * links, password resets, security notices) is rendered through here so they all
 * carry the same brand: the dark ink canvas, the electric-blue mark and the
 * Space Grotesk heading the site itself uses.
 *
 * Email HTML is its own dialect: tables for layout, every style inline, a VML
 * fallback so the button is clickable in Outlook, and a plain-text twin for
 * clients that render neither. Fonts load from Google Fonts where the client
 * allows it (Apple Mail, iOS) and fall back to the system stack elsewhere.
 */
export const palette = {
	ink: '#03080f',
	card: '#0a1523',
	well: '#071020',
	border: '#1b2b3f',
	brand: '#0197f6',
	brandStrong: '#3fb2fa',
	brandInk: '#02121f',
	text: '#e8f1fb',
	white: '#ffffff',
	muted: '#9cb0c6',
	faint: '#5f7389',
} as const

const DISPLAY_FONT =
	"'Space Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif"
const BODY_FONT = "'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif"

export const esc = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			})[char] as string,
	)

/**
 * Marks a value to be shown bright in a paragraph. The markers are control
 * characters no name or account title can contain, so data can never be
 * mistaken for markup; the renderer turns them into `<strong>` after escaping.
 */
export const bold = (value: string) => `\u0001${value}\u0002`

const rich = (value: string) =>
	esc(value).replace(
		/\u0001([\s\S]*?)\u0002/g,
		`<strong style="color:${palette.text};font-weight:600;">$1</strong>`,
	)

const plain = (value: string) => value.replace(/[\u0001\u0002]/g, '')

export type EmailDetail = { label: string; value: string }

export type EmailContent = {
	/** The inbox preview line, shown next to the subject. */
	preheader: string
	/** Small uppercase label above the heading, e.g. "You're invited". */
	eyebrow: string
	heading: string
	/** Body paragraphs. Wrap a value in `bold()` to show it bright; everything is escaped. */
	paragraphs: string[]
	cta: { label: string; url: string }
	/** Key facts shown in the well under the button. */
	details?: EmailDetail[]
	/** How long the link lives and that it works once. */
	expiry?: string
	/** The "if this wasn't you" line. */
	footnote?: string
	/** Who the message was addressed to, for the footer. */
	recipient: string
}

export type RenderedEmail = { subject: string; html: string; text: string }

const logoUrl = () => `${linkOrigin()}/logo/reynolds-built-mark.png`

/** The invisible characters that stop inbox previews from running into the body. */
const PREHEADER_PAD = '&nbsp;&zwnj;'.repeat(40)

export function renderEmail(content: EmailContent): {
	html: string
	text: string
} {
	const {
		preheader,
		eyebrow,
		heading,
		paragraphs,
		cta,
		details = [],
		expiry,
		footnote,
		recipient,
	} = content

	const url = esc(cta.url)
	const origin = linkOrigin()
	const home = esc(origin)

	const paragraphHtml = paragraphs
		.map(
			(paragraph) =>
				`<p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${palette.muted};">${rich(paragraph)}</p>`,
		)
		.join('\n')

	const detailRows = details
		.map(
			(detail, index) => `
						<tr>
							<td style="padding:12px 0;${index ? `border-top:1px solid ${palette.border};` : ''}">
								<div style="font-family:${BODY_FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${palette.faint};">${esc(detail.label)}</div>
								<div style="font-family:${BODY_FONT};font-size:15px;line-height:22px;color:${palette.text};word-break:break-word;">${esc(detail.value)}</div>
							</td>
						</tr>`,
		)
		.join('')

	const detailsHtml = details.length
		? `
<tr>
	<td class="px" style="padding:28px 44px 0;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.well}" style="border-radius:12px;background:${palette.well};border:1px solid ${palette.border};">
			<tr>
				<td style="padding:6px 20px;">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}
					</table>
				</td>
			</tr>
		</table>
	</td>
</tr>`
		: ''

	const closing = [expiry, footnote]
		.filter((line): line is string => Boolean(line))
		.map((line) => esc(line))
		.join('<br>')

	const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(heading)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td,div,p,a{font-family:Arial,sans-serif !important;}</style>
<![endif]-->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<!--<![endif]-->
<style>
	:root { color-scheme: dark; supported-color-schemes: dark; }
	html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; background: ${palette.ink}; }
	body { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
	table, td { mso-table-lspace: 0; mso-table-rspace: 0; border-collapse: collapse; }
	img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
	a { color: ${palette.brandStrong}; }
	.btn:hover { background: ${palette.brandStrong} !important; }
	@media only screen and (max-width: 620px) {
		.container { width: 100% !important; max-width: 100% !important; }
		.px { padding-left: 24px !important; padding-right: 24px !important; }
		.h1 { font-size: 27px !important; line-height: 33px !important; }
		.btn-wrap, .btn-cell { width: 100% !important; }
		.btn { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
	}
</style>
</head>
<body style="margin:0;padding:0;background:${palette.ink};" bgcolor="${palette.ink}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${palette.ink};opacity:0;">${esc(preheader)}${PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.ink}" style="background:${palette.ink};">
	<tr>
		<td align="center" style="padding:40px 16px 48px;">
			<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
			<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;">
				<tr>
					<td class="px" style="padding:0 8px 22px;">
						<table role="presentation" cellpadding="0" cellspacing="0" border="0">
							<tr>
								<td style="vertical-align:middle;padding-right:10px;">
									<a href="${home}" target="_blank" style="text-decoration:none;"><img src="${esc(logoUrl())}" width="30" height="32" alt="${esc(site.name)}" style="display:block;width:30px;height:32px;"></a>
								</td>
								<td style="vertical-align:middle;font-family:${DISPLAY_FONT};font-size:20px;line-height:24px;font-weight:700;letter-spacing:-0.4px;color:${palette.white};">
									<a href="${home}" target="_blank" style="text-decoration:none;color:${palette.white};">${esc(site.nameParts.first)}<span style="color:${palette.brand};">${esc(site.nameParts.second)}</span></a>
								</td>
							</tr>
						</table>
					</td>
				</tr>
				<tr>
					<td bgcolor="${palette.card}" style="border-radius:18px;background:${palette.card};border:1px solid ${palette.border};">
						<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
							<tr>
								<td bgcolor="${palette.brand}" style="height:5px;font-size:0;line-height:0;background:${palette.brand};background-image:linear-gradient(90deg,${palette.brand} 0%,${palette.brandStrong} 45%,${palette.card} 100%);border-radius:18px 18px 0 0;">&nbsp;</td>
							</tr>
							<tr>
								<td class="px" style="padding:40px 44px 6px;">
									<p style="margin:0 0 14px;font-family:${BODY_FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:${palette.brand};">${esc(eyebrow)}</p>
									<h1 class="h1" style="margin:0 0 18px;font-family:${DISPLAY_FONT};font-size:32px;line-height:38px;font-weight:700;letter-spacing:-0.6px;color:${palette.white};">${esc(heading)}</h1>
									${paragraphHtml}
								</td>
							</tr>
							<tr>
								<td class="px" style="padding:14px 44px 4px;">
									<table role="presentation" class="btn-wrap" cellpadding="0" cellspacing="0" border="0">
										<tr>
											<td class="btn-cell" align="center" bgcolor="${palette.brand}" style="border-radius:12px;background:${palette.brand};">
												<!--[if mso]>
												<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="24%" strokecolor="${palette.brand}" fillcolor="${palette.brand}"><w:anchorlock/><center style="color:${palette.brandInk};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${esc(cta.label)}</center></v:roundrect>
												<![endif]-->
												<!--[if !mso]><!-->
												<a class="btn" href="${url}" target="_blank" style="display:inline-block;padding:16px 34px;font-family:${BODY_FONT};font-size:16px;line-height:20px;font-weight:700;color:${palette.brandInk};text-decoration:none;border-radius:12px;background:${palette.brand};mso-hide:all;">${esc(cta.label)}&nbsp;&nbsp;&rarr;</a>
												<!--<![endif]-->
											</td>
										</tr>
									</table>
								</td>
							</tr>
							${detailsHtml}
							<tr>
								<td class="px" style="padding:26px 44px 0;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${palette.faint};">
									Button not working? Paste this link into your browser:<br>
									<a href="${url}" target="_blank" style="color:${palette.brandStrong};text-decoration:underline;word-break:break-all;">${url}</a>
								</td>
							</tr>
							<tr>
								<td class="px" style="padding:26px 44px 40px;">
									<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
										<tr>
											<td style="border-top:1px solid ${palette.border};padding-top:20px;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${palette.faint};">
												${closing}
											</td>
										</tr>
									</table>
								</td>
							</tr>
						</table>
					</td>
				</tr>
				<tr>
					<td class="px" style="padding:28px 8px 0;font-family:${BODY_FONT};font-size:12px;line-height:19px;color:${palette.faint};">
						<span style="color:${palette.muted};font-weight:600;">${esc(site.name)}</span> &middot; ${esc(site.tagline)}.<br>
						Sent to ${esc(recipient)} &middot; <a href="${home}" target="_blank" style="color:${palette.faint};text-decoration:underline;">${esc(site.domain)}</a>
					</td>
				</tr>
			</table>
			<!--[if mso]></td></tr></table><![endif]-->
		</td>
	</tr>
</table>
</body>
</html>`

	const text = [
		eyebrow.toUpperCase(),
		'',
		heading,
		'',
		...paragraphs.map(plain),
		'',
		`${cta.label}: ${cta.url}`,
		'',
		...details.map((detail) => `${detail.label}: ${detail.value}`),
		...(details.length ? [''] : []),
		...[expiry, footnote].filter((line): line is string => Boolean(line)),
		'',
		'—',
		`${site.name} · ${site.tagline}.`,
		origin,
	].join('\n')

	return { html, text }
}
