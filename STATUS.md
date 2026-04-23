# crc-field — STATUS
Generated: 2026-04-22

## 1. What This Repo Does
Mobile-first PWA for CRC sales reps in the field. It is a thin Express server (single `server.js`, SPA in `public/`) that acts mostly as an authenticated proxy in front of the CRC Supplement Portal (Hermes bridge), plus a local store for leads, rep codes, chat, training progress, referrals, an ABC-deliveries builds map, and an Anthropic-powered Ask Brain assistant.

## 2. Live Endpoints

### Declared inline in `server.js`
| Method | Path | What | Status |
|---|---|---|---|
| GET | /health | Liveness check | WIRED |
| GET | /api/rep-codes/validate | Validate a rep code against `lib/repCodes.js` | WIRED |
| GET | /api/maps/reverse-geocode | Google reverse geocode | WIRED |
| GET | /api/jobs/:id | Returns `{}` to keep markup.js canvas opening | STUBBED (explicit stub, server.js:51) |
| POST | /api/leads/:id/photos/markup | Save photo markup into local lead | WIRED |
| GET | /claims-dashboard | Serve `public/claims-dashboard.html` | WIRED |
| GET | /roster | Serve `public/roster.html` | WIRED |
| GET | /training | Serve `public/training.html` | WIRED |
| GET | /{*path} | SPA fallback → `index.html` | WIRED |

### `routes/leads.js` (mounted `/api/leads`)
| GET | /api/leads | List leads, optional `repCode`/`status` filter | WIRED |
| GET | /api/leads/export/csv | CSV dump of all leads | WIRED |
| GET | /api/leads/:id | Single lead | WIRED |
| POST | /api/leads | Create lead; retail auto-syncs to portal | WIRED |
| PATCH | /api/leads/:id | Update; `claim_filed` syncs+orchestrates | WIRED |

### `routes/photos.js` (mounted `/api/leads`)
| POST | /api/leads/:id/photos | Multipart upload, Cloudinary + portal auto-sync | WIRED |
| GET | /api/leads/:id/photos | Two-tab photo list | WIRED |
| DELETE | /api/leads/:id/photos/:photoId | Delete from Cloudinary + lead | WIRED |
| PATCH | /api/leads/:id/photos/:photoId | Update tag/caption | WIRED |
| POST | /api/leads/:id/sync-homeowner-portal | Push photos to portal | WIRED |

### `routes/reports.js` (mounted `/api/leads`)
| POST | /api/leads/:id/report | Portal-first, HTML fallback | WIRED |
| GET | /api/leads/:id/report/:reportId | Serve stored report HTML | WIRED |

### `routes/storms.js` (mounted `/api/storms`)
| GET | /api/storms | 24h-cached Central Ohio hail events from NCEI bulk CSV; returns `{ storms, source, fetchedAt, cacheAge? }`; `?source=reference` for curated list | WORKING |
| GET | /api/storms/refresh | Force live NCEI refresh | WORKING |

On NOAA failure both endpoints return **HTTP 503** with `{ error, retryAfter, source: "NOAA", message }` — never stale hardcoded data presented as live. Cache TTL 24h, held in-memory and mirrored to `data/storm-cache.json`.

### `routes/admin.js` (mounted `/api/admin`)
| GET | /api/admin/data-core | Master contacts/properties | WIRED |
| GET | /api/admin/lists/:name | Named data-core list | WIRED |
| GET | /api/admin/reps | Rep-by-rep lead stats | WIRED |
| GET | /api/admin/export | Data-core CSV dump | WIRED |
| GET | /api/admin/rep-codes | List rep codes | WIRED |
| POST | /api/admin/rep-codes | Create rep code | WIRED |
| PATCH | /api/admin/rep-codes/:code | Update rep code | WIRED |
| GET | /api/admin/chat/threads | List threads with members | WIRED |
| PATCH | /api/admin/chat/threads/:threadId | Rename/update thread | WIRED |
| POST | /api/admin/chat/threads | Create thread | WIRED |
| POST | /api/admin/chat/threads/:threadId/members | Add member | WIRED |
| DELETE | /api/admin/chat/threads/:threadId/members/:code | Remove member | WIRED |
| GET | /api/admin/intelligence | Last saved intel report | WIRED |
| POST | /api/admin/intelligence | Regenerate intel report | WIRED |
| GET | /api/admin/zones | List storm zones | WIRED (unused — `data/zones.json` is empty) |
| POST | /api/admin/zones | Create zone | WIRED (unused) |

