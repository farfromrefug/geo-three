import { BufferGeometry, Intersection, Material, Raycaster, Texture, Vector3 } from 'three';
import { MapHeightNode } from './MapHeightNode';
import { MapView } from '../MapView';
export declare class MapHeightNodeShader extends MapHeightNode {
    protected heightMapLocation: number[];
    protected overZoomFactor: number;
    constructor(parentNode?: MapHeightNode, mapView?: MapView, location?: number, level?: number, x?: number, y?: number);
    static ELEVATION_DECODER: number[];
    static EMPTY_TEXTURE: Texture;
    static geometrySize: number;
    static geometry: BufferGeometry;
    static baseGeometry: BufferGeometry;
    static baseScale: Vector3;
    material: Material;
    static prepareMaterial(material: Material): Material;
    onHeightImage(image: any): void;
    protected handleParentOverZoomTile(resolve?: any): Promise<any>;
    raycast(raycaster: Raycaster, intersects: Intersection[]): void;
}
