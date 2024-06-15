import { UserAuthData } from "./auth.service";

type PermissionKey = string | "admin" | "editor";

interface PermissionElement {
    explicitlyAllowedPaths: string[];
}

export const permissions: { [key in PermissionKey]?: PermissionElement } = {
    admin: {
        explicitlyAllowedPaths: ["/console"],
    },
};

const explicitlyAllowedPaths = new Set<string>(
    Object.keys(permissions)
        .map((key: PermissionKey) => {
            return permissions[key]?.explicitlyAllowedPaths ?? [];
        })
        .flat()
);

export function isUserAllowed(
    permissionObj: UserAuthData | undefined,
    path: string
): boolean {
    if (!explicitlyAllowedPaths.has(path)) {
        return true;
    } else if (!permissionObj?.permissions) {
        return false;
    }

    const roles: PermissionKey[] = Object.keys(
        permissionObj.permissions
    ) as PermissionKey[];

    const allowedSet = new Set<string>();

    for (const role of roles) {
        const roleElem = permissions[role] as PermissionElement;

        for (const path of roleElem.explicitlyAllowedPaths) {
            allowedSet.add(path);
        }
    }

    return allowedSet.has(path);
}
