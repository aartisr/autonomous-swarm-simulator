/**
 * Operational 3D Theater View using Three.js.
 * Renders 3D terrain grid, drone & rover models with spinning rotors,
 * downward lidar sensor cones, 3D RRT* trees, trajectory splines,
 * and dynamic radar/jammer threat domes.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Agent, EmergencyCollisionAlert, ReconTarget, ThreatZone } from '../../types/simulation';
import { simulationEngine } from '../../engine/simulationEngine';
import {
  AlertOctagon,
  AlertTriangle,
  Eye,
  Focus,
  GitBranch,
  Maximize2,
  Radio,
  RotateCcw,
  Route,
  ShieldAlert,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { VioDriftOverlay } from './VioDriftOverlay';
import { PathPlannerOverlay } from './PathPlannerOverlay';

export interface ThreatIntersectionItem {
  agentId: string;
  callsign: string;
  threatName: string;
  threatType: string;
  x: number;
  y: number;
  z: number;
  distToThreatCenter: number;
  threatRadius: number;
  isTraversed: boolean;
  threatColor: string;
}

export const Operational3DView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cameraMode, setCameraMode] = useState<'free' | 'follow'>('free');
  const [showSearchTree, setShowSearchTree] = useState<boolean>(true);
  const [showFrontierNodes, setShowFrontierNodes] = useState<boolean>(true);
  const [showSolutionPath, setShowSolutionPath] = useState<boolean>(true);
  const [treeOpacity, setTreeOpacity] = useState<number>(0.35);
  const [showPlannerOverlay, setShowPlannerOverlay] = useState<boolean>(true);
  const [showSensorFrustums, setShowSensorFrustums] = useState<boolean>(true);
  const [showDriftEllipses, setShowDriftEllipses] = useState<boolean>(true);
  const [showGhostMarkers, setShowGhostMarkers] = useState<boolean>(true);
  const [showGroundFootprints, setShowGroundFootprints] = useState<boolean>(true);
  const [showAgentTrails, setShowAgentTrails] = useState<boolean>(true);
  const [showThreatIntersections, setShowThreatIntersections] = useState<boolean>(true);
  const [threatIntersectionsList, setThreatIntersectionsList] = useState<ThreatIntersectionItem[]>([]);
  const [showCollisionAlerts, setShowCollisionAlerts] = useState<boolean>(true);
  const [collisionAlertsList, setCollisionAlertsList] = useState<EmergencyCollisionAlert[]>([]);
  const [isVisualFlashing, setIsVisualFlashing] = useState<boolean>(false);
  const [dismissedToast, setDismissedToast] = useState<boolean>(false);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [webGlSupported, setWebGlSupported] = useState<boolean>(true);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);

  // Synchronize options in ref so Three.js render loop always has latest settings without rebuilding the scene
  const optionsRef = useRef({
    cameraMode,
    focusedAgentId,
    showSearchTree,
    showFrontierNodes,
    showSolutionPath,
    treeOpacity,
    showSensorFrustums,
    showDriftEllipses,
    showGhostMarkers,
    showGroundFootprints,
    showAgentTrails,
    showThreatIntersections,
    showCollisionAlerts,
  });

  useEffect(() => {
    optionsRef.current = {
      cameraMode,
      focusedAgentId,
      showSearchTree,
      showFrontierNodes,
      showSolutionPath,
      treeOpacity,
      showSensorFrustums,
      showDriftEllipses,
      showGhostMarkers,
      showGroundFootprints,
      showAgentTrails,
      showThreatIntersections,
      showCollisionAlerts,
    };
  }, [
    cameraMode,
    focusedAgentId,
    showSearchTree,
    showFrontierNodes,
    showSolutionPath,
    treeOpacity,
    showSensorFrustums,
    showDriftEllipses,
    showGhostMarkers,
    showGroundFootprints,
    showAgentTrails,
    showThreatIntersections,
    showCollisionAlerts,
  ]);

  // References to keep Three.js state across re-renders
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Drone 3D meshes map: agentId -> THREE.Group
  const agentMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  // Rotors ref for spinning animation: Array<{ rotorMesh: THREE.Mesh; speed: number }>
  const rotorsRef = useRef<{ mesh: THREE.Mesh; speed: number }[]>([]);
  // Target 3D meshes map: targetId -> THREE.Group
  const targetMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  // Threat 3D meshes map: threatId -> THREE.Group
  const threatMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  // RRT* tree line objects
  const rrtLinesGroupRef = useRef<THREE.Group | null>(null);
  // Trajectory lines group
  const trajectoryGroupRef = useRef<THREE.Group | null>(null);
  // VIO drift error ellipsoids and deviation lines group
  const vioDriftGroupRef = useRef<THREE.Group | null>(null);
  // Persistent traversed agent trail lines group
  const agentTrailsGroupRef = useRef<THREE.Group | null>(null);
  // Dynamic threat intersection highlights group
  const threatIntersectionsGroupRef = useRef<THREE.Group | null>(null);
  // Emergency collision alerts and safety buffer wireframes group
  const collisionAlertsGroupRef = useRef<THREE.Group | null>(null);
  // Agent trail breadcrumbs history: agentId -> Array<{ x, y, z, time }>
  const agentTrailsHistoryRef = useRef<Map<string, Array<{ x: number; y: number; z: number; time: number }>>>(new Map());
  const lastAlertUpdateRef = useRef<number>(0);
  const activeIntersectionCountRef = useRef<number>(0);
  const activeCollisionCountRef = useRef<number>(0);
  const lastCollisionCheckRef = useRef<number>(0);
  const lastBeepTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera Orbit controls state
  const orbitRef = useRef({
    radius: 260,
    theta: Math.PI / 4, // azimuth
    phi: Math.PI / 3.2, // elevation
    target: new THREE.Vector3(0, 0, 10),
    isDragging: false,
    prevMouseX: 0,
    prevMouseY: 0,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090e);
    scene.fog = new THREE.FogExp2(0x07090e, 0.0022);
    sceneRef.current = scene;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. Renderer setup with safe WebGL capability detection
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      console.warn('WebGL is not available in current environment:', err);
      setWebGlSupported(false);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = false;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x06b6d4, 1.2);
    dirLight1.position.set(100, 150, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x3b82f6, 0.6);
    dirLight2.position.set(-100, -100, 80);
    scene.add(dirLight2);

    // 5. Tactical Ground Terrain & Grid
    createTacticalGround(scene);

    // 6. Groups for dynamic path & tree lines
    const rrtGroup = new THREE.Group();
    scene.add(rrtGroup);
    rrtLinesGroupRef.current = rrtGroup;

    const trajGroup = new THREE.Group();
    scene.add(trajGroup);
    trajectoryGroupRef.current = trajGroup;

    const vioGroup = new THREE.Group();
    scene.add(vioGroup);
    vioDriftGroupRef.current = vioGroup;

    const trailsGroup = new THREE.Group();
    scene.add(trailsGroup);
    agentTrailsGroupRef.current = trailsGroup;

    const intersectionsGroup = new THREE.Group();
    scene.add(intersectionsGroup);
    threatIntersectionsGroupRef.current = intersectionsGroup;

    const collisionAlertsGroup = new THREE.Group();
    scene.add(collisionAlertsGroup);
    collisionAlertsGroupRef.current = collisionAlertsGroup;

    // 7. Mouse Orbit interaction handlers
    const onMouseDown = (e: MouseEvent) => {
      orbitRef.current.isDragging = true;
      orbitRef.current.prevMouseX = e.clientX;
      orbitRef.current.prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!orbitRef.current.isDragging) return;
      const dx = e.clientX - orbitRef.current.prevMouseX;
      const dy = e.clientY - orbitRef.current.prevMouseY;
      orbitRef.current.prevMouseX = e.clientX;
      orbitRef.current.prevMouseY = e.clientY;

      orbitRef.current.theta -= dx * 0.006;
      orbitRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2.05, orbitRef.current.phi - dy * 0.006));
      updateCameraPosition();
    };

    const onMouseUp = () => {
      orbitRef.current.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.radius = Math.max(60, Math.min(480, orbitRef.current.radius + e.deltaY * 0.3));
      updateCameraPosition();
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // 8. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    resizeObserver.observe(container);

    // 9. Main Animation Loop
    let lastTime = performance.now();
    const animate = (time: number) => {
      animFrameRef.current = requestAnimationFrame(animate);
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // Spin rotors
      for (const item of rotorsRef.current) {
        item.mesh.rotation.y += item.speed * dt * 40;
      }

      // Sync 3D scene elements with simulationEngine state
      syncSceneElements(scene);

      // Camera follow logic if an agent is selected
      const currentOptions = optionsRef.current;
      if (currentOptions.cameraMode === 'follow' && currentOptions.focusedAgentId) {
        const agent = simulationEngine.agents.find((a) => a.id === currentOptions.focusedAgentId);
        if (agent) {
          orbitRef.current.target.lerp(
            new THREE.Vector3(agent.truePose.x, agent.truePose.y, agent.truePose.z),
            0.08
          );
          updateCameraPosition();
        }
      }

      renderer.render(scene, camera);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      agentMeshesRef.current.clear();
      targetMeshesRef.current.clear();
      threatMeshesRef.current.clear();
      collisionAlertsGroupRef.current?.clear();
      agentTrailsHistoryRef.current.clear();
      rotorsRef.current = [];
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []); // Run Three.js setup once on mount; dynamic options synced via optionsRef

  const updateCameraPosition = () => {
    if (!cameraRef.current) return;
    const { radius, theta, phi, target } = orbitRef.current;
    const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    const y = target.y + radius * Math.sin(phi) * Math.cos(theta);
    const z = target.z + radius * Math.cos(phi);

    cameraRef.current.position.set(x, y, z);
    cameraRef.current.up.set(0, 0, 1); // Z-up aerospace coordinate frame
    cameraRef.current.lookAt(target);
  };

  const createTacticalGround = (scene: THREE.Scene) => {
    // Ground plane with aerospace grid
    const size = 300;
    const divisions = 30;
    const grid = new THREE.GridHelper(size, divisions, 0x06b6d4, 0x1e293b);
    grid.rotation.x = Math.PI / 2; // Orient grid flat on XY plane
    grid.position.z = 0;
    scene.add(grid);

    // Subtle dark circular perimeter ring
    const ringGeo = new THREE.RingGeometry(138, 140, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x334155,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    scene.add(ring);
  };

  /**
   * Syncs agents, targets, threats, and RRT* paths with Three.js scene.
   */
  const syncSceneElements = (scene: THREE.Scene) => {
    const opts = optionsRef.current;

    // 1. Sync Agents
    for (const agent of simulationEngine.agents) {
      let group = agentMeshesRef.current.get(agent.id);
      if (!group) {
        group = createAgent3DMesh(agent);
        scene.add(group);
        agentMeshesRef.current.set(agent.id, group);
      }

      // Position (Z is up in our coordinate system)
      group.position.set(agent.truePose.x, agent.truePose.y, agent.truePose.z);
      group.rotation.z = agent.truePose.yaw;

      // Color/status highlight if selected or jammed
      const bodyMesh = group.getObjectByName('agent_body') as THREE.Mesh;
      if (bodyMesh && bodyMesh.material) {
        const mat = bodyMesh.material as THREE.MeshStandardMaterial;
        if (agent.id === opts.focusedAgentId) {
          mat.emissive.setHex(0x06b6d4);
        } else if (agent.gpsStatus === 'denied') {
          mat.emissive.setHex(0xf43f5e);
        } else {
          mat.emissive.setHex(0x000000);
        }
      }

      // Sensor Frustum toggle
      const frustum = group.getObjectByName('sensor_frustum');
      if (frustum) {
        frustum.visible = opts.showSensorFrustums;
      }
    }

    // 2. Sync Targets
    for (const target of simulationEngine.targets) {
      let group = targetMeshesRef.current.get(target.id);
      if (!group) {
        group = createTarget3DMesh(target);
        scene.add(group);
        targetMeshesRef.current.set(target.id, group);
      }

      group.position.set(target.position.x, target.position.y, target.position.z);
      // Floating bobbing effect
      group.position.z = target.position.z + Math.sin(performance.now() * 0.003 + target.priority) * 1.2;
      group.rotation.z += 0.015;

      // Color based on status
      const diamond = group.getObjectByName('target_diamond') as THREE.Mesh;
      if (diamond && diamond.material) {
        const mat = diamond.material as THREE.MeshStandardMaterial;
        if (target.status === 'scouted') {
          mat.color.setHex(0x10b981); // Emerald
          group.visible = true;
        } else if (target.currentWinner) {
          mat.color.setHex(0x3b82f6); // Allocated Blue
        } else {
          mat.color.setHex(0xf59e0b); // Unassigned Amber
        }
      }
    }

    // 3. Sync Dynamic Threats
    for (const threat of simulationEngine.threats) {
      let group = threatMeshesRef.current.get(threat.id);
      if (!group) {
        group = createThreat3DMesh(threat);
        scene.add(group);
        threatMeshesRef.current.set(threat.id, group);
      }

      group.position.set(threat.center.x, threat.center.y, threat.center.z);
      group.visible = threat.isActive;

      // Pulse jammer radius slightly
      if (threat.type === 'jamming_emitter') {
        const scale = 1 + Math.sin(performance.now() * 0.005) * 0.03;
        group.scale.set(scale, scale, 1);
      }
    }

    // 4. Sync Dynamic Pathfinding Search Trees (RRT* & A*)
    if (rrtLinesGroupRef.current) {
      rrtLinesGroupRef.current.clear();
      if (opts.showSearchTree) {
        for (const agent of simulationEngine.agents) {
          if (!agent.isAlive) continue;
          if (opts.focusedAgentId && agent.id !== opts.focusedAgentId) continue;

          // RRT* Search Tree Branches & Nodes
          if (simulationEngine.config.pathfindingAlgo === 'RRT*' && agent.rrtTree && agent.rrtTree.nodes.length > 1) {
            const treeMat = new THREE.LineBasicMaterial({
              color: new THREE.Color(agent.color),
              transparent: true,
              opacity: opts.focusedAgentId ? Math.min(0.9, opts.treeOpacity * 1.5) : opts.treeOpacity,
            });

            const points: THREE.Vector3[] = [];
            const frontierPoints: THREE.Vector3[] = [];
            const nodeMap = new Map(agent.rrtTree.nodes.map((n) => [n.id, n]));

            for (const n of agent.rrtTree.nodes) {
              if (opts.showFrontierNodes) {
                frontierPoints.push(new THREE.Vector3(n.x, n.y, n.z));
              }
              if (n.parentId !== null) {
                const parent = nodeMap.get(n.parentId);
                if (parent) {
                  points.push(new THREE.Vector3(n.x, n.y, n.z));
                  points.push(new THREE.Vector3(parent.x, parent.y, parent.z));
                }
              }
            }

            if (points.length > 0) {
              const geom = new THREE.BufferGeometry().setFromPoints(points);
              const lineSegments = new THREE.LineSegments(geom, treeMat);
              rrtLinesGroupRef.current.add(lineSegments);
            }

            if (opts.showFrontierNodes && frontierPoints.length > 0) {
              const ptGeom = new THREE.BufferGeometry().setFromPoints(frontierPoints);
              const ptMat = new THREE.PointsMaterial({
                color: new THREE.Color(agent.color),
                size: 2.2,
                transparent: true,
                opacity: 0.65,
              });
              const pts = new THREE.Points(ptGeom, ptMat);
              rrtLinesGroupRef.current.add(pts);
            }
          }

          // A* 3D Lattice Search Branches & Explored Cells
          if (simulationEngine.config.pathfindingAlgo === 'A*' && agent.aStarTree && agent.aStarTree.exploredNodes.length > 1) {
            const aStarMat = new THREE.LineBasicMaterial({
              color: new THREE.Color(0x38bdf8), // Sky blue lattice
              transparent: true,
              opacity: opts.focusedAgentId ? Math.min(0.85, opts.treeOpacity * 1.4) : opts.treeOpacity * 0.9,
            });

            const points: THREE.Vector3[] = [];
            const frontierPoints: THREE.Vector3[] = [];

            for (const node of agent.aStarTree.exploredNodes) {
              if (opts.showFrontierNodes) {
                frontierPoints.push(new THREE.Vector3(node.x, node.y, node.z));
              }
              if (node.parent) {
                points.push(new THREE.Vector3(node.x, node.y, node.z));
                points.push(new THREE.Vector3(node.parent.x, node.parent.y, node.parent.z));
              }
            }

            if (points.length > 0) {
              const geom = new THREE.BufferGeometry().setFromPoints(points);
              const lineSegments = new THREE.LineSegments(geom, aStarMat);
              rrtLinesGroupRef.current.add(lineSegments);
            }

            if (opts.showFrontierNodes && frontierPoints.length > 0) {
              const ptGeom = new THREE.BufferGeometry().setFromPoints(frontierPoints);
              const ptMat = new THREE.PointsMaterial({
                color: 0xc084fc, // Purple frontier points
                size: 2.8,
                transparent: true,
                opacity: 0.75,
              });
              const pts = new THREE.Points(ptGeom, ptMat);
              rrtLinesGroupRef.current.add(pts);
            }
          }
        }
      }
    }

    // 5. Sync Trajectory Paths
    if (trajectoryGroupRef.current) {
      trajectoryGroupRef.current.clear();
      if (opts.showSolutionPath) {
        for (const agent of simulationEngine.agents) {
          if (agent.path.length > 1) {
            const isSpotlight = !opts.focusedAgentId || agent.id === opts.focusedAgentId;
            const pathPoints = agent.path.map((p) => new THREE.Vector3(p.x, p.y, p.z));
            const geom = new THREE.BufferGeometry().setFromPoints(pathPoints);
            const mat = new THREE.LineBasicMaterial({
              color: new THREE.Color(agent.color),
              linewidth: 2,
              transparent: true,
              opacity: isSpotlight ? 0.9 : 0.25,
            });
            const pathLine = new THREE.Line(geom, mat);
            trajectoryGroupRef.current.add(pathLine);
          }
        }
      }
    }

    // 6. Sync VIO Drift Error Ellipsoids & Deviation Vectors
    if (vioDriftGroupRef.current) {
      vioDriftGroupRef.current.clear();

      for (const agent of simulationEngine.agents) {
        if (!agent.isAlive) continue;

        const isJammed = agent.gpsStatus === 'denied';
        const sigma = Math.max(1.6, agent.covarianceSigma);
        const estPos = agent.estimatedPose;
        const truePos = agent.truePose;
        const dx = estPos.x - truePos.x;
        const dy = estPos.y - truePos.y;
        const dz = estPos.z - truePos.z;
        const driftDist = Math.hypot(dx, dy, dz);
        const colorHex = isJammed ? 0xf43f5e : 0x06b6d4;

        // 6A. 3D Covariance Uncertainty Ellipsoid Shell
        if (opts.showDriftEllipses) {
          const rx = sigma;
          const ry = sigma;
          const rz = Math.max(1.2, sigma * 0.45); // Flatter along Z (barometric altimeter aiding)

          // Wireframe cage
          const cageGeo = new THREE.SphereGeometry(1, 14, 10);
          cageGeo.scale(rx, ry, rz);
          const cageMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            wireframe: true,
            transparent: true,
            opacity: isJammed ? 0.42 : 0.16,
          });
          const cageMesh = new THREE.Mesh(cageGeo, cageMat);
          cageMesh.position.set(estPos.x, estPos.y, estPos.z);
          vioDriftGroupRef.current.add(cageMesh);

          // Translucent inner volumetric core
          const coreGeo = new THREE.SphereGeometry(1, 14, 10);
          coreGeo.scale(rx * 0.95, ry * 0.95, rz * 0.95);
          const coreMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: isJammed ? 0.09 : 0.03,
            depthWrite: false,
          });
          const coreMesh = new THREE.Mesh(coreGeo, coreMat);
          coreMesh.position.set(estPos.x, estPos.y, estPos.z);
          vioDriftGroupRef.current.add(coreMesh);
        }

        // 6B. Truth-to-Estimated Deviation Vector Line
        if (driftDist > 0.3) {
          const linePoints = [
            new THREE.Vector3(truePos.x, truePos.y, truePos.z),
            new THREE.Vector3(estPos.x, estPos.y, estPos.z),
          ];
          const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
          const lineMat = new THREE.LineBasicMaterial({
            color: isJammed ? 0xf43f5e : 0xf59e0b,
            transparent: true,
            opacity: 0.9,
          });
          const devLine = new THREE.Line(lineGeom, lineMat);
          vioDriftGroupRef.current.add(devLine);
        }

        // 6C. Perceived Ghost Marker (Where internal navigation filter believes agent is)
        if (opts.showGhostMarkers && (isJammed || driftDist > 0.8)) {
          const ghostGeo = new THREE.OctahedronGeometry(1.6, 0);
          const ghostMat = new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            wireframe: true,
            transparent: true,
            opacity: 0.85,
          });
          const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
          ghostMesh.position.set(estPos.x, estPos.y, estPos.z);
          ghostMesh.rotation.z = estPos.yaw;
          vioDriftGroupRef.current.add(ghostMesh);
        }

        // 6D. Ground Uncertainty Footprint & Vertical Altitude Drop Line
        if (opts.showGroundFootprints) {
          const groundRingGeo = new THREE.RingGeometry(
            Math.max(0.6, sigma - 0.4),
            sigma,
            24
          );
          const groundRingMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: isJammed ? 0.35 : 0.14,
          });
          const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
          groundRing.position.set(estPos.x, estPos.y, 0.2);
          vioDriftGroupRef.current.add(groundRing);

          // Altitude drop line from estimated pose down to ground footprint
          const dropPoints = [
            new THREE.Vector3(estPos.x, estPos.y, estPos.z),
            new THREE.Vector3(estPos.x, estPos.y, 0.2),
          ];
          const dropGeom = new THREE.BufferGeometry().setFromPoints(dropPoints);
          const dropMat = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.22,
          });
          const dropLine = new THREE.Line(dropGeom, dropMat);
          vioDriftGroupRef.current.add(dropLine);
        }
      }
    }

    // 7. Sync Persistent Traversed Agent Trails
    if (agentTrailsGroupRef.current) {
      agentTrailsGroupRef.current.clear();
      const histories = agentTrailsHistoryRef.current;

      // Update trail histories for active agents
      for (const agent of simulationEngine.agents) {
        if (!agent.isAlive) continue;
        let trail = histories.get(agent.id);
        if (!trail) {
          trail = [];
          histories.set(agent.id, trail);
        }

        const last = trail[trail.length - 1];
        const cur = agent.truePose;
        // Sample new point if moved more than 0.6m or first point
        if (!last || Math.hypot(cur.x - last.x, cur.y - last.y, cur.z - last.z) >= 0.6) {
          trail.push({ x: cur.x, y: cur.y, z: cur.z, time: performance.now() });
          if (trail.length > 120) {
            trail.shift();
          }
        }
      }

      if (opts.showAgentTrails) {
        for (const agent of simulationEngine.agents) {
          if (!agent.isAlive) continue;
          if (opts.focusedAgentId && agent.id !== opts.focusedAgentId) continue;
          const trail = histories.get(agent.id);
          if (!trail || trail.length < 2) continue;

          const isSpotlight = !opts.focusedAgentId || agent.id === opts.focusedAgentId;
          const agentCol = new THREE.Color(agent.color);

          // Build line segment pairs with fading vertex colors
          const positions: number[] = [];
          const colors: number[] = [];
          const shadowPositions: number[] = [];
          const shadowColors: number[] = [];

          const len = trail.length;
          for (let i = 0; i < len - 1; i++) {
            const p1 = trail[i];
            const p2 = trail[i + 1];

            // Progress from 0 (oldest) to 1 (newest)
            const alpha1 = Math.max(0.08, Math.pow(i / (len - 1), 1.6));
            const alpha2 = Math.max(0.12, Math.pow((i + 1) / (len - 1), 1.6));

            positions.push(p1.x, p1.y, p1.z);
            positions.push(p2.x, p2.y, p2.z);

            colors.push(
              agentCol.r * alpha1,
              agentCol.g * alpha1,
              agentCol.b * alpha1
            );
            colors.push(
              agentCol.r * alpha2,
              agentCol.g * alpha2,
              agentCol.b * alpha2
            );

            // Ground shadow breadcrumb projection
            shadowPositions.push(p1.x, p1.y, 0.12);
            shadowPositions.push(p2.x, p2.y, 0.12);
            shadowColors.push(
              agentCol.r * alpha1 * 0.22,
              agentCol.g * alpha1 * 0.22,
              agentCol.b * alpha1 * 0.22
            );
            shadowColors.push(
              agentCol.r * alpha2 * 0.22,
              agentCol.g * alpha2 * 0.22,
              agentCol.b * alpha2 * 0.22
            );
          }

          // 3D Air Trail
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
          const mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: isSpotlight ? 0.95 : 0.35,
          });
          const trailLine = new THREE.LineSegments(geom, mat);
          agentTrailsGroupRef.current.add(trailLine);

          // Ground shadow trail
          const shadowGeom = new THREE.BufferGeometry();
          shadowGeom.setAttribute('position', new THREE.Float32BufferAttribute(shadowPositions, 3));
          shadowGeom.setAttribute('color', new THREE.Float32BufferAttribute(shadowColors, 3));
          const shadowMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: isSpotlight ? 0.45 : 0.15,
          });
          const shadowLine = new THREE.LineSegments(shadowGeom, shadowMat);
          agentTrailsGroupRef.current.add(shadowLine);

          // Breadcrumb waypoint dots along trail
          const dotPositions: THREE.Vector3[] = [];
          for (let i = 0; i < len; i += 6) {
            dotPositions.push(new THREE.Vector3(trail[i].x, trail[i].y, trail[i].z));
          }
          if (dotPositions.length > 0) {
            const dotGeom = new THREE.BufferGeometry().setFromPoints(dotPositions);
            const dotMat = new THREE.PointsMaterial({
              color: agentCol,
              size: 2.4,
              transparent: true,
              opacity: isSpotlight ? 0.75 : 0.25,
            });
            const dots = new THREE.Points(dotGeom, dotMat);
            agentTrailsGroupRef.current.add(dots);
          }
        }
      }
    }

    // 8. Sync Potential Dynamic Threat Intersections
    if (threatIntersectionsGroupRef.current) {
      threatIntersectionsGroupRef.current.clear();
      const detectedIntersections: ThreatIntersectionItem[] = [];

      if (opts.showThreatIntersections) {
        const activeThreats = simulationEngine.threats.filter((t) => t.isActive);

        for (const agent of simulationEngine.agents) {
          if (!agent.isAlive) continue;
          if (opts.focusedAgentId && agent.id !== opts.focusedAgentId) continue;
          const trail = agentTrailsHistoryRef.current.get(agent.id) || [];

          for (const threat of activeThreats) {
            const threatCenter = threat.center;
            const r = threat.radius;
            const isCylinder = threat.type === 'jamming_emitter';

            // A. Check Traversed Path Trail Points for threat penetration
            for (let i = 0; i < trail.length; i++) {
              const pt = trail[i];
              const d2 = isCylinder
                ? Math.hypot(pt.x - threatCenter.x, pt.y - threatCenter.y)
                : Math.hypot(pt.x - threatCenter.x, pt.y - threatCenter.y, pt.z - threatCenter.z);

              // If within threat zone or crossing boundary
              if (d2 <= r) {
                // Sample boundary transitions or newest points
                const isBoundary = Math.abs(d2 - r) < 4.0 || i === trail.length - 1 || i % 6 === 0;
                if (isBoundary) {
                  detectedIntersections.push({
                    agentId: agent.id,
                    callsign: agent.callsign,
                    threatName: threat.name,
                    threatType: threat.type,
                    x: pt.x,
                    y: pt.y,
                    z: pt.z,
                    distToThreatCenter: d2,
                    threatRadius: r,
                    isTraversed: true,
                    threatColor: threat.color,
                  });
                }
              }
            }

            // B. Check Upcoming Planned Trajectory Waypoints for future collision/intersection
            if (agent.path && agent.path.length > 1) {
              const startIdx = Math.max(0, agent.currentWaypointIndex);
              for (let j = startIdx; j < agent.path.length; j++) {
                const wp = agent.path[j];
                const d2 = isCylinder
                  ? Math.hypot(wp.x - threatCenter.x, wp.y - threatCenter.y)
                  : Math.hypot(wp.x - threatCenter.x, wp.y - threatCenter.y, wp.z - threatCenter.z);

                if (d2 <= r + 2.0) {
                  detectedIntersections.push({
                    agentId: agent.id,
                    callsign: agent.callsign,
                    threatName: threat.name,
                    threatType: threat.type,
                    x: wp.x,
                    y: wp.y,
                    z: wp.z,
                    distToThreatCenter: d2,
                    threatRadius: r,
                    isTraversed: false,
                    threatColor: threat.color,
                  });
                }
              }
            }
          }
        }

        // Dedup nearby points within 4 meters for same threat
        const deduped: ThreatIntersectionItem[] = [];
        for (const item of detectedIntersections) {
          const exists = deduped.some(
            (d) => Math.hypot(d.x - item.x, d.y - item.y, d.z - item.z) < 4.5 && d.threatName === item.threatName
          );
          if (!exists) deduped.push(item);
        }

        // Render 3D Visual Warning Markers for Detected Intersections
        const timeNow = performance.now();
        const pulse = 1 + Math.sin(timeNow * 0.006) * 0.25;

        for (const item of deduped) {
          const alertColor = item.isTraversed ? 0xf43f5e : 0xf59e0b; // Rose for traversed breach, Amber for projected future breach

          // 1. Concentric pulsing hazard beacon ring
          const ringGeo = new THREE.RingGeometry(2.0 * pulse, 2.7 * pulse, 20);
          const ringMat = new THREE.MeshBasicMaterial({
            color: alertColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.position.set(item.x, item.y, item.z);
          ringMesh.rotation.x = Math.PI / 2;
          threatIntersectionsGroupRef.current.add(ringMesh);

          // 2. Central glowing hazard octahedron core
          const coreGeo = new THREE.OctahedronGeometry(1.2 * pulse, 0);
          const coreMat = new THREE.MeshBasicMaterial({
            color: alertColor,
            wireframe: true,
            transparent: true,
            opacity: 0.9,
          });
          const coreMesh = new THREE.Mesh(coreGeo, coreMat);
          coreMesh.position.set(item.x, item.y, item.z);
          coreMesh.rotation.y = timeNow * 0.003;
          coreMesh.rotation.z = timeNow * 0.002;
          threatIntersectionsGroupRef.current.add(coreMesh);

          // 3. Vertical warning pillar line down to ground
          const pillarPoints = [
            new THREE.Vector3(item.x, item.y, item.z),
            new THREE.Vector3(item.x, item.y, 0.1),
          ];
          const pillarGeom = new THREE.BufferGeometry().setFromPoints(pillarPoints);
          const pillarMat = new THREE.LineBasicMaterial({
            color: alertColor,
            transparent: true,
            opacity: 0.65,
          });
          const pillarLine = new THREE.Line(pillarGeom, pillarMat);
          threatIntersectionsGroupRef.current.add(pillarLine);

          // 4. Ground warning footprint ring
          const groundRingGeo = new THREE.RingGeometry(3.0, 3.8, 24);
          const groundRingMat = new THREE.MeshBasicMaterial({
            color: alertColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
          });
          const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
          groundRing.position.set(item.x, item.y, 0.15);
          threatIntersectionsGroupRef.current.add(groundRing);

          // 5. Connecting threat vector ray from moving threat center to intersection point
          const threatObj = simulationEngine.threats.find((t) => t.name === item.threatName);
          if (threatObj) {
            const rayPoints = [
              new THREE.Vector3(threatObj.center.x, threatObj.center.y, threatObj.center.z),
              new THREE.Vector3(item.x, item.y, item.z),
            ];
            const rayGeom = new THREE.BufferGeometry().setFromPoints(rayPoints);
            const rayMat = new THREE.LineBasicMaterial({
              color: alertColor,
              transparent: true,
              opacity: 0.45,
            });
            const rayLine = new THREE.Line(rayGeom, rayMat);
            threatIntersectionsGroupRef.current.add(rayLine);
          }
        }

        // Throttle state update in React to keep rendering smooth
        if (
          Math.abs(deduped.length - activeIntersectionCountRef.current) > 0 ||
          timeNow - lastAlertUpdateRef.current > 600
        ) {
          lastAlertUpdateRef.current = timeNow;
          activeIntersectionCountRef.current = deduped.length;
          setThreatIntersectionsList(deduped.slice(0, 5));
        }
      } else {
        if (threatIntersectionsList.length > 0) {
          setThreatIntersectionsList([]);
        }
      }
    }

    // 9. Sync Emergency Collision Alert System (Safety Buffer Overlap Detection)
    if (collisionAlertsGroupRef.current) {
      collisionAlertsGroupRef.current.clear();
      const detectedCollisions: EmergencyCollisionAlert[] = [];
      const SAFETY_BUFFER_RADIUS = 5.0; // 5.0m safety buffer radius per agent
      const COMBINED_BUFFER = SAFETY_BUFFER_RADIUS * 2; // 10.0m total safety threshold

      if (opts.showCollisionAlerts) {
        const liveAgents = simulationEngine.agents.filter((a) => a.isAlive);
        const timeNow = performance.now();

        for (let i = 0; i < liveAgents.length; i++) {
          for (let j = i + 1; j < liveAgents.length; j++) {
            const a1 = liveAgents[i];
            const a2 = liveAgents[j];
            const dx = a1.truePose.x - a2.truePose.x;
            const dy = a1.truePose.y - a2.truePose.y;
            const dz = a1.truePose.z - a2.truePose.z;
            const dist = Math.hypot(dx, dy, dz);

            if (dist < COMBINED_BUFFER) {
              const overlapDepth = COMBINED_BUFFER - dist;
              const overlapPercentage = (overlapDepth / COMBINED_BUFFER) * 100;

              // Significant overlap threshold: >= 25% overlap (separation distance <= 7.5m)
              if (overlapPercentage >= 25) {
                const dvx = a1.trueVel.vx - a2.trueVel.vx;
                const dvy = a1.trueVel.vy - a2.trueVel.vy;
                const dvz = a1.trueVel.vz - a2.trueVel.vz;
                const closureRate = -(dx * dvx + dy * dvy + dz * dvz) / Math.max(0.1, dist);
                const severity: 'warning' | 'critical' = overlapPercentage >= 50 ? 'critical' : 'warning';
                const alertId = `${a1.id}-${a2.id}`;

                detectedCollisions.push({
                  id: alertId,
                  timestamp: timeNow,
                  agent1Id: a1.id,
                  agent1Callsign: a1.callsign,
                  agent1Color: a1.color,
                  agent1Pos: { ...a1.truePose },
                  agent2Id: a2.id,
                  agent2Callsign: a2.callsign,
                  agent2Color: a2.color,
                  agent2Pos: { ...a2.truePose },
                  distance: dist,
                  safetyRadius: SAFETY_BUFFER_RADIUS,
                  combinedBuffer: COMBINED_BUFFER,
                  overlapDepth,
                  overlapPercentage,
                  relativeSpeed: Math.max(0, closureRate),
                  midpoint: {
                    x: (a1.truePose.x + a2.truePose.x) / 2,
                    y: (a1.truePose.y + a2.truePose.y) / 2,
                    z: (a1.truePose.z + a2.truePose.z) / 2,
                  },
                  severity,
                });
              }
            }
          }
        }

        // Render 3D Visual Warning Indicators for Detected Collisions
        const pulse = 1 + Math.sin(timeNow * 0.012) * 0.15;
        for (const collision of detectedCollisions) {
          const isCritical = collision.severity === 'critical';
          const alertColor = isCritical ? 0xef4444 : 0xf59e0b;

          // 1. Safety Buffer Spheres around both agents
          const createBufferMesh = (pos: { x: number; y: number; z: number }) => {
            const bufGroup = new THREE.Group();
            bufGroup.position.set(pos.x, pos.y, pos.z);

            // Pulsing wireframe outer safety hull
            const sphereGeo = new THREE.SphereGeometry(SAFETY_BUFFER_RADIUS * pulse, 16, 12);
            const wireMat = new THREE.MeshBasicMaterial({
              color: alertColor,
              wireframe: true,
              transparent: true,
              opacity: isCritical ? 0.75 : 0.45,
            });
            const wireMesh = new THREE.Mesh(sphereGeo, wireMat);
            bufGroup.add(wireMesh);

            // Translucent inner volumetric hazard core
            const coreGeo = new THREE.SphereGeometry(SAFETY_BUFFER_RADIUS * 0.95 * pulse, 16, 12);
            const coreMat = new THREE.MeshBasicMaterial({
              color: alertColor,
              transparent: true,
              opacity: isCritical ? 0.14 : 0.06,
              depthWrite: false,
            });
            const coreMesh = new THREE.Mesh(coreGeo, coreMat);
            bufGroup.add(coreMesh);

            // Ground warning ring projected under the agent
            const gndGeo = new THREE.RingGeometry(
              SAFETY_BUFFER_RADIUS * 0.85,
              SAFETY_BUFFER_RADIUS * 1.05,
              24
            );
            const gndMat = new THREE.MeshBasicMaterial({
              color: alertColor,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: isCritical ? 0.5 : 0.25,
            });
            const gndMesh = new THREE.Mesh(gndGeo, gndMat);
            gndMesh.position.set(0, 0, -pos.z + 0.15); // Drop to ground
            bufGroup.add(gndMesh);

            return bufGroup;
          };

          collisionAlertsGroupRef.current.add(createBufferMesh(collision.agent1Pos));
          collisionAlertsGroupRef.current.add(createBufferMesh(collision.agent2Pos));

          // 2. High-intensity connecting hazard laser tether between agents
          const tetherPoints = [
            new THREE.Vector3(collision.agent1Pos.x, collision.agent1Pos.y, collision.agent1Pos.z),
            new THREE.Vector3(collision.agent2Pos.x, collision.agent2Pos.y, collision.agent2Pos.z),
          ];
          const tetherGeom = new THREE.BufferGeometry().setFromPoints(tetherPoints);
          const tetherMat = new THREE.LineBasicMaterial({
            color: alertColor,
            linewidth: 3,
            transparent: true,
            opacity: 0.95,
          });
          const tetherLine = new THREE.Line(tetherGeom, tetherMat);
          collisionAlertsGroupRef.current.add(tetherLine);

          // 3. Central Conflict Octahedron Beacon & Shockwave at Midpoint
          const mid = collision.midpoint;
          const midCoreGeo = new THREE.OctahedronGeometry(1.8 * pulse, 0);
          const midCoreMat = new THREE.MeshBasicMaterial({
            color: 0xff0033,
            wireframe: true,
            transparent: true,
            opacity: 0.95,
          });
          const midCoreMesh = new THREE.Mesh(midCoreGeo, midCoreMat);
          midCoreMesh.position.set(mid.x, mid.y, mid.z);
          midCoreMesh.rotation.x = timeNow * 0.005;
          midCoreMesh.rotation.y = timeNow * 0.007;
          collisionAlertsGroupRef.current.add(midCoreMesh);

          // Expanding shockwave rings on ground under collision midpoint
          const shockGeo = new THREE.RingGeometry(3.5 * pulse, 4.8 * pulse, 24);
          const shockMat = new THREE.MeshBasicMaterial({
            color: alertColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
          });
          const shockMesh = new THREE.Mesh(shockGeo, shockMat);
          shockMesh.position.set(mid.x, mid.y, 0.2);
          collisionAlertsGroupRef.current.add(shockMesh);

          // Vertical danger pillar between midpoint and ground
          const midPillarPoints = [
            new THREE.Vector3(mid.x, mid.y, mid.z),
            new THREE.Vector3(mid.x, mid.y, 0.2),
          ];
          const midPillarGeom = new THREE.BufferGeometry().setFromPoints(midPillarPoints);
          const midPillarMat = new THREE.LineBasicMaterial({
            color: alertColor,
            transparent: true,
            opacity: 0.7,
          });
          const midPillarLine = new THREE.Line(midPillarGeom, midPillarMat);
          collisionAlertsGroupRef.current.add(midPillarLine);
        }

        // Throttle React state update for collision alert list and trigger visual flash
        if (
          detectedCollisions.length !== activeCollisionCountRef.current ||
          timeNow - lastCollisionCheckRef.current > 150
        ) {
          lastCollisionCheckRef.current = timeNow;
          const previousCount = activeCollisionCountRef.current;
          activeCollisionCountRef.current = detectedCollisions.length;

          if (detectedCollisions.length > 0) {
            setCollisionAlertsList(detectedCollisions);
            if (previousCount === 0 || detectedCollisions.some((c) => c.severity === 'critical')) {
              triggerVisualFlash();
              playCollisionAudioAlert();
            }
          } else if (previousCount > 0) {
            setCollisionAlertsList([]);
          }
        }
      } else {
        if (collisionAlertsList.length > 0) {
          setCollisionAlertsList([]);
        }
      }
    }
  };

  const createAgent3DMesh = (agent: Agent): THREE.Group => {
    const group = new THREE.Group();

    if (agent.type === 'rover') {
      // Ground Rover 3D Mesh
      const bodyGeo = new THREE.BoxGeometry(4.5, 3.2, 1.6);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(agent.color),
        metalness: 0.8,
        roughness: 0.3,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.name = 'agent_body';
      group.add(body);

      // Sensor mast
      const mastGeo = new THREE.CylinderGeometry(0.2, 0.2, 2.2, 8);
      const mastMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.set(0.8, 0, 1.4);
      mast.rotation.x = Math.PI / 2;
      group.add(mast);
    } else {
      // Quadrotor Drone 3D Mesh
      // Center chassis
      const centerGeo = new THREE.CylinderGeometry(1.4, 1.8, 0.8, 8);
      const centerMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(agent.color),
        metalness: 0.7,
        roughness: 0.25,
      });
      const center = new THREE.Mesh(centerGeo, centerMat);
      center.rotation.x = Math.PI / 2;
      center.name = 'agent_body';
      group.add(center);

      // Cross arms
      const armMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
      const armGeo = new THREE.BoxGeometry(4.8, 0.35, 0.2);
      const arm1 = new THREE.Mesh(armGeo, armMat);
      arm1.rotation.z = Math.PI / 4;
      const arm2 = new THREE.Mesh(armGeo, armMat);
      arm2.rotation.z = -Math.PI / 4;
      group.add(arm1, arm2);

      // 4 Rotors
      const rotorPositions = [
        { x: 1.7, y: 1.7, z: 0.3 },
        { x: -1.7, y: 1.7, z: 0.3 },
        { x: 1.7, y: -1.7, z: 0.3 },
        { x: -1.7, y: -1.7, z: 0.3 },
      ];

      for (let i = 0; i < 4; i++) {
        const rPos = rotorPositions[i];
        const rGeo = new THREE.BoxGeometry(1.6, 0.15, 0.05);
        const rMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
        const rotor = new THREE.Mesh(rGeo, rMat);
        rotor.position.set(rPos.x, rPos.y, rPos.z);
        group.add(rotor);
        rotorsRef.current.push({ mesh: rotor, speed: i % 2 === 0 ? 1 : -1 });
      }

      // Lidar downward sensor frustum cone
      const coneGeo = new THREE.ConeGeometry(5.0, 10.0, 16, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(agent.color),
        transparent: true,
        opacity: 0.08,
        wireframe: true,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.name = 'sensor_frustum';
      cone.position.set(0, 0, -5.0);
      cone.rotation.x = -Math.PI / 2;
      group.add(cone);
    }

    return group;
  };

  const createTarget3DMesh = (target: ReconTarget): THREE.Group => {
    const group = new THREE.Group();

    // Floating Recon Diamond (Octahedron)
    const octGeo = new THREE.OctahedronGeometry(2.4, 0);
    const octMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.25,
    });
    const oct = new THREE.Mesh(octGeo, octMat);
    oct.name = 'target_diamond';
    group.add(oct);

    // Outer wireframe beacon ring
    const ringGeo = new THREE.RingGeometry(3.2, 3.6, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    return group;
  };

  const createThreat3DMesh = (threat: ThreatZone): THREE.Group => {
    const group = new THREE.Group();

    if (threat.type === 'jamming_emitter') {
      // Cylindrical Electronic Warfare Jamming Barrier
      const cylGeo = new THREE.CylinderGeometry(threat.radius, threat.radius, 40, 24, 1, true);
      const cylMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.14,
        wireframe: true,
        side: THREE.DoubleSide,
      });
      const cyl = new THREE.Mesh(cylGeo, cylMat);
      cyl.rotation.x = Math.PI / 2;
      group.add(cyl);
    } else {
      // Radar threat dome hemisphere
      const domeGeo = new THREE.SphereGeometry(threat.radius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const domeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(threat.color),
        transparent: true,
        opacity: 0.12,
        wireframe: true,
        side: THREE.DoubleSide,
      });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.rotation.x = -Math.PI / 2;
      group.add(dome);
    }

    return group;
  };

  const playCollisionAudioAlert = () => {
    if (audioMuted) return;
    const nowMs = performance.now();
    if (nowMs - lastBeepTimeRef.current < 700) return;
    lastBeepTimeRef.current = nowMs;

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtxClass();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(440, t + 0.16);

        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.18);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  };

  const triggerVisualFlash = () => {
    setIsVisualFlashing(true);
    setDismissedToast(false);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => {
      setIsVisualFlashing(false);
    }, 1400);
  };

  const trackCollisionMidpoint = (midpoint: { x: number; y: number; z: number }) => {
    orbitRef.current.target.set(midpoint.x, midpoint.y, midpoint.z);
    orbitRef.current.radius = 80;
    orbitRef.current.phi = Math.PI / 3.4;
    setCameraMode('free');
    setFocusedAgentId(null);
    updateCameraPosition();
  };

  const engageEvasionImpulse = (alert: EmergencyCollisionAlert) => {
    const a1 = simulationEngine.agents.find((a) => a.id === alert.agent1Id);
    const a2 = simulationEngine.agents.find((a) => a.id === alert.agent2Id);
    if (a1 && a2) {
      const dx = a1.truePose.x - a2.truePose.x;
      const dy = a1.truePose.y - a2.truePose.y;
      const dist = Math.hypot(dx, dy) || 1;
      const push = 10.0;
      a1.trueVel.vx += (dx / dist) * push;
      a1.trueVel.vy += (dy / dist) * push;
      a2.trueVel.vx -= (dx / dist) * push;
      a2.trueVel.vy -= (dy / dist) * push;
    }
  };

  const resetCamera = () => {
    orbitRef.current.radius = 260;
    orbitRef.current.theta = Math.PI / 4;
    orbitRef.current.phi = Math.PI / 3.2;
    orbitRef.current.target.set(0, 0, 10);
    setCameraMode('free');
    updateCameraPosition();
  };

  if (!webGlSupported) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#07090e] border border-slate-800 rounded-lg p-6 text-center font-mono select-none">
        <div className="max-w-md bg-[#0c1220] border border-amber-900/60 rounded-lg p-6 shadow-2xl flex flex-col items-center gap-3">
          <ShieldAlert className="w-10 h-10 text-amber-400 animate-pulse" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
            WebGL Context Fallback
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Hardware 3D WebGL context was not acquired in this iframe. The full multi-agent simulation is active on the 2D Tactical Radar and Comms Mesh view!
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setWebGlSupported(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Retry WebGL Context</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-[#07090e] border border-slate-800 rounded-lg overflow-hidden select-none">
      {/* 3D Viewport Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0b0f19] border-b border-slate-800 text-xs z-10">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
            Operational 3D Theater
          </span>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-cyan-400">60 FPS WebGL</span>
        </div>

        {/* Viewport Action Toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowAgentTrails(!showAgentTrails)}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
              showAgentTrails ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
            title="Toggle persistent traversed agent trail lines"
          >
            <Route className="w-3 h-3 text-cyan-400" />
            <span>Trails: {showAgentTrails ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setShowThreatIntersections(!showThreatIntersections)}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
              showThreatIntersections ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
            title="Toggle potential dynamic threat intersection points"
          >
            <AlertOctagon className="w-3 h-3 text-amber-400" />
            <span>Hazard Intersections: {showThreatIntersections ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setShowPlannerOverlay(!showPlannerOverlay)}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
              showPlannerOverlay ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
            title="Toggle Real-Time Path Planner Inspection Overlay"
          >
            <GitBranch className="w-3 h-3 text-cyan-400" />
            <span>Path Trees: {showPlannerOverlay ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setShowSensorFrustums(!showSensorFrustums)}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              showSensorFrustums ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            Lidar Frustum: {showSensorFrustums ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setShowDriftEllipses(!showDriftEllipses)}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
              showDriftEllipses ? 'bg-rose-950/80 text-rose-300 border border-rose-800' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
            title="Toggle 3D VIO Covariance Uncertainty Ellipsoids"
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>VIO Shells: {showDriftEllipses ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setShowCollisionAlerts(!showCollisionAlerts)}
            className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
              showCollisionAlerts
                ? 'bg-rose-950/90 text-rose-300 border border-rose-700'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
            title="Toggle Emergency Collision Alert & Safety Buffer Overlap Monitoring"
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>Collision Guard: {showCollisionAlerts ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => {
              simulationEngine.triggerNearMissScenario();
              triggerVisualFlash();
            }}
            className="px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 bg-red-950 hover:bg-red-900 text-red-200 border border-red-700 shadow-sm"
            title="Force two swarm agents into close proximity to test Emergency Collision Alert"
          >
            <AlertTriangle className="w-3 h-3 text-red-400 animate-pulse" />
            <span>Simulate Near-Miss</span>
          </button>

          <button
            onClick={() => setAudioMuted(!audioMuted)}
            className={`p-1 rounded text-[11px] font-mono transition-colors ${
              audioMuted
                ? 'bg-slate-900 text-slate-500 border border-slate-800 hover:text-slate-300'
                : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
            }`}
            title={audioMuted ? 'Unmute Collision Audio Siren' : 'Mute Collision Audio Siren'}
          >
            {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
          </button>

          <button
            onClick={() => {
              if (simulationEngine.agents.length > 0) {
                const nextId = focusedAgentId
                  ? simulationEngine.agents[
                      (simulationEngine.agents.findIndex((a) => a.id === focusedAgentId) + 1) %
                        simulationEngine.agents.length
                    ].id
                  : simulationEngine.agents[0].id;
                setFocusedAgentId(nextId);
                setCameraMode('follow');
              }
            }}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono border border-slate-700"
            title="Cycle track camera onto swarm agents"
          >
            <Focus className="w-3 h-3 text-cyan-400" />
            <span>{focusedAgentId ? `Track ${focusedAgentId}` : 'Track Agent'}</span>
          </button>

          <button
            onClick={resetCamera}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title="Reset Orbit Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Mount Container */}
      <div ref={containerRef} className="relative flex-1 w-full min-h-[340px] cursor-grab active:cursor-grabbing" />

      {/* Path Planner Search Tree Overlay */}
      {showPlannerOverlay && (
        <PathPlannerOverlay
          agents={simulationEngine.agents}
          focusedAgentId={focusedAgentId}
          onSelectAgent={(id) => {
            setFocusedAgentId(id);
            if (id) setCameraMode('follow');
          }}
          showSearchTree={showSearchTree}
          onToggleSearchTree={() => setShowSearchTree(!showSearchTree)}
          showFrontierNodes={showFrontierNodes}
          onToggleFrontierNodes={() => setShowFrontierNodes(!showFrontierNodes)}
          showSolutionPath={showSolutionPath}
          onToggleSolutionPath={() => setShowSolutionPath(!showSolutionPath)}
          treeOpacity={treeOpacity}
          onChangeTreeOpacity={(val) => setTreeOpacity(val)}
        />
      )}

      {/* VIO Drift Error Analyzer Visual Overlay */}
      <VioDriftOverlay
        agents={simulationEngine.agents}
        focusedAgentId={focusedAgentId}
        onSelectAgent={(id) => {
          setFocusedAgentId(id);
          setCameraMode('follow');
        }}
        showDriftEllipses={showDriftEllipses}
        onToggleDriftEllipses={() => setShowDriftEllipses(!showDriftEllipses)}
        showGhostMarkers={showGhostMarkers}
        onToggleGhostMarkers={() => setShowGhostMarkers(!showGhostMarkers)}
        showGroundFootprints={showGroundFootprints}
        onToggleGroundFootprints={() => setShowGroundFootprints(!showGroundFootprints)}
      />

      {/* Floating Dynamic Threat Intersections Alert HUD */}
      {showThreatIntersections && threatIntersectionsList.length > 0 && (
        <div className="absolute top-12 right-3 z-20 max-w-xs bg-slate-950/90 border border-rose-800/80 rounded-lg p-2.5 backdrop-blur-md shadow-2xl font-mono text-[11px] select-auto">
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-rose-900/60 text-rose-300 font-semibold">
            <div className="flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>THREAT INTERSECTIONS ({threatIntersectionsList.length})</span>
            </div>
            <span className="text-[9px] bg-rose-950 text-rose-300 px-1 py-0.5 rounded border border-rose-800">
              ACTIVE
            </span>
          </div>
          <div className="flex flex-col gap-1.5 mt-2 max-h-36 overflow-y-auto">
            {threatIntersectionsList.map((item, idx) => (
              <div
                key={`${item.agentId}-${idx}`}
                onClick={() => {
                  setFocusedAgentId(item.agentId);
                  setCameraMode('follow');
                }}
                className="cursor-pointer bg-slate-900/80 hover:bg-slate-800 p-1.5 rounded border border-slate-800 hover:border-cyan-700 transition-colors flex items-start justify-between gap-1.5"
                title="Click to track agent in 3D"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-cyan-300">{item.callsign}</span>
                    <span className="text-[9px] text-slate-400">·</span>
                    <span className="text-slate-300 text-[10px] truncate">{item.threatName}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5">
                    {item.isTraversed ? 'Traversed Breach' : 'Trajectory Collision'} · ({item.x.toFixed(0)}, {item.y.toFixed(0)}, {item.z.toFixed(0)}m)
                  </div>
                </div>
                <button
                  type="button"
                  className="text-[9px] px-1.5 py-0.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded shrink-0 self-center"
                >
                  Track
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergency Collision Visual Flash Strobe Overlay */}
      {(isVisualFlashing || collisionAlertsList.length > 0) && showCollisionAlerts && (
        <div className="pointer-events-none absolute inset-0 z-30 transition-all duration-150 overflow-hidden">
          {/* Intense Red Radial Strobe Vignette & Flashing Borders */}
          <div
            className={`absolute inset-0 border-4 border-red-500 shadow-[inset_0_0_100px_rgba(239,68,68,0.75)] ${
              isVisualFlashing ? 'bg-red-600/20 animate-pulse' : 'bg-red-950/10'
            }`}
          />

          {/* Top Emergency Strobe Warning Ticker */}
          <div className="absolute top-0 inset-x-0 bg-red-950/95 border-b-2 border-red-500 px-4 py-1.5 flex items-center justify-between text-red-200 font-mono text-[11px] font-bold tracking-wider uppercase backdrop-blur-md shadow-2xl animate-pulse">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 animate-bounce" />
              <span className="text-white drop-shadow-[0_0_8px_rgba(239,68,68,0.95)]">
                EMERGENCY COLLISION HAZARD // SAFETY BUFFER OVERLAP DETECTED
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-red-900/90 text-red-100 px-2 py-0.5 rounded text-[10px] border border-red-500 font-bold tracking-normal">
                {collisionAlertsList.length > 0
                  ? `${collisionAlertsList[0].overlapPercentage.toFixed(0)}% BUFFER PENETRATION`
                  : 'PROXIMITY WARNING'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Collision Toast Notification in 3D View */}
      {showCollisionAlerts && collisionAlertsList.length > 0 && !dismissedToast && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-3 pointer-events-auto">
          {(() => {
            const topAlert = collisionAlertsList[0];
            const isCritical = topAlert.severity === 'critical';
            return (
              <div
                className={`rounded-lg p-3.5 backdrop-blur-md border-2 font-mono text-xs shadow-2xl transition-all duration-200 ${
                  isCritical
                    ? 'bg-slate-950/95 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)] text-slate-100'
                    : 'bg-slate-950/95 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.5)] text-slate-100'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-red-900/60">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <ShieldAlert
                        className={`w-5 h-5 ${isCritical ? 'text-red-500 animate-bounce' : 'text-amber-400 animate-pulse'}`}
                      />
                      <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                    </div>
                    <div>
                      <div className="font-bold tracking-wider uppercase text-red-300 text-[11px] flex items-center gap-1.5">
                        <span>EMERGENCY COLLISION ALERT</span>
                        {collisionAlertsList.length > 1 && (
                          <span className="bg-red-900 text-red-200 text-[9px] px-1.5 py-0.2 rounded border border-red-600 font-mono">
                            +{collisionAlertsList.length - 1} MORE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Safety Buffer Overlap &bull; Active Evasion Protocol
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        isCritical
                          ? 'bg-red-950 text-red-200 border-red-600 animate-pulse'
                          : 'bg-amber-950 text-amber-200 border-amber-600'
                      }`}
                    >
                      {topAlert.severity}
                    </span>
                    <button
                      onClick={() => setDismissedToast(true)}
                      className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
                      title="Dismiss alert toast"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Agents Involved & Conflict Stats */}
                <div className="mt-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded border border-slate-800">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-bold border"
                        style={{
                          backgroundColor: `${topAlert.agent1Color}22`,
                          borderColor: topAlert.agent1Color,
                          color: topAlert.agent1Color,
                        }}
                      >
                        {topAlert.agent1Callsign}
                      </span>
                      <Zap className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-bold border"
                        style={{
                          backgroundColor: `${topAlert.agent2Color}22`,
                          borderColor: topAlert.agent2Color,
                          color: topAlert.agent2Color,
                        }}
                      >
                        {topAlert.agent2Callsign}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400">Separation: </span>
                      <span className="text-xs font-bold text-red-400">{topAlert.distance.toFixed(1)} m</span>
                      <span className="text-[10px] text-slate-500"> / 10.0m Safe</span>
                    </div>
                  </div>

                  {/* Overlap Progress Gauge */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>Safety Buffer Penetration:</span>
                      <span className="font-bold text-red-400">
                        {topAlert.overlapPercentage.toFixed(0)}% Overlap ({topAlert.overlapDepth.toFixed(1)}m)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                      <div
                        className={`h-full rounded-full transition-all duration-150 ${
                          isCritical
                            ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-red-600 animate-pulse'
                            : 'bg-gradient-to-r from-yellow-500 to-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(10, topAlert.overlapPercentage))}%` }}
                      />
                    </div>
                  </div>

                  {/* Telemetry Details */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
                    <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Closure Rate:</span>
                      <span className="font-mono text-amber-300">
                        {topAlert.relativeSpeed > 0 ? `+${topAlert.relativeSpeed.toFixed(1)} m/s` : 'Diverging'}
                      </span>
                    </div>
                    <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Est. TTI:</span>
                      <span className="font-mono text-red-400 font-bold">
                        {topAlert.relativeSpeed > 0.5
                          ? `${(topAlert.distance / topAlert.relativeSpeed).toFixed(1)}s`
                          : 'Stationary'}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-800">
                    <button
                      onClick={() => trackCollisionMidpoint(topAlert.midpoint)}
                      className="flex-1 py-1 px-2 bg-red-950 hover:bg-red-900 text-red-200 border border-red-700 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1"
                    >
                      <Focus className="w-3 h-3 text-red-400" />
                      <span>Track Hazard Midpoint</span>
                    </button>
                    <button
                      onClick={() => {
                        setFocusedAgentId(topAlert.agent1Id);
                        setCameraMode('follow');
                      }}
                      className="py-1 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-[10px] transition-colors"
                      title={`Follow ${topAlert.agent1Callsign}`}
                    >
                      Track {topAlert.agent1Callsign}
                    </button>
                    <button
                      onClick={() => {
                        setFocusedAgentId(topAlert.agent2Id);
                        setCameraMode('follow');
                      }}
                      className="py-1 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded text-[10px] transition-colors"
                      title={`Follow ${topAlert.agent2Callsign}`}
                    >
                      Track {topAlert.agent2Callsign}
                    </button>
                    <button
                      onClick={() => engageEvasionImpulse(topAlert)}
                      className="py-1 px-2 bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-700 rounded text-[10px] transition-colors flex items-center gap-1"
                      title="Apply instant APF repulsion impulse to safely separate both agents"
                    >
                      <Zap className="w-3 h-3 text-cyan-400" />
                      <span>Evasion Nudge</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Floating Tactical Overlay HUD */}
      <div className="absolute bottom-2 left-2 z-10 pointer-events-none flex flex-col gap-1 text-[10px] font-mono bg-black/60 backdrop-blur-sm p-2 rounded border border-white/10 text-slate-300">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">COORDINATE FRAME:</span>
          <span className="text-cyan-400">ENU (Z-UP)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">CAMERA MODE:</span>
          <span className="text-slate-200 uppercase">{cameraMode}</span>
        </div>
        <div className="text-[9px] text-slate-400">Drag: Orbit · Scroll: Zoom</div>
      </div>
    </div>
  );
};
