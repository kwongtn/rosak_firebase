import { NzCardModule } from "ng-zorro-antd/card";
import { NzTagModule } from "ng-zorro-antd/tag";

import { Component, Input, OnInit } from "@angular/core";

import { Project } from "../models/firestore";

@Component({
    selector: "about-projects",
    templateUrl: "./projects-card.component.html",
    styleUrls: ["./projects-card.component.scss"],
    standalone:true,
    imports: [
        NzCardModule,
        NzTagModule,

    ]
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
