# Project Notes

## Deployment Status
- Live frontend: `https://website-murex-phi-81.vercel.app`
- Live API: `https://apartment-api-ptpn.onrender.com`
- Admin page currently usable at: `https://website-murex-phi-81.vercel.app/admin-listings.html`

## Decision (Current)
- Keep new `map image per listing` work **local only for now**.
- Do **not** push current local changes yet.

## What Is Already Live
- Private admin listing creation (no user accounts).
- Cloudinary upload flow for main listing image.
- Demo listings cleanup button in admin page.

## What Is Implemented Locally (Not Pushed Yet)
- New DB field: `mapImageUrl` on `Listing`.
- Admin page supports second upload input: `Map Image`.
- API accepts `mapImageUrl` and returns it in listing payload.
- Hero card map section uses listing-specific map image.

## Resume Later
When ready, ask:
- "Continue map image feature and push live"

Then we should:
1. Run local test flow.
2. Commit local map-image changes.
3. Push to GitHub.
4. Let Render/Vercel redeploy.
5. Verify `/admin-listings.html` map upload in production.
