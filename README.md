# Reynolds Built

Reynolds Built (ReynoldsBuilt.dev) is the marketing site for an AI, automation, and custom software consultancy. It is built with Next.js, Tailwind CSS, and shadcn/ui primitives, with no database.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` after the development server starts.

## Contact form

The site has no database. The contact form sends mail through Nodemailer. Copy `.env.example` to `.env.local` and replace every placeholder with the SMTP settings for the sending mailbox. Never commit `.env.local`.

```bash
CONTACT_TO_EMAIL=you@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_PASS=replace-with-your-smtp-password
SMTP_FROM_EMAIL=you@example.com
```

## Content

Current case-study and article copy is intentionally marked as in progress. Project previews in `public/` have been retained. Replace the records in `src/lib/site-content.ts` with approved project details and publish-ready insight content as it becomes available.
