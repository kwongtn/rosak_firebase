# Graph Report - rosak_firebase (2026-09-02)

## Corpus Check

- 312 files · ~261,153 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 1860 nodes · 3509 edges · 181 communities (94 shown, 84 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)

- Image Upload Pipeline
- Shared Utilities & Queries
- Cloud Functions API
- Console Incident Moderation
- Gallery Data & Layout
- Incident Calendar UI
- About Page & Ads
- GraphQL Client Core
- Pending Incidents Panel
- Incident Sheet Service
- Functions Dependencies
- Spotting GraphQL Queries
- Theme & Nav Services
- Link Form & Asset Select
- Legacy Frontend Map A
- Spotting Activity Heatmap
- Chronology Utilities
- Line Overview Components
- Social Media Links Panel
- Insiden Page Assembly
- Spotting Grid Components
- Tracker Layer Controls
- Public Social Links
- Feature Doc Concepts A
- Tracker Info Panel
- Tracker Marker Layers
- Status Badge Variants
- Auth Service & Guards
- Vehicle Status Trends
- Not-Found & Navigation
- Console Page State
- Frontend Progress & Templates
- App Routing & Preload
- Station Assets Section
- Line Details Page
- Version & Chunk Recovery
- Tracker Layer Services
- TypeScript Config
- SSR Bootstrap
- Incident Form Component
- Vehicle Spotting Grid
- GTFS Realtime Service
- Polling Source
- Line Switcher & Store
- Environments & Server
- Dev Dependencies
- Console Page Component
- Incident AI Service
- GTFS Static Service
- Tracker Shell Assembly
- Angular Build Options
- Spartan UI Skill
- Favicon Build Scripts
- GDPR Page
- Vote Button
- Profile Feature Concepts
- Tracker Feature Concepts
- NPM Scripts
- Gallery Feature Concepts
- Tracker Map Component
- App Footer & Versioning
- Runtime Dependencies
- Bulk Actions Composable
- Hlm Table Components
- Angular Workspace Config
- L7 Dependency Exclusions
- Insiden Feature Concepts
- Package Config
- Line Details Month Nav
- Hlm Checkbox
- Build Targets
- E2E Incident Workflows
- Build Info Script
- Dev Serve Target
- Prod Build Config
- Project Web Config
- Spotting Feature Concepts
- Mock GraphQL Server
- Firebase Config Script
- Sentry Sourcemaps Script
- App Error Handler
- Analytics Service
- Console Nav Tests
- Insiden Routes & Shell
- Link Form Component
- Vehicle Status Board
- Report Form Component
- Account Panel
- Prod Budgets
- GDPR Feature Concepts
- Upload Service Concepts
- Tracker Legacy Services
- Visual Evidence Script
- Runtime Config Script
- Situasi Legacy Components
- Shell Legacy Components
- DOM Visual Checks
- CI Gates
- Profile Redirect Guard
- Not-Found Concepts
- Legacy Auth Concepts
- Static Server Script
- MCP Browser Config
- App Hosting Concepts
- Favicon Color Variants
- Trailing Debouncer
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- Legacy Vehicle List Components
- Legacy GDPR Components
- Legacy Image Preview Components
- Legacy Vehicle Heatmap Components
- Legacy Status Tag Components
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- NPM Dependency
- getImgurThumbnail
- MEDIA_YEAR_COUNTS_QUERY
- GeojsonStorageService
- about.md Document
- compliance.md Document
- 01-component-analyzer.md Document
- 02-compilation.md Document
- console.md Document
- gallery.md Document
- insiden.md Document
- profile.md Document
- AppModule
- BuildInfoService
- GenericMutationReturn
- getThumbnail
- SessionHistoryService
- SpottingStorageService
- SpottingTypePipe
- ThemeService
- VehicleStatusPipe
- ImageGridComponent
- SpottingTypeTagComponent
- ConstructionComponent
- FallbackComponent
- OverallComponent
- SpottingMainComponent
- GtfsStaticStateService
- TrackerComponent
- Image Not Found Placeholder

