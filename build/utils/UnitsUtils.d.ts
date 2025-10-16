import { Vector2 } from 'three';
export declare class UnitsUtils {
    static EARTH_RADIUS: number;
    static EARTH_PERIMETER: number;
    static EARTH_ORIGIN: number;
    static get(onResult: Function, onError: Function): void;
    static datumsToSpherical(latitude: number, longitude: number, output?: Vector2, scale?: number): Vector2;
    static sphericalToDatums(x: number, y: number): {
        lat: number;
        lon: number;
    };
    static quadtreeToDatums(zoom: number, x: number, y: number): {
        lat: number;
        lon: number;
    };
}
