import { CancelablePromise } from '../utils/CancelablePromise';
import RasterMapProvider from './RasterMapProvider';
export declare class GoogleMapsProvider extends RasterMapProvider {
    apiToken: string;
    sessionToken: string;
    orientation: number;
    format: string;
    mapType: string;
    overlay: boolean;
    constructor(apiToken: string);
    createSession(): void;
    fetchImage(zoom: number, x: number, y: number): CancelablePromise<any>;
    buildURL(zoom: any, x: any, y: any): string;
}
