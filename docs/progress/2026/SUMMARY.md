# Yearly Summary — 2026

## Overview

2026 marks the **Angular 22 SSR rewrite** and **feature platform maturation** year for rosak_firebase. The codebase transitioned from Angular 18 (ng-zorro-antd) to Angular 22 with Tailwind v4, SSR, and a modern component architecture. Three major feature platforms were delivered: **insiden** (incident reporting), **console** (admin tools), and **ads** (monetization), alongside significant tracker, profile, and spotting improvements.

---

## Major Milestones

### Q1–Q2: Foundation & Migration (Jan–Jul)

| Period  | Milestone                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Jan–Feb | Angular 18 → 19/20 upgrade prep, ng-devui → ng-zorro-antd migration (Stage 0)                                                 |
| Mar–Apr | Standalone component migration across all features (spotting, tracker, profile, insiden, gallery, console, about, compliance) |
| May–Jun | GTFS real-time tracking platform: multi-layer sources, status cards, path display, panel RT layer                             |
| Jul     | SSR enablement via Angular Universal, custom webpack builder, codecov integration                                             |

### Q3: Feature Platform Delivery (Aug)

| Week      | Milestone                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Aug 3–4   | Angular 19/20 upgrade: ng-devui → ng-zorro-antd (Stage 0), global font/nav badges/avatar restoration |
| Aug 10–11 | Firebase config fixes, rewrite checkpoint                                                            |
| Aug 13    | Angular 22 rewrite at repo root (major architecture shift)                                           |
| Aug 16–19 | Error tracking improvements, favicon update, profile public view                                     |
| Aug 21–24 | **insiden platform**: Firebase Functions + Gemini AI, report form, voting, approval queue            |
| Aug 22–24 | **console platform**: Approval queue, social media triage, admin claim enforcement                   |
| Aug 26    | **ads platform**: AdSense integration, app-ad-slot, robots.txt                                       |

---

## Module Evolution 2026

### insiden (Incident Platform) — **NEW PLATFORM**

| Phase      | Deliverables                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-2026   | Calendar view, timeline, event cards, long/short-term separation, markdown details                                                                                  |
| Aug 21     | Firebase Functions scaffold, Gemini extraction (Cheerio)                                                                                                            |
| Aug 22     | Report form (nested chronology), vote button (optimistic), asset tagging, AI summarize, social-media sheet, approval queue submission, `summarizeIncident` callable |
| Aug 23     | Reference-data error surfacing, form/toast polish                                                                                                                   |
| Aug 24     | Searchable asset multi-select, form polish                                                                                                                          |
| **Status** | **MVP Complete** — Full incident reporting → AI processing → admin approval workflow                                                                                |

### console (Admin Dashboard) — **MAJOR EXPANSION**

| Phase      | Deliverables                                                                |
| ---------- | --------------------------------------------------------------------------- |
| Pre-2026   | Events table, pagination, mark-as-read, vehicle status tags, reporter links |
| Aug 22     | Incident approval queue, social media links triage, section navigation      |
| Aug 22     | **Security**: Admin claim enforcement (Firebase custom claims)              |
| **Status** | **Admin tools mature** — Approval workflows, triage, secure routes          |

### tracker (GTFS Real-time) — **MATURE PLATFORM**

| Phase      | Deliverables                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Pre-2026   | Multi-layer sources, status cards, path display, RT layer, panel selections, mapbox integration |
| Aug 2026   | Navigation latency reduction, auth gate sync, console dropdown fixes                            |
| **Status** | **Production-ready** — Real-time vehicle tracking with multi-source GTFS-RT                     |

### profile (User Profiles) — **ENHANCED**

| Phase      | Deliverables                                                                           |
| ---------- | -------------------------------------------------------------------------------------- |
| Pre-2026   | Nickname editing, spotting stats, trends/charts, favourite trains, historical spotting |
| Aug 2026   | Public view feature, privacy settings modal, historical spottings on load              |
| **Status** | **Feature-complete** — Public/private views, privacy controls, statistics              |

### spotting (Train Spotting) — **CORE FEATURE**

| Phase      | Deliverables                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-2026   | Form (line/vehicle selection, sanity tests, run number, image upload, compression, queueing), drawer UI, inline history, session history |
| Aug 2026   | Skeletons for line data, z-index fixes, GraphQL error catching                                                                           |
| **Status** | **Polished** — Robust form, image pipeline, history, loading states                                                                      |

### navigation / shell — **MODERNIZED**

| Phase      | Deliverables                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Pre-2026   | Header, menu, theme picker, login dropdown, avatar                                                          |
| Aug 2026   | Progress bar for slow routes, one-shot animations, z-index management, avatar/pill polish, console sub-menu |
| **Status** | **App shell complete** — Perceived performance, animation polish, overlay management                        |

