import { Injectable, signal } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class IncidentSheetService {
  readonly isOpen = signal(false);

  open() {
    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
  }

  setOpen(open: boolean) {
    this.isOpen.set(open);
  }
}
