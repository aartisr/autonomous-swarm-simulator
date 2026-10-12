/**
 * Types and interfaces for the Autonomous Swarm & Dynamic Pathfinding Simulator.
 */

export type AgentType = 'quadrotor' | 'rover';

export type GpsStatus = 'nominal' | 'degraded' | 'denied';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Pose3D extends Vector3D {
  yaw: number; // in radians
  pitch?: number;
  roll?: number;
}

export interface Twist3D {
  vx: number;
  vy: number;
  vz: number;
  yawRate: number;
}

export interface RrtNode extends Vector3D {
  id: number;
  parentId: number | null;
  cost: number;
}

export interface RrtTree {
  nodes: RrtNode[];
  bestPath: Vector3D[];
  iterationCount: number;
  rewiresCount: number;
  sampleCount: number;
  solved: boolean;
}

export interface AStarNode extends Vector3D {
  parent?: Vector3D;
  gCost: number;
  fCost: number;
}

export interface AStarTree {
  exploredNodes: AStarNode[];
  path: Vector3D[];
  nodesEvaluated: number;
  solved: boolean;
}

export interface Agent {
  id: string;
  callsign: string;
  type: AgentType;
  color: string;
  truePose: Pose3D;
  trueVel: Twist3D;
  estimatedPose: Pose3D;
  covarianceSigma: number; // uncertainty radius in meters
  gpsStatus: GpsStatus;
  battery: number; // 0 - 100%
  batteryDrainRate: number;
  commsRange: number; // meters
  bundle: string[]; // assigned target IDs in sequence
  path: Vector3D[];
  currentWaypointIndex: number;
  rrtTree?: RrtTree;
  aStarTree?: AStarTree;
  isAlive: boolean;
  activeSensors: ('lidar' | 'vio' | 'eo_ir' | 'uwb')[];
  peerLinks: string[]; // IDs of neighboring agents currently in comms range
  role: 'recon_lead' | 'sensor_node' | 'relay_anchor';
}

export interface ReconTarget {
  id: string;
  code: string;
  position: Vector3D;
  priority: number; // 1 (low) to 5 (critical)
  reward: number; // utility reward
  durationRequired: number; // seconds needed to scout
  scoutedProgress: number; // 0 to 1
  currentWinner: string | null;
  winningBid: number;
  bidLedger: Record<string, number>; // agentId -> bid value
  timestampLedger: Record<string, number>; // agentId -> timestamp
  status: 'unassigned' | 'auctioning' | 'assigned' | 'scouted';
  detectedTime: number;
}

export interface ThreatZone {
  id: string;
  type: 'radar_dome' | 'jamming_emitter' | 'kinetic_hazard' | 'terrain_pinnacle';
  name: string;
  center: Vector3D;
  radius: number;
  velocity: { vx: number; vy: number; vz: number };
  intensity: number; // 0 to 1
  isActive: boolean;
  color: string;
}

export interface CbbaLedgerEntry {
  targetId: string;
  targetCode: string;
  priority: number;
  winnerId: string | null;
  winningBid: number;
  agentBids: Record<string, number>;
  consensusRound: number;
  settled: boolean;
}

export interface RosTopicMessage {
  id: string;
  topic: string;
  sourceNode: string;
  timestamp: number;
  qos: 'reliable' | 'best_effort';
  type: string;
  payload: Record<string, unknown>;
}

export interface RosNodeInfo {
  name: string;
  status: 'active' | 'degraded' | 'stalled';
  hz: number;
  publishedTopics: string[];
  subscribedTopics: string[];
  messageCount: number;
}

export interface PathfindingBenchmark {
  algorithm: 'RRT*' | 'A*';
  planningTimeMs: number;
  pathLengthMeters: number;
  nodesEvaluated: number;
  rewiresCount: number;
  obstacleClearanceMeters: number;
  timestamp: number;
}

export interface SimulationConfig {
  swarmSize: number;
  scenario: 'recon_gps_denied' | 'crater_survey' | 'urban_canyon';
  pathfindingAlgo: 'RRT*' | 'A*';
  commsRadius: number; // meters
  vioDriftMultiplier: number; // drift rate in denied zone
  driftNoiseFloor: number; // minimum baseline covariance noise floor in meters
  sensorUncertainty: number; // sensor noise variance scale multiplier (0.5x - 3.0x)
  dynamicObstaclesCount: number;
  simSpeed: number; // 1, 2, 5
  isPlaying: boolean;
  jammingActive: boolean;
  uwbAnchoringActive: boolean;
  selectedAgentId: string | null;
  cameraMode: 'free' | 'follow' | 'top_down';
}

export interface EmergencyCollisionAlert {
  id: string;
  timestamp: number;
  agent1Id: string;
  agent1Callsign: string;
  agent1Color: string;
  agent1Pos: Vector3D;
  agent2Id: string;
  agent2Callsign: string;
  agent2Color: string;
  agent2Pos: Vector3D;
  distance: number;
  safetyRadius: number;
  combinedBuffer: number;
  overlapDepth: number;
  overlapPercentage: number;
  relativeSpeed: number;
  midpoint: Vector3D;
  severity: 'warning' | 'critical';
}
