# Hover Deep Link — Investigation Findings

Sprint: feat/hover-deep-link
Date: 2026-04-22

## What we tested

| Probe | Result |
|---|---|
| DNS: `app.hover.to` | Does not resolve (old button pointed here — broken) |
| DNS: `hover.to` | Resolves (Cloudflare / HubSpot CMS marketing site) |
| `hover.to/projects/new?...` | 404 |
| `hover.to/new` | 404 |
| `hover.to/capture` | 404 |
| `hover.to/apple-app-site-association` | 200 — but `paths: []` for every registered appID |
| Hover iOS App Store ID | `942568673` (app: `to.hover.ios.store`, team `32MMRNC3MW`) |
| Hover REST API (`api.hover.to`) | Bearer-token job/images endpoints only — no project-create deep link |

## Conclusion

Hover exposes **no URL-based pre-fill** for a new project capture.

- No universal link opens the native app directly — AASA declares the app
  bundle but claims zero paths, so iOS will never hand a hover.to URL to
  the app.
- `app.hover.to/new?address=...` (what the previous button used) was a
  dead host, so the button did nothing on tap.
- Custom URL scheme `hover://` is undocumented; best-effort attempt only.

## What shipped

Launch-only behavior:

1. Copy `address + homeowner name` to clipboard (rep pastes into Hover).
2. Attempt `hover://` to open the installed iOS app.
3. If the scheme doesn't fire within ~1.5 s, fall back to
   `https://hover.to` (marketing page with App Store links).
4. If iOS blocks the attempt, show a toast with a tappable App Store
   link (`apps.apple.com/us/app/hover-design-measure/id942568673`).

Pre-fill level shipped: **none** (clipboard-assist only). Upgrade path:
if Hover ever publishes universal-link params, only `public/hover-link.js`
needs to change.
