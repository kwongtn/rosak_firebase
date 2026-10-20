import { Component, computed, input, signal } from "@angular/core";

/**
 * Up to two letters for a name: the first letter of the first and last words ("Ann Lee" → "AL",
 * "Zul" → "Z"). Works on code points so a leading emoji or non-Latin letter is not split.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (first + last).toUpperCase();
}

/**
 * Round avatar for a person. Shows `src` when it loads and falls back to the person's initials
 * when `src` is empty or fails (a CMS-supplied URL can break), so a row of cards keeps its
 * alignment either way. Purely decorative: the name is always rendered as text beside it.
 */
@Component({
  selector: "app-avatar",
  host: { class: "inline-flex shrink-0" },
  template: `
    @if (showImage()) {
      <img
        [src]="src()"
        alt=""
        [attr.width]="size()"
        [attr.height]="size()"
        [style.width.px]="size()"
        [style.height.px]="size()"
        loading="lazy"
        decoding="async"
        class="rounded-full object-cover"
        (error)="failedSrc.set(src())"
      />
    } @else {
      <span
        aria-hidden="true"
        data-testid="avatar-initials"
        class="bg-muted text-muted-foreground inline-flex items-center justify-center rounded-full text-sm font-medium select-none"
        [style.width.px]="size()"
        [style.height.px]="size()"
        >{{ initials() }}</span
      >
    }
  `,
})
export class AvatarComponent {
  readonly name = input("");
  readonly src = input("");
  readonly size = input(48);

  /** The URL that last failed to load; a new `src` is tried again. */
  protected readonly failedSrc = signal<string | undefined>(undefined);
  protected readonly showImage = computed(() => !!this.src() && this.failedSrc() !== this.src());
  protected readonly initials = computed(() => initialsOf(this.name()));
}