## God Nodes (most connected - your core abstractions)

1. `PendingIncidentsComponent` - 35 edges
2. `HlmButton` - 32 edges
3. `ToastService` - 31 edges
4. `AuthService` - 29 edges
5. `HlmSkeleton` - 24 edges
6. `VehicleStatus` - 23 edges
7. `SpottingType` - 23 edges
8. `AppNavComponent` - 23 edges
9. `IncidentFormComponent` - 22 edges
10. `GraphQLClient` - 20 edges

## Surprising Connections (you probably didn't know these)

- `Yearly Summary 2026 — Angular 22 SSR Rewrite and Feature Platform Maturation` --references--> `index.html — App Entry (TranSPOT, AdSense Auto Ads ca-pub-3632544969292535)` [INFERRED]
  docs/progress/2026/SUMMARY.md → src/index.html
- `Progress Log 2026-08-24 — Major Feature Day (14 commits across insiden, tracker, profile, spotting, navigation, console, gdpr, about, core)` --references--> `App Root Shell (app.html) — nav progress, router-outlet, sonner toaster` [EXTRACTED]
  docs/progress/2026/08/24.md → src/app/app.html
- `Progress Log 2026-08-24 — Major Feature Day (14 commits across insiden, tracker, profile, spotting, navigation, console, gdpr, about, core)` --references--> `GDPR Page (gdpr.page.html) — Firestore compliance details with error retry` [EXTRACTED]
  docs/progress/2026/08/24.md → src/app/features/gdpr/gdpr.page.html
- `Progress Log 2026-08-24 — Major Feature Day (14 commits across insiden, tracker, profile, spotting, navigation, console, gdpr, about, core)` --references--> `Incident Form Component — Report an Incident sheet with chronology and asset multi-select` [EXTRACTED]
  docs/progress/2026/08/24.md → src/app/features/insiden/incident-form/incident-form.component.html
- `robots.txt — Crawl Policy (allows public, disallows /console and /profile)` --conceptually_related_to--> `Console Insiden Links Component — Social Media Links Triage with asset tagging` [INFERRED]
  public/robots.txt → src/app/features/console/insiden/links/links.component.html

## Import Cycles

- None detected.

## Communities (181 total, 84 thin omitted)

### Community 0 - "Image Upload Pipeline"

Cohesion: 0.05
Nodes (27): ImageCompressionService, Injectable, ImageFile, ImageUploadService, PendingUpload, PendingUploadType, Injectable, deletePendingUpload() (+19 more)

### Community 1 - "Shared Utilities & Queries"

Cohesion: 0.05
Nodes (35): ready(), RecaptchaService, Injectable, Window, linesLabel(), vehicleLinesLabel(), DateTrend, DELETE_EVENT_MUTATION (+27 more)

### Community 2 - "Cloud Functions API"

Cohesion: 0.08
Nodes (41): api, ApiError, app, asChronologyList(), AuthError, buildPrompt(), buildSummarizePrompt(), ConfigError (+33 more)

### Community 3 - "Console Incident Moderation"

Cohesion: 0.06
Nodes (44): ConsoleNavComponent, ConsoleNavItem, ITEMS, Component, APPROVE_INCIDENT_MUTATION, ApproveIncidentVars, CalendarIncidentSeverity, ChronologyIndicator (+36 more)

### Community 4 - "Gallery Data & Layout"

Cohesion: 0.06
Nodes (27): MEDIA_YEAR_COUNTS_QUERY, MediaNode, MEDIAS_QUERY, MediasFeedQueryData, MediasFeedQueryVars, MediaYearCount, MediaYearCountsQueryData, getImgurThumbnail() (+19 more)

### Community 5 - "Incident Calendar UI"

Cohesion: 0.07
Nodes (20): clampToMonth(), dateFromKey(), DayCell, IncidentCalendarComponent, MONTH_NAMES, SEVERITY_DOT, startOfMonth(), Component (+12 more)

