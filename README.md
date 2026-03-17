# Mazda

Mazda is a self-hosted digital library app built with Next.js, Bun, tRPC, and Prisma.

## AI Transparency

This project was implemented with very heavy AI assistance.

- Code generation: ~100% AI-generated (architecture, backend, frontend, infra)
- Human role: product direction, feature requests, QA feedback, and acceptance
- Practical implication: review all code before production use, especially auth, access control, and file-processing paths

If you fork or deploy Mazda, keep this disclosure so downstream users know how the codebase was produced.

## Features

- Multi-user auth with bootstrap admin flow (first account becomes admin)
- Admin-managed user creation (public signup disabled after first user)
- Personal library scoping (users only see books they have access to)
- Upload/download and organization (collections, tags, reading states)
- Reader modes:
  - EPUB (themes, typography controls, TOC, highlights, progress sync)
  - PDF (page navigation, zoom, rotate)
  - CBZ/CBR (comic page viewer)
  - TXT/Markdown
- Metadata + cover enrichment on upload (registry-first cover, book-extracted fallback)

## Local development (Bun + Postgres)

1. Install dependencies:

```bash
bun install
```

2. Start PostgreSQL (example):

```bash
docker run --name mazda-db -e POSTGRES_USER=mazda -e POSTGRES_PASSWORD=mazda -e POSTGRES_DB=mazda -p 5432:5432 -d postgres:16-alpine
```

3. Create `.env` values:

```bash
DATABASE_URL=postgresql://mazda:mazda@localhost:5432/mazda?schema=public
JWT_SECRET=change-me-in-production
BOOKS_STORAGE_PATH=./data/books
COVERS_STORAGE_PATH=./data/covers
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Run app:

```bash
bunx prisma migrate deploy
bun run dev
```

## Prisma commands

```bash
bunx prisma migrate dev
bunx prisma migrate deploy
bunx prisma generate
```

## Docker Compose

```bash
docker compose up --build
```

App: `http://localhost:3000`

## Login flow

- The first registered user is automatically assigned the `ADMIN` role.
- Public registration is disabled after the first user exists.
- Additional users must be created by an admin from the Admin panel.

## Supported formats

`.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.cbz`, `.cbr`, `.txt`, `.md`

## License

Mazda is licensed under **GNU AGPL-3.0-only**.

- You can use, modify, and self-host it.
- If you distribute modified versions, they must remain under AGPL-3.0.
- If you run a modified version as a network service, you must provide the full corresponding source to users of that service.

This enforces a permanent open-source/copy-left model for derivatives.
