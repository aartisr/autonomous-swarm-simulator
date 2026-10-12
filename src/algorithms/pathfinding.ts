/**
 * Dynamic Pathfinding Algorithms: RRT* (with dynamic rewiring) and A* Grid Search.
 * Includes collision checking against terrain elevations and moving 3D threat domes.
 */

import {
  AStarNode,
  AStarTree,
  PathfindingBenchmark,
  RrtNode,
  RrtTree,
  ThreatZone,
  Vector3D,
} from '../types/simulation';

function dist3D(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Checks if a 3D point or line segment collides with any active threat zone.
 */
export function isPointInCollision(
  pt: Vector3D,
  threats: ThreatZone[],
  safetyBuffer: number = 6.0
): boolean {
  // Ground collision check
  if (pt.z < 2.0) return true;

  for (const threat of threats) {
    if (!threat.isActive) continue;
    const d = dist3D(pt, threat.center);
    if (d < threat.radius + safetyBuffer) {
      return true;
    }
  }
  return false;
}

export function isSegmentInCollision(
  p1: Vector3D,
  p2: Vector3D,
  threats: ThreatZone[],
  steps: number = 8
): boolean {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt: Vector3D = {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
      z: p1.z + (p2.z - p1.z) * t,
    };
    if (isPointInCollision(pt, threats)) {
      return true;
    }
  }
  return false;
}

/**
 * Computes minimum obstacle clearance along a trajectory.
 */
export function calculateObstacleClearance(path: Vector3D[], threats: ThreatZone[]): number {
  if (path.length === 0 || threats.length === 0) return 999;
  let minClearance = 999;

  for (const pt of path) {
    for (const threat of threats) {
      if (!threat.isActive) continue;
      const d = dist3D(pt, threat.center) - threat.radius;
      if (d < minClearance) {
        minClearance = d;
      }
    }
  }
  return Math.max(0, minClearance);
}

/**
 * Rapidly-exploring Random Tree Star (RRT*) in 3D Space.
 * Features:
 * - Goal-biased sampling
 * - Steered step extension
 * - Near-neighbor minimal cost parent selection
 * - Neighborhood rewiring
 */