### Community 6 - "About Page & Ads"

Cohesion: 0.07
Nodes (21): ADS_CONFIG, AdSlotKey, resolveAdSlot(), AboutPage, firebaseApp(), STATUS_VARIANT, Component, Personnel (+13 more)

### Community 7 - "GraphQL Client Core"

Cohesion: 0.08
Nodes (20): GraphQLClient, GraphQLRequestBody, GraphQLRequestError, graphqlResource(), Injectable, GraphQLError, DOWNVOTE_MUTATION, REMOVE_VOTE_MUTATION (+12 more)

### Community 8 - "Pending Incidents Panel"

Cohesion: 0.08
Nodes (4): PendingIncident, PendingIncidentsComponent, ComponentUnderTest, Component

### Community 9 - "Incident Sheet Service"

Cohesion: 0.08
Nodes (29): ChronologyExtractState, ExtractedIncidentData, IncidentSheetService, Injectable, CalendarIncidentMedia, CalendarIncidentStatus, ChronologyIndicator, CREATE_CALENDAR_INCIDENT_MUTATION (+21 more)

### Community 10 - "Functions Dependencies"

Cohesion: 0.05
Nodes (38): cors, firebase-admin, firebase-functions, dependencies, cheerio, cors, express, firebase-admin (+30 more)

### Community 11 - "Spotting GraphQL Queries"

Cohesion: 0.09
Nodes (30): IncidentSeverity, WheelStatus, ADD_SPOTTING_EVENT_MUTATION, AddSpottingEventData, AddSpottingEventInput, AddSpottingEventVars, LINES_AND_VEHICLES_QUERY, LinesAndVehiclesQueryData (+22 more)

### Community 12 - "Theme & Nav Services"

Cohesion: 0.07
Nodes (20): MODES, ResolvedTheme, ThemeMode, ThemeService, Injectable, NavIconHoverGroupService, Injectable, CompactNavComponent (+12 more)

### Community 13 - "Link Form & Asset Select"

Cohesion: 0.10
Nodes (17): AssetMultiSelectComponent, AssetMultiSelectOption, Component, SUBMIT_SOCIAL_MEDIA_LINK_MUTATION, SubmitSocialMediaLinkData, SubmitSocialMediaLinkVars, LinkFormModel, linkFormSchema (+9 more)

### Community 14 - "Legacy Frontend Map A"

Cohesion: 0.07
Nodes (32): Cross-Cutting Findings, Doc Index, 00-overview.md Document, Sitemap, System Topology, Legacy Tech Stack, About Page /about, AvatarCardComponent (+24 more)

### Community 15 - "Spotting Activity Heatmap"

Cohesion: 0.08
Nodes (19): FakeObserver, SpottingActivityHeatmap, toSpottingActivityPoints(), Component, Component, WheelStatusBadge, VEHICLE_SPOTTING_HISTORY_QUERY, VehicleSpottingHistoryQueryData (+11 more)

### Community 16 - "Chronology Utilities"

Cohesion: 0.11
Nodes (13): StubFooter, StubNav, Component, canMoveDown(), canMoveUp(), ChronologyDraft, ChronologyIndicator, emptyChronology() (+5 more)

### Community 17 - "Line Overview Components"

Cohesion: 0.10
Nodes (20): VehicleType, CHIP_STYLE, FleetSummaryComponent, Component, isSortColumn(), LineOverviewPage, Component, BoardStat (+12 more)

### Community 18 - "Social Media Links Panel"

Cohesion: 0.10
Nodes (4): SocialMediaLinkRow, SocialMediaLinksComponent, ComponentUnderTest, Component

### Community 19 - "Insiden Page Assembly"

Cohesion: 0.13
Nodes (15): INSIDEN_INCIDENTS_QUERY, InsidenIncidentsQueryData, LinkSheetService, Injectable, SpottingShellPage, Component, AppFooterComponent, Component (+7 more)