### `routes/maps.js` (mounted `/api/maps`)
| GET | /api/maps/autocomplete | Places autocomplete proxy | WIRED |
| GET | /api/maps/place-details | Place→lat/lng proxy | WIRED |
| GET | /api/maps/streetview | Street View image URL | WIRED |
| GET | /api/maps/key | Return JS API key | WIRED |

### `routes/stats.js` (mounted `/api/stats`)
| GET | /api/stats/:repCode | Rep performance | WIRED |
| GET | /api/stats | Leaderboard | WIRED |

### `routes/hover.js` (mounted `/api/hover`)
| POST | /api/hover/sync | Inbound Hover webhook from Hermes | WIRED |
| POST | /api/hover/pull-photos/:leadId | Pull images from Hover API | STUBBED — returns "Hover API not configured" because `HOVER_ACCESS_TOKEN` is missing from `.env` |
| POST | /api/hover/order/:leadId | Order a Hover measurement via portal | WIRED |

### `routes/chat.js` (mounted `/api/chat`)
| GET | /api/chat/stream/:threadId | SSE stream | WIRED |
| GET | /api/chat/threads | Threads for rep (includes DM) | WIRED |
| GET | /api/chat/messages/:threadId | Last N messages | WIRED |
| POST | /api/chat/messages | Post text/photo message | WIRED |
| POST | /api/chat/photo | Cloudinary chat photo upload | WIRED |
| POST | /api/chat/react | Toggle emoji reaction | WIRED |

### `routes/brain.js` (mounted `/api/brain`)
| POST | /api/brain/chat | Streaming `claude-sonnet-4-6` chat | WIRED |
| GET | /api/brain/history/:repCode | Per-rep history | WIRED |
| DELETE | /api/brain/history/:repCode | Clear history | WIRED |
| GET | /api/brain/history | All history (admin) | WIRED |

### `routes/claims-dashboard.js` (mounted `/api/claims-dashboard`)
| GET | /api/claims-dashboard | Pipeline/weekly/monthly rollup | PARTIAL — reads static `data/jobs-2026-ytd.json` snapshot (last written 2026-04-02); not live JobNimbus |

### `routes/referrals.js` (mounted `/api/referrals`)
| GET | /api/referrals/stats | Per-rep referral stats | WIRED |
| GET | /api/referrals | List referrals | WIRED |
| GET | /api/referrals/:id | Single referral | WIRED |
| POST | /api/referrals | Create referral | WIRED |
| PATCH | /api/referrals/:id | Update referral | WIRED |

### `routes/training.js` (mounted `/api/training`)
| GET | /api/training/assets | Cloudinary manifest | WIRED |
| GET | /api/training/quizzes | Quiz data | WIRED |
| GET | /api/training/flashcards | Flashcard data | WIRED |
| GET | /api/training/progress | All rep progress (admin) | WIRED |
| GET | /api/training/progress/:repCode | Single rep progress | WIRED |
| POST | /api/training/progress/:repCode | Save progress | WIRED |

### `routes/field-jobs.js` (mounted `/api/field/jobs` AND `/api/field` — mounted twice in server.js:23-24)
| GET | /api/field/jobs | Portal proxy — list jobs by repCode | WIRED |
| GET | /api/field/jobs/:id | Portal job detail + photo-URL absolutization | WIRED |
| POST | /api/field/jobs | Create job via Hermes bridge | WIRED |
| PATCH | /api/field/jobs/:id | Update allowed fields | WIRED |
| POST | /api/field/jobs/:id/notes | Add note | WIRED |
| POST | /api/field/jobs/:id/tasks | Add task | WIRED |
| PATCH | /api/field/jobs/:id/tasks/:taskId | Complete/update task | WIRED |
| POST | /api/field/jobs/:id/photos | Upload photo to portal simple-photos | WIRED |
| DELETE | /api/field/jobs/:id/photos/:photoId | Delete portal photo | WIRED |
| POST | /api/field/jobs/:id/photos/markup | Save photo markup to portal | WIRED |
| POST | /api/field/jobs/:id/photo-inspection-report | Build PDF (portal) | WIRED |
| POST | /api/field/jobs/:id/claim-filing-package | Build PDF (portal) | WIRED |
| GET | /api/field/jobs/:id/next-steps-pdf | Stream PDF from portal | WIRED |
| POST | /api/field/jobs/:id/sign | Capture auth signature | WIRED |
| PATCH | /api/field/jobs/:id/fieldnotes | Save field obs | WIRED |
| POST | /api/field/checkins | Submit daily check-in | WIRED |
| GET | /api/field/checkins/status | Who checked in today | WIRED |

