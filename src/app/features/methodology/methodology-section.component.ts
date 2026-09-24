import { Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { METRIC_DOCS, type MethodologySection } from "../../core/methodology/methodology.content";
import { renderMethodologyCopy } from "../../core/methodology/methodology-render.util";
import { InfoPopover, type InfoPopoverLink } from "../../ui/info-popover/info-popover";

/** One metric row: the registry entry's identity plus its already-token-rendered definition. */
interface MetricRow {
  id: string;
  title: string;
  content: string;
}

/**
 * One anchored block of `/methodology`: heading, "Last reviewed" date, owning-route link,
 * the in-progress state while the owning spec's code has not landed, and the registry metrics
 * that belong to it.
 *
 * Every string comes from `METHODOLOGY_SECTIONS` / `METRIC_DOCS` through
 * `renderMethodologyCopy()` — nothing here is typed inline, so the popover a rider opens on a
 * metric and this page can never disagree (METHODOLOGY_DOCS.md §6).
 */
@Component({
  selector: "app-methodology-section",
  imports: [InfoPopover, RouterLink],
  template: `
    <section [id]="section().id" class="flex scroll-mt-24 flex-col gap-3">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-lg font-semibold">{{ section().title }}</h2>
        <p class="text-muted-foreground text-xs">{{ _lastReviewed() }}</p>
      </div>

      <p class="text-sm">{{ _body() }}</p>

      @if (section().inProgress) {
        <p
          data-testid="in-progress"
          class="border-border/60 bg-muted/40 text-muted-foreground rounded-lg border p-3 text-xs leading-relaxed"
        >
          This section is still in progress — its rule is owned by {{ section().sourceSpec }} and
          will render here once that spec's code lands.
        </p>
      }

      @if (section().ownerRoute; as route) {
        <a [routerLink]="route" class="text-primary text-xs underline-offset-4 hover:underline"
          >See this on the site</a
        >
      } @else {
        <p class="text-muted-foreground text-xs">{{ section().sourceSpec }}</p>
      }

      @if (_metrics().length > 0) {
        <ul class="flex flex-col gap-1.5">
          @for (metric of _metrics(); track metric.id) {
            <li>
              <app-info-popover [label]="metric.title" [content]="metric.content" [link]="_link()">
                <span class="text-sm">{{ metric.title }}</span>
              </app-info-popover>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class MethodologySectionComponent {
  /** The registry section this block renders; the anchor id is its `id`. */
  readonly section = input.required<MethodologySection>();

  protected readonly _body = computed(() => renderMethodologyCopy(this.section().body));

  /** Built as a template so a token in `lastReviewed` would resolve too, and so a raw `{{` can
   * never survive to the DOM. */
  protected readonly _lastReviewed = computed(() =>
    renderMethodologyCopy(`Last reviewed ${this.section().lastReviewed}`),
  );

  protected readonly _metrics = computed<MetricRow[]>(() =>
    METRIC_DOCS.filter((doc) => doc.sectionId === this.section().id).map((doc) => ({
      id: doc.id,
      title: doc.title,
      content: renderMethodologyCopy(doc.definition),
    })),
  );

  /** Every metric's popover points back at this section's anchor on the full method. */
  protected readonly _link = computed<InfoPopoverLink>(() => ({
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: this.section().id,
  }));
}
