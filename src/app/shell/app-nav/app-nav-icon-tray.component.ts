import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  output,
  signal,
} from "@angular/core";
import * as Sentry from "@sentry/angular";
import { AuthService } from "../../core/auth/auth.service";
import { ImageUploadService } from "../../core/upload/image-upload.service";
import { NewVersionService } from "../../core/version/new-version.service";
import { ThemeToggleComponent } from "../../ui/theme-toggle/theme-toggle.component";
import { NavIconHoverGroupService } from "./nav-icon-hover-group.service";
import {
  avatarButtonClassFor,
  avatarLabelText,
  newVersionButtonClassFor,
  welcomeLabelText,
} from "./app-nav.util";

/** Delay before the avatar briefly expands (into a "Log In" pill logged out, or a "Welcome
 * back, NAME" pill logged in), and how long it stays expanded before collapsing back — a
 * one-shot, on-load attention cue, not a recurring one, so a visitor notices the login/account
 * affordance without it nagging on every render. */
const AVATAR_HINT_DELAY_MS = 2500;
const AVATAR_HINT_DURATION_MS = 4000;

/** Module-level, not a component field: `<app-nav>` is recreated on every top-level page
 * navigation (it's not a persistent shell), so a field would re-arm the one-shot hint on every
 * SPA navigation. This lives at module scope instead, so it's shared across every tray created
 * during one real page load and only resets on an actual browser refresh (a fresh evaluation of
 * this module) — matching "only on full page refresh, not when navigating through modules". */
let hasShownAvatarHintThisPageLoad = false;

/**
 * `<app-nav>`'s right-hand icon tray: the background-upload pill, the "new version" reload
 * button, the Sentry feedback trigger, the theme toggle and the avatar/login button. The host is
 * the tray `<div>` itself (attribute selector), so the row's classes and its position in the
 * bar's `justify-between` layout stay on the exact same element.
 *
 * Owns its own expand/hint/report-bug state; the one thing it can't do alone — opening the
 * account sheet that lives on `<app-nav>` — is emitted as `accountRequested`.
 */
