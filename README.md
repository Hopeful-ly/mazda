# Mazda

Mazda is a self-hosted digital library app built with Next.js, Bun, tRPC, and Prisma.

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
- Later registered users are assigned the `USER` role.

## Supported formats

`.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.cbz`, `.cbr`, `.txt`, `.md`
