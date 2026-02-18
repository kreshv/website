# Deployment Guide

## 1) Deploy API to Render

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and select this repo.
3. Render will detect `render.yaml` and create the `apartment-api` service.
4. Set env vars in Render:
   - `DATABASE_URL` = Neon pooled URL (`-pooler` host)
   - `DIRECT_URL` = Neon direct URL (non-`-pooler` host)
   - `CORS_ORIGIN` = your Vercel frontend origin (example: `https://your-site.vercel.app`)
     - Optional local dev: comma-separate origins, e.g. `https://your-site.vercel.app,http://127.0.0.1:5500`
   - `ADMIN_SECRET` = long random string for private admin writes
   - `CLOUDINARY_CLOUD_NAME` = your Cloudinary cloud name
   - `CLOUDINARY_API_KEY` = your Cloudinary API key
   - `CLOUDINARY_API_SECRET` = your Cloudinary API secret
   - `CLOUDINARY_FOLDER` = optional folder (example: `listings`)
5. Deploy and verify:
   - `GET https://<render-service>.onrender.com/api/health`
   - `GET https://<render-service>.onrender.com/api/listings`
   - `POST https://<render-service>.onrender.com/api/admin/listings` (with `x-admin-key`)

## 2) Deploy Frontend to Vercel

1. Import this repo in Vercel.
2. Keep framework preset as `Other` (static site).
3. Before deploying, edit `/app-config.js`:
   - set `API_BASE_URL` to your Render API URL.
4. Deploy and verify:
   - `/` loads search page
   - `/apartments` loads results page
   - `/admin` loads private admin listing page

## 3) First-time DB setup

Migrations are applied on API boot via:

`npm run prisma:deploy && npm start`

After first deploy, run seed once locally or via Render shell:

`npm run seed`

## 4) Use Admin Page to Add Listings (No Public Accounts)

1. Open your deployed admin page:
   - `https://<your-domain>/admin`
2. Enter:
   - API Base URL (`https://<render-service>.onrender.com`)
   - Admin Key (`ADMIN_SECRET`)
3. Fill listing fields and upload image.
4. Submit.

If an uploaded image is provided as file input, the backend uploads it to Cloudinary and stores the returned URL in `Listing.imageUrl`.

## 5) Local run

API:

```bash
cd api
npm install
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm run dev
```

Frontend:

Open `/index.html` with a local static server.
