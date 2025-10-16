import { BufferGeometry, Intersection, Raycaster, Vector3 } from 'three';
import { MapNode } from './MapNode';
export declare class MapPlaneNode extends MapNode {
    constructor(parentNode?: any, mapView?: any, location?: number, level?: number, x?: number, y?: number);
    static geometry: BufferGeometry;
    static baseGeometry: BufferGeometry;
    static baseScale: Vector3;
    initialize(): Promise<any>;
    createChildNodes(): void;
    raycast(raycaster: Raycaster, intersects: Intersection[]): void;
}
