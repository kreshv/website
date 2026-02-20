# Local Testing Without Touching Live Listings

This lets you use the admin page locally and write to an isolated DB.

## 1) Create local env file

```bash
cd /Users/kreshnikcikaqi/Desktop/website/api
cp .env.local.example .env.local
```

Edit `api/.env.local` and set:
- `DATABASE_URL` / `DIRECT_URL` to your **test** database (not production)
- `ADMIN_SECRET` to a local admin key
- Cloudinary keys (if you want image uploads while testing)

## 2) Run API in local-env mode

Apply DB migrations to your local test DB first:

```bash
cd /Users/kreshnikcikaqi/Desktop/website/api
set -a; source .env.local; set +a
npm run prisma:deploy
```

Then run the API:

```bash
cd /Users/kreshnikcikaqi/Desktop/website/api
USE_LOCAL_ENV=1 npm run dev
```

## 3) Serve frontend locally

```bash
cd /Users/kreshnikcikaqi/Desktop/website
python3 -m http.server 5500
```

## 4) Use local admin page

Open:
- `http://127.0.0.1:5500/admin-listings.html`

Use:
- API Base URL: `http://127.0.0.1:5050`
- Admin Key: value from `api/.env.local` -> `ADMIN_SECRET`

Create/update listings, then check:
- `http://127.0.0.1:5500/apartments.html`

## Notes

- `app-config.js` auto-switches API URL:
  - local host -> `http://127.0.0.1:5050`
  - deployed host -> Render URL
- Do not run local tests against production DB unless intentional.
