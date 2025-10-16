import RasterMapProvider from './RasterMapProvider';
export declare class MapTilerProvider extends RasterMapProvider {
    apiKey: string;
    format: string;
    category: string;
    style: string;
    resolution: number;
    constructor(apiKey: any, category: any, style: any, format: any);
    buildURL(zoom: any, x: any, y: any): string;
}
