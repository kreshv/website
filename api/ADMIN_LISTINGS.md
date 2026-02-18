# Private Listing Admin (No User Accounts)

This project supports creating listings privately via an admin-only API key.

## 1. Set your admin key

In `api/.env`, add:

```env
ADMIN_SECRET=your-long-random-secret
```

## 2. Start API

```bash
cd api
npm run dev
```

## 3. Create a listing from JSON

Use the example payload:

```bash
cd api
npm run add:listing -- --file ./scripts/new-listing.example.json
```

## 4. Endpoint details

- Method: `POST /api/admin/listings`
- Required header: `x-admin-key: <ADMIN_SECRET>`
- Body fields:
  - `title` (required)
  - `address` (optional)
  - `price` (required)
  - `beds`, `baths` (optional)
  - `borough`, `neighborhood` (required)
  - `petsPolicy` (optional)
  - `isActive` (optional)
  - `unitFeatures[]`, `buildingFeatures[]`, `subwayLines[]` (optional)

Public users remain accountless and still only consume `GET /api/listings`.

## Optional: use the private admin page

Open:

- `/Users/kreshnikcikaqi/Desktop/website/admin-listings.html`

Then:

1. Enter API base URL and your `ADMIN_SECRET`.
2. Fill listing fields.
3. Upload an image file (stored as `imageUrl`).
4. Submit.
