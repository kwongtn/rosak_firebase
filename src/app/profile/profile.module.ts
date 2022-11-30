import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { ProfileMainComponent } from "./main/main.component";
import { ProfileSpottingsComponent } from "./spottings/spottings.component";
import { ProfileUserComponent } from "./user/user.component";

@NgModule({
    declarations: [
        ProfileMainComponent,
        ProfileUserComponent,
        ProfileSpottingsComponent,
    ],
    imports: [CommonModule],
})
export class ProfileModule {}
