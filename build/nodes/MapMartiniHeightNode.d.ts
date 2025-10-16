import { Material, MeshPhongMaterial, Texture, Vector3 } from 'three';
import { MapNodeGeometry } from '../geometries/MapNodeGeometry';
import { MapView } from '../MapView';
import { MapHeightNode } from './MapHeightNode';
export declare class MapMartiniHeightNode extends MapHeightNode {
    static geometrySize: number;
    static emptyTexture: Texture;
    static geometry: MapNodeGeometry;
    elevationDecoder: any;
    static tileSize: number;
    static baseScale: Vector3;
    exageration: number;
    meshMaxError: number | Function;
    material: MeshPhongMaterial;
    constructor(parentNode?: MapMartiniHeightNode, mapView?: MapView, location?: number, level?: number, x?: number, y?: number, { elevationDecoder, meshMaxError, exageration }?: {
        elevationDecoder?: number[];
        meshMaxError?: number | Function;
        exageration?: number;
    });
    static prepareMaterial(material: Material, level: number, exageration?: number): any;
    static getTerrain(imageData: Uint8ClampedArray, tileSize: number, elevationDecoder: any): Float32Array;
    static getMeshAttributes(vertices: number[], terrain: Float32Array, tileSize: number, bounds: number[], exageration: number): {
        position: {
            value: Float32Array;
            size: number;
        };
        uv: {
            value: Float32Array;
            size: number;
        };
    };
    onHeightImage(image: HTMLImageElement): Promise<void>;
    loadHeightGeometry(): Promise<any>;
}