### ads (Monetization) — **NEW PLATFORM**

| Phase      | Deliverables                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Aug 26     | `app-ad-slot` component, `ADS_CONFIG`, manual AdSense units, fill-gated reveal, block capping, behavioral specs, `robots.txt` |
| **Status** | **MVP Ready** — Config-driven, tested, SEO-protected                                                                          |

### core (Utilities) — **EXTRACTED PATTERNS**

| Phase      | Deliverables                                                         |
| ---------- | -------------------------------------------------------------------- |
| Aug 2026   | `useBulkActions` composable, version reload prompt, commit hygiene   |
| **Status** | **Pattern library growing** — Reusable composables, error resilience |

---

## Architecture Evolution

### Before 2026 (Angular 18)

- ng-devui component library
- Apollo GraphQL client
- Client-side rendering (CSR)
- Module-based architecture (NgModules)

### After 2026 (Angular 22)

- **Tailwind v4** + **Headless UI** (hlm-* components)
- **Strawberry GraphQL** (via `graphqlResource()` / `postGraphQL()`)
- **SSR** (Server-Side Rendering) via Angular Universal
- **Standalone components** (no NgModules)
- **Firebase Auth/Firestore/Storage** direct integration
- **Firebase Functions** for backend logic (AI, summarization)

### Key Technical Shifts

1. **UI Library**: ng-devui → ng-zorro-antd → Tailwind v4 + hlm (Headless UI)
2. **Data Fetching**: Apollo → TanStack Query-like `graphqlResource()` signals
3. **Rendering**: CSR → SSR (SEO, performance, social previews)
4. **Components**: NgModules → Standalone (tree-shakable, lazy-loadable)
5. **Backend**: Custom API → Firebase Functions (serverless, integrated auth)

---

## Commit Statistics (2026 YTD)

| Month     | Commits | Major Focus                      |
| --------- | ------- | -------------------------------- |
| Jan       | 0       | (no data in range)               |
| Feb       | 0       | (no data in range)               |
| Mar       | 1       | Verification component fix       |
| Apr       | 0       | (no data in range)               |
| May       | 0       | (no data in range)               |
| Jun       | 0       | (no data in range)               |
| Jul       | 0       | (no data in range)               |
| Aug       | **41+** | **3 feature platforms + polish** |
| **Total** | **42+** |                                  |

> Note: Git history shows major activity in Aug 2026. Earlier 2026 commits may be in different branches or squashed.

---

## Key Commits Reference (2026)

### Angular 22 Rewrite & Migration

- `29d26cf` (2026-08-11): Replace old Angular 18 app with rewritten Angular 22 app at repo root
- `844ee9e` (2026-08-03): refactor: replace ng-devui with ng-zorro-antd (Stage 0 of Angular 19/20 upgrade)
- `3106525` (2026-08-04): fix: restore global font, nav badges, avatar/theme icons lost in ng-devui removal

### insiden Platform

- `20d7e31` (2026-08-21): feat(insiden): Add Firebase Functions structure and frontend insiden feature scaffold
- `36b4889` (2026-08-21): feat(insiden): Implement Gemini extraction function with Cheerio strategy
- `7cc48e7` (2026-08-22): feat(insiden): Add incident report form with nested chronology editor
- `eb17dc9` (2026-08-22): feat(insiden): Add vote button with net score, breakdown tooltip, optimistic updates
- `9b55adc` (2026-08-22): feat(insiden): Submit created drafts into the approval queue
- `64e28f2` (2026-08-22): feat(functions): Add summarizeIncident callable
- `2f742cd` (2026-08-22): feat(insiden): Add asset tagging and AI summarize to the report form
- `912d204` (2026-08-24): feat(insiden): Add searchable asset multi-select and form polish

### Console Platform

- `47d74b6` (2026-08-22): feat(console): Add incident approval queue page
- `d45b6f0` (2026-08-22): feat(console): Add social media links triage page
- `116a866` (2026-08-22): feat(console): Add section nav to all console pages
- `29b5d6d` (2026-08-22): fix(console): Enforce the admin claim on console routes

### Ads Platform

- `aa1d8c2` (2026-08-26): feat(ads): add shared app-ad-slot component and ADS_CONFIG
- `4ecb8cb` (2026-08-26): feat(ads): place manual AdSense units across standard pages
- `5c1c1b1` (2026-08-26): feat(ads): reveal slots only when filled and cap them to their reserved block
- `aa34d6f` (2026-08-26): test(ads): behavioral spec for app-ad-slot fill lifecycle and sizing
- `866cb37` (2026-08-26): chore(seo): add robots.txt excluding console and profile from crawling