### Community 20 - "Spotting Grid Components"

Cohesion: 0.11
Nodes (21): SpottingType, dateKeyOf(), DayCell, SpottingActivityPoint, spottingIntensityClass(), TypeCount, WeekColumn, SpottingCountTooltipComponent (+13 more)

### Community 21 - "Tracker Layer Controls"

Cohesion: 0.11
Nodes (14): RefreshIntervalMs, LayerCheckbox, RAILWAY_LINE_SOURCE, REALTIME_LAYER_CHECKBOXES, STOPS_LAYER_CHECKBOXES, InfoPanelKind, CountdownRingComponent, Component (+6 more)

### Community 22 - "Public Social Links"

Cohesion: 0.13
Nodes (18): faviconHostnameOf(), PUBLIC_SOCIAL_MEDIA_LINKS_QUERY, PublicSocialMediaLink, PublicSocialMediaLinkLine, PublicSocialMediaLinksQueryData, PublicSocialMediaLinkStation, PublicSocialMediaLinkVehicle, LinkCardComponent (+10 more)

### Community 23 - "Feature Doc Concepts A"

Cohesion: 0.09
Nodes (23): AboutPage - standalone lazy-loaded routed component reading public/about via onSnapshot, About Feature - hand-edited Firestore public/about page, Personnel Schema - display-flagged, order-sorted, socials normalized, PublicAboutDocument - TypeScript interfaces for Personnel, Project, TechStack, ProjectStatus, STATUS_VARIANT Lookup - project status to badge variant mapping, adminOnlyGuard - route guard requiring Firebase admin custom claim, currently TEMPORARY true, Bulk-Action Pattern - selectMode + checkedIds Set reused as useBulkActions composable, CONSOLE_EVENTS_QUERY - GraphQL ConsoleEvents with EventFilter, pagination, EventOrder created (+15 more)

### Community 24 - "Tracker Info Panel"

Cohesion: 0.13
Nodes (11): observeHeight(), DEFAULT_REFRESH_INTERVAL_MS, IFeedEntity, escapeHtml(), highlightJson(), SortDir, PanelInternals, TableRow (+3 more)

### Community 25 - "Tracker Marker Layers"

Cohesion: 0.16
Nodes (13): @antv/l7, PopupState, RtMarkerLayerController, MAP_STYLE_FOR_THEME, createVehicleMarkerElement(), iconModeForSourceKey(), VehicleIconMode, buildVehiclePopupHtml() (+5 more)

### Community 26 - "Status Badge Variants"

Cohesion: 0.15
Nodes (15): GraphQLResponse, LineStatus, LABEL_BY_STATUS, VARIANT_BY_STATUS, LABEL_BY_TYPE, VARIANT_BY_TYPE, AnyVehicleStatus, LABEL_BY_STATUS (+7 more)

### Community 27 - "Auth Service & Guards"

Cohesion: 0.14
Nodes (9): adminOnlyGuard(), AuthStub, runGuard(), AuthService, E2EAuthOverride, firebaseApp(), firstNameStorageKey(), Injectable (+1 more)

### Community 28 - "Vehicle Status Trends"

Cohesion: 0.11
Nodes (16): VehicleStatus, GridRow, DATA_SOURCES, DataSourceId, DataSourceOption, DayColumn, DaySegment, MONTH_TICK_LABEL (+8 more)

### Community 29 - "Not-Found & Navigation"

Cohesion: 0.11
Nodes (6): fetchRandomPet(), NotFoundPage, PetPic, Component, AppNavComponent, Component

### Community 30 - "Console Page State"

Cohesion: 0.18
Nodes (16): SpottingVehicleStatus, SpottingTypeBadge, Component, Component, VehicleStatusBadge, FilterFormModel, SPOTTING_TYPE_OPTIONS, STATUS_OPTIONS (+8 more)

### Community 31 - "Frontend Progress & Templates"

