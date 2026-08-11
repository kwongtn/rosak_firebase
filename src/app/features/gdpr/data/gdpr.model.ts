/** Shape of the live Firestore doc at `public/gdpr` — ported from the old app's
 * `compliance/models/firestore.ts`. Admin-edited CMS content, not something this app writes: a
 * checklist of GDPR-related requirements, each flagged whether this project currently adheres to
 * it, with rich-text detail and an optional note. */
export interface GdprDetailChild {
  title: string;
  adhered: boolean;
  details: string;
  notes?: string;
}

export interface GdprDetail {
  title: string;
  children: GdprDetailChild[];
}

export interface PublicGdprDocument {
  definition: string;
  intro: string;
  details: GdprDetail[];
}
