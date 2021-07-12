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
		node.getWorldPosition(position);
		var worldDistance = pov.distanceTo(position);
		// const distance = worldDistance / Math.pow(2, 20 - node.level) / Math.max(camera.zoom/5, 1);
		const distance = worldDistance / Math.pow(2, 20 - node.level);

		inFrustum = inFrustum || (this.pointOnly ? frustum.containsPoint(position) : frustum.intersectsObject(node));
		// if (!inFrustum) 
		// {
		// 	node.isMesh = false;
		// 	return;
		// }
		// console.log('handleNode', inFrustum, node.level, node.x, node.y);

		if (canSubdivideOrSimplify && (maxZoom > node.level && distance < this.subdivideDistance) && inFrustum)
		{
			node.subdivide();
			const children = node.children;
			if (children) 
			{
				for (let index = 0; index < children.length; index++) 
				{
					const n = children[index];
					if (n instanceof MapNode) 
					{
						this.handleNode(n, camera, minZoom, maxZoom, false);
					}
				}
			}
			node.hide();
		}
		else if (canSubdivideOrSimplify && (node.level > maxZoom || (!inFrustum || minZoom < node.level )&& distance > this.simplifyDistance) && node.parentNode)
		{
			const parentNode = node.parentNode;
			const removed = parentNode.simplify(distance, camera.far);
			this.handleNode(parentNode, camera, minZoom, maxZoom, false, false);
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
			if (child instanceof MapNode && !child.subdivided) 
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

		const toHandle = this.getChildrenToTraverse(view.children[0]);
		// console.log('updateLOD', toHandle.length);
		toHandle.forEach( (node) => {return this.handleNode(node, camera, minZoom, maxZoom);});
	}
}
