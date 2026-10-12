/**
 * Main Multi-Agent Swarm Simulation Engine.
 * Orchestrates 60 FPS physics integration, dynamic CBBA auctions,
 * real-time RRT-Star and A-Star replanning, VIO drift, and ROS 2 middleware publishing.
 */

import {
  Agent,
  AgentType,
  PathfindingBenchmark,
  ReconTarget,
  SimulationConfig,
  ThreatZone,
  Vector3D,
} from '../types/simulation';
import { CbbaAgentState, runFullCbbaIteration } from '../algorithms/cbba';
import { planAStar, planRrtStar } from '../algorithms/pathfinding';
import {
  applyCooperativeUwbLocalization,
  updateAgentVioDrift,
} from '../algorithms/vioAndCooperativeLocalization';
import { ros2Bus } from './ros2Middleware';

const BOUNDS = {
  minX: -140,
  maxX: 140,
  minY: -140,
  maxY: 140,
  minZ: 2,
  maxZ: 50,
};

const AGENT_COLORS = [
  '#06b6d4', // cyan (uav-alpha)
  '#3b82f6', // blue (uav-bravo)
  '#10b981', // emerald (uav-charlie)
  '#8b5cf6', // purple (uav-delta)
  '#f59e0b', // amber (uav-echo)
  '#ec4899', // pink (uav-foxtrot)
  '#14b8a6', // teal (uav-golf)
  '#6366f1', // indigo (uav-hotel)
  '#84cc16', // lime (uav-india)
  '#eab308', // yellow (uav-juliet)
  '#a855f7', // violet (uav-kilo)
  '#f43f5e', // rose (uav-lima)
];

const CALLSIGNS = [
  'ALPHA-01', 'BRAVO-02', 'CHARLIE-03', 'DELTA-04',
  'ECHO-05', 'FOXTROT-06', 'GOLF-07', 'HOTEL-08',
  'INDIA-09', 'JULIET-10', 'KILO-11', 'LIMA-12',
];

export class SimulationEngine {
  public agents: Agent[] = [];
  public targets: ReconTarget[] = [];
  public threats: ThreatZone[] = [];
  public cbbaStates: Record<string, CbbaAgentState> = {};
  public cbbaEvents: string[] = [];
  public consensusRound: number = 0;
  public isConsensusSettled: boolean = false;
  public missionElapsedTime: number = 0; // seconds
  public lastBenchmark: PathfindingBenchmark | null = null;
  public totalTargetsScouted: number = 0;

  public config: SimulationConfig = {
    swarmSize: 6,
    scenario: 'recon_gps_denied',
    pathfindingAlgo: 'RRT*',
    commsRadius: 95,
    vioDriftMultiplier: 1.2,
    driftNoiseFloor: 1.5,
    sensorUncertainty: 1.0,
    dynamicObstaclesCount: 4,
    simSpeed: 1,
    isPlaying: true,
    jammingActive: true,
    uwbAnchoringActive: true,
    selectedAgentId: null,
    cameraMode: 'free',
  };

  private listeners: Set<() => void> = new Set();
  private lastTickTime: number = performance.now();
  private cbbaAccumulator: number = 0;
  private rosPublishAccumulator: number = 0;
  private replanAccumulator: number = 0;

