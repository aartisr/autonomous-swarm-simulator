/**
 * Swarm Communication Topology Overlay Component.
 * Displays real-time ROS 2 DDS peer-to-peer message handshake metrics,
 * link quality, throughput, and QoS reliability status across the swarm.
 */

import React, { useState } from 'react';
import { Agent } from '../../types/simulation';
import { simulationEngine } from '../../engine/simulationEngine';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  EyeOff,
  Radio,
  Share2,
  ShieldAlert,
  Zap,
} from 'lucide-react';

export interface PeerLinkTelemetry {
  id: string;
  sourceCallsign: string;
  targetCallsign: string;
  sourceColor: string;
  targetColor: string;
  distanceMeters: number;
  handshakeHz: number;
  latencyMs: number;
  rssiDb: number;
  isJammed: boolean;
  qos: 'RELIABLE' | 'BEST_EFFORT';
}

interface SwarmTopologyOverlayProps {
  peerLinks: PeerLinkTelemetry[];
  showHandshakeRates: boolean;
  onToggleHandshakeRates: () => void;
  showPacketPhotons: boolean;
  onTogglePacketPhotons: () => void;
  showRssiBadges: boolean;
  onToggleRssiBadges: () => void;
}

export const SwarmTopologyOverlay: React.FC<SwarmTopologyOverlayProps> = ({
  peerLinks,
  showHandshakeRates,
  onToggleHandshakeRates,
  showPacketPhotons,
  onTogglePacketPhotons,
  showRssiBadges,
  onToggleRssiBadges,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Compute aggregate network metrics
  const activeLinkCount = peerLinks.length;
  const jammedLinksCount = peerLinks.filter((l) => l.isJammed).length;
  const avgHz =
    activeLinkCount > 0
      ? peerLinks.reduce((sum, l) => sum + l.handshakeHz, 0) / activeLinkCount
      : 0;
  const totalThroughputMsgs = peerLinks.reduce((sum, l) => sum + l.handshakeHz * 2, 0);

  return (
    <div className="absolute top-12 right-2 z-20 w-80 max-w-[calc(100%-1rem)] bg-[#070b13]/90 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl overflow-hidden font-mono text-xs select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0c1220]/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Share2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200 text-[11px] uppercase tracking-wider">
            Swarm Comms Topology
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded border border-emerald-800 font-bold">
            ROS 2 DDS
          </span>
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          title={isCollapsed ? 'Expand Topology Overlay' : 'Collapse Topology Overlay'}
        >
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-2.5 flex flex-col gap-2">
          {/* Aggregate Network KPIs */}
          <div className="grid grid-cols-3 gap-1.5 p-2 bg-[#05080e] rounded border border-slate-800/80 text-[10px]">
            <div>
              <div className="text-slate-400 text-[9px] uppercase">Active Links</div>
              <div className="font-bold text-cyan-300 tabular-nums">
                {activeLinkCount} {jammedLinksCount > 0 && <span className="text-rose-400 text-[9px]">({jammedLinksCount} deg)</span>}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[9px] uppercase">Avg Handshake</div>
              <div className="font-bold text-emerald-400 tabular-nums">
                {avgHz.toFixed(1)} Hz
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[9px] uppercase">Throughput</div>
              <div className="font-bold text-purple-300 tabular-nums">
                {Math.round(totalThroughputMsgs)} msg/s
              </div>
            </div>
          </div>

          {/* Visual Display Toggles */}
          <div className="grid grid-cols-3 gap-1 text-[10px] bg-slate-900/60 p-1.5 rounded border border-slate-800/60">
            <button
              onClick={onToggleHandshakeRates}
              className={`py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors ${
                showHandshakeRates
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle Live Handshake Hz Labels along links"
            >
              <span className="truncate">Hz Labels</span>
              {showHandshakeRates ? <Eye className="w-2.5 h-2.5 text-cyan-400 shrink-0" /> : <EyeOff className="w-2.5 h-2.5 shrink-0" />}
            </button>

            <button
              onClick={onTogglePacketPhotons}
              className={`py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors ${
                showPacketPhotons
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle Animated DDS Packet Photons"
            >
              <span className="truncate">Packets</span>
              {showPacketPhotons ? <Eye className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> : <EyeOff className="w-2.5 h-2.5 shrink-0" />}
            </button>

            <button
              onClick={onToggleRssiBadges}
              className={`py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors ${
                showRssiBadges
                  ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                  : 'bg-slate-950 text-slate-400 border border-slate-800'
              }`}
              title="Toggle RSSI Signal Margin Badges"
            >
              <span className="truncate">RSSI / QoS</span>
              {showRssiBadges ? <Eye className="w-2.5 h-2.5 text-purple-400 shrink-0" /> : <EyeOff className="w-2.5 h-2.5 shrink-0" />}
            </button>
          </div>

          {/* Active Peer Handshake Channels */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
            <span>DDS PEER CHANNEL</span>
            <span>HANDSHAKE FREQ</span>
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
            {peerLinks.length === 0 ? (
              <div className="p-3 text-center text-slate-500 italic text-[10px]">
                No active P2P links. Swarm partitioned or out of range.
              </div>
            ) : (
              peerLinks.map((link) => (
                <div
                  key={link.id}
                  className={`p-1.5 rounded flex items-center justify-between border text-[10px] transition-all ${
                    link.isJammed
                      ? 'bg-rose-950/40 border-rose-800/60'
                      : 'bg-[#090d16] border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: link.sourceColor }}
                      />
                      <span className="font-bold text-slate-200">
                        {link.sourceCallsign.split('-')[0]}
                      </span>
                    </div>
                    <span className="text-slate-500">↔</span>
                    <div className="flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: link.targetColor }}
                      />
                      <span className="font-bold text-slate-200">
                        {link.targetCallsign.split('-')[0]}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-2">
                    <span className="text-slate-400 tabular-nums">
                      {link.distanceMeters.toFixed(0)}m
                    </span>
                    <span
                      className={`font-bold tabular-nums ${
                        link.isJammed
                          ? 'text-rose-400'
                          : link.handshakeHz > 20
                          ? 'text-emerald-300'
                          : 'text-cyan-300'
                      }`}
                    >
                      {link.handshakeHz.toFixed(1)} Hz
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800 flex items-center justify-between">
            <span>DDS Bus: /swarm/consensus/bundle</span>
            <span>Reliability: RTPS Best-Effort/Reliable</span>
          </div>
        </div>
      )}
    </div>
  );
};
