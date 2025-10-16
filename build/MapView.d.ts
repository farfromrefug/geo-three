import { Mesh, Raycaster } from 'three';
import { MapNode } from './nodes/MapNode';
import { MapProvider } from './providers/MapProvider';
import { LODControl } from './lod/LODControl';
export declare class MapView extends Mesh {
    static PLANAR: number;
    static SPHERICAL: number;
    static HEIGHT: number;
    static HEIGHT_SHADER: number;
    static MARTINI: number;
    static mapModes: Map<number, any>;
    lod: LODControl;
    provider: MapProvider;
    heightProvider: MapProvider;
    root: MapNode;
    onNodeReady: Function;
    nodeAutoLoad: boolean;
    lowMemoryUsage: boolean;
    maxZoomForPeaks: number;
    constructor(root?: (number | MapNode), provider?: MapProvider, heightProvider?: MapProvider, nodeAutoLoad?: boolean, onNodeReady?: Function);
    nodeShouldAutoLoad(): boolean;
    setRoot(root: (MapNode | number)): void;
    setProvider(provider: MapProvider): void;
    setHeightProvider(heightProvider: MapProvider): void;
    clear(): any;
    getMetaData(): void;
    raycast(raycaster: Raycaster, intersects: any[]): boolean;
}