  constructor() {
    this.initScenario(this.config.scenario);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public initScenario(scenario: SimulationConfig['scenario']): void {
    this.config.scenario = scenario;
    this.missionElapsedTime = 0;
    this.totalTargetsScouted = 0;
    this.cbbaEvents = ['Swarm mission initialized under decentralized protocol.'];
    this.consensusRound = 0;
    this.isConsensusSettled = false;
    this.cbbaStates = {};

    // Generate agents in tactical grid formation
    this.agents = [];
    const count = this.config.swarmSize;
    const spacing = 22;
    const cols = Math.ceil(Math.sqrt(count));

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = (col - cols / 2) * spacing - 70;
      const y = (row - cols / 2) * spacing - 70;
      const z = i % 2 === 0 ? 14 : 20;

      const type: AgentType = i === count - 1 ? 'rover' : 'quadrotor';
      const callsign = CALLSIGNS[i] || `DRONE-${i + 1}`;
      const color = AGENT_COLORS[i % AGENT_COLORS.length];

      const agent: Agent = {
        id: `agent-${i + 1}`,
        callsign,
        type,
        color,
        truePose: { x, y, z: type === 'rover' ? 2 : z, yaw: 0 },
        trueVel: { vx: 0, vy: 0, vz: 0, yawRate: 0 },
        estimatedPose: { x, y, z: type === 'rover' ? 2 : z, yaw: 0 },
        covarianceSigma: 0.6,
        gpsStatus: 'nominal',
        battery: 100 - (i % 3) * 5,
        batteryDrainRate: 0.04,
        commsRange: this.config.commsRadius,
        bundle: [],
        path: [],
        currentWaypointIndex: 0,
        isAlive: true,
        activeSensors: ['lidar', 'vio', 'eo_ir', 'uwb'],
        peerLinks: [],
        role: i === 0 ? 'recon_lead' : i === count - 1 ? 'relay_anchor' : 'sensor_node',
      };

      this.agents.push(agent);
      ros2Bus.registerAgentNodes(callsign);
    }

    // Generate dynamic threat zones
    this.threats = [
      {
        id: 'threat-ew-1',
        type: 'jamming_emitter',
        name: 'EW Jammer Alpha',
        center: { x: 5, y: -10, z: 15 },
        radius: 48,
        velocity: { vx: 1.2, vy: -0.6, vz: 0 },
        intensity: 0.95,
        isActive: this.config.jammingActive,
        color: '#f43f5e',
      },
      {
        id: 'threat-radar-1',
        type: 'radar_dome',
        name: 'SAM Radar Dome Beta',
        center: { x: 45, y: 55, z: 20 },
        radius: 36,
        velocity: { vx: -1.0, vy: 0.8, vz: 0 },
        intensity: 0.8,
        isActive: true,
        color: '#f59e0b',
      },
      {
        id: 'threat-kinetic-1',
        type: 'kinetic_hazard',
        name: 'Hostile Loitering Munition',
        center: { x: -30, y: 40, z: 18 },
        radius: 20,
        velocity: { vx: 3.5, vy: -2.5, vz: 0 },
        intensity: 1.0,
        isActive: true,
        color: '#ef4444',
      },
      {
        id: 'threat-terrain-1',
        type: 'terrain_pinnacle',
        name: 'Ridge Pinnacle Obstacle',
        center: { x: -5, y: 65, z: 28 },
        radius: 26,
        velocity: { vx: 0, vy: 0, vz: 0 },
        intensity: 0.7,
        isActive: true,
        color: '#64748b',
      },
    ];

    // Generate Reconnaissance Targets with priority values
    this.targets = [
      {
        id: 'target-1',
        code: 'TGT-ALPHA',
        position: { x: 30, y: -20, z: 12 },
        priority: 5,
        reward: 95,
        durationRequired: 4.0,
        scoutedProgress: 0,
        currentWinner: null,
        winningBid: 0,
        bidLedger: {},
        timestampLedger: {},
        status: 'unassigned',
        detectedTime: 0,
      },
      {
        id: 'target-2',
        code: 'TGT-BRAVO',
        position: { x: 75, y: 15, z: 16 },
        priority: 4,
        reward: 80,
        durationRequired: 3.5,
        scoutedProgress: 0,
        currentWinner: null,
        winningBid: 0,
        bidLedger: {},
        timestampLedger: {},
        status: 'unassigned',
        detectedTime: 0,
      },
      {
        id: 'target-3',
        code: 'TGT-CHARLIE',
        position: { x: -10, y: 80, z: 22 },
        priority: 5,
        reward: 90,
        durationRequired: 5.0,
        scoutedProgress: 0,
        currentWinner: null,
        winningBid: 0,
        bidLedger: {},
        timestampLedger: {},
        status: 'unassigned',
        detectedTime: 0,
      },
      {
        id: 'target-4',
        code: 'TGT-DELTA',
        position: { x: 60, y: -70, z: 10 },
        priority: 3,
        reward: 60,
        durationRequired: 3.0,
        scoutedProgress: 0,
        currentWinner: null,
        winningBid: 0,
        bidLedger: {},
        timestampLedger: {},
        status: 'unassigned',
        detectedTime: 0,
      },
      {
        id: 'target-5',
        code: 'TGT-ECHO',
        position: { x: -65, y: 25, z: 18 },
        priority: 4,
        reward: 75,
        durationRequired: 4.0,
        scoutedProgress: 0,
        currentWinner: null,
        winningBid: 0,
        bidLedger: {},
        timestampLedger: {},
        status: 'unassigned',
        detectedTime: 0,
      },
      {
        id: 'target-6',
        code: 'TGT-FOXTROT',
        position: { x: -20, y: -60, z: 14 },
        priority: 2,
        reward: 50,
        durationRequired: 2.5,
        scoutedProgress: 0,
        currentWinner: null,
        winningBid: 0,
        bidLedger: {},
        timestampLedger: {},
        status: 'unassigned',
        detectedTime: 0,
      },
      {
        id: 'target-7',
        code: 'TGT-GOLF',
        position: { x: 85, y: 70, z: 24 },
        priority: 3,
        reward: 65,
        durationRequired: 3.5,
        scoutedProgress: 0,
        currentWinner: null,
        winningBid: 0,
        bidLedger: {},
        timestampLedger: {},
        status: 'unassigned',
        detectedTime: 0,
      },
    ];

    // Trigger initial CBBA auction
    this.runCbbaStep();
    this.replanAllAgents();
    this.notify();
  }

