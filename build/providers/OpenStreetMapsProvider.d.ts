import RasterMapProvider from './RasterMapProvider';
export declare class OpenStreetMapsProvider extends RasterMapProvider {
    format: string;
    constructor(address?: string);
    buildURL(zoom: any, x: any, y: any): string;
}
