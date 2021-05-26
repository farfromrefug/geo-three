import {LODRadial} from './LODRadial';
import {Frustum, Matrix4, Vector3} from 'three';
import {MapNode} from '../nodes/MapNode';

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


	protected handleNode(node, minZoom, maxZoom, inFrustum = false): boolean
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
			let allLoading = true;
			if (children) 
			{
				children.forEach((n) => {return allLoading = this.handleNode(n, minZoom, maxZoom, false) && allLoading;});
				if (!allLoading) 
				{
					// one not in frustum let still hide ourself
					node.isMesh = false;
					node.objectsHolder.visible = false;
				}
			}
			return allLoading;
		}
		else if (minZoom < node.level && distance > this.simplifyDistance && node.parentNode)
		{
			const parentNode = node.parentNode;
			parentNode.simplify();
			if (parentNode.level > minZoom) 
			{
				this.handleNode(parentNode, minZoom, maxZoom);
			}
			return true;
		}
		else if (inFrustum && minZoom <= node.level )
		{
			if (!node.isReady) 
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

	public updateLOD(view, camera, renderer, scene): void
	{
		projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		frustum.setFromProjectionMatrix(projection);
		camera.getWorldPosition(pov);
		
		const minZoom = view.provider.minZoom;
		const maxZoom = view.provider.maxZoom;
		const toHandle = [];
		view.children[0].traverseVisible((node) => {return toHandle.push(node);});
		toHandle.forEach((node) =>
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
