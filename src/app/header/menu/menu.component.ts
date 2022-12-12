import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { Router } from "@angular/router";

@Component({
    selector: "d-header-menu",
    templateUrl: "./menu.component.html",
    styleUrls: ["./menu.component.scss"],
})
export class MenuComponent implements OnInit {
    @Input() menuList: any[] = [];
    @Input() selectedItem = {};
    @Output() menuEvent = new EventEmitter<string>();
    curLanguage!: string;

    constructor(public router: Router) {
        return;
    }

    ngOnInit(): void {
        const pathName = window.location.pathname;
        for (let i = 0; i < this.menuList.length; i++) {
            if (this.menuList[i].href === pathName) {
                this.selectedItem = this.menuList[i];
            }
        }
    }

    onSelect(item: any): void {
        if (item.target === "_self") {
            this.selectedItem = item;
        }
        this.menuChange(item.name);
    }

    menuChange(value: string): void {
        this.menuEvent.emit(value);
    }

    changeLanguage(lang: string): void {
        this.curLanguage = lang;
    }

    reportBug(): void {
        throw new Error(`User reported bug at time ${(new Date()).valueOf()}`);
    }
}
