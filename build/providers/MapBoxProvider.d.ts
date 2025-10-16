import { CancelablePromise } from '../utils/CancelablePromise';
import RasterMapProvider from './RasterMapProvider';
export declare class MapBoxProvider extends RasterMapProvider {
    static ADDRESS: string;
    static STYLE: number;
    static MAP_ID: number;
    apiToken: string;
    format: string;
    useHDPI: boolean;
    mode: number;
    mapId: string;
    style: string;
    version: string;
    constructor(apiToken?: string, id?: string, mode?: number, format?: string, useHDPI?: boolean, version?: string);
    getMetaData(): void;
    fetchImage(zoom: number, x: number, y: number): CancelablePromise<any>;
    buildURL(zoom: any, x: any, y: any): string;
}
