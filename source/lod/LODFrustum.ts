import {LODRadial} from './LODRadial';
import {Frustum, Matrix4, Vector3} from 'three';
import {MapNode} from '../nodes/MapNode';
import { MapHeightNode } from '../nodes/MapHeightNode';
import { MapView } from '../MapView';

const projection = new Matrix4();
const pov = new Vector3();
const frustum = new Frustum();
const position = new Vector3();

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


	protected async handleNode(node, minZoom, maxZoom, inFrustum = false): Promise<boolean>
	{
		if (!(node instanceof MapNode)) 
		{
			return true;
		}

		node.getWorldPosition(position);
		var distance = pov.distanceTo(position);
		distance /= Math.pow(2, 20 - node.level);

		inFrustum = inFrustum || (this.pointOnly ? frustum.containsPoint(position) : frustum.intersectsObject(node));
		if (maxZoom > node.level && distance < this.subdivideDistance && inFrustum)
		{
			node.subdivide();
			const children = node.children;
			let loadingCount = 0;
			if (children) 
			{
				for (let index = 0; index < children.length; index++) {
					const n = children[index];
					if (!(n instanceof MapNode)) 
					{
						continue;
					}
					const result = await this.handleNode(n, minZoom, maxZoom, false);
					if (result) {
						loadingCount++;
					}
				}
				// if (loadingCount > 0 && loadingCount < 4) 
				// {
					// one not in frustum let still hide ourself
					node.isMesh = false;
					node.objectsHolder.visible = false;
				// }
			}
			return loadingCount > 0;
		}
		else if ((node.level > maxZoom || (minZoom < node.level && distance > this.simplifyDistance))  && node.parentNode)
		{
			const parentNode = node.parentNode;
			parentNode.simplify();
			if (parentNode.level > minZoom) 
			{
				await this.handleNode(parentNode, minZoom, maxZoom);
			}
			return true;
		}
		else if (inFrustum && minZoom <= node.level )
		{
			if (!node.isTextureReady || (node instanceof MapHeightNode && !node.isHeightReady)) 
			{
				node.initialize();
			}
			return true;
		}
		else
		{
			return node.isTextureReady && (!(node instanceof MapHeightNode) || node.isHeightReady);
		}
	}

	public updateLOD(view: MapView, camera, renderer, scene): void
	{
		projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		frustum.setFromProjectionMatrix(projection);
		camera.getWorldPosition(pov);
		
		const minZoom = view.provider.minZoom;
		const maxZoom = view.provider.maxZoom + view.provider.maxOverZoom;
		const toHandle = [];
		view.children[0].traverseVisible((node) => {return toHandle.push(node);});
		toHandle.forEach( (node) =>
		{		
			if (node.children.length <=1) 
			{
				this.handleNode(node, minZoom, maxZoom);

			}
		});

		// view.children[0].traverse((node) =>
		// {	
		// 	this.handleNode(node, minZoom, maxZoom);
		// });
	}
}