  public setSwarmSize(size: number): void {
    this.config.swarmSize = Math.max(3, Math.min(12, size));
    this.initScenario(this.config.scenario);
  }

  public togglePlayPause(): void {
    this.config.isPlaying = !this.config.isPlaying;
    this.notify();
  }

  public setSimSpeed(speed: number): void {
    this.config.simSpeed = speed;
    this.notify();
  }

  public toggleJammer(): void {
    this.config.jammingActive = !this.config.jammingActive;
    const jammer = this.threats.find((t) => t.type === 'jamming_emitter');
    if (jammer) {
      jammer.isActive = this.config.jammingActive;
    }
    ros2Bus.publish(
      '/mesh/jamming_alert',
      '/rf_mesh_router',
      'sensor_msgs/msg/ElectronicWarfareAlert',
      {
        active: this.config.jammingActive,
        center: jammer?.center,
        radius: jammer?.radius,
      },
      'reliable'
    );
    this.notify();
  }

  public toggleUwbAnchoring(): void {
    this.config.uwbAnchoringActive = !this.config.uwbAnchoringActive;
    this.notify();
  }

  public setPathfindingAlgo(algo: 'RRT*' | 'A*'): void {
    this.config.pathfindingAlgo = algo;
    this.replanAllAgents();
    this.notify();
  }

  public selectAgent(id: string | null): void {
    this.config.selectedAgentId = id;
    this.notify();
  }

  public setDriftNoiseFloor(val: number): void {
    this.config.driftNoiseFloor = Math.max(0.2, Math.min(8.0, Number(val)));
    for (const agent of this.agents) {
      if (agent.gpsStatus === 'nominal') {
        agent.covarianceSigma = this.config.driftNoiseFloor * Math.min(1.5, this.config.sensorUncertainty);
      }
    }
    this.notify();
  }

  public setSensorUncertainty(val: number): void {
    this.config.sensorUncertainty = Math.max(0.2, Math.min(4.0, Number(val)));
    for (const agent of this.agents) {
      if (agent.gpsStatus === 'nominal') {
        agent.covarianceSigma = this.config.driftNoiseFloor * Math.min(1.5, this.config.sensorUncertainty);
      }
    }
    this.notify();
  }

