import { Subscription } from "rxjs";
import {
    ImageUploadService,
} from "src/app/services/spotting/image-upload.service";
import { ThemeService } from "src/app/services/theme/theme.service";

import {
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
} from "@angular/core";
import { Router } from "@angular/router";

@Component({
    selector: "d-header-menu",
    templateUrl: "./menu.component.html",
    styleUrls: ["./menu.component.scss"],
})
export class MenuComponent implements OnInit, OnDestroy {
    @Input() menuList: any[] = [];
    @Input() selectedItem = {};
    @Output() menuEvent = new EventEmitter<string>();
    curLanguage!: string;

    countIcon: number = 0;
    $countIcon: Subscription | undefined = undefined;

    constructor(public router: Router, private themeService: ThemeService, 
        private imageUploadService: ImageUploadService) {
        return;
    }

    ngOnInit(): void {
        const pathName = window.location.pathname;
        for (let i = 0; i < this.menuList.length; i++) {
            if (this.menuList[i].href === pathName) {
                this.selectedItem = this.menuList[i];
            }
        }

        this.$countIcon = this.imageUploadService.$pendingUploadCount.subscribe(
            (count) => {
                this.countIcon = count;
            }
        );
    }
    
    ngOnDestroy(): void {
        this.$countIcon?.unsubscribe();
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

    toggleTheme(): void{
        this.themeService.toggleTheme();
    }
}
