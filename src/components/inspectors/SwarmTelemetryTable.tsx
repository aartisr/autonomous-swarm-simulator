/**
 * Swarm Multi-Agent Telemetry Table.
 * Real-time tabular readout of agent 3D coordinates, VIO drift covariance sigma,
 * battery state of charge, RF peer mesh link count, and CBBA assigned target.
 */

import React from 'react';
import { simulationEngine } from '../../engine/simulationEngine';
import { Battery, BatteryWarning, Navigation, Radio, ShieldAlert } from 'lucide-react';

export const SwarmTelemetryTable: React.FC = () => {
  const { agents, targets, config } = simulationEngine;
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  return (
    <div className="h-full flex flex-col bg-[#0b0f19] text-slate-200 text-xs overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e1422] border-b border-slate-800">
        <div className="flex items-center gap-2 font-semibold text-slate-200">
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          <span>Swarm Node Telemetry & VIO Health</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
          <span>ACTIVE AGENTS: {agents.length}</span>
          <span>·</span>
          <span>
            JAMMED AGENTS: {agents.filter((a) => a.gpsStatus === 'denied').length}
          </span>
        </div>
      </div>

      {/* VIO Noise Floor & Uncertainty Configuration Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-[#080c14] border-b border-slate-800 text-[11px] font-mono">
        <div className="flex items-center gap-4">
          {/* Drift Noise Floor Slider */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Drift Noise Floor (σ₀):</span>
            <input
              type="range"
              min="0.5"
              max="6.0"
              step="0.1"
              value={config.driftNoiseFloor}
              onChange={(e) => simulationEngine.setDriftNoiseFloor(parseFloat(e.target.value))}
              className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
            <span className="text-rose-400 font-bold tabular-nums w-12">
              {config.driftNoiseFloor.toFixed(1)}m
            </span>
          </div>

          <span className="text-slate-600">·</span>

          {/* Sensor Uncertainty Slider */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Sensor Uncertainty:</span>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={config.sensorUncertainty}
              onChange={(e) => simulationEngine.setSensorUncertainty(parseFloat(e.target.value))}
              className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <span className="text-amber-400 font-bold tabular-nums w-10">
              {config.sensorUncertainty.toFixed(1)}x
            </span>
          </div>
        </div>

        {/* Quick Calibration Presets */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[10px]">PRESETS:</span>
          <button
            onClick={() => {
              simulationEngine.setDriftNoiseFloor(0.8);
              simulationEngine.setSensorUncertainty(0.7);
            }}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 text-[10px] transition-colors"
          >
            Tactical (0.8m)
          </button>
          <button
            onClick={() => {
              simulationEngine.setDriftNoiseFloor(1.5);
              simulationEngine.setSensorUncertainty(1.0);
            }}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10px] transition-colors"
          >
            Nominal (1.5m)
          </button>
          <button
            onClick={() => {
              simulationEngine.setDriftNoiseFloor(3.8);
              simulationEngine.setSensorUncertainty(2.2);
            }}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-rose-300 border border-slate-800 text-[10px] transition-colors"
          >
            High Noise (3.8m)
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-3">
        <table className="w-full text-left font-mono text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="pb-1.5 font-medium">CALLSIGN</th>
              <th className="pb-1.5 font-medium">TYPE</th>
              <th className="pb-1.5 font-medium">TRUE POSE (X, Y, Z)</th>
              <th className="pb-1.5 font-medium">AIRSPEED</th>
              <th className="pb-1.5 font-medium">GPS STATUS</th>
              <th className="pb-1.5 font-medium">VIO DRIFT (σ)</th>
              <th className="pb-1.5 font-medium min-w-[130px]">BATTERY & EST. MISSION TIME</th>
              <th className="pb-1.5 font-medium">MESH PEERS</th>
              <th className="pb-1.5 font-medium">ASSIGNED TARGET</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {agents.map((agent) => {
              const currentTgt = agent.bundle.length > 0 ? targetMap.get(agent.bundle[0]) : null;
              const isSelected = config.selectedAgentId === agent.id;
              const speed = Math.hypot(agent.trueVel.vx, agent.trueVel.vy, agent.trueVel.vz);

              // Calculate estimated remaining mission time
              // drainRate is % battery per second
              const drainRate = agent.batteryDrainRate > 0 ? agent.batteryDrainRate : 0.04;
              const remainingSeconds = Math.max(0, agent.battery / drainRate);
              const remMinutes = Math.floor(remainingSeconds / 60);
              const remSecs = Math.floor(remainingSeconds % 60);
              const timeString = `${remMinutes}m ${remSecs < 10 ? '0' : ''}${remSecs}s`;

              // Battery status styling
              const isCritLow = agent.battery <= 20;
              const isLow = agent.battery <= 45;
              const batteryBarColor = isCritLow
                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                : isLow
                ? 'bg-amber-400'
                : 'bg-emerald-400';

              const batteryTextColor = isCritLow
                ? 'text-rose-400 font-bold'
                : isLow
                ? 'text-amber-400 font-semibold'
                : 'text-emerald-300 font-semibold';

              return (
                <tr
                  key={agent.id}
                  onClick={() => simulationEngine.selectAgent(agent.id)}
                  className={`hover:bg-slate-900/50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : ''
                  }`}
                >
                  <td className="py-2 font-bold" style={{ color: agent.color }}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color }} />
                      <span>{agent.callsign}</span>
                    </div>
                  </td>
                  <td className="py-2 uppercase text-slate-400 text-[10px]">
                    {agent.type}
                  </td>
                  <td className="py-2 text-slate-300 tabular-nums">
                    ({agent.truePose.x.toFixed(1)}, {agent.truePose.y.toFixed(1)}, {agent.truePose.z.toFixed(1)}m)
                  </td>
                  <td className="py-2 text-cyan-300 tabular-nums">
                    {speed.toFixed(1)} m/s
                  </td>
                  <td className="py-2">
                    {agent.gpsStatus === 'nominal' ? (
                      <span className="text-emerald-400 font-semibold">● NOMINAL</span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-400 font-semibold">
                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                        <span>DENIED (EW)</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 tabular-nums">
                    <span
                      className={`font-semibold ${
                        agent.covarianceSigma > 10
                          ? 'text-rose-400'
                          : agent.covarianceSigma > 3
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      ±{agent.covarianceSigma.toFixed(2)}m
                    </span>
                  </td>
                  {/* Battery Health Indicator Column */}
                  <td className="py-2 tabular-nums">
                    <div className="flex flex-col gap-1 min-w-[130px] pr-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {isCritLow ? (
                            <BatteryWarning className="w-3 h-3 text-rose-400 animate-pulse" />
                          ) : (
                            <Battery className={`w-3 h-3 ${isLow ? 'text-amber-400' : 'text-emerald-400'}`} />
                          )}
                          <span className={batteryTextColor}>
                            {agent.battery.toFixed(0)}%
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ~{timeString}
                        </span>
                      </div>
                      {/* Health progress bar */}
                      <div className="w-full bg-slate-800/90 rounded-full h-1.5 overflow-hidden flex">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${batteryBarColor}`}
                          style={{ width: `${Math.min(100, Math.max(0, agent.battery))}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2 tabular-nums text-slate-400">
                    <div className="flex items-center gap-1">
                      <Radio className="w-3 h-3 text-cyan-400" />
                      <span>{agent.peerLinks.length} nodes</span>
                    </div>
                  </td>
                  <td className="py-2">
                    {currentTgt ? (
                      <span className="text-amber-300 font-bold">
                        [{currentTgt.code}] ({Math.round(currentTgt.scoutedProgress * 100)}%)
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Holding</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