@Component({
  selector: "div[app-nav-icon-tray]",
  imports: [ThemeToggleComponent],
  template: `
    <!-- Global, so it's visible regardless of which page actually queued the upload
                 (report-form on /spotting, incident-card on /insiden) — the queue itself is a
                 root singleton that keeps going in the background across navigation either
                 way; this is just making that already-true fact visible from anywhere. -->
    @if (uploads.pendingCount() > 0) {
      <span
        class="bg-muted text-muted-foreground flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs"
        title="Photos uploading in the background"
      >
        <svg
          class="size-3 shrink-0 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="3"
          />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
          />
        </svg>
        Uploading {{ uploads.pendingCount() }}
      </span>
    }
    @if (newVersion.hasNewVersion()) {
      <!-- Same grow-in-normal-flow / hover-group pattern as the theme toggle and
                     avatar below — this row's convention is meant to extend to any icon added
                     to it, and there's no reason this one should be the exception. -->
      <button
        type="button"
        class="border-primary/40 text-primary hover:bg-primary/10 animate-breathe flex h-8 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl border outline-none transition-[width,padding] duration-500"
        [class]="newVersionButtonClass()"
        aria-label="A new version of this site is available — click to reload"
        title="A new version of this site is available — click to reload"
        (click)="newVersion.reloadForNewVersion()"
        (mouseenter)="iconHoverGroup.onEnter('new-version')"
        (mouseleave)="iconHoverGroup.onLeave('new-version')"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        @if (newVersionExpanded()) {
          <span class="text-sm font-medium whitespace-nowrap">Update available</span>
        }
      </button>
    }
    <!-- Sentry's own User Feedback widget, opened via createForm() below rather than
                 its default auto-injected floating button — this way it's just another icon
                 in the row, styled and positioned like everything else here instead of a
                 foreign-looking widget bolted onto the corner of the viewport. A plain Angular
                 (click) binding here, not Sentry's own attachTo(el) helper: attachTo grabs a
                 specific DOM node once (originally via a viewChild ref, captured inside
                 afterNextRender) and attaches its listener directly to it — but that node can
                 end up replaced shortly after by hydration reconciliation, leaving the
                 listener stranded on an already-detached element while a fresh, listener-less
                 button silently takes its place (confirmed directly: the two were provably
                 different, disconnected DOM nodes). Angular's own (click) binding has no such
                 failure mode — it's tied to the *template's* own instructions, so it's always
                 correctly (re)attached to whichever node is actually live. -->
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full outline-none"
      aria-label="Report a bug"
      title="Report a bug"
      (click)="onReportBug()"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m8 2 1.88 1.88" />
        <path d="M14.12 3.88 16 2" />
        <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
        <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
        <path d="M12 20v-9" />
        <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
        <path d="M6 13H2" />
        <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
        <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
        <path d="M22 13h-4" />
        <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
      </svg>
    </button>
    <app-theme-toggle />
    <!-- Grows in normal flow (no absolute-positioning trick) — that's deliberate: this
                 button comes after the theme toggle in the row, so growing it doesn't move
                 the toggle directly, but it does grow this whole shrink-0 row's own content
                 width, and since the row's parent (the top-level bar) uses justify-between,
                 that extra width is taken out of the middle gap, shifting this entire block —
                 toggle included — further left. That's exactly "push away, not cover": the
                 toggle visibly moves aside instead of the avatar growing over it. The reverse
                 (hovering the toggle) works the same way, in the other direction — see
                 theme-toggle.component.ts. -->
    <button
      type="button"
      class="text-muted-foreground hover:ring-ring/50 flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-transparent px-1.5 outline-none transition-[padding,background-color,border-color,color] duration-300 hover:ring-2"
      [class]="avatarButtonClass()"
      [attr.aria-label]="auth.isLoggedIn() ? 'Account' : 'Log in'"
      [title]="auth.isLoggedIn() ? 'Account' : 'Log in'"
      (click)="onAvatarClick()"
      (mouseenter)="iconHoverGroup.onEnter('avatar')"
      (mouseleave)="iconHoverGroup.onLeave('avatar')"
    >
      @if (auth.isLoggedIn() && avatarUrl() && !avatarErrored()) {
        <img
          [src]="avatarUrl()"
          alt=""
          class="size-5 shrink-0 rounded-full object-cover"
          (error)="avatarErrored.set(true)"
        />
      } @else {
        <svg
          viewBox="0 0 24 24"
          class="size-5 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"
          />
        </svg>
      }
      <!-- The label lives in its own grid track that animates 0fr to 1fr (not the
                     button's own width/max-width): a grid track's size is a plain
                     numeric-ish value the browser can interpolate smoothly at every frame,
                     unlike animating to or from an unbounded max-width (which can't be
                     interpolated at all — the previous version transitioned that and simply
                     snapped instead of easing) or guessing a fixed max-width cap that clips a
                     genuinely long name. The surrounding flex row's own width then just
                     follows this track's smoothly-animating content width for free — no
                     separate transition needed on the button itself. -->
      <span
        class="grid overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
        [style.grid-template-columns]="expanded() ? '1fr' : '0fr'"
      >
        <span class="min-w-0 overflow-hidden">
          <span class="text-sm font-medium whitespace-nowrap">{{ avatarLabel() }}</span>
        </span>
      </span>
    </button>
  `,
})
export class AppNavIconTrayComponent {
  protected readonly auth = inject(AuthService);
  protected readonly uploads = inject(ImageUploadService);
  protected readonly newVersion = inject(NewVersionService);
  protected readonly iconHoverGroup = inject(NavIconHoverGroupService);
  private readonly destroyRef = inject(DestroyRef);

  /** Emitted when a logged-in avatar click should open the account sheet (owned by `<app-nav>`). */
  readonly accountRequested = output<void>();

  /** Firebase's `photoURL`, separated out so a broken image URL can fall back to the generic
   * icon instead of a broken-image glyph — same pattern as the account panel's own avatar. */
  protected readonly avatarUrl = computed(() => this.auth.user()?.photoURL ?? null);
  protected readonly avatarErrored = signal(false);

