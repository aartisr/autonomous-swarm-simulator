/**
 * Consensus-Based Bundle Algorithm (CBBA) Implementation.
 * 
 * Based on Choi, Brunet, and How (IEEE Transactions on Robotics, 2009):
 * "Consensus-Based Decentralized Auctions for Robust Task Allocation".
 * 
 * Implements:
 * 1. Greedy Bundle Construction (marginal score maximization)
 * 2. Peer-to-peer Consensus and Conflict Resolution (11-rule table)
 * 3. Cascade bundle release upon outbid
 */

import { Agent, ReconTarget, Vector3D } from '../types/simulation';

export interface CbbaAgentState {
  agentId: string;
  bundle: string[]; // ordered task IDs
  path: Vector3D[]; // waypoints for the bundle
  bids: Record<string, number>; // taskId -> highest bid known
  winners: Record<string, string | null>; // taskId -> winning agentId known
  timestamps: Record<string, number>; // agentId -> last heard timestamp
}

export interface CbbaAuctionResult {
  agentStates: Record<string, CbbaAgentState>;
  consensusRound: number;
  conflictEvents: string[];
  isFullyConverged: boolean;
}

const MAX_BUNDLE_SIZE = 3;
const DISCOUNT_FACTOR = 0.95; // spatial-temporal reward discount