  public addDynamicTarget(pos?: Vector3D, priority: number = 4): void {
    const idx = this.targets.length + 1;
    const position = pos || {
      x: (Math.random() - 0.5) * 180,
      y: (Math.random() - 0.5) * 180,
      z: 10 + Math.random() * 20,
    };
    const target: ReconTarget = {
      id: `target-dyn-${idx}`,
      code: `TGT-${String.fromCharCode(65 + (idx % 26))}${idx}`,
      position,
      priority,
      reward: 50 + priority * 10,
      durationRequired: 3.5,
      scoutedProgress: 0,
      currentWinner: null,
      winningBid: 0,
      bidLedger: {},
      timestampLedger: {},
      status: 'unassigned',
      detectedTime: this.missionElapsedTime,
    };
    this.targets.push(target);
    this.cbbaEvents.push(`New Recon Objective [${target.code}] detected at (${position.x.toFixed(0)}, ${position.y.toFixed(0)})`);
    this.runCbbaStep();
    this.replanAllAgents();
    this.notify();
  }

  public addDynamicThreat(): void {
    const idx = this.threats.length + 1;
    const threat: ThreatZone = {
      id: `threat-dyn-${idx}`,
      type: 'radar_dome',
      name: `Mobile Radar Zone ${idx}`,
      center: {
        x: (Math.random() - 0.5) * 140,
        y: (Math.random() - 0.5) * 140,
        z: 16,
      },
      radius: 28 + Math.random() * 14,
      velocity: {
        vx: (Math.random() - 0.5) * 2.5,
        vy: (Math.random() - 0.5) * 2.5,
        vz: 0,
      },
      intensity: 0.85,
      isActive: true,
      color: '#f59e0b',
    };
    this.threats.push(threat);
    this.replanAllAgents();
    this.notify();
  }

  public singleStep(): void {
    this.step(0.04);
  }

  /**
   * Forces two active swarm agents into a close proximity intercept trajectory
   * to test and evaluate the Emergency Collision Alert system and safety buffer overlaps.
   */
  public triggerNearMissScenario(): { agent1: Agent; agent2: Agent } | null {
    if (this.agents.length < 2) return null;
    const a1 = this.agents[0];
    const a2 = this.agents[1];

    // Position a2 within 3.5m of a1 (causing a 65% safety buffer overlap where combined buffer is 10.0m)
    a2.truePose.x = a1.truePose.x + 2.8;
    a2.truePose.y = a1.truePose.y + 1.8;
    a2.truePose.z = a1.truePose.z + 0.2;

    // Set converging velocities
    a1.trueVel.vx = 4.2;
    a1.trueVel.vy = 2.0;
    a2.trueVel.vx = -4.5;
    a2.trueVel.vy = -2.2;

    // Re-route current short paths to maintain collision trajectory momentarily
    a1.path = [
      { x: a1.truePose.x + 8, y: a1.truePose.y + 5, z: a1.truePose.z },
    ];
    a1.currentWaypointIndex = 0;

    a2.path = [
      { x: a2.truePose.x - 8, y: a2.truePose.y - 5, z: a2.truePose.z },
    ];
    a2.currentWaypointIndex = 0;

    ros2Bus.publish(
      '/swarm/emergency_collision_alert',
      '/safety_monitor_node',
      'geometry_msgs/msg/CollisionWarning',
      {
        alertType: 'CRITICAL_BUFFER_OVERLAP',
        agent1: a1.callsign,
        agent2: a2.callsign,
        distance: 3.33,
        overlapPercentage: 66.7,
        timestamp: this.missionElapsedTime,
      },
      'reliable'
    );

    this.notify();
    return { agent1: a1, agent2: a2 };
  }

  /**
   * Primary 60 FPS physics & logic step.
   */
  public update(now: number): void {
    const rawDt = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;
    const dt = Math.min(0.08, Math.max(0.005, rawDt)) * this.config.simSpeed;

    if (!this.config.isPlaying) return;

    this.step(dt);
  }

