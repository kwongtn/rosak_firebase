import { Component } from "@angular/core";

/**
 * The MLPTF wordmark logo shared by `<app-nav>` and `<app-compact-nav>`. An attribute selector on
 * `<svg>` so the element and its sizing classes stay the consumer's (`class="h-9 w-auto"`), and the
 * rendered DOM is the same `<svg>` the two navs used to inline. The children carry the `svg:`
 * prefix: a component template does not know it sits inside an `<svg>`, so a bare `<path>` would be
 * created as an HTML element and never draw.
 */
@Component({
  selector: "svg[app-brand-logo]",
  host: { viewBox: "0 0 570.14 178.35", "aria-hidden": "true" },
  template: `
    <svg:path fill="#ee7104" d="M1.5,6.23L.29,132.87l82.39-2.27L1.5,6.23Z" />
    <svg:path fill="#ee7104" d="M1.5,6.23l117.75,125.57,101.07-1.06L1.5,6.23Z" />
    <svg:path fill="#ee7104" d="M1.5,6.23l275.87,125.29,247.58-2.86L1.5,6.23" />
    <svg:path
      fill="currentColor"
      d="M0,134.4L37.77,5.22l38.17-.4,4.69,89.06L126.83,4.42l38.57-.4-19.96,127.9-27.99,.4,19.39-104.19-54.17,102.47-21.78,.38-5.87-101.33-27.57,104.15-27.46,.6Z"
    />
    <svg:path
      fill="currentColor"
      d="M188.57,4.69l-28.33,127.05,80.12-1.14,4.36-22.25-51.61,.09L216.4,4.27l-27.82,.42Z"
    />
    <svg:path
      fill="currentColor"
      d="M309.78,.67c-13.14,.73-22.17,2.41-33.32,4.5-1.16,7.99-27.89,126.34-27.89,126.34h28.79l9.78-46.47s16.7,1.7,38.17-2.28c14.6-7.41,19.82-7.99,29.6-22.23,3.57-5.62,11.96-20.36,2.68-41.38-7.05-12.59-25.12-17.74-47.81-18.48Zm-1.17,23.21c2.46,0,5.13,.11,7.34,.49,7.19,.31,11.83,3.31,14.87,6.03,2.05,2.05,1.87,10.45,1.87,10.45-.53,4.91-2.28,8.21-5.09,12.59-4.2,5.54-7.99,6.79-15.54,8.3-8.97,1.12-19.69,.8-19.69,.8l8.57-38.3s3.56-.35,7.66-.36h0Z"
    />
    <svg:path
      fill="currentColor"
      d="M367.37,.94l-4.82,24.37,34.42-.13-22.1,104.46,28.39-.54,22.77-104.73h36.03l5.22-23.3-99.91-.13Z"
    />
    <svg:path
      fill="currentColor"
      d="M476.38,.94l-28.53,128.04h28.93l11.25-52.5,46.61-.54,4.69-22.23-46.34,.27,6.96-30.67,49.96-.27,4.96-23.04-78.48,.94Z"
    />
  `,
})
export class BrandLogoComponent {}
