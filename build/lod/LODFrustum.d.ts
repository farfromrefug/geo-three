import { MapNode } from '../nodes/MapNode';
import { MapView } from '../MapView';
import { LODControl } from './LODControl';
export declare class LODFrustum implements LODControl {
    subdivideDistance: number;
    simplifyDistance: number;
    testCenter: boolean;
    pointOnly: boolean;
    protected isChildReady(node: MapNode): boolean;
    protected handleNode(node: any, handled: Set<MapNode>, camera: any, minZoom: any, maxZoom: any, inFrustum?: boolean, canSubdivide?: boolean, canSimplify?: boolean): void;
    private toHandle;
    getChildrenToTraverse(parent: any): Set<MapNode>;
    private lastMatrix;
    private handled;
    updateLOD(view: MapView, camera: any, renderer: any, scene: any, force?: boolean): void;
}