  private step(dt: number): void {
    this.missionElapsedTime += dt;

    // 1. Move dynamic threats and bounce inside bounds
    for (const threat of this.threats) {
      if (threat.velocity.vx !== 0 || threat.velocity.vy !== 0) {
        threat.center.x += threat.velocity.vx * dt * 4;
        threat.center.y += threat.velocity.vy * dt * 4;

        if (threat.center.x < BOUNDS.minX + 30 || threat.center.x > BOUNDS.maxX - 30) {
          threat.velocity.vx *= -1;
        }
        if (threat.center.y < BOUNDS.minY + 30 || threat.center.y > BOUNDS.maxY - 30) {
          threat.velocity.vy *= -1;
        }
      }
    }

    // 2. Update peer-to-peer radio mesh links
    for (let i = 0; i < this.agents.length; i++) {
      const a1 = this.agents[i];
      a1.peerLinks = [];
      for (let j = 0; j < this.agents.length; j++) {
        if (i === j) continue;
        const a2 = this.agents[j];
        const dist = Math.hypot(
          a1.truePose.x - a2.truePose.x,
          a1.truePose.y - a2.truePose.y,
          a1.truePose.z - a2.truePose.z
        );
        if (dist <= a1.commsRange) {
          a1.peerLinks.push(a2.id);
        }
      }
    }

    // 3. Update VIO drift & Cooperative Localization
    for (const agent of this.agents) {
      if (!agent.isAlive) continue;
      updateAgentVioDrift(
        agent,
        this.threats,
        dt,
        this.config.vioDriftMultiplier,
        this.config.driftNoiseFloor,
        this.config.sensorUncertainty
      );
      // Battery consumption
      agent.battery = Math.max(0, agent.battery - agent.batteryDrainRate * dt);
    }

    if (this.config.uwbAnchoringActive) {
      applyCooperativeUwbLocalization(this.agents, dt, 110);
    }

    // 4. Update kinematics & waypoint navigation for each agent
    for (const agent of this.agents) {
      if (!agent.isAlive) continue;
      this.updateAgentMotion(agent, dt);
    }

    // 5. Update reconnaissance scouting progress
    this.updateTargetProgress(dt);

    // 6. Periodic CBBA rounds
    this.cbbaAccumulator += dt;
    if (this.cbbaAccumulator >= 1.2) {
      this.cbbaAccumulator = 0;
      this.runCbbaStep();
    }

    // 7. Periodic replanning check
    this.replanAccumulator += dt;
    if (this.replanAccumulator >= 2.0) {
      this.replanAccumulator = 0;
      this.checkAndReplanPaths();
    }

    // 8. ROS 2 Pub/Sub Telemetry publish
    this.rosPublishAccumulator += dt;
    if (this.rosPublishAccumulator >= 0.2) {
      this.rosPublishAccumulator = 0;
      this.publishRosTelemetry();
    }

    this.notify();
  }

  private updateAgentMotion(agent: Agent, dt: number): void {
    if (agent.path.length === 0 || agent.currentWaypointIndex >= agent.path.length) {
      // Idle station keeping / hover
      agent.trueVel.vx *= 0.88;
      agent.trueVel.vy *= 0.88;
      agent.trueVel.vz *= 0.88;
      return;
    }

    const targetWp = agent.path[agent.currentWaypointIndex];
    const dx = targetWp.x - agent.truePose.x;
    const dy = targetWp.y - agent.truePose.y;
    const dz = targetWp.z - agent.truePose.z;
    const distToWp = Math.hypot(dx, dy, dz);

    if (distToWp < 5.0) {
      agent.currentWaypointIndex++;
      if (agent.currentWaypointIndex >= agent.path.length) {
        // Arrived at current goal
        return;
      }
    }

    // Velocity control with maximum speed
    const maxSpeed = agent.type === 'rover' ? 9.0 : 15.0;
    const desiredVx = (dx / (distToWp + 0.1)) * maxSpeed;
    const desiredVy = (dy / (distToWp + 0.1)) * maxSpeed;
    const desiredVz = (dz / (distToWp + 0.1)) * (maxSpeed * 0.7);

    // Artificial Potential Field (APF) inter-agent collision repulsion
    let repulseX = 0;
    let repulseY = 0;
    let repulseZ = 0;
    const separationRadius = 12.0;

    for (const other of this.agents) {
      if (other.id === agent.id || !other.isAlive) continue;
      const ox = agent.truePose.x - other.truePose.x;
      const oy = agent.truePose.y - other.truePose.y;
      const oz = agent.truePose.z - other.truePose.z;
      const oDist = Math.hypot(ox, oy, oz);

      if (oDist < separationRadius && oDist > 0.1) {
        const force = (separationRadius - oDist) / separationRadius * 18.0;
        repulseX += (ox / oDist) * force;
        repulseY += (oy / oDist) * force;
        repulseZ += (oz / oDist) * force;
      }
    }

    // Smooth acceleration
    const accel = 12.0;
    agent.trueVel.vx += (desiredVx + repulseX - agent.trueVel.vx) * Math.min(1, accel * dt);
    agent.trueVel.vy += (desiredVy + repulseY - agent.trueVel.vy) * Math.min(1, accel * dt);
    agent.trueVel.vz += (desiredVz + repulseZ - agent.trueVel.vz) * Math.min(1, accel * dt);

    // Integrate true position
    agent.truePose.x += agent.trueVel.vx * dt;
    agent.truePose.y += agent.trueVel.vy * dt;
    agent.truePose.z = Math.max(agent.type === 'rover' ? 2 : 4, agent.truePose.z + agent.trueVel.vz * dt);

    // Yaw heading
    if (Math.hypot(agent.trueVel.vx, agent.trueVel.vy) > 0.5) {
      agent.truePose.yaw = Math.atan2(agent.trueVel.vy, agent.trueVel.vx);
    }
  }