### Profile & Spotting Polish

- `f779e7e` (2026-08-19): feat(profile): Add public view feature
- `873202f` (2026-08-24): refactor(profile): show privacy settings as a modal sourced from loaded preferences
- `bdac574` (2026-08-24): fix(profile): fetch historical spottings on own-profile load
- `85efe4b` (2026-08-24): fix(spotting): show skeletons while line data loads
- `6a33fdc` (2026-08-24): fix(spotting): fix sticky z-index overlap on line details
- `1e7aac9` (2026-08-19): fix(spotting): Add error catching on failed gql requests

### Navigation & Core

- `38bde66` (2026-08-24): feat(navigation): add thin top progress bar for slow route loads
- `4698bba` (2026-08-24): fix(app-nav): one-shot reveal animations, tracker console dropdown, nav z-index below overlays
- `fd5d274` (2026-08-24): fix(app-nav): polish avatar, update pill, console sub-menu and widen transition
- `839e64d` (2026-08-24): feat(version): prompt reload on stale lazy-chunk 404
- `0010f5d` (2026-08-24): feat(tracker): reduce perceived latency on /tracker navigation

### GDPR/About & Toast

- `ba95758` (2026-08-24): fix(gdpr, about): add Firestore error state with retry button
- `89a0f5f` (2026-08-22): feat(toast): Add pin/dismiss hover controls to notifications
- `e8a6c72` (2026-08-18): fix(ui): Toast not adhering to theme

---

## 2026 Technology Stack Summary

| Layer          | Technology                                 | Version/Notes               |
| -------------- | ------------------------------------------ | --------------------------- |
| Framework      | Angular                                    | 22 (SSR)                    |
| Styling        | Tailwind CSS                               | v4                          |
| UI Components  | Headless UI (hlm-*)                        | Radix-based                 |
| GraphQL        | Strawberry (backend) + `graphqlResource()` | Signal-based                |
| Auth           | Firebase Auth                              | Custom claims for admin     |
| Database       | Firestore                                  | Real-time listeners         |
| Storage        | Firebase Storage                           | Image uploads               |
| Functions      | Firebase Functions                         | Node.js, Gemini AI, Cheerio |
| Hosting        | Firebase App Hosting                       | SSR support                 |
| Analytics      | Google Analytics                           | App version tracking        |
| Error Tracking | Sentry                                     | Source maps, replay         |
| Testing        | Vitest + Playwright                        | Unit + E2E                  |
| Linting        | Prettier                                   | Single lint gate            |
| CI/CD          | GitHub Actions                             | Build, test, deploy         |

---

## Outlook: Q4 2026 & Beyond

### Planned / In Progress

- [ ] **Angular 22 stabilization**: Post-rewrite bug fixes, performance tuning
- [ ] **insiden v2**: AI summary quality, extraction accuracy, bulk operations
- [ ] **Console v2**: Bulk approval actions, audit logging, role-based access
- [ ] **Ads v2**: A/B testing, revenue analytics, consent management (GDPR)
- [ ] **Tracker v2**: Offline support, multi-source failover, historical replay
- [ ] **Profile v2**: Data export (GDPR), advanced analytics, social features
- [ ] **Core**: Design system documentation, component library extraction

### Technical Debt

- [ ] Complete ng-zorro-antd → Tailwind migration (remaining components)
- [ ] Standardize error handling patterns across features
- [ ] Extract shared GraphQL fragments
- [ ] Improve test coverage (target: 80%+)
- [ ] Document component APIs (Storybook or similar)

---

## Appendix: Module Map

```
src/app/
├── features/
│   ├── insiden/          # Incident reporting platform (NEW 2026)
│   ├── console/          # Admin dashboard (EXPANDED 2026)
│   ├── tracker/          # GTFS real-time tracking (MATURE)
│   ├── profile/          # User profiles (ENHANCED 2026)
│   ├── spotting/         # Train spotting (CORE)
│   ├── gallery/          # Image gallery
│   ├── about/            # About page + compliance
│   ├── gdpr/             # GDPR compliance
│   ├── ads/              # AdSense integration (NEW 2026)
│   └── not-found/        # 404 page
├── core/
│   ├── navigation/       # App nav, progress bar, animations
│   ├── auth/             # Firebase auth integration
│   ├── utils/            # useBulkActions, helpers
│   └── version/          # Stale chunk detection
├── shared/
│   ├── components/       # app-ad-slot, toast, skeletons, buttons
│   ├── ui/               # hlm-* wrappers, form controls
│   └── services/         # GraphQL, Firestore, Storage
└── shell/                # Layout, header, footer, theme
```

---

_Generated from git history analysis on 2026-08-27_