### `routes/builds.js` (mounted `/api/builds`)
| GET | /api/builds | Geocoded completed JN jobs | WIRED — but not called by the frontend (frontend uses `/api/builds-map/pins` instead) |
| GET | /api/builds/summary | Counts by rep/year/type | WIRED — also unused from frontend |
| POST | /api/builds/refresh | Geocode new JN completions | WIRED |

### `routes/builds-map.js` (mounted `/api/builds-map`)
| POST | /api/builds-map/import-csv | Import `abc-deliveries.csv` | WIRED (also auto-runs on startup, server.js:101) |
| GET | /api/builds-map/pins | Pin list with color filter | WIRED |
| PATCH | /api/builds-map/pins/:id | Set shingleColor/notes | WIRED |
| POST | /api/builds-map/pins | Manual pin add | WIRED |
| POST | /api/builds-map/geocode | Geocode next 10 pins | WIRED |
| POST | /api/builds-map/geocode-all | Batch geocode all | WIRED |

### `routes/rep-card.js` (mounted at `/`)
| GET | /api/rep-card/:code | Merged rep card data | WIRED |
| PATCH | /api/rep-cards/:code | Update own card (self or admin) | WIRED |
| POST | /api/rep-cards/:code/photo | Upload rep photo to Cloudinary | WIRED |
| GET | /api/rep-codes | Public rep list | WIRED (duplicate — collides conceptually with `/api/admin/rep-codes`) |
| PATCH | /api/rep-codes/:code | Update rep code | WIRED (auth-gated, duplicates admin route) |
| GET | /rep-card/:code/vcard | Download `.vcf` | WIRED |
| GET | /rep-card/:code | Public HTML rep card | WIRED |

### `routes/recruit.js` (mounted at `/`)
| POST | /api/applications | Store recruit application | WIRED |
| GET | /recruit | Public recruit HTML page | WIRED |

## 3. Feature Inventory

| Feature | Status | Notes |
|---|---|---|
| Local leads store (JSON) | LIVE | `data/leads.json` currently empty (`[]`) — all active work lives on the portal |
| Lead → Portal/Hermes sync | LIVE | `lib/portalSync.js`, retail syncs on create, insurance syncs on `claim_filed` |
| Field Jobs UI (portal proxy) | LIVE | `routes/field-jobs.js` — the primary workflow surface |
| Photo upload + markup (to portal) | LIVE | Native FormData fix committed in Build 3.3 (b47f556, 9beba5e) |
| Photo URL absolutization | LIVE | Build 3.3.2 rewrite for relative portal URLs |
| Cloudinary local photo store | LIVE | `lib/photoStorage.js`, configured |
| Ask Brain (Anthropic claude-sonnet-4-6) | LIVE | Streaming SSE, history persisted per rep |
| Team Chat (SSE) | LIVE | Company/leadership/DM threads |
| Rep Stats + Leaderboard | LIVE | Pure local-lead calculation; will show zero until leads exist |
| Rep Cards + vCard | LIVE | Cloudinary photos, public `/rep-card/:code` |
| Recruit landing page + application | LIVE | Applications land in `data/applications.json` |
| Training portal (assets/quizzes/flashcards/progress) | LIVE | Static assets via Cloudinary manifest |
| ABC-delivery Builds Map | LIVE | CSV auto-import + background geocode on startup |
| JN Builds Map (`/api/builds`) | LIVE but ORPHANED | Route + data exist; frontend doesn't call it |
| Claims Dashboard | PARTIAL | Reads static `jobs-2026-ytd.json` — not a live JN feed |
| Storm layer (hail events) | LIVE | Real NCEI bulk CSV pull (Central Ohio counties, Hail only), 24h cache, honest 503 on failure |
| Hover photo pull | BROKEN | `HOVER_ACCESS_TOKEN` not set; endpoint returns "not configured" |
| Inbound Hover webhook | LIVE | `/api/hover/sync` ready for Hermes |
| Storm zones | NOT STARTED | Routes + store exist, `zones.json` empty, no UI |
| Referrals API | LIVE but ORPHANED | Endpoints exist, no frontend UI in `index.html` |
| System Intelligence report | LIVE but ORPHANED | Admin-only, no UI |
| Data Core upsert on lead create | LIVE | `upsertDataCore()` in `lib/store.js` |
| Authorization signature capture | LIVE | `POST /api/field/jobs/:id/sign` proxies to portal |
| Daily field check-ins | LIVE | Proxied to portal |
| Photo Inspection / Claim Filing PDFs | LIVE | Proxied to portal PDF builders |
| Buyers/Career Guide generators | ORPHANED | `lib/generate-buyers-guide.js` + `scripts/generateBuyersGuide.js` / `generateCareerGuide.js` — standalone node scripts, not wired to any route; `scripts/generateBuyersGuide.js` depends on a logo under `$HOME/vaults/crc-brain/...` |

