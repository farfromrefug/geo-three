import {Mesh, MeshBasicMaterial, Vector3, Matrix4, Quaternion} from "three";
import {MapNode} from "./MapNode";
import {MapSphereNodeGeometry} from "../geometries/MapSphereNodeGeometry";
import {UnitsUtils} from "../utils/UnitsUtils";

/** 
 * Represents a map tile node.
 * 
 * A map node can be subdivided into other nodes (Quadtree).
 * 
 * @class MapSphereNode
 */
export class MapSphereNode extends MapNode
{
	constructor(parentNode, mapView, location, level, x, y)
	{
		super(MapSphereNode.createGeometry(level, x, y), new MeshBasicMaterial({wireframe: false}), parentNode, mapView, location, level, x, y);
	
		this.applyScaleNode();
	
		this.matrixAutoUpdate = false;
		this.isMesh = true;
	
		if (this.isReady) 
		{
			this.loadTexture();
		}
	}
	
	/**
	 * Number of segments per node geometry.
	 *
	 * @STATIC
	 * @static SEGMENTS
	 * @type {number}
	 */
	static SEGMENTS = 80;
	
	/**
	 * Create a geometry for a sphere map node.
	 *
	 * @method createGeometry
	 * @param {number} zoom
	 * @param {number} x
	 * @param {number} y
	 */
	static createGeometry(zoom, x, y)
	{
		var range = Math.pow(2, zoom);
		var max = 40;
		var segments = Math.floor(MapSphereNode.SEGMENTS * (max / (zoom + 1)) / max);
	
		// X
		var phiLength = 1 / range * 2 * Math.PI;
		var phiStart = x * phiLength;
	
		// Y
		var thetaLength = 1 / range * Math.PI;
		var thetaStart = y * thetaLength;
	
		return new MapSphereNodeGeometry(1, segments, segments, phiStart, phiLength, thetaStart, thetaLength);
	}
	
	/** 
	 * Apply scale and offset position to the sphere node geometry.
	 *
	 * @method applyScaleNode
	 */
	applyScaleNode()
	{
		this.geometry.computeBoundingBox();
	
		var box = this.geometry.boundingBox.clone();
		var center = box.getCenter(new Vector3());
	
		var matrix = new Matrix4();
		matrix.compose(new Vector3(-center.x, -center.y, -center.z), new Quaternion(), new Vector3(UnitsUtils.EARTH_RADIUS, UnitsUtils.EARTH_RADIUS, UnitsUtils.EARTH_RADIUS));
		this.geometry.applyMatrix4(matrix);
	
		this.position.copy(center);
	
		this.updateMatrix();
		this.updateMatrixWorld();
	}
	
	updateMatrix()
	{
		this.matrix.setPosition(this.position);
		this.matrixWorldNeedsUpdate = true;
	}
	
	updateMatrixWorld(force)
	{
		if (this.matrixWorldNeedsUpdate || force)
		{
			this.matrixWorld.copy(this.matrix);
			this.matrixWorldNeedsUpdate = false;
		}
	}
	
	createChildNodes()
	{
		var level = this.level + 1;
	
		var x = this.x * 2;
		var y = this.y * 2;
	
		var node = new MapSphereNode(this, this.mapView, MapNode.TOP_LEFT, level, x, y);
		this.add(node);
		node.updateMatrix();
		node.updateMatrixWorld(true);
	
		var node = new MapSphereNode(this, this.mapView, MapNode.TOP_RIGHT, level, x + 1, y);
		this.add(node);
		node.updateMatrix();
		node.updateMatrixWorld(true);
	
		var node = new MapSphereNode(this, this.mapView, MapNode.BOTTOM_LEFT, level, x, y + 1);
		this.add(node);
		node.updateMatrix();
		node.updateMatrixWorld(true);
	
		var node = new MapSphereNode(this, this.mapView, MapNode.BOTTOM_RIGHT, level, x + 1, y + 1);
		this.add(node);
		node.updateMatrix();
		node.updateMatrixWorld(true);
	}
	
	/**
	 * Overrides normal raycasting, to avoid raycasting when isMesh is set to false.
	 * 
	 * @method raycast
	 */
	raycast(raycaster, intersects)
	{
		if (this.isMesh === true)
		{
			return Mesh.prototype.raycast.call(this, raycaster, intersects);
		}
	
		return false;
	}
}