  private updateTargetProgress(dt: number): void {
    const targetMap = new Map(this.targets.map((t) => [t.id, t]));

    for (const agent of this.agents) {
      if (agent.bundle.length === 0) continue;
      const currentTargetId = agent.bundle[0];
      const target = targetMap.get(currentTargetId);
      if (!target || target.status === 'scouted') continue;

      const dist = Math.hypot(
        agent.truePose.x - target.position.x,
        agent.truePose.y - target.position.y,
        agent.truePose.z - target.position.z
      );

      // In scouting range (within 14m)
      if (dist < 14.0) {
        target.status = 'assigned';
        target.scoutedProgress += (dt / target.durationRequired) * (agent.covarianceSigma > 10 ? 0.6 : 1.0);

        if (target.scoutedProgress >= 1.0) {
          target.scoutedProgress = 1.0;
          target.status = 'scouted';
          this.totalTargetsScouted++;
          this.cbbaEvents.push(`[${target.code}] reconnaissance complete by ${agent.callsign}!`);

          // Remove completed target from agent bundle
          agent.bundle.shift();
          this.runCbbaStep();
          this.planAgentPath(agent);
        }
      }
    }
  }

  public runCbbaStep(): void {
    this.consensusRound++;
    const res = runFullCbbaIteration(
      this.agents,
      this.cbbaStates,
      this.targets,
      this.missionElapsedTime
    );

    this.cbbaStates = res.updatedStates;
    this.isConsensusSettled = res.isConverged;

    if (res.allEvents.length > 0) {
      this.cbbaEvents = [...res.allEvents.slice(-6), ...this.cbbaEvents.slice(0, 40)];
    }

    // Sync targets winners and highest bids
    for (const target of this.targets) {
      let highestBid = 0;
      let winnerId: string | null = null;

      for (const [agentId, state] of Object.entries(this.cbbaStates)) {
        const bid = state.bids[target.id] || 0;
        target.bidLedger[agentId] = bid;
        if (bid > highestBid) {
          highestBid = bid;
          winnerId = state.winners[target.id] || agentId;
        }
      }

      target.winningBid = highestBid;
      target.currentWinner = winnerId;
      if (target.status !== 'scouted') {
        target.status = winnerId ? 'assigned' : 'unassigned';
      }
    }

    // Broadcast CBBA topic on ROS 2 bus
    ros2Bus.publish(
      '/swarm/consensus/bundle_ledger',
      '/swarm_mission_manager',
      'swarm_msgs/msg/CbbaLedger',
      {
        round: this.consensusRound,
        converged: this.isConsensusSettled,
        targetsAllocated: this.targets.filter((t) => t.currentWinner !== null).length,
        timestamp: Date.now(),
      },
      'reliable'
    );
  }

