/**
 * Mission Control Ribbon & Tactical Command Bar.
 * Follows aerospace high-density layout guidelines.
 */

import React, { useState } from 'react';
import { simulationEngine } from '../../engine/simulationEngine';
import {
  Check,
  Download,
  FastForward,
  Pause,
  Play,
  PlusCircle,
  Radio,
  RefreshCw,
  ShieldAlert,
  StepForward,
  Users,
  Zap,
} from 'lucide-react';

export const MissionControlRibbon: React.FC = () => {
  const { config, missionElapsedTime, agents, isConsensusSettled, totalTargetsScouted, targets } =
    simulationEngine;

  const [hasDownloaded, setHasDownloaded] = useState(false);

  const handleDownloadLogs = () => {
    simulationEngine.downloadSimulationLogs();
    setHasDownloaded(true);
    setTimeout(() => {
      setHasDownloaded(false);
    }, 2500);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#0b0f19] border-b border-slate-800 text-xs select-none">
      {/* Brand & Mission Status Zone */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-tight text-white font-mono uppercase text-cyan-400">
            AERO-SWARM
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-300 font-medium hidden sm:inline">
            Autonomous Swarm Simulator
          </span>
        </div>

        {/* Mission Elapsed Time */}
        <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-900 rounded border border-slate-800 font-mono">
          <span className="text-slate-400 text-[10px]">MISSION TIME:</span>
          <span className="text-cyan-300 font-bold tabular-nums">
            {formatTime(missionElapsedTime)}
          </span>
        </div>

        {/* Swarm Consensus Status */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-slate-900 rounded border border-slate-800 font-mono text-[11px]">
          <span className="text-slate-400">CBBA:</span>
          <span
            className={`font-semibold ${
              isConsensusSettled ? 'text-emerald-400' : 'text-amber-400 animate-pulse'
            }`}
          >
            {isConsensusSettled ? 'CONSENSUS REACHED' : 'AUCTIONING'}
          </span>
        </div>

        {/* Scouted Targets Count */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 rounded border border-slate-800 font-mono text-[11px]">
          <span className="text-slate-400">SCOUTED:</span>
          <span className="text-emerald-400 font-bold tabular-nums">
            {totalTargetsScouted} / {targets.length}
          </span>
        </div>
      </div>

      {/* Primary Simulation Controls */}
      <div className="flex items-center gap-2">
        {/* Play / Pause */}
        <button
          onClick={() => simulationEngine.togglePlayPause()}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono font-medium text-xs transition-colors ${
            config.isPlaying
              ? 'bg-amber-600/90 hover:bg-amber-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {config.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{config.isPlaying ? 'Pause' : 'Resume'}</span>
        </button>

        {/* Step */}
        <button
          onClick={() => simulationEngine.singleStep()}
          disabled={config.isPlaying}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded border border-slate-700 transition-colors"
          title="Single Step Frame"
        >
          <StepForward className="w-3.5 h-3.5" />
        </button>

        {/* Speed multiplier */}
        <div className="flex items-center bg-slate-900 p-0.5 rounded border border-slate-800 font-mono text-[11px]">
          {[1, 2, 5].map((spd) => (
            <button
              key={spd}
              onClick={() => simulationEngine.setSimSpeed(spd)}
              className={`px-2 py-0.5 rounded transition-colors ${
                config.simSpeed === spd
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Swarm Scale Dropdown */}
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-900 rounded border border-slate-800 font-mono text-[11px]">
          <Users className="w-3 h-3 text-cyan-400" />
          <select
            value={config.swarmSize}
            onChange={(e) => simulationEngine.setSwarmSize(Number(e.target.value))}
            className="bg-transparent text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value={4} className="bg-slate-900">4 Agents</option>
            <option value={6} className="bg-slate-900">6 Agents</option>
            <option value={8} className="bg-slate-900">8 Agents</option>
            <option value={12} className="bg-slate-900">12 Agents</option>
          </select>
        </div>

        {/* EW Jammer Toggle */}
        <button
          onClick={() => simulationEngine.toggleJammer()}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-mono text-[11px] transition-colors border ${
            config.jammingActive
              ? 'bg-rose-950/90 text-rose-300 border-rose-800'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title="Toggle Electronic Warfare GPS Jammer"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>EW Jammer: {config.jammingActive ? 'ACTIVE' : 'OFF'}</span>
        </button>

        {/* UWB Cooperative Anchoring Toggle */}
        <button
          onClick={() => simulationEngine.toggleUwbAnchoring()}
          className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded font-mono text-[11px] transition-colors border ${
            config.uwbAnchoringActive
              ? 'bg-cyan-950/90 text-cyan-300 border-cyan-800'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title="Toggle Cooperative P2P UWB Relative Localization"
        >
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span>UWB Anchoring: {config.uwbAnchoringActive ? 'ON' : 'OFF'}</span>
        </button>

        {/* Download Simulation Logs Button */}
        <button
          onClick={handleDownloadLogs}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded font-mono text-[11px] transition-all border shadow-sm ${
            hasDownloaded
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600'
              : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-slate-700 hover:border-cyan-500 hover:text-cyan-200'
          }`}
          title="Download CBBA Ledger State and Swarm Telemetry as JSON"
        >
          {hasDownloaded ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400 animate-in zoom-in-50" />
              <span className="font-semibold text-emerald-300">Logs Exported</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Download Simulation Logs</span>
            </>
          )}
        </button>

        {/* Reset */}
        <button
          onClick={() => simulationEngine.initScenario(config.scenario)}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
          title="Reset Simulation Scenario"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