Cohesion: 0.23
Nodes (18): Progress Log 2026-08-24 — Major Feature Day (14 commits across insiden, tracker, profile, spotting, navigation, console, gdpr, about, core), Progress Log 2026-08-27 — Documentation Structure Creation (daily, monthly, yearly progress docs), Monthly Summary August 2026 — 3 Feature Waves (insiden, console, ads) with 41 commits, Yearly Summary 2026 — Angular 22 SSR Rewrite and Feature Platform Maturation, robots.txt — Crawl Policy (allows public, disallows /console and /profile), App Root Shell (app.html) — nav progress, router-outlet, sonner toaster, About Page (about.page.html) — Firestore CMS, skeletons, projects, personnel, tech stack, ad slots, Console Page (console.page.html) — spotting event moderation filters and table (+10 more)

### Community 32 - "App Routing & Preload"

Cohesion: 0.18
Nodes (6): routes, HoverPreloadStrategy, Injectable, pathWithOptionalParamMatcher(), SPOTTING_ROUTES, TRACKER_ROUTES

### Community 33 - "Station Assets Section"

Cohesion: 0.15
Nodes (11): AssetType, LINE_STATION_ASSETS_QUERY, LineStationAssetsQueryData, LineStationAssetsQueryVars, ASSET_TYPE_LABEL, SpottingRedirectPage, Component, TrackerMapSkeletonComponent (+3 more)

### Community 34 - "Line Details Page"

Cohesion: 0.12
Nodes (12): LINE_SPOTTING_BOUNDS_QUERY, LineSpottingBoundsQueryData, LineSpottingBoundsQueryVars, VEHICLE_TYPES_QUERY, VehicleTypesQueryData, VehicleTypesQueryVars, LINE_DETAILS_TABS, LineDetailsTabId (+4 more)

### Community 35 - "Version & Chunk Recovery"

Cohesion: 0.20
Nodes (6): CHUNK_LOAD_ERROR_PHRASES, isChunkLoadError(), NewVersionService, Injectable, VersionManifest, isSameCommit()

### Community 36 - "Tracker Layer Services"

Cohesion: 0.17
Nodes (7): firebaseApp(), GeojsonStorageService, Injectable, RtSourceConfig, StaticSourceConfig, LayerSelectionService, Injectable

### Community 37 - "TypeScript Config"

Cohesion: 0.13
Nodes (14): compileOnSave, compilerOptions, esModuleInterop, module, noImplicitReturns, noUnusedLocals, outDir, sourceMap (+6 more)

### Community 38 - "SSR Bootstrap"

Cohesion: 0.17
Nodes (8): App, appConfig, config, serverConfig, serverRoutes, Component, NavProgressComponent, Component

### Community 41 - "GTFS Realtime Service"

Cohesion: 0.22
Nodes (3): GtfsRealtimeService, RtSource, Injectable

### Community 42 - "Polling Source"

Cohesion: 0.25
Nodes (4): DEFAULT_POLLING_INTERVAL_MS, PollingIntervalMs, PollingSource, createSource()

### Community 43 - "Line Switcher & Store"

Cohesion: 0.16
Nodes (9): LineStatusBadge, Component, SpottingLinesStore, Injectable, Line, LINES_QUERY, LinesQueryData, LineSwitcherComponent (+1 more)

### Community 44 - "Environments & Server"

Cohesion: 0.24
Nodes (8): environment, environment, Environment, sentrySharedOptions, angularApp, app, browserDistFolder, reqHandler

### Community 45 - "Dev Dependencies"

Cohesion: 0.15
Nodes (13): @angular/compiler-cli, devDependencies, @angular/cli, @angular/compiler-cli, @playwright/test, postcss, prettier, tailwindcss (+5 more)

### Community 47 - "Incident AI Service"

Cohesion: 0.24
Nodes (10): apiUrl(), currentIdToken(), envSegment(), ExtractIncidentResult, firebaseApp(), functionsBaseUrl(), IncidentAiService, SummarizeChronology (+2 more)

