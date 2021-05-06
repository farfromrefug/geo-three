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

	updateLOD(view, camera, renderer, scene)
	{
		projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		frustum.setFromProjectionMatrix(projection);
		camera.getWorldPosition(pov);
		
		var self = this;
		const minZoom = view.provider.minZoom;
		const maxZoom = view.provider.maxZoom;
		view.children[0].traverse(function(node)
		{	
			if (!(node instanceof MapNode)) 
			{
				return;
			}
			node.getWorldPosition(position);
			var distance = pov.distanceTo(position);
			distance /= Math.pow(2, maxZoom - node.level);
	
			var inFrustum = self.pointOnly ? frustum.containsPoint(position) : frustum.intersectsObject(node);
	
			if ((minZoom >= node.level || distance < self.subdivideDistance )&& inFrustum)
			{
				node.subdivide();
			}
			else if (minZoom < node.level && distance > self.simplifyDistance && node.parentNode)
			{
				node.parentNode.simplify();
			}
		});
	}
}

