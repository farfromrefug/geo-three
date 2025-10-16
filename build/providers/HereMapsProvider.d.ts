import RasterMapProvider from './RasterMapProvider';
export declare class HereMapsProvider extends RasterMapProvider {
    static PATH: string;
    appId: string;
    appCode: string;
    style: string;
    scheme: string;
    format: string;
    size: number;
    version: string;
    server: number;
    constructor(appId: string, appCode: string, style: string, scheme: string, format: string, size: number);
    nextServer(): void;
    getMetaData(): void;
    buildURL(zoom: any, x: any, y: any): string;
}
