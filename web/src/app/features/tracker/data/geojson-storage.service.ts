import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { getApps, initializeApp } from "firebase/app";
import { getStorage, getDownloadURL, ref } from "firebase/storage";
import JSZip from "jszip";
import type { FeatureCollection } from "geojson";
import { environment } from "../../../../environments/environment";

function firebaseApp() {
    return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

/**
 * Fetches a zipped GeoJSON file from Firebase Cloud Storage. Ported from GetGeojsonService —
 * used for the always-on rail-line overlay (`gs://.../malaysia_railway.geo.zip`).
 */
@Injectable({ providedIn: "root" })
export class GeojsonStorageService {
    private readonly http = inject(HttpClient);

    async getData(gsUrl: string, filePathInZip: string): Promise<FeatureCollection> {
        const storage = getStorage(firebaseApp());
        const downloadUrl = await getDownloadURL(ref(storage, gsUrl));
        const buffer = await firstValueFrom(this.http.get(downloadUrl, { responseType: "arraybuffer" }));
        const zip = await JSZip.loadAsync(buffer);
        const file = zip.file(filePathInZip);
        if (!file) {
            throw new Error(`${filePathInZip} not found in ${gsUrl}`);
        }
        const text = await file.async("string");
        return JSON.parse(text);
    }
}
