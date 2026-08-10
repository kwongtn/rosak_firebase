import { SpottingType, SpottingVehicleStatus, VehicleStatus, WheelStatus } from "../../../core/graphql/types";

/* ---------------------------------------------------------------------- *
 * events — the admin moderation queue. Ported from the old app's
 * ConsoleEventsGqlService verbatim in shape (same fields), but the *filters* variable is built
 * differently on submit — see console.page.ts's doc comment for the statusIn/typeIn bug this
 * fixes rather than ports.
 * ---------------------------------------------------------------------- */

export const CONSOLE_EVENTS_QUERY = /* GraphQL */ `
    query ConsoleEvents($eventFilters: EventFilter, $eventPagination: OffsetPaginationInput, $eventOrder: EventOrder) {
        eventsCount
        events(filters: $eventFilters, pagination: $eventPagination, order: $eventOrder) {
            id
            spottingDate
            notes
            created
            status
            type
            runNumber
            mediaCount
            isMine
            wheelStatus
            vehicle {
                id
                status
                identificationNo
                vehicleType {
                    internalName
                }
                lines {
                    id
                    code
                }
            }
            reporter {
                shortId
                nickname
            }
        }
    }
`;

export interface ConsoleEventFilters {
    status?: { inList: SpottingVehicleStatus[] };
    type?: { inList: SpottingType[] };
    created?: { range: { start: string; end: string } };
    spotted?: { range: { start: string; end: string } };
    differentStatusThanVehicle?: boolean;
    isAnonymous?: boolean;
    isRead?: boolean;
    hasNotes?: boolean;
    freeSearch?: string;
}

export interface ConsoleEventsQueryVars {
    eventFilters: ConsoleEventFilters;
    eventPagination: { limit: number; offset: number };
    eventOrder: { created: "ASC" | "DESC" };
}

export interface ConsoleEvent {
    id: string;
    spottingDate: string;
    notes: string;
    created: string;
    status: SpottingVehicleStatus;
    type: SpottingType;
    runNumber: string | null;
    mediaCount: number;
    isMine: boolean;
    wheelStatus: WheelStatus | null;
    vehicle: {
        id: string;
        status: VehicleStatus;
        identificationNo: string;
        vehicleType: { internalName: string };
        lines: { id: string; code: string }[];
    };
    reporter: { shortId: string; nickname: string } | null;
}

export interface ConsoleEventsQueryData {
    eventsCount: number;
    events: ConsoleEvent[];
}

/* ---------------------------------------------------------------------- *
 * markAsRead — bulk-mark a page of events reviewed. The backend actively enforces
 * IsRecaptchaChallengePassed on this one (verified against rosak_backend/spotting/schema/
 * schema.py — unlike addEvent, where that check is commented out), so this is the one call in
 * the app that needs a real reCAPTCHA v3 token attached.
 * ---------------------------------------------------------------------- */

export const MARK_AS_READ_MUTATION = /* GraphQL */ `
    mutation MarkAsRead($input: MarkEventAsReadInput!) {
        markAsRead(input: $input) {
            ok
        }
    }
`;

export interface MarkAsReadVars {
    input: { eventIds: string[] };
}

export interface MarkAsReadData {
    markAsRead: { ok: boolean };
}
