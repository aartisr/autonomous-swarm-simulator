/**
 * Visual Inertial Odometry (VIO) Drift Simulation & Cooperative P2P Relative Positioning.
 * 
 * Simulates:
 * - GPS degradation/denial when entering electronic warfare (EW) jamming zones.
 * - Covariance expansion $\sigma^2$ during dead reckoning.
 * - Cooperative UWB peer-to-peer ranging & relative multilateration anchor correction.
 */

import { Agent, ThreatZone, Vector3D } from '../types/simulation';

function dist3D(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Box-Muller standard normal generator
function gaussianRandom(mean: number = 0, stdev: number = 1): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * stdev;
}

/**
 * Updates an agent's estimated pose and covariance based on GPS availability.
 */
export function updateAgentVioDrift(
  agent: Agent,
  threats: ThreatZone[],
  dt: number,
  driftMultiplier: number = 1.0,
  noiseFloor: number = 1.5,
  sensorUncertainty: number = 1.0
): void {
  // Check if agent is inside any active jamming zone
  let inJammingZone = false;
  for (const t of threats) {
    if (t.type === 'jamming_emitter' && t.isActive) {
      const d = dist3D(agent.truePose, t.center);
      if (d <= t.radius) {
        inJammingZone = true;
        break;
      }
    }
  }

  if (inJammingZone) {
    agent.gpsStatus = 'denied';
    // VIO dead-reckoning drift growth rate (random walk) scaled by sensorUncertainty
    const driftRate = 0.45 * driftMultiplier * sensorUncertainty * dt;
    agent.covarianceSigma = Math.max(
      noiseFloor * sensorUncertainty,
      Math.min(50.0, agent.covarianceSigma + driftRate * 1.2)
    );

    // Apply incremental drift to estimated pose
    const driftStepX = gaussianRandom(0, 0.25 * driftMultiplier * sensorUncertainty * dt);
    const driftStepY = gaussianRandom(0, 0.25 * driftMultiplier * sensorUncertainty * dt);
    const driftStepZ = gaussianRandom(0, 0.08 * driftMultiplier * sensorUncertainty * dt);

    agent.estimatedPose.x += agent.trueVel.vx * dt + driftStepX;
    agent.estimatedPose.y += agent.trueVel.vy * dt + driftStepY;
    agent.estimatedPose.z += agent.trueVel.vz * dt + driftStepZ;
  } else {
    // Nominal GPS environment: Kalman filter fuses GPS + VIO, bounded by noise floor
    agent.gpsStatus = 'nominal';
    const kalmanGain = Math.min(1.0, 4.5 * dt);
    agent.estimatedPose.x += (agent.truePose.x - agent.estimatedPose.x) * kalmanGain;
    agent.estimatedPose.y += (agent.truePose.y - agent.estimatedPose.y) * kalmanGain;
    agent.estimatedPose.z += (agent.truePose.z - agent.estimatedPose.z) * kalmanGain;
    
    const targetMinSigma = noiseFloor * Math.min(1.5, sensorUncertainty);
    if (agent.covarianceSigma > targetMinSigma) {
      agent.covarianceSigma = Math.max(targetMinSigma, agent.covarianceSigma - 3.0 * dt);
    } else {
      agent.covarianceSigma = targetMinSigma;
    }
  }
}

/**
 * Cooperative P2P Relative Positioning via Ultra-Wideband (UWB) ranging.
 * When an agent with high uncertainty is within UWB line-of-sight of peers with
 * lower uncertainty, relative range measurements are fused to tighten covariance.
 */
export function applyCooperativeUwbLocalization(
  agents: Agent[],
  dt: number,
  uwbRange: number = 100.0
): { correctionsCount: number; averageSigmaReduction: number } {
  let correctionsCount = 0;
  let totalSigmaReduction = 0;

  for (const agent of agents) {
    if (!agent.isAlive || agent.gpsStatus === 'nominal') continue;

    // Find peers within UWB range that have significantly lower uncertainty
    const anchors: { peer: Agent; range: number }[] = [];

    for (const peer of agents) {
      if (peer.id === agent.id || !peer.isAlive) continue;

      const trueDist = dist3D(agent.truePose, peer.truePose);
      if (trueDist <= uwbRange && peer.covarianceSigma < agent.covarianceSigma * 0.65) {
        // Simulated UWB range measurement with 10cm accuracy noise
        const noisyRange = trueDist + gaussianRandom(0, 0.12);
        anchors.push({ peer, range: noisyRange });
      }
    }

    // Need at least 2 anchor peers to correct drift via relative triangulation
    if (anchors.length >= 2) {
      correctionsCount++;
      // Weighted fusion pulling towards geometrically consistent position
      let corrX = 0;
      let corrY = 0;
      let corrZ = 0;
      let totalWeight = 0;

      for (const { peer, range } of anchors) {
        const estDist = dist3D(agent.estimatedPose, peer.estimatedPose);
        const error = estDist - range;
        const weight = 1.0 / (peer.covarianceSigma + 0.5);

        if (estDist > 0.1) {
          const dirX = (peer.estimatedPose.x - agent.estimatedPose.x) / estDist;
          const dirY = (peer.estimatedPose.y - agent.estimatedPose.y) / estDist;
          const dirZ = (peer.estimatedPose.z - agent.estimatedPose.z) / estDist;

          corrX += dirX * error * weight;
          corrY += dirY * error * weight;
          corrZ += dirZ * error * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        const step = Math.min(0.8, 1.8 * dt);
        agent.estimatedPose.x += (corrX / totalWeight) * step;
        agent.estimatedPose.y += (corrY / totalWeight) * step;
        agent.estimatedPose.z += (corrZ / totalWeight) * step;

        const prevSigma = agent.covarianceSigma;
        // Bounded covariance reduction from cooperative peer constraint
        agent.covarianceSigma = Math.max(
          1.8,
          agent.covarianceSigma - (agent.covarianceSigma - 2.5) * 0.45 * dt
        );
        totalSigmaReduction += prevSigma - agent.covarianceSigma;
      }
    }
  }

  return {
    correctionsCount,
    averageSigmaReduction: correctionsCount > 0 ? totalSigmaReduction / correctionsCount : 0,
  };
}