### Community 48 - "GTFS Static Service"

Cohesion: 0.23
Nodes (6): GtfsStaticService, StaticSource, StopRow, Injectable, StatusCardSkeletonComponent, Component

### Community 49 - "Tracker Shell Assembly"

Cohesion: 0.17
Nodes (8): LayerApplyBarComponent, Component, MobileLayerSheetComponent, Component, StatusCardComponent, Component, TrackerShellPage, Component

### Community 50 - "Angular Build Options"

Cohesion: 0.17
Nodes (12): options, assets, browser, outputMode, security, server, ssr, styles (+4 more)

### Community 51 - "Spartan UI Skill"

Cohesion: 0.18
Nodes (12): CLI Generators - init, ui, ui-theme, info --json, healthcheck, migrate-* via nx or ng, Theming Customization - Tailwind v4 layers, hlm-tailwind-preset.css, ui-theme generator, CSS variables OKLCH, MCP Server @spartan-ng/mcp - spartan_components_list/get, spartan_blocks_*, spartan_docs_get, cache tools, Registry Model - Brain npm vs Helm copy-in, components.json, fixed catalog no remote registry, Brain-vs-Helm Rule - two-layer architecture and composition via directives, Composition Rule - items inside groups, overlays need title, Card/Tabs/Avatar patterns, Forms Rule - hlmField, hlmFieldSet/FieldLegend, toggle-group for 2-7 choices, Signal Forms, Icons Rule - ng-icon with lucide names, provideIcons registration, sizing via font-size (+4 more)

### Community 52 - "Favicon Build Scripts"

Cohesion: 0.20
Nodes (9): selectVariant(), icoDest, icoSrc, publicDir, rootDir, srcDir, svgDest, svgSrc (+1 more)

### Community 53 - "GDPR Page"

Cohesion: 0.23
Nodes (6): GdprDetail, GdprDetailChild, PublicGdprDocument, firebaseApp(), GdprPage, Component

### Community 54 - "Vote Button"

Cohesion: 0.27
Nodes (8): Component, VoteButtonComponent, formatBreakdown(), formatNetScore(), nextVoteState(), state, VoteState, VoteValue

### Community 55 - "Profile Feature Concepts"

Cohesion: 0.18
Nodes (11): AuthService, DELETE_EVENT_MUTATION, GET_MY_EVENTS_QUERY, GET_PUBLIC_USER_QUERY, GET_USER_DATA_QUERY, MySpottingsComponent, ProfilePage, SettingsComponent (+3 more)

### Community 56 - "Tracker Feature Concepts"

Cohesion: 0.20
Nodes (11): CountdownRingComponent, GtfsRealtimeService, GtfsStaticService, layer-config, LayerSelectionService, RtMarkerLayerController, RtSource, StaticSource (+3 more)

### Community 57 - "NPM Scripts"

Cohesion: 0.18
Nodes (11): scripts, build, ng, postbuild, prebuild, prepare, prestart, serve:ssr:web (+3 more)

### Community 58 - "Gallery Feature Concepts"

Cohesion: 0.20
Nodes (10): computeJustifiedRows, GalleryPage, GalleryYearSliderComponent, GraphQLClient, graphqlResource, JustifiedGridComponent, MediaNode, MEDIAS_QUERY (+2 more)

### Community 59 - "Tracker Map Component"

Cohesion: 0.31
Nodes (3): Output, TrackerMapComponent, Component

### Community 60 - "App Footer & Versioning"

Cohesion: 0.49
Nodes (7): BackendVersion, BACKEND_REPO_URL, backendCommitUrl(), FRONTEND_REPO_URL, frontendCommitUrl(), isValidHash(), toShortHash()

### Community 61 - "Runtime Dependencies"

Cohesion: 0.22
Nodes (9): @angular/cdk, @angular/forms, @antv/l7, dependencies, @angular/cdk, @angular/forms, @antv/l7, express (+1 more)