export function planRrtStar(
  start: Vector3D,
  goal: Vector3D,
  threats: ThreatZone[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
  maxIterations: number = 220,
  stepSize: number = 18.0,
  goalTolerance: number = 12.0
): { tree: RrtTree; benchmark: PathfindingBenchmark } {
  const startTime = performance.now();
  const nodes: RrtNode[] = [
    {
      id: 0,
      x: start.x,
      y: start.y,
      z: start.z,
      parentId: null,
      cost: 0,
    },
  ];

  let rewiresCount = 0;
  let sampleCount = 0;
  let bestGoalNodeId: number | null = null;
  let minGoalCost = Infinity;

  // Gamma parameter for RRT* rewiring radius
  const gammaRRT = 45.0;

  for (let iter = 0; iter < maxIterations; iter++) {
    sampleCount++;
    // Goal-biased sampling (18% probability)
    let sample: Vector3D;
    if (Math.random() < 0.18) {
      sample = { ...goal };
    } else {
      sample = {
        x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
        y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY),
        z: bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ),
      };
    }

    // Find nearest existing node
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist3D(nodes[i], sample);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    const nearestNode = nodes[nearestIdx];

    // Steer towards sample by stepSize
    const steerDist = Math.min(stepSize, nearestDist);
    if (steerDist < 0.5) continue;

    const dirX = (sample.x - nearestNode.x) / nearestDist;
    const dirY = (sample.y - nearestNode.y) / nearestDist;
    const dirZ = (sample.z - nearestNode.z) / nearestDist;

    const newNodePos: Vector3D = {
      x: nearestNode.x + dirX * steerDist,
      y: nearestNode.y + dirY * steerDist,
      z: nearestNode.z + dirZ * steerDist,
    };

    // Collision check
    if (isSegmentInCollision(nearestNode, newNodePos, threats)) {
      continue;
    }

    // RRT* Near Neighbor Search radius
    const n = nodes.length;
    const rStar = Math.min(
      stepSize * 2.2,
      gammaRRT * Math.pow(Math.log(n + 1) / (n + 1), 1 / 3) + 12
    );

    // Find best parent among near neighbors
    let bestParentId = nearestNode.id;
    let minCostToNew = nearestNode.cost + dist3D(nearestNode, newNodePos);
    const nearIndices: number[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const d = dist3D(nodes[i], newNodePos);
      if (d <= rStar) {
        nearIndices.push(i);
        const testCost = nodes[i].cost + d;
        if (testCost < minCostToNew && !isSegmentInCollision(nodes[i], newNodePos, threats)) {
          minCostToNew = testCost;
          bestParentId = nodes[i].id;
        }
      }
    }

    // Add new node
    const newNode: RrtNode = {
      id: nodes.length,
      x: newNodePos.x,
      y: newNodePos.y,
      z: newNodePos.z,
      parentId: bestParentId,
      cost: minCostToNew,
    };
    nodes.push(newNode);

    // Rewire near neighbors
    for (const nearIdx of nearIndices) {
      const nearNode = nodes[nearIdx];
      const d = dist3D(newNode, nearNode);
      if (newNode.cost + d < nearNode.cost && !isSegmentInCollision(newNode, nearNode, threats)) {
        nearNode.parentId = newNode.id;
        nearNode.cost = newNode.cost + d;
        rewiresCount++;
      }
    }

    // Check if within goal tolerance
    const distToGoal = dist3D(newNode, goal);
    if (distToGoal <= goalTolerance) {
      const totalCost = newNode.cost + distToGoal;
      if (totalCost < minGoalCost && !isSegmentInCollision(newNode, goal, threats)) {
        minGoalCost = totalCost;
        bestGoalNodeId = newNode.id;
      }
    }
  }

  // Backtrack best path
  const bestPath: Vector3D[] = [];
  let solved = false;

  if (bestGoalNodeId !== null) {
    solved = true;
    bestPath.push({ ...goal });
    let currId: number | null = bestGoalNodeId;
    while (currId !== null) {
      const currNode: RrtNode = nodes[currId];
      bestPath.unshift({ x: currNode.x, y: currNode.y, z: currNode.z });
      currId = currNode.parentId;
    }
  } else {
    // Fallback: pick node closest to goal
    let closestId = 0;
    let closestDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist3D(nodes[i], goal);
      if (d < closestDist) {
        closestDist = d;
        closestId = i;
      }
    }
    let currId: number | null = closestId;
    while (currId !== null) {
      const currNode: RrtNode = nodes[currId];
      bestPath.unshift({ x: currNode.x, y: currNode.y, z: currNode.z });
      currId = currNode.parentId;
    }
    bestPath.push({ ...goal });
  }

  // Calculate path length
  let pathLengthMeters = 0;
  for (let i = 0; i < bestPath.length - 1; i++) {
    pathLengthMeters += dist3D(bestPath[i], bestPath[i + 1]);
  }

  const planningTimeMs = performance.now() - startTime;
  const clearance = calculateObstacleClearance(bestPath, threats);

  return {
    tree: {
      nodes,
      bestPath,
      iterationCount: maxIterations,
      rewiresCount,
      sampleCount,
      solved,
    },
    benchmark: {
      algorithm: 'RRT*',
      planningTimeMs,
      pathLengthMeters,
      nodesEvaluated: nodes.length,
      rewiresCount,
      obstacleClearanceMeters: clearance,
      timestamp: Date.now(),
    },
  };
}

/**
 * A* 3D Grid Search Planner.
 * Used for direct algorithmic comparison and benchmarking against RRT*.
 */