  /** The real first name (Google's own `given_name`, which can be more than one word) rather
   * than just `displayName`'s first *word* — falls back to the full display name/email only
   * when no `given_name` was ever captured (see AuthService.firstName's own doc comment for
   * when that happens). */
  protected readonly firstOrFullName = computed(() => {
    const user = this.auth.user();
    if (!user) {
      return "";
    }
    return this.auth.firstName() ?? user.displayName ?? user.email ?? "there";
  });
  /** The on-load hint's full "Welcome back, NAME" pill text — only ever shown once per page
   * load (see `showAvatarHint`/`hasShownAvatarHintThisPageLoad`). Every *hover*-triggered
   * expansion after that shows just the bare name (see the template) — having already
   * introduced itself once, the button doesn't repeat the whole greeting on every hover. */
  protected readonly welcomeLabel = computed(() => welcomeLabelText(this.firstOrFullName()));
  protected readonly avatarLabel = computed(() =>
    avatarLabelText({
      isLoggedIn: this.auth.isLoggedIn(),
      showHint: this.showAvatarHint(),
      welcomeLabel: this.welcomeLabel(),
      name: this.firstOrFullName(),
    }),
  );

  /** One-shot "psst, here's the login/account button" cue — see AVATAR_HINT_DELAY_MS/
   * DURATION_MS and `hasShownAvatarHintThisPageLoad`. Fires regardless of login state (the
   * button just shows different content either way); `expanded` doesn't gate this on auth
   * state itself, so a login/logout arriving mid-window swaps the pill's content live rather
   * than needing to re-trigger the cue. */
  protected readonly showAvatarHint = signal(false);
  /** Same expand, triggered by hovering (grouped with the theme toggle's own hover — see
   * NavIconHoverGroupService) rather than the one-shot on-load timer — a hover is itself
   * already a deliberate "I'm looking at this" signal, so it gets the same affordance without
   * waiting for or depending on the timer. */
  private readonly isHoveringAvatar = this.iconHoverGroup.isExpanded("avatar");
  protected readonly expanded = computed(() => this.showAvatarHint() || this.isHoveringAvatar());

  protected readonly newVersionExpanded = this.iconHoverGroup.isExpanded("new-version");
  /** Explicit `w-*` per state (not `max-w-*`, unlike the avatar's own name pill): the label
   * here is always the fixed string "Update available", never open-ended user content, so a
   * concrete width is safe — and it's what makes the collapsed state a true square (`w-8`
   * matching the `h-8` base) rather than shrinking to its icon's own narrower content width,
   * which read as a slim rectangle instead of the round-ish square this is meant to look like. */
  protected readonly newVersionButtonClass = computed(() =>
    newVersionButtonClassFor(this.newVersionExpanded()),
  );
  /** Outline, not filled — a solid `bg-primary` pill here (this button's previous look) reads
   * as a primary CTA sitting in the middle of an otherwise-neutral nav bar, competing with
   * actual primary actions elsewhere on the page rather than reading as "this is chrome, not
   * the point of the page." An outline keeps the same "look, something changed" affordance
   * without that visual weight. */
  protected readonly avatarButtonClass = computed(() => avatarButtonClassFor(this.expanded()));

  /** Created once, on first use, then reused on every later click — see onReportBug(). */
  private feedbackDialog: Awaited<
    ReturnType<Exclude<ReturnType<typeof Sentry.getFeedback>, undefined>["createForm"]>
  > | null = null;

  constructor() {
    afterNextRender(() => {
      this.auth.whenReady.then(() => {
        if (hasShownAvatarHintThisPageLoad || this.destroyRef.destroyed) {
          return;
        }
        hasShownAvatarHintThisPageLoad = true;
        const showTimer = setTimeout(() => this.showAvatarHint.set(true), AVATAR_HINT_DELAY_MS);
        const hideTimer = setTimeout(
          () => this.showAvatarHint.set(false),
          AVATAR_HINT_DELAY_MS + AVATAR_HINT_DURATION_MS,
        );
        this.destroyRef.onDestroy(() => {
          clearTimeout(showTimer);
          clearTimeout(hideTimer);
        });
      });
    });
  }

  /** Logged out, there's nothing an account panel could show yet — the click should do what
   * the old plain "Log in" button did, not open a panel that's empty until that finishes. */
  protected onAvatarClick(): void {
    if (this.auth.isLoggedIn()) {
      this.accountRequested.emit();
    } else {
      this.auth.login();
    }
  }

  /** Builds the feedback form once (createForm(), not attachTo() — see the template's own doc
   * comment for why) and reuses the same dialog on every later click rather than creating a
   * fresh one each time. */
  protected async onReportBug(): Promise<void> {
    if (!this.feedbackDialog) {
      this.feedbackDialog = (await Sentry.getFeedback()?.createForm()) ?? null;
    }
    this.feedbackDialog?.appendToDom();
    this.feedbackDialog?.open();
  }
}