## 4. External Integrations

| Service | Purpose | Status |
|---|---|---|
| CRC Supplement Portal (Hermes) | Source of truth for jobs/photos/notes/tasks/PDFs | WORKING (`SUPPLEMENT_PORTAL_URL` + `HERMES_API_SECRET` set) |
| Cloudinary | Photo + rep headshot storage | WORKING (cloud `dtrzdisoc`) |
| Anthropic (Claude) | Ask Brain chat (`claude-sonnet-4-6`) | WORKING (key set in `.env`) |
| Google Maps | Autocomplete, Place Details, Street View, Geocoding | WORKING |
| NOAA Storm Events | Hail event pull | WORKING — `lib/noaaStorms.js` pulls annual CSVs from `ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/`, filters to Central Ohio + Hail, caches 24h. Returns HTTP 503 on NOAA failure instead of silent fallback |
| Hover API | Pull photos for a lead | NOT CONFIGURED (`HOVER_ACCESS_TOKEN` missing) |
| CompanyCam | Photo source | NOT CONFIGURED here — field app consumes CompanyCam URLs indirectly via portal responses; no direct integration in this repo |
| JobNimbus | Job data for claims-dashboard + builds | NOT CONFIGURED — only reads a static JSON snapshot (`data/jobs-2026-ytd.json`) |
| Lob | Direct mail | NOT CONFIGURED (`LOB_API_KEY` in `.env` is empty, not referenced in any code) |
| ABC Supply (file drop) | Delivery CSV → builds map | WORKING (CSV on disk, auto-imported on boot) |
| SendGrid / Twilio / Gmail API / JobNimbus API / OpenAI / Slack / Google Drive / Postgres / any DB | — | NOT CONFIGURED — no references in code |

Webhook endpoints exposed: `POST /api/hover/sync` is the only inbound webhook.

## 5. Env Vars

Referenced in code:
- `PORT` — set in `.env`
- `GOOGLE_MAPS_API_KEY` — set
- `SUPPLEMENT_PORTAL_URL` — set
- `HERMES_API_SECRET` — set
- `CLOUDINARY_CLOUD_NAME` — set
- `CLOUDINARY_API_KEY` — set
- `CLOUDINARY_API_SECRET` — set
- `ANTHROPIC_API_KEY` — set
- `HOVER_ACCESS_TOKEN` — **referenced, NOT in `.env`**
- `LOB_API_KEY` — present in `.env` but empty and never referenced in source
- `HOME` — used by `lib/generate-buyers-guide.js`, `scripts/generateBuyersGuide.js`, `scripts/generateCareerGuide.js` for paths into `~/content-engine` and `~/vaults/crc-brain`

There is **no `.env.example` file** in this repo. Any new deploy cannot bootstrap required vars from a template.

## 6. Open TODOs

`grep TODO|FIXME|XXX|HACK` across `server.js`, `routes/`, `lib/`, `public/`, `scripts/`: **zero matches.**

One explicit stub is documented with a comment:
- `server.js:51` — `// Stub: markup.js calls /api/jobs/:id to pre-load existing strokes. ... return empty object to keep the canvas opening.`

## 7. Dead Code / Unused Routes

Orphaned backend (route defined, never called by frontend in `public/*.js`):
- `GET /api/leads/export/csv` — CSV dump, no UI link
- `GET /api/admin/zones`, `POST /api/admin/zones` — `zones.json` is empty, no UI
- `GET /api/storms?source=reference` — curated list gated behind query param; frontend does not request it today
- `GET /api/admin/lists/:name` — not called
- `GET /api/admin/intelligence`, `POST /api/admin/intelligence` — admin-only, no UI
- `GET /api/admin/export` — data-core CSV, no UI
- All `/api/referrals/*` — no referrals view in `index.html`
- `GET /api/builds`, `GET /api/builds/summary`, `POST /api/builds/refresh` — frontend uses the sibling `/api/builds-map/*` for pin rendering
- `POST /api/hover/pull-photos/:leadId` — blocked by missing token anyway
- Public rep routes `/rep-card/:code`, `/rep-card/:code/vcard` — intentional share links, only reached externally

