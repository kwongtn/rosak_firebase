import { FeatureCollection } from "geojson";
import { loadAsync } from "jszip";
import { firstValueFrom } from "rxjs";

import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { getDownloadURL, ref, Storage } from "@angular/fire/storage";

/**
 * Notes:
 * 1. Geojson is generated via OSM, tool here: https://observablehq.com/@saneef/geojson-from-openstreetmap
 * 2. Refer to the following for syntax: https://wiki.openstreetmap.org/wiki/Railways
 */

@Injectable({
    providedIn: "root",
})
export class GetGeojsonService {
    private readonly storage: Storage = inject(Storage);

    constructor(private http: HttpClient) {}

    async getData(url: string, filePath: string): Promise<FeatureCollection> {
        return await firstValueFrom(
            this.http.get(await getDownloadURL(ref(this.storage, url)), {
                responseType: "arraybuffer",
            })
        ).then(async (data: any) => {
            const zipInstance = await loadAsync(data);

            return JSON.parse(
                await zipInstance.files[filePath].async("string")
            );
        });
    }
}
