import { CancelablePromise } from '../utils/CancelablePromise';
export declare abstract class MapProvider {
    name: string;
    minZoom: number;
    maxZoom: number;
    maxOverZoom: number;
    zoomDelta: number;
    minLevelForZoomDelta: number;
    get actualMaxZoom(): number;
    bounds: number[];
    center: number[];
    fetchImage(zoom: number, x: number, y: number): CancelablePromise<any>;
    getMetaData(): void;
    protected fetchingTilesPromises: Map<string, CancelablePromise<any>>;
    protected fetchTileImage(zoom: number, x: number, y: number): Promise<any>;
    cancelTile(zoom: number, x: number, y: number): void;
    fetchTile(zoom: number, x: number, y: number): Promise<any>;
}
