/** The current value of the form control an `input`/`change` event came from. A typed stand-in for
 * the `$any($event.target).value` that `strictTemplates` forces in a template: Angular's template
 * parser rejects an inline `as` cast inside an event binding, so a component exposes this as a
 * `protected readonly eventValue = eventValue` member and calls `eventValue($event)`. */
export function eventValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}