  public planAgentPath(agent: Agent): void {
    if (agent.bundle.length === 0) {
      agent.path = [];
      agent.rrtTree = undefined;
      return;
    }

    const targetMap = new Map(this.targets.map((t) => [t.id, t]));
    const nextTarget = targetMap.get(agent.bundle[0]);
    if (!nextTarget) return;

    const start = agent.estimatedPose;
    const goal = nextTarget.position;

    if (this.config.pathfindingAlgo === 'RRT*') {
      const res = planRrtStar(start, goal, this.threats, BOUNDS, 180, 16.0);
      agent.rrtTree = res.tree;
      agent.aStarTree = undefined;
      agent.path = res.tree.bestPath;
      agent.currentWaypointIndex = 0;
      this.lastBenchmark = res.benchmark;
    } else {
      const res = planAStar(start, goal, this.threats, BOUNDS, 10.0);
      agent.path = res.path;
      agent.aStarTree = res.tree;
      agent.rrtTree = undefined;
      agent.currentWaypointIndex = 0;
      this.lastBenchmark = res.benchmark;
    }
  }

  public replanAllAgents(): void {
    for (const agent of this.agents) {
      if (agent.isAlive) {
        this.planAgentPath(agent);
      }
    }
  }

  private checkAndReplanPaths(): void {
    // Check if any agent's current path is obstructed by a moving threat
    for (const agent of this.agents) {
      if (agent.path.length > 0) {
        for (const threat of this.threats) {
          if (!threat.isActive) continue;
          for (let i = agent.currentWaypointIndex; i < agent.path.length; i++) {
            const wp = agent.path[i];
            const dist = Math.hypot(wp.x - threat.center.x, wp.y - threat.center.y, wp.z - threat.center.z);
            if (dist < threat.radius + 6) {
              // Path collision detected: replan!
              this.planAgentPath(agent);
              break;
            }
          }
        }
      }
    }
  }

