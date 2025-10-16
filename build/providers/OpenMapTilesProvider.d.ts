import RasterMapProvider from './RasterMapProvider';
export declare class OpenMapTilesProvider extends RasterMapProvider {
    format: string;
    theme: string;
    constructor(address: string, format?: string, theme?: string);
    getMetaData(): void;
    buildURL(zoom: any, x: any, y: any): string;
}