Files not imported anywhere in the runtime server:
- `lib/crcBrandStandard.js` (161 lines) — zero references
- `lib/generate-buyers-guide.js` — standalone CLI
- `scripts/generateBuyersGuide.js`, `scripts/generateCareerGuide.js`, `scripts/upload-training-assets.js`, `scripts/geocode-builds.js`, `scripts/generate-pwa-icons.js` — standalone CLIs, none invoked by server or `package.json` scripts
- `analyze-jn.js` (repo root) — standalone CLI

Mount oddity:
- `server.js:23-24` mounts `routes/field-jobs.js` at **both** `/api/field/jobs` and `/api/field`. That means `/api/field/:id/*` resolves the same as `/api/field/jobs/:id/*`. Works, but easy to reason about wrong.

Duplicate rep-code endpoints:
- `GET/POST/PATCH /api/admin/rep-codes*` (admin) vs `GET/PATCH /api/rep-codes*` (rep-card.js). Two routers manage the same JSON file.

## 8. Data Model

A **lead** (`lib/store.js:createLead`) — the local JSON record, one per door knock:

```json
{
  "id": "1714000000000",
  "address": "123 Main St",
  "city": "Columbus",
  "state": "OH",
  "zip": "43215",
  "lat": 39.96,
  "lng": -82.99,
  "county": "Franklin",
  "homeowner": "Jane Smith",
  "phone": "614-555-1234",
  "email": "jane@example.com",
  "jobType": "Roof",
  "jobTypes": ["Roof"],
  "jobCategory": "insurance",
  "source": "Door Knock",
  "notes": "",
  "status": "new",
  "repCode": "MCG",
  "photos": { "inspection": [], "build": [] },
  "measurements": null,
  "hoverId": null,
  "ownerName": "",
  "mailingAddress": "",
  "yearBuilt": null,
  "assessedValue": null,
  "propertyClass": "residential",
  "absenteeOwner": false,
  "streetViewUrl": "",
  "portalJobId": null,
  "createdAt": "2026-04-22T...",
  "updatedAt": "2026-04-22T..."
}
```

Persistence: plain JSON files under `data/` (no DB). Writes are synchronous `fs.writeFileSync`. Current state on disk:
- `data/leads.json` → `[]` (empty)
- `data/crc-data-core.json` → zero contacts, zero properties
- `data/rep-codes.json` → 7 active reps (MCG, LANE, TSHINGLE, RHYSB, DCHRIS, RONDO, DOMG)
- `data/builds-db.json` → ABC deliveries (335 KB)
- `data/jobs-2026-ytd.json` → JN snapshot (2.7 MB, last written 2026-04-02)

A **photo** (after Cloudinary upload):
```json
{
  "id": "<cloudinary public_id>",
  "url": "<secure_url>",
  "thumbnail": "<secure_url with w_300,c_fill>",
  "width": 1600, "height": 1067,
  "tag": "overview|roof|damage|interior|before|after|...",
  "category": "inspection|build",
  "caption": "",
  "repCode": "MCG",
  "jobId": "<lead id>",
  "source": "manual|hover|import",
  "uploadedBy": "MCG",
  "uploadedAt": "..."
}
```

The **field-jobs proxy** does not define a local model — it returns the portal's job shape verbatim (after photo URL absolutization).

## 9. Deploy State
- Render service name: **crc-field** (project's `CLAUDE.md` references `crc-field.onrender.com`; no `render.yaml` in repo — service config lives in the Render dashboard).
- Auto-deploys from: **main**.
- Recent commits show an active release cadence; latest on main is `ac8c91d Build 3.3.3 (field): Kill blank download window + fix desktop header cutoff` (2026-04-22). Working tree is clean. Deploy status in Render UI: unknown — needs manual check.

## 10. The One Thing

**This app is a frontend for the portal, not a standalone service.** Every meaningful workflow — job create, notes, tasks, photos, markup, PDFs, signatures, check-ins — flows through `routes/field-jobs.js` to the Supplement Portal. The local `leads` store that the rest of the code assumes as its primary model is currently **empty** and is no longer the path reps use. For the CRC Operating System rollout, that means: (a) portal uptime is field-app uptime, and (b) the leftover local-lead surface (leads, referrals, storm zones, system intelligence, two sets of rep-code endpoints, the unused `/api/builds` route, and the NOAA fallback) is drag — cleaning or collapsing it will make this repo's job obvious: a thin, signed proxy in front of the portal plus chat + Brain + training + ABC map.
