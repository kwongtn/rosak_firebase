import { Component, computed, inject, input, output, signal } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { AuthService } from "../../../core/auth/auth.service";
import { HlmButton } from "../../../ui/button/button";
import { HlmInput } from "../../../ui/input/input";
import { HlmCardImports } from "../../../ui/card/card";
import { ToastService } from "../../../ui/toast/toast.service";
import { UPDATE_USER_MUTATION, UpdateUserData, UpdateUserVars, UserData } from "../data/profile.queries";

/**
 * Identity header + nickname editor + stat cards. Ported from user/user.component.ts, but with
 * the zero-spotting crash bugs actually fixed rather than reproduced: the old version read
 * `favouriteVehicles[0]` with no emptiness guard, and the backend's `withMostEntries` resolver
 * raises IndexError for a user with no spottings (see Known Quirks in profile.md) — both are
 * guarded here so a brand-new user gets an empty state instead of a broken page.
 */
@Component({
    selector: "app-profile-user-card",
    imports: [FormsModule, DecimalPipe, HlmButton, HlmInput, ...HlmCardImports],
    template: `
        <div class="flex flex-col gap-6">
            <div class="flex items-center gap-4">
                @if (auth.user()?.photoURL; as photo) {
                    <img [src]="photo" alt="" class="size-16 rounded-full" />
                }
                <div>
                    <h1 class="text-xl font-semibold">{{ auth.user()?.displayName || "Anonymous" }}</h1>
                    <p class="text-muted-foreground text-sm">
                        @if (auth.user()?.emailVerified && auth.user()?.email) {
                            {{ auth.user()?.email }}
                        }
                        @if (auth.user()?.phoneNumber) {
                            ({{ auth.user()?.phoneNumber }})
                        }
                    </p>
                </div>
            </div>

            <div hlmCard class="max-w-sm">
                <div hlmCardContent class="flex-row items-center justify-between">
                    @if (isEditing()) {
                        <input hlmInput [(ngModel)]="nicknameDraft" placeholder="Enter your desired nickname" class="flex-1" />
                        <button hlmBtn size="icon-sm" variant="ghost" [disabled]="isSaving()" (click)="save()">✓</button>
                        <button hlmBtn size="icon-sm" variant="ghost" (click)="cancel()">✕</button>
                    } @else {
                        <div>
                            <p class="text-muted-foreground text-xs">Nickname</p>
                            <p class="font-medium">{{ _displayedNickname() || "N/A" }}</p>
                        </div>
                        <button hlmBtn size="sm" variant="outline" (click)="startEdit()">
                            {{ _displayedNickname() ? "Edit" : "Add" }}
                        </button>
                    }
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div hlmCard>
                    <div hlmCardContent>
                        <p class="text-muted-foreground text-xs">Total Spottings</p>
                        <p class="text-lg font-semibold">{{ user().spottingsCount | number }}</p>
                    </div>
                </div>
                <div hlmCard>
                    <div hlmCardContent>
                        <p class="text-muted-foreground text-xs">Media Uploaded</p>
                        <p class="text-lg font-semibold">{{ user().mediaCount | number }}</p>
                    </div>
                </div>
                @if (user().withMostEntriesMonth; as month) {
                    <div hlmCard>
                        <div hlmCardContent>
                            <p class="text-muted-foreground text-xs">Best month ({{ month.dateKey }})</p>
                            <p class="text-lg font-semibold">{{ month.count | number }}</p>
                        </div>
                    </div>
                }
                @if (user().withMostEntriesDay; as day) {
                    <div hlmCard>
                        <div hlmCardContent>
                            <p class="text-muted-foreground text-xs">Best day ({{ day.dateKey }})</p>
                            <p class="text-lg font-semibold">{{ day.count | number }}</p>
                        </div>
                    </div>
                }
                @if (_favouriteVehicle(); as fav) {
                    <div hlmCard>
                        <div hlmCardContent>
                            <p class="text-muted-foreground text-xs">Favourite Train ({{ fav.count }} spottings)</p>
                            <p class="text-lg font-semibold">{{ fav.vehicle.identificationNo }}</p>
                            <p class="text-muted-foreground text-xs">{{ _favouriteVehicleLines() }}</p>
                        </div>
                    </div>
                }
            </div>
        </div>
    `,
})
export class UserCardComponent {
    readonly user = input.required<UserData>();
    readonly nicknameSaved = output<string>();

    protected readonly auth = inject(AuthService);
    private readonly graphql = inject(GraphQLClient);
    private readonly toast = inject(ToastService);

    protected readonly isEditing = signal(false);
    protected readonly isSaving = signal(false);
    protected nicknameDraft = "";

    /** Overrides `user().nickname` for immediate feedback after a save, without mutating the input. */
    private readonly _savedNickname = signal<string | null>(null);
    protected readonly _displayedNickname = computed(() => this._savedNickname() ?? this.user().nickname);

    protected readonly _favouriteVehicle = computed(() => this.user().favouriteVehicles[0]);
    protected readonly _favouriteVehicleLines = computed(() =>
        this._favouriteVehicle()?.vehicle.lines.map((l) => l.code).join(", ")
    );

    protected startEdit(): void {
        this.nicknameDraft = this._displayedNickname();
        this.isEditing.set(true);
    }

    protected cancel(): void {
        this.isEditing.set(false);
    }

    protected async save(): Promise<void> {
        this.isSaving.set(true);
        try {
            const idToken = await this.auth.idToken();
            const data = await this.graphql.request<UpdateUserData, UpdateUserVars>(
                UPDATE_USER_MUTATION,
                { data: { nickname: this.nicknameDraft } },
                idToken ? { "firebase-auth-key": idToken } : {}
            );
            this._savedNickname.set(data.updateUser.nickname);
            this.nicknameSaved.emit(data.updateUser.nickname);
            this.isEditing.set(false);
        } catch (err) {
            this.toast.error("Save failed", err instanceof Error ? err.message : "Unknown error");
        } finally {
            this.isSaving.set(false);
        }
    }
}
