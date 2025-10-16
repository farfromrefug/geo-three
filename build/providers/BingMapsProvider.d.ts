import RasterMapProvider from './RasterMapProvider';
export declare class BingMapsProvider extends RasterMapProvider {
    maxZoom: number;
    apiKey: string;
    type: string;
    format: string;
    mapSize: number;
    subdomain: string;
    constructor(apiKey?: string, type?: string);
    static AERIAL: string;
    static ROAD: string;
    static AERIAL_LABELS: string;
    static OBLIQUE: string;
    static OBLIQUE_LABELS: string;
    getMetaData(): void;
    static quadKey(zoom: number, x: number, y: number): string;
    buildURL(zoom: any, x: any, y: any): string;
}
