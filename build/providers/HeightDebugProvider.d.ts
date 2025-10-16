import { Color } from 'three';
import { CancelablePromise } from '../utils/CancelablePromise';
import RasterMapProvider from './RasterMapProvider';
export declare class HeightDebugProvider extends RasterMapProvider {
    provider: RasterMapProvider;
    fromColor: Color;
    toColor: Color;
    constructor(provider: any);
    buildURL(zoom: number, x: number, y: number): string;
    fetchImage(zoom: number, x: number, y: number): CancelablePromise<any>;
}
