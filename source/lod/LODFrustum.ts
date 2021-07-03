import {LODRadial} from './LODRadial';
import {Frustum, Matrix4, Vector3} from 'three';
import {MapNode} from '../nodes/MapNode';
import {MapHeightNode} from '../nodes/MapHeightNode';
import {MapView} from '../MapView';
import {UnitsUtils} from '../utils/UnitsUtils';

import {bboxToTile} from '@mapbox/tilebelt'; 

const projection = new Matrix4();
const pov = new Vector3();
const frustum = new Frustum();
const position = new Vector3();
const temp = new Vector3();

/**
 * Check the planar distance between the nodes center and the view position.
 *
 * Only subdivides elements inside of the camera frustum.
 */
export class LODFrustum extends LODRadial 
{
	/**
	 * Distance to subdivide the tiles.
	 */
	public subdivideDistance: number = 120;

	/**
	 * Distance to simplify the tiles.
	 */
	public simplifyDistance: number = 400;

	/**
	 * If true only the central point of the plane geometry will be used
	 *
	 * Otherwise the object bouding sphere will be tested, providing better results for nodes on frustum edge but will lower performance.
	 */
	public testCenter: boolean = true;

	/**
	 * If set true only the center point of the object is considered. 
	 * 
	 * Otherwise the full bouding box of the objects are considered.
	 */
	public pointOnly: boolean = false;

	// private nodeMap = new Map<String, MapNode>();

	protected isChildReady(node: MapNode): boolean
	{
		
		return node.isTextureReady && (!(node instanceof MapHeightNode) || node.isHeightReady);
	}

	protected handleNode(node, camera, minZoom, maxZoom, inFrustum = false, canSubdivideOrSimplify = true): void
	{
		if (!(node instanceof MapNode)) 
		{
			return;
		}
		// const key =`${node.x},${node.y},${node.level}`;
		// if (!this.nodeMap.has(key)) {
		// 	this.nodeMap.set(key, node);
		// }

		node.getWorldPosition(position);
		var distance = pov.distanceTo(position);
		distance /= Math.pow(2, 20 - node.level) * Math.max(camera.zoom/2, 1);
		// distance /= Math.pow(2, 20 - node.level);

		inFrustum = inFrustum || (this.pointOnly ? frustum.containsPoint(position) : frustum.intersectsObject(node));
		// console.log('test', node.level, node.x, node.y, distance, inFrustum);

		if (canSubdivideOrSimplify && (maxZoom > node.level && distance < this.subdivideDistance) && inFrustum)
		{
			node.subdivide();
			// console.log('subdivide', node.x, node.y, node.level);
			const children = node.children;
			if (children) 
			{
				for (let index = 0; index < children.length; index++) 
				{
					const n = children[index];
					if (!(n instanceof MapNode)) 
					{
						continue;
					}
					this.handleNode(n, camera, minZoom, maxZoom, false);
				}
			}
			node.isMesh = false;
			node.objectsHolder.visible = false;
		}
		else if (canSubdivideOrSimplify && (node.level > maxZoom || (!inFrustum || minZoom < node.level )&& distance > this.simplifyDistance) && node.parentNode)
		{
			const parentNode = node.parentNode;
			const removed = parentNode.simplify(distance, camera.far);
			// console.log('simplify', removed.length, parentNode.x, parentNode.y, parentNode.level);
			// removed.forEach(n=>this.nodeMap.delete(`${n.x},${n.y},${n.level}`))
			// if (parentNode.level > minZoom) 
			// {
			this.handleNode(parentNode, camera, minZoom, maxZoom, false, false);
			// }
		}
		else if ((inFrustum || distance < this.subdivideDistance) && minZoom <= node.level )
		{
			if (!this.isChildReady(node))
			{
				node.initialize();
			}
		}
	}

	public getChildrenToTraverse(parent): any[]
	{
		const toHandle = [];
		function handleChild(child): void 
		{
			if (!child.children || child.children.length === 1) 
			{
				toHandle.push(child);
			}
			else 
			{
				child.children.forEach((c) => 
				{
					if (child instanceof MapNode) 
					{
						handleChild(c);
					}
				});
			}
		}
		handleChild(parent);
		return toHandle;
	}

	public updateLOD(view: MapView, camera, renderer, scene): void
	{
		projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		frustum.setFromProjectionMatrix(projection);
		
		camera.getWorldPosition(pov);
		const minZoom = view.provider.minZoom;
		const maxZoom = view.provider.maxZoom + view.provider.maxOverZoom;

		// var bottomRight = new Vector3( camera.far, 0, camera.far);
		// var topLeft = new Vector3( -camera.far, 0, -camera.far * 2 );
		// bottomRight.applyMatrix4( camera.matrixWorld );
		// topLeft.applyMatrix4( camera.matrixWorld );

		// const pos = UnitsUtils.sphericalToDatums(pov.x, -pov.z);
		// const postopLeft = UnitsUtils.sphericalToDatums(topLeft.x , -topLeft.z);
		// const posbottomRight = UnitsUtils.sphericalToDatums(bottomRight.x , -bottomRight.z);
		// const bbox = [Math.min(posbottomRight.latitude, postopLeft.latitude), Math.min(posbottomRight.longitude, postopLeft.longitude), Math.max(posbottomRight.latitude, postopLeft.latitude), Math.max(posbottomRight.longitude, postopLeft.longitude)];
		// const tile = bboxToTile(bbox.reverse())
		// const key = `${tile[0]},${tile[1]},${tile[2]}`
		// const toHandle = this.getChildrenToTraverse(this.nodeMap.get(key) || view.children[0]);
		// let count  =0;
		// view.children[0].traverse((node) =>
		// {
		// 	count++});
		const toHandle = this.getChildrenToTraverse(view.children[0]);
		// console.log('toHandle', toHandle.length, bbox.join(','), tile, count);
		toHandle.forEach( (node) => {return this.handleNode(node, camera, minZoom, maxZoom);});
	}
}