  private publishRosTelemetry(): void {
    for (const agent of this.agents) {
      const prefix = `/${agent.callsign.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

      // VIO Pose topic
      ros2Bus.publish(
        `${prefix}/vio_pose`,
        `${prefix}/vio_estimator_node`,
        'geometry_msgs/msg/PoseWithCovariance',
        {
          position: agent.estimatedPose,
          covariance_sigma: agent.covarianceSigma,
          gps_mode: agent.gpsStatus,
        },
        'best_effort'
      );

      // Cmd Vel topic
      ros2Bus.publish(
        `${prefix}/cmd_vel`,
        `${prefix}/motion_planner_node`,
        'geometry_msgs/msg/Twist',
        {
          linear: agent.trueVel,
          angular: { yaw_rate: agent.trueVel.yawRate },
        },
        'best_effort'
      );
    }

    // Global swarm state
    ros2Bus.publish(
      '/swarm/telemetry',
      '/swarm_mission_manager',
      'std_msgs/msg/SwarmState',
      {
        activeAgents: this.agents.filter((a) => a.isAlive).length,
        targetsRemaining: this.targets.filter((t) => t.status !== 'scouted').length,
        jammingActive: this.config.jammingActive,
      },
      'best_effort'
    );
  }

  /**
   * Generates a comprehensive JSON snapshot of current CBBA ledger state,
   * consensus convergence, and all agent telemetry.
   */
  public getSimulationLogSnapshot() {
    return {
      metadata: {
        system: 'AERO-SWARM Autonomous Swarm Simulator',
        exportTimestamp: new Date().toISOString(),
        missionElapsedTimeSeconds: Number(this.missionElapsedTime.toFixed(2)),
        missionElapsedFormatted: `T+${String(Math.floor(this.missionElapsedTime / 60)).padStart(2, '0')}:${String(
          Math.floor(this.missionElapsedTime % 60)
        ).padStart(2, '0')}`,
        scenario: this.config.scenario,
        swarmSize: this.config.swarmSize,
        simSpeed: this.config.simSpeed,
        pathfindingAlgorithm: this.config.pathfindingAlgo,
        jammingActive: this.config.jammingActive,
        uwbAnchoringActive: this.config.uwbAnchoringActive,
        driftNoiseFloor: this.config.driftNoiseFloor,
        sensorUncertainty: this.config.sensorUncertainty,
      },
      cbbaLedgerState: {
        consensusRound: this.consensusRound,
        isConsensusSettled: this.isConsensusSettled,
        totalTargetsScouted: this.totalTargetsScouted,
        targetsCount: this.targets.length,
        targetAllocations: this.targets.map((tgt) => {
          const winner = this.agents.find((a) => a.id === tgt.currentWinner);
          return {
            id: tgt.id,
            code: tgt.code,
            priority: tgt.priority,
            reward: tgt.reward,
            position: tgt.position,
            status: tgt.status,
            scoutedProgress: Number(tgt.scoutedProgress.toFixed(3)),
            winningAgentId: tgt.currentWinner,
            winningAgentCallsign: winner ? winner.callsign : null,
            winningBid: Number(tgt.winningBid.toFixed(2)),
            bidLedger: tgt.bidLedger,
            timestampLedger: tgt.timestampLedger,
          };
        }),
        agentCbbaStates: this.cbbaStates,
        events: [...this.cbbaEvents],
      },
      telemetry: {
        totalAgents: this.agents.length,
        activeAgents: this.agents.filter((a) => a.isAlive).length,
        jammedAgents: this.agents.filter((a) => a.gpsStatus === 'denied').length,
        agents: this.agents.map((agent) => {
          const dx = agent.estimatedPose.x - agent.truePose.x;
          const dy = agent.estimatedPose.y - agent.truePose.y;
          const dz = agent.estimatedPose.z - agent.truePose.z;
          const euclideanDrift = Math.hypot(dx, dy, dz);
          const drainRatePerMin = agent.batteryDrainRate * 60;
          const remainingMinutes = drainRatePerMin > 0 ? agent.battery / drainRatePerMin : 0;

          return {
            id: agent.id,
            callsign: agent.callsign,
            type: agent.type,
            role: agent.role,
            isAlive: agent.isAlive,
            gpsStatus: agent.gpsStatus,
            battery: {
              percentage: Number(agent.battery.toFixed(1)),
              drainRatePerSec: agent.batteryDrainRate,
              estimatedRemainingMinutes: Number(remainingMinutes.toFixed(1)),
            },
            truePose: {
              x: Number(agent.truePose.x.toFixed(2)),
              y: Number(agent.truePose.y.toFixed(2)),
              z: Number(agent.truePose.z.toFixed(2)),
              yaw: Number(agent.truePose.yaw.toFixed(2)),
            },
            estimatedPose: {
              x: Number(agent.estimatedPose.x.toFixed(2)),
              y: Number(agent.estimatedPose.y.toFixed(2)),
              z: Number(agent.estimatedPose.z.toFixed(2)),
              yaw: Number(agent.estimatedPose.yaw.toFixed(2)),
            },
            driftError: {
              dx: Number(dx.toFixed(3)),
              dy: Number(dy.toFixed(3)),
              dz: Number(dz.toFixed(3)),
              euclideanDistanceMeters: Number(euclideanDrift.toFixed(3)),
            },
            covarianceSigma: Number(agent.covarianceSigma.toFixed(2)),
            trueVelocity: {
              vx: Number(agent.trueVel.vx.toFixed(2)),
              vy: Number(agent.trueVel.vy.toFixed(2)),
              vz: Number(agent.trueVel.vz.toFixed(2)),
              yawRate: Number(agent.trueVel.yawRate.toFixed(2)),
            },
            commsRangeMeters: agent.commsRange,
            peerLinksCount: agent.peerLinks.length,
            peerLinks: agent.peerLinks,
            activeSensors: agent.activeSensors,
            bundle: agent.bundle,
            currentWaypointIndex: agent.currentWaypointIndex,
            totalWaypoints: agent.path.length,
          };
        }),
      },
      activeThreats: this.threats.map((threat) => ({
        id: threat.id,
        name: threat.name,
        type: threat.type,
        center: threat.center,
        radius: threat.radius,
        intensity: threat.intensity,
        isActive: threat.isActive,
      })),
      lastBenchmark: this.lastBenchmark,
    };
  }

  /**
   * Triggers client browser download of current simulation logs as a formatted JSON file.
   */
  public downloadSimulationLogs(): void {
    const data = this.getSimulationLogSnapshot();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timeFormatted = `T${Math.floor(this.missionElapsedTime)}s`;
    const dateFormatted = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `aero-swarm-sim-logs-${timeFormatted}-${dateFormatted}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const simulationEngine = new SimulationEngine();
