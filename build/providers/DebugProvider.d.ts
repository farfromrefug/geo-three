import { CancelablePromise } from '../utils/CancelablePromise';
import { MapProvider } from './MapProvider';
export declare class DebugProvider extends MapProvider {
    resolution: number;
    fetchImage(zoom: number, x: number, y: number): CancelablePromise<any>;
}
