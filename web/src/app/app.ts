import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { BrnSonnerToaster } from "@spartan-ng/brain/sonner";

@Component({
    selector: "app-root",
    imports: [RouterOutlet, BrnSonnerToaster],
    templateUrl: "./app.html",
    styleUrl: "./app.css"
})
export class App {}
