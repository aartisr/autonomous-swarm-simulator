/**
 * VIO Drift Error Overlay Component.
 * Displays real-time Visual Inertial Odometry error metrics,
 * comparing ground truth poses against GPS-denied perceived poses,
 * Euclidean deviation vectors ||Δp||, and covariance confidence bounds.
 */

import React, { useState } from 'react';
import { Agent } from '../../types/simulation';
import { simulationEngine } from '../../engine/simulationEngine';
import { Activity, ChevronDown, ChevronUp, Eye, EyeOff, Radio, ShieldAlert } from 'lucide-react';

interface VioDriftOverlayProps {
  agents: Agent[];
  focusedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  showDriftEllipses: boolean;
  onToggleDriftEllipses: () => void;
  showGhostMarkers: boolean;
  onToggleGhostMarkers: () => void;
  showGroundFootprints: boolean;
  onToggleGroundFootprints: () => void;
}

export const VioDriftOverlay: React.FC<VioDriftOverlayProps> = ({
  agents,
  focusedAgentId,
  onSelectAgent,
  showDriftEllipses,
  onToggleDriftEllipses,
  showGhostMarkers,
  onToggleGhostMarkers,
  showGroundFootprints,
  onToggleGroundFootprints,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Compute swarm aggregate VIO metrics
  const jammedCount = agents.filter((a) => a.gpsStatus === 'denied').length;
  let maxDrift = 0;
  let avgDrift = 0;

  for (const agent of agents) {
    const dx = agent.estimatedPose.x - agent.truePose.x;
    const dy = agent.estimatedPose.y - agent.truePose.y;
    const dz = agent.estimatedPose.z - agent.truePose.z;
    const drift = Math.hypot(dx, dy, dz);
    if (drift > maxDrift) maxDrift = drift;
    avgDrift += drift;
  }
  avgDrift = agents.length > 0 ? avgDrift / agents.length : 0;

  return (
    <div className="absolute top-12 right-2 z-20 w-80 max-w-[calc(100%-1rem)] bg-[#070b13]/90 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl overflow-hidden font-mono text-xs select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0c1220]/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
          <span className="font-semibold text-slate-200 text-[11px] uppercase tracking-wider">
            VIO Drift Error Analyzer
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title={isCollapsed ? 'Expand VIO Analyzer' : 'Collapse VIO Analyzer'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-2.5 flex flex-col gap-2">
          {/* Aggregate Telemetry Strip */}
          <div className="grid grid-cols-3 gap-1.5 p-2 bg-[#05080e] rounded border border-slate-800/80 text-[10px]">
            <div>
              <div className="text-slate-400 text-[9px] uppercase">GPS Jammed</div>
              <div className="font-bold text-rose-400 tabular-nums">
                {jammedCount} / {agents.length}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[9px] uppercase">Max Drift</div>
              <div className="font-bold text-amber-300 tabular-nums">
                {maxDrift.toFixed(1)} m
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[9px] uppercase">Avg Drift</div>
              <div className="font-bold text-cyan-300 tabular-nums">
                {avgDrift.toFixed(1)} m
              </div>
            </div>
          </div>

          {/* 3D Visualization Layer Toggles */}
          <div className="flex items-center justify-between gap-1 text-[10px] bg-slate-900/60 p-1.5 rounded border border-slate-800/60">
            <button
              onClick={onToggleDriftEllipses}
              className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 transition-colors ${
                showDriftEllipses
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle 3D Covariance Uncertainty Ellipsoids"
            >
              <span>3D Shells</span>
              {showDriftEllipses ? <Eye className="w-3 h-3 text-rose-400" /> : <EyeOff className="w-3 h-3" />}
            </button>

            <button
              onClick={onToggleGhostMarkers}
              className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 transition-colors ${
                showGhostMarkers
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle Perceived/Estimated Pose Ghost Wireframe"
            >
              <span>Perceived</span>
              {showGhostMarkers ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3" />}
            </button>

            <button
              onClick={onToggleGroundFootprints}
              className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 transition-colors ${
                showGroundFootprints
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle Ground Uncertainty Footprints"
            >
              <span>Footprint</span>
              {showGroundFootprints ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3" />}
            </button>
          </div>

          {/* VIO Noise & Uncertainty Configuration Panel */}
          <div className="flex flex-col gap-2 p-2 bg-[#05080e] rounded border border-slate-800 text-[10px]">
            <div className="flex items-center justify-between text-slate-300 font-semibold text-[10px]">
              <span className="text-cyan-400 uppercase tracking-wider">VIO Sensor Calibration</span>
              <span className="text-slate-500 font-normal">Controls Error Ellipse Size</span>
            </div>

            {/* Slider 1: Drift Noise Floor */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-slate-400">
                <span>Drift Noise Floor (σ₀):</span>
                <span className="text-rose-400 font-bold tabular-nums">
                  {simulationEngine.config.driftNoiseFloor.toFixed(1)} m
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="6.0"
                step="0.1"
                value={simulationEngine.config.driftNoiseFloor}
                onChange={(e) => simulationEngine.setDriftNoiseFloor(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>

            {/* Slider 2: Sensor Uncertainty */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-slate-400">
                <span>Sensor Uncertainty Scale:</span>
                <span className="text-amber-400 font-bold tabular-nums">
                  {simulationEngine.config.sensorUncertainty.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={simulationEngine.config.sensorUncertainty}
                onChange={(e) => simulationEngine.setSensorUncertainty(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Preset Calibrations */}
            <div className="flex items-center gap-1 pt-1 border-t border-slate-800/80">
              <span className="text-slate-500 text-[9px]">Presets:</span>
              <button
                onClick={() => {
                  simulationEngine.setDriftNoiseFloor(0.8);
                  simulationEngine.setSensorUncertainty(0.7);
                }}
                className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 text-[9px] transition-colors"
                title="Tactical Grade Optical Flow + Nav IMU"
              >
                Tactical (0.8m)
              </button>
              <button
                onClick={() => {
                  simulationEngine.setDriftNoiseFloor(1.5);
                  simulationEngine.setSensorUncertainty(1.0);
                }}
                className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[9px] transition-colors"
                title="Nominal Commercial MEMS Sensor"
              >
                Nominal (1.5m)
              </button>
              <button
                onClick={() => {
                  simulationEngine.setDriftNoiseFloor(3.8);
                  simulationEngine.setSensorUncertainty(2.2);
                }}
                className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-rose-300 border border-slate-800 text-[9px] transition-colors"
                title="High Noise / Electronic Warfare Jamming Stress Test"
              >
                High Noise (3.8m)
              </button>
            </div>
          </div>

          {/* Agent Drift Discrepancy List */}
          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
            <span>PERCEIVED VS TRUTH DELTA (||Δp||)</span>
            <span>COVARIANCE σ</span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
            {agents.map((agent) => {
              const dx = agent.estimatedPose.x - agent.truePose.x;
              const dy = agent.estimatedPose.y - agent.truePose.y;
              const dz = agent.estimatedPose.z - agent.truePose.z;
              const errorMag = Math.hypot(dx, dy, dz);
              const isSelected = focusedAgentId === agent.id;
              const isJammed = agent.gpsStatus === 'denied';

              return (
                <button
                  key={agent.id}
                  onClick={() => onSelectAgent(agent.id)}
                  className={`w-full text-left p-1.5 rounded transition-all flex items-center justify-between text-[11px] ${
                    isSelected
                      ? 'bg-rose-950/60 border border-rose-700/80'
                      : 'bg-[#090d16] hover:bg-slate-900 border border-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: agent.color }}
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-200 text-[10px]">
                        {agent.callsign}
                      </span>
                      <div className="text-[9px] flex items-center gap-1">
                        {isJammed ? (
                          <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                            <ShieldAlert className="w-2.5 h-2.5" /> EW JAMMED
                          </span>
                        ) : (
                          <span className="text-emerald-400">● GPS FIX</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-bold tabular-nums text-[11px] ${
                        errorMag > 8
                          ? 'text-rose-400'
                          : errorMag > 3
                          ? 'text-amber-400'
                          : 'text-cyan-300'
                      }`}
                    >
                      Δ {errorMag.toFixed(1)}m
                    </div>
                    <div className="text-[9px] text-slate-400 tabular-nums">
                      σ: ±{agent.covarianceSigma.toFixed(1)}m
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800 flex items-center justify-between">
            <span>UWB Peer Anchoring: Active</span>
            <span>Z-Scale: 0.45x Baro Aided</span>
          </div>
        </div>
      )}
    </div>
  );
};
