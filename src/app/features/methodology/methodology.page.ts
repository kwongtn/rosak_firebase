import { Component, inject } from "@angular/core";
import { Meta } from "@angular/platform-browser";
import { METHODOLOGY_SECTIONS } from "../../core/methodology/methodology.content";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { DisclaimerNote } from "../../ui/disclaimer-note/disclaimer-note";
import { MethodologySectionComponent } from "./methodology-section.component";

/**
 * One paragraph for crawlers and link previews. Deliberately names the mechanisms, never a
 * number — every figure on the page is owned by a sibling spec and resolved from the registry.
 */
const META_DESCRIPTION =
  "How MLPTF counts what it publishes: where each datum comes from, how reliability, line " +
  "status, disruption episodes, rider sightings and arrivals are derived, the moderation rules " +
  "behind community reports, and what these community estimates cannot tell you.";

/**
 * `/methodology` — the public "How this is counted" page. A code-first registry
 * (`core/methodology/`) feeds both this page and every `InfoPopover`, so the full method and the
 * tooltip cannot drift apart.
 *
 * Every section is rendered from `METHODOLOGY_SECTIONS` and is `inProgress` until its owning
 * spec's code lands, so v1 publishes structure, ownership and the disclaimer rather than
 * formulas. The page is `RenderMode.Server` (see app.routes.server.ts): it must be indexable and
 * the sources section will gain DATA_PROVENANCE.md's public `dataSources` fetch — until that
 * query lands the section renders the in-progress state, never a hardcoded license string.
 */
@Component({
  selector: "app-methodology",
  imports: [AppFooterComponent, AppNavComponent, DisclaimerNote, MethodologySectionComponent],
  templateUrl: "./methodology.page.html",
})
export class MethodologyPage {
  protected readonly sections = METHODOLOGY_SECTIONS;

  constructor() {
    inject(Meta).updateTag({ name: "description", content: META_DESCRIPTION });
  }
}
