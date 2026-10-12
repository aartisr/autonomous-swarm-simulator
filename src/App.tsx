/**
 * AERO-SWARM: Autonomous Swarm & Dynamic Pathfinding Simulator
 * Main application layout coordinating 3D WebGL theater, 2D tactical radar,
 * and bottom telemetry dock for CBBA ledger, ROS 2 bus, and pathfinding benchmarks.
 */

import React, { useEffect, useState } from 'react';
import { simulationEngine } from './engine/simulationEngine';
import { MissionControlRibbon } from './components/controls/MissionControlRibbon';
import { Operational3DView } from './components/views/Operational3DView';
import { Tactical2DView } from './components/views/Tactical2DView';
import { CbbaLedgerInspector } from './components/inspectors/CbbaLedgerInspector';
import { RosNodeInspector } from './components/inspectors/RosNodeInspector';
import { PathfindingBenchmarkView } from './components/inspectors/PathfindingBenchmark';
import { SwarmTelemetryTable } from './components/inspectors/SwarmTelemetryTable';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  Columns2,
  Cpu,
  GitBranch,
  Layers,
  Maximize2,
  Navigation,
  PlusCircle,
  ShieldAlert,
  Zap,
} from 'lucide-react';

export default function App() {
  const [, setTick] = useState(0);
  const [viewMode, setViewMode] = useState<'dual' | '3d_only' | '2d_only'>('dual');
  const [activeTab, setActiveTab] = useState<'cbba' | 'ros2' | 'pathfinding' | 'telemetry'>('cbba');

  useEffect(() => {
    // Authoritative 60 FPS physics & consensus simulation tick loop
    let animId: number;
    const runSimulationLoop = (now: number) => {
      animId = requestAnimationFrame(runSimulationLoop);
      simulationEngine.update(now);
    };
    animId = requestAnimationFrame(runSimulationLoop);

    // Re-render UI components on engine updates (throttled at ~10 Hz to keep DOM fast)
    let lastRender = 0;
    const unsubscribe = simulationEngine.subscribe(() => {
      const now = performance.now();
      if (now - lastRender > 100) {
        lastRender = now;
        setTick((t) => (t + 1) % 1000);
      }
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#07090e] text-slate-100 overflow-hidden font-sans">
      {/* 1. Top Mission Control Ribbon */}
      <MissionControlRibbon />

      {/* 2. Middle Main Viewport: Dual 3D Operational Theater + 2D Tactical Radar */}
      <div className="flex-1 min-h-0 flex flex-col p-2 gap-2">
        {/* View Layout Controls & Quick Scenario Bar */}
        <div className="flex items-center justify-between px-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Operational Viewport:
            </span>
            <div className="flex items-center bg-[#0b0f19] p-0.5 rounded border border-slate-800">
              <button
                onClick={() => setViewMode('dual')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  viewMode === 'dual'
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Columns2 className="w-3 h-3" />
                <span>Dual View (3D + 2D)</span>
              </button>
              <button
                onClick={() => setViewMode('3d_only')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  viewMode === '3d_only'
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Maximize2 className="w-3 h-3" />
                <span>3D Theater Only</span>
              </button>
              <button
                onClick={() => setViewMode('2d_only')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  viewMode === '2d_only'
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>2D Tactical Only</span>
              </button>
            </div>
          </div>

          {/* Quick Scenario & Event Injectors */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => simulationEngine.addDynamicTarget()}
              className="flex items-center gap-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded font-mono text-[11px] border border-slate-800 transition-colors"
            >
              <PlusCircle className="w-3 h-3 text-amber-400" />
              <span>Spawn Recon Target</span>
            </button>

            <button
              onClick={() => simulationEngine.addDynamicThreat()}
              className="flex items-center gap-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded font-mono text-[11px] border border-slate-800 transition-colors"
            >
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              <span>Inject Moving Threat</span>
            </button>
          </div>
        </div>

        {/* Viewport Stages Grid */}
        <div className="flex-1 min-h-[300px] grid grid-cols-1 md:grid-cols-2 gap-2">
          {(viewMode === 'dual' || viewMode === '3d_only') && (
            <div className={`h-full ${viewMode === '3d_only' ? 'md:col-span-2' : ''}`}>
              <ErrorBoundary fallbackTitle="3D Theater Subsystem Exception">
                <Operational3DView />
              </ErrorBoundary>
            </div>
          )}

          {(viewMode === 'dual' || viewMode === '2d_only') && (
            <div className={`h-full ${viewMode === '2d_only' ? 'md:col-span-2' : ''}`}>
              <ErrorBoundary fallbackTitle="2D Tactical Radar Subsystem Exception">
                <Tactical2DView />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Telemetry & Algorithmic Dock (280px) */}
      <div className="h-[280px] flex flex-col bg-[#0b0f19] border-t border-slate-800 shrink-0">
        {/* Tab Navigation Strip */}
        <div className="flex items-center justify-between px-3 bg-[#080c14] border-b border-slate-800">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('cbba')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-medium border-b-2 transition-colors ${
                activeTab === 'cbba'
                  ? 'border-amber-400 text-amber-300 bg-amber-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>CBBA Bundle Ledger</span>
            </button>

            <button
              onClick={() => setActiveTab('ros2')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-medium border-b-2 transition-colors ${
                activeTab === 'ros2'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>ROS 2 DDS Bus</span>
            </button>

            <button
              onClick={() => setActiveTab('pathfinding')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-medium border-b-2 transition-colors ${
                activeTab === 'pathfinding'
                  ? 'border-purple-400 text-purple-300 bg-purple-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5 text-purple-400" />
              <span>RRT* / A* Benchmark</span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-medium border-b-2 transition-colors ${
                activeTab === 'telemetry'
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>Swarm Nodes & VIO</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-slate-500">
            <span>RESILIENCE: COOPERATIVE UWB ANCHORING</span>
            <span>·</span>
            <span>AUTONOMY: DECENTRALIZED CONSENSUS</span>
          </div>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 min-h-0">
          <ErrorBoundary fallbackTitle="Telemetry Inspector Subsystem Exception">
            {activeTab === 'cbba' && <CbbaLedgerInspector />}
            {activeTab === 'ros2' && <RosNodeInspector />}
            {activeTab === 'pathfinding' && <PathfindingBenchmarkView />}
            {activeTab === 'telemetry' && <SwarmTelemetryTable />}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