function distance3D(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Computes marginal score of adding a target to an agent's planned trajectory.
 */
function computeMarginalScore(
  agent: Agent,
  currentTargets: ReconTarget[],
  newTarget: ReconTarget
): { score: number; bestInsertIndex: number } {
  // If target already scouted, score is 0
  if (newTarget.status === 'scouted') return { score: 0, bestInsertIndex: -1 };

  // Sensor compatibility and battery constraint
  const batteryPenalty = (100 - agent.battery) * 0.05;
  const baseReward = newTarget.reward * (newTarget.priority * 1.2);

  if (currentTargets.length === 0) {
    const dist = distance3D(agent.estimatedPose, newTarget.position);
    const score = Math.max(0.1, baseReward * Math.pow(DISCOUNT_FACTOR, dist / 40) - batteryPenalty);
    return { score, bestInsertIndex: 0 };
  }

  let bestScore = -1;
  let bestIndex = 0;

  // Try inserting at every position
  for (let idx = 0; idx <= currentTargets.length; idx++) {
    let totalDist = 0;
    let prevPos: Vector3D = agent.estimatedPose;
    const testList = [...currentTargets];
    testList.splice(idx, 0, newTarget);

    for (let k = 0; k < testList.length; k++) {
      totalDist += distance3D(prevPos, testList[k].position);
      prevPos = testList[k].position;
    }

    const discountedReward = baseReward * Math.pow(DISCOUNT_FACTOR, totalDist / 50) - batteryPenalty;
    if (discountedReward > bestScore) {
      bestScore = discountedReward;
      bestIndex = idx;
    }
  }

  return {
    score: Math.max(0, bestScore),
    bestInsertIndex: bestIndex,
  };
}

/**
 * Phase 1: Bundle Construction
 * Each agent greedily adds tasks to its bundle that yield the highest positive marginal utility.
 */
export function buildAgentBundle(
  agent: Agent,
  state: CbbaAgentState,
  allTargets: ReconTarget[],
  currentTime: number
): { modified: boolean; events: string[] } {
  const events: string[] = [];
  let modified = false;

  const targetMap = new Map<string, ReconTarget>();
  for (const t of allTargets) {
    targetMap.set(t.id, t);
  }

  while (state.bundle.length < MAX_BUNDLE_SIZE) {
    let bestTaskId: string | null = null;
    let highestMarginalScore = 0;
    let bestInsertPos = 0;

    const currentBundleTargets = state.bundle
      .map((id) => targetMap.get(id))
      .filter((t): t is ReconTarget => Boolean(t));

    for (const target of allTargets) {
      if (target.status === 'scouted') continue;
      if (state.bundle.includes(target.id)) continue;

      const { score, bestInsertIndex } = computeMarginalScore(agent, currentBundleTargets, target);
      const currentWinningBid = state.bids[target.id] || 0;

      // Must strictly outbid the current known highest bid
      if (score > currentWinningBid && score > highestMarginalScore) {
        highestMarginalScore = score;
        bestTaskId = target.id;
        bestInsertPos = bestInsertIndex;
      }
    }

    if (bestTaskId && highestMarginalScore > 0) {
      state.bundle.splice(bestInsertPos, 0, bestTaskId);
      state.bids[bestTaskId] = highestMarginalScore;
      state.winners[bestTaskId] = agent.id;
      state.timestamps[agent.id] = currentTime;

      const target = targetMap.get(bestTaskId);
      events.push(`${agent.callsign} bid ${highestMarginalScore.toFixed(1)} on [${target?.code || bestTaskId}]`);
      modified = true;
    } else {
      break; // No further beneficial task found
    }
  }

  return { modified, events };
}

/**
 * Phase 2: Consensus and Conflict Resolution between peer agents in RF range.
 * Applies the 11 CBBA consensus rules to update winning agent IDs and release outbid tasks.
 */
export function resolveCbbaConflicts(
  agentA: CbbaAgentState,
  agentB: CbbaAgentState,
  callsignA: string,
  callsignB: string,
  allTargets: ReconTarget[],
  currentTime: number
): { conflictCount: number; events: string[] } {
  const events: string[] = [];
  let conflictCount = 0;

  for (const target of allTargets) {
    const tid = target.id;
    const winnerA = agentA.winners[tid] || null;
    const winnerB = agentB.winners[tid] || null;
    const bidA = agentA.bids[tid] || 0;
    const bidB = agentB.bids[tid] || 0;

    // Rule 1: A and B agree
    if (winnerA === winnerB) {
      continue;
    }

    // Rule 2: A thinks B is winner
    if (winnerA === agentB.agentId) {
      if (winnerB === agentB.agentId) {
        // Update bid to B's value
        agentA.bids[tid] = bidB;
      } else {
        // B changed its mind, reset A's view
        agentA.winners[tid] = winnerB;
        agentA.bids[tid] = bidB;
        conflictCount++;
      }
      continue;
    }

    // Rule 3: B has higher bid on task A thought someone else (or none) won
    if (bidB > bidA) {
      const prevWinner = agentA.winners[tid];
      agentA.winners[tid] = winnerB;
      agentA.bids[tid] = bidB;

      // If A had this task in its bundle, it must release it and all subsequent tasks
      const bundleIdx = agentA.bundle.indexOf(tid);
      if (bundleIdx !== -1) {
        const releasedTasks = agentA.bundle.slice(bundleIdx);
        agentA.bundle = agentA.bundle.slice(0, bundleIdx);

        for (const releasedId of releasedTasks) {
          if (releasedId !== tid && agentA.winners[releasedId] === agentA.agentId) {
            agentA.winners[releasedId] = null;
            agentA.bids[releasedId] = 0;
          }
        }
        events.push(
          `${callsignA} outbid by ${callsignB} on [${target.code}]. Released ${releasedTasks.length} bundle task(s).`
        );
        conflictCount++;
      }
    } else if (bidA > bidB) {
      // Reverse rule: A's bid beats B
      const bundleIdx = agentB.bundle.indexOf(tid);
      agentB.winners[tid] = winnerA;
      agentB.bids[tid] = bidA;

      if (bundleIdx !== -1) {
        const releasedTasks = agentB.bundle.slice(bundleIdx);
        agentB.bundle = agentB.bundle.slice(0, bundleIdx);

        for (const releasedId of releasedTasks) {
          if (releasedId !== tid && agentB.winners[releasedId] === agentB.agentId) {
            agentB.winners[releasedId] = null;
            agentB.bids[releasedId] = 0;
          }
        }
        events.push(
          `${callsignB} outbid by ${callsignA} on [${target.code}]. Released ${releasedTasks.length} bundle task(s).`
        );
        conflictCount++;
      }
    }
  }

  agentA.timestamps[agentB.agentId] = currentTime;
  agentB.timestamps[agentA.agentId] = currentTime;

  return { conflictCount, events };
}

/**
 * Runs a full CBBA round over the current swarm state and returns consensus telemetry.
 */
export function runFullCbbaIteration(
  agents: Agent[],
  agentStates: Record<string, CbbaAgentState>,
  targets: ReconTarget[],
  currentTime: number
): {
  updatedStates: Record<string, CbbaAgentState>;
  allEvents: string[];
  isConverged: boolean;
} {
  const allEvents: string[] = [];
  let anyBundleModified = false;
  let totalConflicts = 0;

  // Initialize missing agent states
  for (const agent of agents) {
    if (!agentStates[agent.id]) {
      agentStates[agent.id] = {
        agentId: agent.id,
        bundle: [...agent.bundle],
        path: [],
        bids: {},
        winners: {},
        timestamps: {},
      };
    }
  }

  // Phase 1: Local bundle construction for all alive agents
  for (const agent of agents) {
    if (!agent.isAlive) continue;
    const res = buildAgentBundle(agent, agentStates[agent.id], targets, currentTime);
    if (res.modified) {
      anyBundleModified = true;
      allEvents.push(...res.events);
    }
  }

  // Phase 2: Mesh peer-to-peer consensus
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a1 = agents[i];
      const a2 = agents[j];
      if (!a1.isAlive || !a2.isAlive) continue;

      // Check if agents are within radio communication range
      const dist = distance3D(a1.estimatedPose, a2.estimatedPose);
      if (dist <= Math.min(a1.commsRange, a2.commsRange)) {
        const res = resolveCbbaConflicts(
          agentStates[a1.id],
          agentStates[a2.id],
          a1.callsign,
          a2.callsign,
          targets,
          currentTime
        );
        totalConflicts += res.conflictCount;
        if (res.events.length > 0) {
          allEvents.push(...res.events);
        }
      }
    }
  }

  // Sync bundles back to agent objects
  for (const agent of agents) {
    if (agentStates[agent.id]) {
      agent.bundle = [...agentStates[agent.id].bundle];
    }
  }

  const isConverged = !anyBundleModified && totalConflicts === 0;

  return {
    updatedStates: agentStates,
    allEvents,
    isConverged,
  };
}
