import { Material, BufferGeometry, Vector3, Raycaster, Intersection } from 'three';
import { MapNode } from './MapNode';
import { MapView } from '../MapView';
export declare class MapHeightNode extends MapNode {
    heightLoaded: boolean;
    isHeightReady: boolean;
    constructor(parentNode?: MapHeightNode, mapView?: MapView, location?: number, level?: number, x?: number, y?: number, geometry?: BufferGeometry, material?: Material);
    static tileSize: number;
    static geometrySize: number;
    static geometry: BufferGeometry;
    static baseGeometry: BufferGeometry;
    static BASE_SCALE: Vector3;
    initialize(): Promise<any>;
    dispose(): void;
    protected onTextureImage(image: any): void;
    loadTexture(): Promise<any>;
    nodeReady(): void;
    createChildNodes(): void;
    parentNode: MapHeightNode;
    parent: MapHeightNode;
    heightListeners: any[];
    protected handleParentOverZoomTile(resolve?: any): Promise<void>;
    loadHeightGeometry(): Promise<any>;
    onHeightImage(image: any): void;
    raycast(raycaster: Raycaster, intersects: Intersection[]): void;
}
