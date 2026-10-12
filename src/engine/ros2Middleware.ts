/**
 * ROS 2 (Robot Operating System) DDS Pub/Sub Middleware Emulator.
 * 
 * Provides:
 * - Real-time ROS 2 node registry and lifecycle states
 * - Standard message types (geometry_msgs, nav_msgs, sensor_msgs, swarm_msgs)
 * - QoS profiles (RELIABLE vs BEST_EFFORT)
 * - Topic message buffers, publish frequency (Hz), and latency injection
 */

import { RosNodeInfo, RosTopicMessage } from '../types/simulation';

export class Ros2Middleware {
  private nodes: Map<string, RosNodeInfo> = new Map();
  private subscribers: Map<string, Set<(msg: RosTopicMessage) => void>> = new Map();
  private messageHistory: RosTopicMessage[] = [];
  private topicFrequencies: Map<string, { count: number; lastTime: number; currentHz: number }> = new Map();
  private maxHistorySize = 150;
  public simulatedLatencyMs = 12;
  public packetDropRate = 0.02; // 2% simulated RF packet drop

  constructor() {
    this.initDefaultNodes();
  }

  private initDefaultNodes() {
    this.registerNode({
      name: '/swarm_mission_manager',
      status: 'active',
      hz: 10,
      publishedTopics: ['/swarm/consensus/bundle_ledger', '/swarm/recon_targets'],
      subscribedTopics: ['/swarm/telemetry'],
      messageCount: 0,
    });

    this.registerNode({
      name: '/rf_mesh_router',
      status: 'active',
      hz: 20,
      publishedTopics: ['/mesh/link_matrix', '/mesh/jamming_alert'],
      subscribedTopics: ['/swarm/telemetry'],
      messageCount: 0,
    });

    this.registerNode({
      name: '/safety_monitor_node',
      status: 'active',
      hz: 20,
      publishedTopics: ['/swarm/emergency_collision_alert', '/swarm/safety_buffers'],
      subscribedTopics: ['/swarm/telemetry'],
      messageCount: 0,
    });
  }

  public registerNode(info: RosNodeInfo): void {
    this.nodes.set(info.name, info);
  }

  public registerAgentNodes(agentCallsign: string): void {
    const prefix = `/${agentCallsign.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

    this.registerNode({
      name: `${prefix}/cbba_consensus_node`,
      status: 'active',
      hz: 5,
      publishedTopics: ['/swarm/consensus/bundle_ledger'],
      subscribedTopics: ['/swarm/consensus/bundle_ledger', `${prefix}/vio_pose`],
      messageCount: 0,
    });

    this.registerNode({
      name: `${prefix}/motion_planner_node`,
      status: 'active',
      hz: 10,
      publishedTopics: [`${prefix}/nav_trajectory`, `${prefix}/cmd_vel`],
      subscribedTopics: [`${prefix}/vio_pose`, '/threats/dynamic_zones'],
      messageCount: 0,
    });

    this.registerNode({
      name: `${prefix}/vio_estimator_node`,
      status: 'active',
      hz: 30,
      publishedTopics: [`${prefix}/vio_pose`],
      subscribedTopics: ['/sensors/imu', '/sensors/optical_flow'],
      messageCount: 0,
    });
  }

  public publish(
    topic: string,
    sourceNode: string,
    type: string,
    payload: Record<string, unknown>,
    qos: 'reliable' | 'best_effort' = 'reliable'
  ): void {
    // Simulate RF packet drop for best effort topics
    if (qos === 'best_effort' && Math.random() < this.packetDropRate) {
      return;
    }

    const msg: RosTopicMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      topic,
      sourceNode,
      timestamp: Date.now(),
      qos,
      type,
      payload,
    };

    // Update node message count
    const node = this.nodes.get(sourceNode);
    if (node) {
      node.messageCount++;
    }

    // Update topic Hz
    const now = performance.now();
    let freqData = this.topicFrequencies.get(topic);
    if (!freqData) {
      freqData = { count: 0, lastTime: now, currentHz: 0 };
      this.topicFrequencies.set(topic, freqData);
    }
    freqData.count++;
    if (now - freqData.lastTime >= 1000) {
      freqData.currentHz = Math.round((freqData.count * 1000) / (now - freqData.lastTime));
      freqData.count = 0;
      freqData.lastTime = now;
    }

    // Buffer message
    this.messageHistory.unshift(msg);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.pop();
    }

    // Deliver to subscribers
    const callbacks = this.subscribers.get(topic);
    if (callbacks) {
      for (const cb of callbacks) {
        cb(msg);
      }
    }
  }

  public subscribe(topic: string, callback: (msg: RosTopicMessage) => void): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(callback);
    return () => {
      this.subscribers.get(topic)?.delete(callback);
    };
  }

  public getNodes(): RosNodeInfo[] {
    return Array.from(this.nodes.values());
  }

  public getTopicFrequency(topic: string): number {
    return this.topicFrequencies.get(topic)?.currentHz || 0;
  }

  public getRecentMessages(limit: number = 50, filterTopic?: string): RosTopicMessage[] {
    if (!filterTopic) {
      return this.messageHistory.slice(0, limit);
    }
    return this.messageHistory.filter((m) => m.topic === filterTopic).slice(0, limit);
  }

  public clearHistory(): void {
    this.messageHistory = [];
  }
}

export const ros2Bus = new Ros2Middleware();
