/**
 * Path Planner Overlay Component.
 * Dynamically toggles visibility and inspection of RRT* and A* search trees,
 * rendering explored branches, frontier lattice nodes, and live solver metrics.
 */

import React, { useState } from 'react';
import { simulationEngine } from '../../engine/simulationEngine';
import { Agent } from '../../types/simulation';
import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  EyeOff,
  GitBranch,
  Play,
  RefreshCw,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';

interface PathPlannerOverlayProps {
  agents: Agent[];
  focusedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
  showSearchTree: boolean;
  onToggleSearchTree: () => void;
  showFrontierNodes: boolean;
  onToggleFrontierNodes: () => void;
  showSolutionPath: boolean;
  onToggleSolutionPath: () => void;
  treeOpacity: number;
  onChangeTreeOpacity: (val: number) => void;
}

export const PathPlannerOverlay: React.FC<PathPlannerOverlayProps> = ({
  agents,
  focusedAgentId,
  onSelectAgent,
  showSearchTree,
  onToggleSearchTree,
  showFrontierNodes,
  onToggleFrontierNodes,
  showSolutionPath,
  onToggleSolutionPath,
  treeOpacity,
  onChangeTreeOpacity,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const activeAlgo = simulationEngine.config.pathfindingAlgo;
  const benchmark = simulationEngine.lastBenchmark;

  // Aggregate tree statistics across swarm
  let totalTreeNodes = 0;
  let totalRewires = 0;
  for (const agent of agents) {
    if (agent.rrtTree) {
      totalTreeNodes += agent.rrtTree.nodes.length;
      totalRewires += agent.rrtTree.rewiresCount;
    } else if (agent.aStarTree) {
      totalTreeNodes += agent.aStarTree.exploredNodes.length;
    }
  }

  return (
    <div className="absolute top-12 left-2 z-20 w-80 max-w-[calc(100%-1rem)] bg-[#070b13]/90 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl overflow-hidden font-mono text-xs select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0c1220]/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200 text-[11px] uppercase tracking-wider">
            Path Planner Overlay
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-cyan-950 text-cyan-300 rounded border border-cyan-800 font-bold">
            {activeAlgo}
          </span>
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          title={isCollapsed ? 'Expand Path Planner Overlay' : 'Collapse Path Planner Overlay'}
        >
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-2.5 flex flex-col gap-2">
          {/* Algorithm Switcher Bar */}
          <div className="flex items-center justify-between gap-1 p-1 bg-[#05080e] rounded border border-slate-800/80">
            <span className="text-slate-400 text-[10px] pl-1">Engine:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => simulationEngine.setPathfindingAlgo('RRT*')}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                  activeAlgo === 'RRT*'
                    ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                RRT* (Continuous)
              </button>
              <button
                onClick={() => simulationEngine.setPathfindingAlgo('A*')}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                  activeAlgo === 'A*'
                    ? 'bg-blue-950 text-blue-300 font-bold border border-blue-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                A* (3D Lattice)
              </button>
            </div>
            <button
              onClick={() => simulationEngine.replanAllAgents()}
              className="p-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700"
              title="Force Real-Time Re-plan"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* Search Tree Layer Visibility Controls */}
          <div className="grid grid-cols-3 gap-1 text-[10px] bg-slate-900/60 p-1.5 rounded border border-slate-800/60">
            <button
              onClick={onToggleSearchTree}
              className={`py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors ${
                showSearchTree
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle Full 3D Search Tree Branches"
            >
              <span className="truncate">Search Tree</span>
              {showSearchTree ? <Eye className="w-2.5 h-2.5 text-cyan-400 shrink-0" /> : <EyeOff className="w-2.5 h-2.5 shrink-0" />}
            </button>

            <button
              onClick={onToggleFrontierNodes}
              className={`py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors ${
                showFrontierNodes
                  ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle Frontier Lattice Vertices"
            >
              <span className="truncate">Frontier</span>
              {showFrontierNodes ? <Eye className="w-2.5 h-2.5 text-purple-400 shrink-0" /> : <EyeOff className="w-2.5 h-2.5 shrink-0" />}
            </button>

            <button
              onClick={onToggleSolutionPath}
              className={`py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors ${
                showSolutionPath
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle Best Trajectory Spline"
            >
              <span className="truncate">Path</span>
              {showSolutionPath ? <Eye className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> : <EyeOff className="w-2.5 h-2.5 shrink-0" />}
            </button>
          </div>

          {/* Search Tree Opacity Slider */}
          <div className="flex items-center justify-between gap-2 p-1.5 bg-[#05080e] rounded border border-slate-800 text-[10px]">
            <span className="text-slate-400">Tree Opacity:</span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={treeOpacity}
              onChange={(e) => onChangeTreeOpacity(parseFloat(e.target.value))}
              className="w-28 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="text-cyan-300 font-bold tabular-nums w-8 text-right">
              {Math.round(treeOpacity * 100)}%
            </span>
          </div>

          {/* Real-Time Solver Telemetry Matrix */}
          <div className="grid grid-cols-3 gap-1.5 p-2 bg-[#05080e] rounded border border-slate-800/80 text-[10px]">
            <div>
              <div className="text-slate-400 text-[9px] uppercase">
                {activeAlgo === 'RRT*' ? 'Tree Nodes' : 'Expanded'}
              </div>
              <div className="font-bold text-cyan-300 tabular-nums">
                {benchmark ? benchmark.nodesEvaluated : totalTreeNodes}
              </div>
            </div>

            <div>
              <div className="text-slate-400 text-[9px] uppercase">
                {activeAlgo === 'RRT*' ? 'Rewires' : 'Grid Res'}
              </div>
              <div className="font-bold text-purple-300 tabular-nums">
                {activeAlgo === 'RRT*' ? (benchmark?.rewiresCount ?? totalRewires) : '10m'}
              </div>
            </div>

            <div>
              <div className="text-slate-400 text-[9px] uppercase">Latency</div>
              <div className="font-bold text-emerald-400 tabular-nums">
                {benchmark ? `${benchmark.planningTimeMs.toFixed(1)} ms` : '<2 ms'}
              </div>
            </div>
          </div>

          {/* Agent Spotlight Filter */}
          <div className="flex flex-col gap-1 pt-1 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>SPOTLIGHT AGENT TREE:</span>
              {focusedAgentId && (
                <button
                  onClick={() => onSelectAgent(null)}
                  className="text-cyan-400 hover:underline text-[9px]"
                >
                  Show All Swarm
                </button>
              )}
            </div>

            <div className="flex gap-1 flex-wrap">
              {agents.map((agent) => {
                const isSelected = focusedAgentId === agent.id;
                const hasPath = agent.path.length > 0;
                return (
                  <button
                    key={agent.id}
                    onClick={() => onSelectAgent(isSelected ? null : agent.id)}
                    className={`px-1.5 py-0.5 rounded text-[9px] transition-all flex items-center gap-1 border ${
                      isSelected
                        ? 'bg-cyan-950 text-white border-cyan-400 font-bold shadow-sm'
                        : hasPath
                        ? 'bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950 text-slate-600 border-slate-900 opacity-60'
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span>{agent.callsign.split('-')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Explanatory Technical Footer */}
          <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800 flex items-center justify-between">
            <span>Dynamic Replanning: Active</span>
            <span>Collision Buffer: 6m</span>
          </div>
        </div>
      )}
    </div>
  );
};
