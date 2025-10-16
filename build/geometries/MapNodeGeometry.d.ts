import { BufferGeometry } from 'three';
export declare class MapNodeGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, widthSegments?: number, heightSegments?: number, options?: {
        skirt?: boolean;
        skirtDepth?: number;
        uvs?: boolean;
    });
    static buildPlane(width: number, height: number, widthSegments: number, heightSegments: number, indices: number[], vertices: number[], uvs: number[]): void;
    static buildSkirt(width: number, height: number, widthSegments: number, heightSegments: number, skirtDepth: number, indices: number[], vertices: number[], uvs: number[]): void;
}