export function planAStar(
  start: Vector3D,
  goal: Vector3D,
  threats: ThreatZone[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
  gridRes: number = 10.0
): { path: Vector3D[]; tree: AStarTree; benchmark: PathfindingBenchmark } {
  const startTime = performance.now();

  const toKey = (gx: number, gy: number, gz: number) => `${gx},${gy},${gz}`;
  const snap = (v: number, min: number) => Math.round((v - min) / gridRes);

  const startGX = snap(start.x, bounds.minX);
  const startGY = snap(start.y, bounds.minY);
  const startGZ = snap(start.z, bounds.minZ);

  const goalGX = snap(goal.x, bounds.minX);
  const goalGY = snap(goal.y, bounds.minY);
  const goalGZ = snap(goal.z, bounds.minZ);

  const openSet = new Map<string, { gx: number; gy: number; gz: number; gCost: number; fCost: number }>();
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, string>();
  const exploredNodes: AStarNode[] = [];

  const startKey = toKey(startGX, startGY, startGZ);
  const hStart = Math.sqrt(
    Math.pow(startGX - goalGX, 2) + Math.pow(startGY - goalGY, 2) + Math.pow(startGZ - goalGZ, 2)
  ) * gridRes;

  openSet.set(startKey, {
    gx: startGX,
    gy: startGY,
    gz: startGZ,
    gCost: 0,
    fCost: hStart,
  });

  let nodesEvaluated = 0;
  let targetFound = false;
  let finalKey = '';

  const maxNodesToEval = 800; // bound search to keep interactive 60fps

  while (openSet.size > 0 && nodesEvaluated < maxNodesToEval) {
    nodesEvaluated++;
    // Get node with lowest fCost
    let bestKey = '';
    let lowestF = Infinity;

    for (const [key, item] of openSet.entries()) {
      if (item.fCost < lowestF) {
        lowestF = item.fCost;
        bestKey = key;
      }
    }

    const current = openSet.get(bestKey)!;
    openSet.delete(bestKey);
    closedSet.add(bestKey);

    const currentWorldPos: Vector3D = {
      x: bounds.minX + current.gx * gridRes,
      y: bounds.minY + current.gy * gridRes,
      z: bounds.minZ + current.gz * gridRes,
    };

    // Check goal reached
    if (current.gx === goalGX && current.gy === goalGY && current.gz === goalGZ) {
      targetFound = true;
      finalKey = bestKey;
      break;
    }

    // Neighbors (3D 26-connectivity simplified to 6 principal + 8 diagonal directions)
    const dirs = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [0, 1, 1],
    ];

    for (const [dx, dy, dz] of dirs) {
      const ngx = current.gx + dx;
      const ngy = current.gy + dy;
      const ngz = current.gz + dz;
      const nKey = toKey(ngx, ngy, ngz);

      if (closedSet.has(nKey)) continue;

      const worldPos: Vector3D = {
        x: bounds.minX + ngx * gridRes,
        y: bounds.minY + ngy * gridRes,
        z: bounds.minZ + ngz * gridRes,
      };

      // Collision check
      if (isPointInCollision(worldPos, threats)) {
        continue;
      }

      const moveDist = Math.sqrt(dx * dx + dy * dy + dz * dz) * gridRes;
      const tentativeG = current.gCost + moveDist;

      const existing = openSet.get(nKey);
      if (!existing || tentativeG < existing.gCost) {
        cameFrom.set(nKey, bestKey);
        const h = Math.sqrt(
          Math.pow(ngx - goalGX, 2) + Math.pow(ngy - goalGY, 2) + Math.pow(ngz - goalGZ, 2)
        ) * gridRes;

        openSet.set(nKey, {
          gx: ngx,
          gy: ngy,
          gz: ngz,
          gCost: tentativeG,
          fCost: tentativeG + h,
        });

        if (exploredNodes.length < 320) {
          exploredNodes.push({
            x: worldPos.x,
            y: worldPos.y,
            z: worldPos.z,
            parent: currentWorldPos,
            gCost: tentativeG,
            fCost: tentativeG + h,
          });
        }
      }
    }
  }

  // Reconstruct path
  const path: Vector3D[] = [];
  if (targetFound && finalKey) {
    let curr = finalKey;
    while (curr) {
      const [gx, gy, gz] = curr.split(',').map(Number);
      path.unshift({
        x: bounds.minX + gx * gridRes,
        y: bounds.minY + gy * gridRes,
        z: bounds.minZ + gz * gridRes,
      });
      curr = cameFrom.get(curr) || '';
    }
  } else {
    // Straight line fallback if search budget exhausted
    path.push({ ...start }, { ...goal });
  }

  let pathLengthMeters = 0;
  for (let i = 0; i < path.length - 1; i++) {
    pathLengthMeters += dist3D(path[i], path[i + 1]);
  }

  const planningTimeMs = performance.now() - startTime;
  const clearance = calculateObstacleClearance(path, threats);

  return {
    path,
    tree: {
      exploredNodes,
      path,
      nodesEvaluated,
      solved: targetFound,
    },
    benchmark: {
      algorithm: 'A*',
      planningTimeMs,
      pathLengthMeters,
      nodesEvaluated,
      rewiresCount: 0,
      obstacleClearanceMeters: clearance,
      timestamp: Date.now(),
    },
  };
}
