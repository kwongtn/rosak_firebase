import { Component, computed, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { ReCaptchaV3Service } from "ng-recaptcha-2";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { AuthService } from "../../core/auth/auth.service";
import { ToastService } from "../../ui/toast/toast.service";
import { HlmButton } from "../../ui/button/button";
import { HlmInput } from "../../ui/input/input";
import { HlmNativeSelect } from "../../ui/select/native-select";
import { HlmCheckbox } from "../../ui/checkbox/checkbox";
import { HlmBadge } from "../../ui/badge/badge";
import { HlmCardImports } from "../../ui/card/card";
import { HlmTableImports } from "../../ui/table/table";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { VehicleStatusBadge } from "../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { SpottingTypeBadge } from "../../domain-ui/spotting-type-badge/spotting-type-badge";
import { SpottingType, SpottingVehicleStatus } from "../../core/graphql/types";
import { environment } from "../../../environments/environment";
import {
    CONSOLE_EVENTS_QUERY,
    ConsoleEvent,
    ConsoleEventFilters,
    ConsoleEventsQueryData,
    ConsoleEventsQueryVars,
    MARK_AS_READ_MUTATION,
    MarkAsReadData,
    MarkAsReadVars,
} from "./data/console.queries";

const PAGE_SIZE = 100;

const STATUS_OPTIONS: { label: string; value: SpottingVehicleStatus }[] = [
    { label: "In Service", value: "IN_SERVICE" },
    { label: "Not in Service", value: "NOT_IN_SERVICE" },
    { label: "Decommissioned", value: "DECOMMISSIONED" },
    { label: "Testing", value: "TESTING" },
];

const SPOTTING_TYPE_OPTIONS: { label: string; value: SpottingType }[] = [
    { label: "Just Spotting", value: "JUST_SPOTTING" },
    { label: "Depot", value: "DEPOT" },
    { label: "Location", value: "LOCATION" },
    { label: "At Station", value: "AT_STATION" },
    { label: "Between Stations", value: "BETWEEN_STATIONS" },
];

/** undefined = "Any" (don't filter on this field) — matches the old app's tri-state radios. */
interface FilterFormModel {
    status: SpottingVehicleStatus[];
    spottingType: SpottingType[];
    createdFrom: string;
    createdTo: string;
    spottedFrom: string;
    spottedTo: string;
    isVehicleStatusDifferent: boolean | undefined;
    isAnonymous: boolean | undefined;
    isRead: boolean | undefined;
    hasNotes: boolean | undefined;
    freeSearch: string;
}

function emptyFilterForm(): FilterFormModel {
    return {
        status: [],
        spottingType: [],
        createdFrom: "",
        createdTo: "",
        spottedFrom: "",
        spottedTo: "",
        isVehicleStatusDifferent: undefined,
        isAnonymous: undefined,
        isRead: false,
        hasNotes: undefined,
        freeSearch: "",
    };
}

/**
 * /console — admin moderation queue for crowd-submitted spotting events: filter, page through,
 * and bulk mark-as-read. Ported from src/app/console/, fixing the one thing that was actually
 * broken there rather than reproducing it: `filterFormToGqlFilters()` sent flat `statusIn`/
 * `typeIn` keys that don't exist on the real `EventFilter` (verified against rosak_backend/
 * spotting/schema/filters.py — the real fields are `status: {inList}` / `type: {inList}`), so
 * the Status/Spotting-Type filters silently did nothing in the old app. Fixed here, not ported.
 *
 * `markAsRead` is the one mutation in this app that still needs a real reCAPTCHA v3 token —
 * confirmed the backend actively enforces `IsRecaptchaChallengePassed` on it (unlike `addEvent`,
 * where that check is commented out server-side), so this page is also the reason
 * `RECAPTCHA_V3_SITE_KEY` is provided in app.config.ts.
 */
@Component({
    selector: "app-console",
    imports: [
        DatePipe,
        RouterLink,
        HlmButton,
        HlmInput,
        HlmNativeSelect,
        HlmCheckbox,
        HlmBadge,
        ...HlmCardImports,
        ...HlmTableImports,
        AppNavComponent,
        AppFooterComponent,
        VehicleStatusBadge,
        SpottingTypeBadge,
    ],
    templateUrl: "./console.page.html",
})
export class ConsolePage {
    private readonly graphql = inject(GraphQLClient);
    private readonly auth = inject(AuthService);
    private readonly toast = inject(ToastService);
    private readonly recaptcha = inject(ReCaptchaV3Service);

    protected readonly backendUrl = environment.backendUrl;
    protected readonly statusOptions = STATUS_OPTIONS;
    protected readonly spottingTypeOptions = SPOTTING_TYPE_OPTIONS;

    protected readonly filterForm = signal(emptyFilterForm());

    protected readonly events = signal<ConsoleEvent[]>([]);
    protected readonly totalCount = signal<number | undefined>(undefined);
    protected readonly isLoading = signal(false);
    protected readonly hasMore = signal(true);

    protected readonly selectMode = signal(false);
    protected readonly checkedIds = signal<Set<string>>(new Set());
    protected readonly checkedCount = computed(() => this.checkedIds().size);

    /** The filters actually in effect — only replaced on Search, so editing the form doesn't
     * refetch until the admin explicitly asks for it (matches the old app's onSearch button). */
    private appliedFilters: ConsoleEventFilters = { isRead: false };

    constructor() {
        this.load();
    }

    protected toggleStatus(value: SpottingVehicleStatus): void {
        this.filterForm.update((f) => ({
            ...f,
            status: f.status.includes(value) ? f.status.filter((v) => v !== value) : [...f.status, value],
        }));
    }

    protected toggleSpottingType(value: SpottingType): void {
        this.filterForm.update((f) => ({
            ...f,
            spottingType: f.spottingType.includes(value)
                ? f.spottingType.filter((v) => v !== value)
                : [...f.spottingType, value],
        }));
    }

    /** Native <select> options are always strings, so the tri-state Any/Yes/No filters (which
     * are really `boolean | undefined`) round-trip through this "any"/"yes"/"no" encoding. */
    protected triState(value: boolean | undefined): "any" | "yes" | "no" {
        return value === undefined ? "any" : value ? "yes" : "no";
    }

    protected onTriStateChange(
        field: "isVehicleStatusDifferent" | "isAnonymous" | "isRead" | "hasNotes",
        event: Event
    ): void {
        const raw = (event.target as HTMLSelectElement).value;
        const value = raw === "any" ? undefined : raw === "yes";
        this.filterForm.update((f) => ({ ...f, [field]: value }));
    }

    protected search(): void {
        this.appliedFilters = this.buildFilters();
        this.events.set([]);
        this.hasMore.set(true);
        this.checkedIds.set(new Set());
        this.load();
    }

    protected loadMore(): void {
        this.load();
    }

    protected toggleSelectMode(): void {
        this.selectMode.update((v) => !v);
        this.checkedIds.set(new Set());
    }

    protected toggleChecked(id: string): void {
        this.checkedIds.update((set) => {
            const next = new Set(set);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    protected async markAsRead(): Promise<void> {
        const ids = [...this.checkedIds()];
        if (ids.length === 0) {
            return;
        }
        this.isLoading.set(true);
        try {
            const [recaptchaToken, idToken] = await Promise.all([
                firstValueFrom(this.recaptcha.execute("markAsRead")),
                this.auth.idToken(),
            ]);
            const data = await this.graphql.request<MarkAsReadData, MarkAsReadVars>(
                MARK_AS_READ_MUTATION,
                { input: { eventIds: ids } },
                {
                    "g-recaptcha-response": recaptchaToken,
                    ...(idToken ? { "firebase-auth-key": idToken } : {}),
                }
            );
            if (data.markAsRead.ok) {
                this.events.update((list) => list.filter((e) => !ids.includes(e.id)));
                this.checkedIds.set(new Set());
                this.toast.success("Marked as read", `${ids.length} event${ids.length === 1 ? "" : "s"} marked as read.`);
            }
        } catch (err) {
            this.toast.error("Couldn't mark as read", err instanceof Error ? err.message : "Unknown error");
        } finally {
            this.isLoading.set(false);
        }
    }

    private async load(): Promise<void> {
        if (this.isLoading()) {
            return;
        }
        this.isLoading.set(true);
        try {
            const idToken = await this.auth.idToken();
            const data = await this.graphql.request<ConsoleEventsQueryData, ConsoleEventsQueryVars>(
                CONSOLE_EVENTS_QUERY,
                {
                    eventFilters: this.appliedFilters,
                    eventPagination: { limit: PAGE_SIZE, offset: this.events().length },
                    eventOrder: { created: "DESC" },
                },
                idToken ? { "firebase-auth-key": idToken } : {}
            );
            this.events.update((list) => [...list, ...data.events]);
            this.totalCount.set(data.eventsCount);
            this.hasMore.set(data.events.length === PAGE_SIZE);
        } catch (err) {
            this.toast.error("Couldn't load events", err instanceof Error ? err.message : "Unknown error");
        } finally {
            this.isLoading.set(false);
        }
    }

    private buildFilters(): ConsoleEventFilters {
        const f = this.filterForm();
        const filters: ConsoleEventFilters = {};
        if (f.status.length > 0) {
            filters.status = { inList: f.status };
        }
        if (f.spottingType.length > 0) {
            filters.type = { inList: f.spottingType };
        }
        if (f.createdFrom && f.createdTo) {
            filters.created = { range: { start: f.createdFrom, end: f.createdTo } };
        }
        if (f.spottedFrom && f.spottedTo) {
            filters.spotted = { range: { start: f.spottedFrom, end: f.spottedTo } };
        }
        if (f.isVehicleStatusDifferent !== undefined) {
            filters.differentStatusThanVehicle = f.isVehicleStatusDifferent;
        }
        if (f.isAnonymous !== undefined) {
            filters.isAnonymous = f.isAnonymous;
        }
        if (f.isRead !== undefined) {
            filters.isRead = f.isRead;
        }
        if (f.hasNotes !== undefined) {
            filters.hasNotes = f.hasNotes;
        }
        if (f.freeSearch) {
            filters.freeSearch = f.freeSearch;
        }
        return filters;
    }
}
