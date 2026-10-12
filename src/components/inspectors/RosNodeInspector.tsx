/**
 * ROS 2 Node Architecture & Topic Bus Inspector.
 * Displays registered ROS 2 nodes, published/subscribed topics with live Hz rates,
 * DDS QoS profiles, and raw ROS topic payload telemetry.
 */

import React, { useEffect, useState } from 'react';
import { ros2Bus } from '../../engine/ros2Middleware';
import { RosNodeInfo, RosTopicMessage } from '../../types/simulation';
import { Activity, Cpu, Layers, Radio, Sliders } from 'lucide-react';

export const RosNodeInspector: React.FC = () => {
  const [nodes, setNodes] = useState<RosNodeInfo[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('/swarm/consensus/bundle_ledger');
  const [recentMessages, setRecentMessages] = useState<RosTopicMessage[]>([]);
  const [simLatency, setSimLatency] = useState<number>(ros2Bus.simulatedLatencyMs);
  const [packetDrop, setPacketDrop] = useState<number>(ros2Bus.packetDropRate * 100);

  useEffect(() => {
    const interval = setInterval(() => {
      setNodes(ros2Bus.getNodes());
      setRecentMessages(ros2Bus.getRecentMessages(12, selectedTopic));
    }, 400);

    return () => clearInterval(interval);
  }, [selectedTopic]);

  const uniqueTopics = [
    '/swarm/consensus/bundle_ledger',
    '/swarm/telemetry',
    '/mesh/jamming_alert',
    '/alpha_01/vio_pose',
    '/alpha_01/cmd_vel',
    '/bravo_02/vio_pose',
    '/bravo_02/cmd_vel',
  ];

  const handleLatencyChange = (val: number) => {
    setSimLatency(val);
    ros2Bus.simulatedLatencyMs = val;
  };

  const handleDropChange = (val: number) => {
    setPacketDrop(val);
    ros2Bus.packetDropRate = val / 100;
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0f19] text-slate-200 text-xs">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e1422] border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>ROS 2 DDS Node & Topic Inspector</span>
          </div>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-slate-400">{nodes.length} Registered Nodes</span>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-cyan-400">DDS Cyclone RMW</span>
        </div>

        {/* Network Emulation Controls */}
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3 h-3 text-slate-400" />
            <span className="text-slate-400">Latency:</span>
            <input
              type="range"
              min="0"
              max="150"
              value={simLatency}
              onChange={(e) => handleLatencyChange(Number(e.target.value))}
              className="w-16 accent-cyan-400 cursor-pointer"
            />
            <span className="text-cyan-400 tabular-nums w-8">{simLatency}ms</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Packet Drop:</span>
            <input
              type="range"
              min="0"
              max="25"
              value={packetDrop}
              onChange={(e) => handleDropChange(Number(e.target.value))}
              className="w-16 accent-rose-400 cursor-pointer"
            />
            <span className="text-rose-400 tabular-nums w-6">{packetDrop}%</span>
          </div>
        </div>
      </div>

      {/* Main Content Split: Left Topics List, Right Live JSON Messages */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800 overflow-hidden">
        {/* Left Col: Topic Catalog */}
        <div className="p-3 overflow-y-auto space-y-2 bg-[#090d16]">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Active Swarm Topics</span>
          </div>

          <div className="space-y-1">
            {uniqueTopics.map((topic) => {
              const hz = ros2Bus.getTopicFrequency(topic);
              const isSelected = selectedTopic === topic;
              return (
                <button
                  key={topic}
                  onClick={() => setSelectedTopic(topic)}
                  className={`w-full flex items-center justify-between p-2 rounded text-left font-mono text-[11px] transition-colors ${
                    isSelected
                      ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
                      : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-800/80'
                  }`}
                >
                  <span className="truncate">{topic}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 tabular-nums">
                    {hz > 0 ? `${hz} Hz` : 'Active'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Node Summary List */}
          <div className="pt-3 border-t border-slate-800/80">
            <div className="text-slate-400 font-medium text-[11px] mb-1.5 flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>Node Graph Snapshot</span>
            </div>
            <div className="space-y-1 font-mono text-[10px]">
              {nodes.slice(0, 5).map((node) => (
                <div
                  key={node.name}
                  className="p-1.5 rounded bg-slate-900/40 border border-slate-800/60 flex items-center justify-between"
                >
                  <span className="text-slate-300 truncate">{node.name}</span>
                  <span className="text-emerald-400">NOMINAL</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 2 Cols: Live Topic Payload Viewer */}
        <div className="md:col-span-2 p-3 flex flex-col overflow-hidden bg-[#0a0e18]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-mono text-cyan-300 font-medium">{selectedTopic}</span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              Showing recent pub/sub frames
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[11px]">
            {recentMessages.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-500 italic">
                Awaiting messages on {selectedTopic}...
              </div>
            ) : (
              recentMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="p-2 rounded bg-slate-950/80 border border-slate-800/80 shadow-sm"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 border-b border-slate-800/60 pb-1">
                    <span className="text-cyan-400 font-semibold">{msg.sourceNode}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-1 rounded bg-slate-800 text-slate-300 uppercase">
                        QoS: {msg.qos}
                      </span>
                      <span>{new Date(msg.timestamp).toISOString().split('T')[1].slice(0, 8)}</span>
                    </div>
                  </div>
                  <pre className="text-emerald-300 text-[10px] overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(msg.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
