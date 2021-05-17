import {LODRadial} from "./LODRadial";
import {MapNode} from "../nodes/MapNode";
import {Vector3, Frustum, Matrix4} from "three";

var projection = new Matrix4();
var pov = new Vector3();
var frustum = new Frustum();
var position = new Vector3();

/**
 * Check the planar distance between the nodes center and the view position.
 * 
 * Only subdivides elements inside of the camera frustum.
 *
 * @class LODFrustum
 * @extends {LODRadial}
 */
export class LODFrustum extends LODRadial
{
	constructor()
	{
		super();

		this.subdivideDistance = 120;
	
		this.simplifyDistance = 400;
	
		/**
		 * If true only the central point of the plane geometry will be used
		 * 
		 * Otherwise the object bouding sphere will be tested, providing better results for nodes on frustum edge but will lower performance.
		 * 
		 * @attribute testCenter
		 * @type {boolean}
		 */
		this.testCenter = true;
	}

	handleNode(node, minZoom, maxZoom, inFrustum = false) 
	{
		if (!(node instanceof MapNode)) 
		{
			return true;
		}
		node.getWorldPosition(position);
		var distance = pov.distanceTo(position);
		distance /= Math.pow(2, 20 - node.level);

		 inFrustum = inFrustum || (this.pointOnly ? frustum.containsPoint(position) : frustum.intersectsObject(node));
		//  console.log('handleNode', node.x, node.y, node.level, distance, inFrustum);
		 if (maxZoom > node.level && distance < this.subdivideDistance && inFrustum)
		{
			const subdivded = node.subdivide();
			let allLoading = true;
			if (subdivded) 
			{
				subdivded.forEach((n) => {return allLoading = this.handleNode(n, minZoom, maxZoom, false) && allLoading;});
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
			const simplified = node.parentNode.simplify();
			if (simplified && simplified.level > minZoom) 
			{
				this.handleNode(simplified, minZoom, maxZoom);
			}
			return true;
		}
		else if (inFrustum && minZoom <= node.level )
		{
			if (!node.isReady) 
			{
				node.loadTexture();
			}
			return true;
		}
		else
		{
			return node.isReady;
		}
	}

	updateLOD(view, camera, renderer, scene)
	{
		// const start = Date.now();
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
		// console.log('updateLOD', Date.now() - start, 'ms');
	}
}

