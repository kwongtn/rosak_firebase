import { take } from "rxjs";
import { AuthService } from "src/app/services/auth/auth.service";
import { ToastService } from "src/app/services/toast/toast.service";

import {
    Component,
    Input,
    OnChanges,
    OnInit,
    SimpleChanges,
} from "@angular/core";
import { User } from "@angular/fire/auth";

import {
    UserDataResponseUser,
    UserFavouriteVehicle,
} from "../services/get-user-data.service";
import { UpdateUserService } from "../services/update-user.service";

@Component({
    selector: "profile-user",
    templateUrl: "./user.component.html",
    styleUrls: ["./user.component.scss"],
})
export class ProfileUserComponent implements OnInit, OnChanges {
    @Input() displayData: UserDataResponseUser | undefined = undefined;
    @Input() user!: User;
    @Input() loading = true;

    nickname: string = "";
    nicknameChangeButtonClicked: boolean = false;
    isNicknameSaveLoading: boolean = false;

    constructor(
        private updateUserService: UpdateUserService,
        public authService: AuthService,
        private toastService: ToastService
    ) {
        this.nickname = this.displayData?.nickname ?? "";
    }

    ngOnInit() {
        return;
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.nickname = this.displayData?.nickname ?? "";
    }

    getFavouriteTrainDisplayLineString(data: UserFavouriteVehicle): string {
        return data.vehicle.lines
            .map((line) => {
                return line.code;
            })
            .join(", ");
    }

    toggleNicknameButtonClick() {
        this.nicknameChangeButtonClicked = !this.nicknameChangeButtonClicked;
    }

    async onNicknameSave() {
        this.isNicknameSaveLoading = true;
        this.updateUserService
            .mutate(
                {
                    data: {
                        nickname: this.nickname,
                    },
                },
                {
                    context: {
                        headers: {
                            "firebase-auth-key":
                                await this.authService.getIdToken(),
                        },
                    },
                }
            )
            .pipe(take(1))
            .forEach(({ data, errors }) => {
                if (errors) {
                    console.log(errors);
                    this.toastService.addToast(
                        "Save failed",
                        errors.join(" "),
                        "error"
                    );
                } else {
                    this.nickname = data?.updateUser.nickname ?? "";
                    this.toggleNicknameButtonClick();
                }
            }).catch((err) => {
                this.toastService.addToast(
                    "Save failed",
                    err.message,
                    "error"
                );

            }).finally(() => {
                this.isNicknameSaveLoading = false;
            });
    }
}