### Community 63 - "Hlm Table Components"

Cohesion: 0.39
Nodes (8): HlmTable, HlmTableContainer, HlmTBody, HlmTd, HlmTh, HlmTHead, HlmTr, Directive

### Community 64 - "Angular Workspace Config"

Cohesion: 0.25
Nodes (7): analytics, packageManager, cli, newProjectRoot, projects, $schema, version

### Community 65 - "L7 Dependency Exclusions"

Cohesion: 0.25
Nodes (8): exclude, @antv/l7-component, @antv/l7-core, @antv/l7-layers, @antv/l7-maps, @antv/l7-scene, @antv/l7-source, @antv/l7-utils

### Community 66 - "Insiden Feature Concepts"

Cohesion: 0.25
Nodes (8): CalendarIncident, graphqlResource, ImageUploadService, IncidentCalendarComponent, IncidentCardComponent, INSIDEN_INCIDENTS_QUERY, InsidenPage, PhotoPickerComponent

### Community 67 - "Package Config"

Cohesion: 0.25
Nodes (7): lint-staged, *.{js,ts,json,css,html,md}, name, packageManager, private, version, prettier --write

### Community 68 - "Line Details Month Nav"

Cohesion: 0.36
Nodes (4): addMonths(), LineDetailsPage, monthKey(), Component

### Community 70 - "Build Targets"

Cohesion: 0.29
Nodes (7): build, test, builder, configurations, defaultConfiguration, builder, architect

### Community 71 - "E2E Incident Workflows"

Cohesion: 0.33
Nodes (3): loginAs(), INCIDENT, RecordedCall

### Community 72 - "Build Info Script"

Cohesion: 0.29
Nodes (5): hash, outPath, rootDir, timestamp, versionJsonPath

### Community 73 - "Dev Serve Target"

Cohesion: 0.33
Nodes (6): serve, prebundle, builder, configurations, defaultConfiguration, options

### Community 74 - "Prod Build Config"

Cohesion: 0.33
Nodes (6): development, buildTarget, extractLicenses, fileReplacements, optimization, sourceMap

### Community 75 - "Project Web Config"

Cohesion: 0.33
Nodes (6): web, prefix, projectType, root, schematics, sourceRoot

### Community 76 - "Spotting Feature Concepts"

Cohesion: 0.33
Nodes (6): ADD_SPOTTING_EVENT_MUTATION, graphqlResource, ReportFormComponent, ReportSheetService, SpottingLinesStore, SpottingShellPage

### Community 77 - "Mock GraphQL Server"

Cohesion: 0.40
Nodes (5): calls, json(), PORT, server, stubs

### Community 78 - "Firebase Config Script"

Cohesion: 0.33
Nodes (4): config, FALLBACK, outPath, rootDir

### Community 79 - "Sentry Sourcemaps Script"

Cohesion: 0.33
Nodes (3): distDir, release, rootDir

### Community 80 - "App Error Handler"

Cohesion: 0.47
Nodes (3): AppErrorHandler, is404Error(), Injectable

### Community 81 - "Analytics Service"

Cohesion: 0.47
Nodes (3): AnalyticsService, firebaseApp(), Injectable

### Community 82 - "Console Nav Tests"

Cohesion: 0.40
Nodes (3): TestHost, TestOutlet, Component

### Community 83 - "Insiden Routes & Shell"

Cohesion: 0.33
Nodes (4): INSIDEN_ROUTES, InsidenShellComponent, TODO: Add incident list logic in Wave 3, Component

### Community 84 - "Link Form Component"

Cohesion: 0.47
Nodes (3): emptyLinkFormModel(), LinkFormComponent, Component

### Community 85 - "Vehicle Status Board"

Cohesion: 0.47
Nodes (3): humanizeSince(), Component, VehicleStatusBoardComponent

### Community 88 - "Prod Budgets"

Cohesion: 0.40
Nodes (5): production, budgets, buildTarget, outputHashing, sourceMap

