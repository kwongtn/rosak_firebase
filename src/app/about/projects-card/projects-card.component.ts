import { Component, Input, OnInit } from "@angular/core";

import { Project } from "../models/firestore";

@Component({
    selector: "app-projects-card",
    templateUrl: "./projects-card.component.html",
    styleUrls: ["./projects-card.component.scss"],
})
export class ProjectsCardComponent implements OnInit {
  @Input() data!: Project;

  constructor() {
      return;
  }

  ngOnInit(): void {
      return;
  }
}