### Community 89 - "GDPR Feature Concepts"

Cohesion: 0.40
Nodes (5): GdprDetail, GdprDetailChild, GdprPage, onSnapshot, PublicGdprDocument

### Community 90 - "Upload Service Concepts"

Cohesion: 0.40
Nodes (5): ImageCompressionService, ImageUploadService, ToastService, FormUploadComponent, SpottingFormComponent

### Community 91 - "Tracker Legacy Services"

Cohesion: 0.40
Nodes (5): GetGeojsonService, GtfsRtStateService, PanelSelectionService, StatusCardComponent, TrackerMapComponent

### Community 92 - "Visual Evidence Script"

Cohesion: 0.40
Nodes (3): INCIDENTS, LINKS, PENDING

### Community 93 - "Runtime Config Script"

Cohesion: 0.40
Nodes (4): config, FALLBACK, outPath, rootDir

### Community 94 - "Situasi Legacy Components"

Cohesion: 0.50
Nodes (4): SpottingLineCalendarHeatmapComponent, VehicleStatusHistoryComponent, SituasiComponent, VehiclesComponent

### Community 95 - "Shell Legacy Components"

Cohesion: 0.50
Nodes (4): VerificationCodeCardComponent, AppComponent, AppRoutingModule, HeaderComponent

### Community 97 - "CI Gates"

Cohesion: 0.50
Nodes (4): Build Gate - npm run build with SENTRY_AUTH_TOKEN, needs lint+test, CI Pipeline - lint, test, build jobs on pull_request and push main/staging, Prettier Lint Gate - npx prettier --check ., Vitest Test Gate - npm test --no-watch with prebuild for generated files and junit output

### Community 99 - "Not-Found Concepts"

Cohesion: 0.67
Nodes (3): LineStatusBadge, NOT_FOUND_MESSAGES, NotFoundPage

### Community 100 - "Legacy Auth Concepts"

Cohesion: 0.67
Nodes (3): AuthService, GraphQLModule, isUserAllowed

### Community 103 - "App Hosting Concepts"

Cohesion: 0.67
Nodes (3): Deploy Functions - branch-aware single-project rosak-7223b via WIF, only on functions/** changes, Firebase App Hosting - production base config with runConfig and env vars, Staging Override - apphosting.staging.yaml merges over base for rosak-staging backend

### Community 104 - "Favicon Color Variants"

Cohesion: 1.00
Nodes (3): Blue favicon (#2563EB) - 500x500 SVG fan/ray mark with three triangular paths radiating from apex at 14.1,36.3 sharing class st0 fill #2563EB, Default favicon (#EE7104 orange) - 500x500 SVG fan/ray mark with three triangular paths radiating from apex at 14.1,36.3 sharing class st0 fill #EE7104, Green favicon (#22C55E) - 500x500 SVG fan/ray mark with three triangular paths radiating from apex at 14.1,36.3 sharing class st0 fill #22C55E

## Knowledge Gaps

- **438 isolated node(s):** `/bin/bash`, `$schema`, `version`, `packageManager`, `analytics` (+433 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 773 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **84 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `exclude` connect `L7 Dependency Exclusions` to `Dev Serve Target`, `Tracker Marker Layers`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `@antv/l7` connect `Tracker Marker Layers` to `L7 Dependency Exclusions`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `PendingIncidentsComponent` connect `Pending Incidents Panel` to `Chronology Utilities`, `Console Incident Moderation`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `/bin/bash`, `$schema`, `version` to the rest of the system?**
  _438 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Image Upload Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.051923076923076926 - nodes in this community are weakly interconnected._
- **Should `Shared Utilities & Queries` be split into smaller, more focused modules?**
  _Cohesion score 0.05136612021857923 - nodes in this community are weakly interconnected._
- **Should `Cloud Functions API` be split into smaller, more focused modules?**
  _Cohesion score 0.07743496672716274 - nodes in this community are weakly interconnected._
