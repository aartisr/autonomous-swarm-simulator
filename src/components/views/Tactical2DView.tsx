/**
 * 2D Tactical Radar & Mesh Topology Map.
 * Renders top-down P2P communication mesh links, VIO covariance drift ellipses,
 * GPS jamming danger zones, MIL-STD drone symbology, and radar sweep.
 */

import React, { useEffect, useRef, useState } from 'react';
import { simulationEngine } from '../../engine/simulationEngine';
import { Crosshair, PlusCircle, Radio, Share2, ShieldAlert } from 'lucide-react';
import { SwarmTopologyOverlay, PeerLinkTelemetry } from './SwarmTopologyOverlay';

export const Tactical2DView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [clickAction, setClickAction] = useState<'inspect' | 'spawn_target'>('inspect');
  const [showMeshLinks, setShowMeshLinks] = useState<boolean>(true);
  const [showCovariance, setShowCovariance] = useState<boolean>(true);
  const [showTopologyOverlay, setShowTopologyOverlay] = useState<boolean>(true);
  const [showHandshakeRates, setShowHandshakeRates] = useState<boolean>(true);
  const [showPacketPhotons, setShowPacketPhotons] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showRssiBadges, setShowRssiBadges] = useState<boolean>(false);
  const [peerLinksState, setPeerLinksState] = useState<PeerLinkTelemetry[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive Canvas Resizing
    const resizeCanvas = () => {
      if (container) {
        const w = container.clientWidth || 600;
        const h = container.clientHeight || 450;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    };
    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    if (container) {
      resizeObserver.observe(container);
    }

    let animId: number;
    let sweepAngle = 0;
    let lastStateSync = 0;

    const render = () => {
      animId = requestAnimationFrame(render);
      try {
        const width = canvas.width;
        const height = canvas.height;
        if (width === 0 || height === 0) return;

        const centerX = width / 2;
        const centerY = height / 2;
        // World coordinates span [-140, 140], scale to canvas
        const scale = Math.min(width, height) / 300;

        const toScreenX = (wx: number) => centerX + wx * scale;
        const toScreenY = (wy: number) => centerY - wy * scale; // Invert Y for standard Cartesian

        // Clear with dark tactical canvas
        ctx.fillStyle = '#080c14';
        ctx.fillRect(0, 0, width, height);

        // 1. Tactical Grid & Range Rings
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;

        // Range rings at 40m, 80m, 120m
        const rings = [40, 80, 120];
        for (const r of rings) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, r * scale, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#475569';
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillText(`${r}m`, centerX + 4, centerY - r * scale + 10);
        }

        // Crosshair center axes
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        // Sweeping radar beam (with fallback if createConicGradient is unsupported)
        sweepAngle = (sweepAngle + 0.02) % (Math.PI * 2);
        ctx.save();
        if (typeof ctx.createConicGradient === 'function') {
          const sweepGradient = ctx.createConicGradient(sweepAngle, centerX, centerY);
          sweepGradient.addColorStop(0, 'rgba(6, 182, 212, 0.12)');
          sweepGradient.addColorStop(0.12, 'rgba(6, 182, 212, 0)');
          sweepGradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
          ctx.fillStyle = sweepGradient;
          ctx.beginPath();
          ctx.arc(centerX, centerY, 140 * scale, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, 140 * scale, sweepAngle, sweepAngle + 0.35);
          ctx.closePath();
          ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
          ctx.fill();
        }
        ctx.restore();

      // 2. Render Threat & EW Jamming Zones
      for (const threat of simulationEngine.threats) {
        if (!threat.isActive) continue;
        const tx = toScreenX(threat.center.x);
        const ty = toScreenY(threat.center.y);
        const tr = threat.radius * scale;

        if (threat.type === 'jamming_emitter') {
          // EW Jamming zone
          ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#f43f5e';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#fda4af';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillText('EW JAMMING SECTOR', tx - 45, ty - tr - 4);
        } else {
          // Radar dome / dynamic threat
          ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, Math.PI * 2);
          ctx.stroke();

          // Heading vector
          if (threat.velocity.vx !== 0 || threat.velocity.vy !== 0) {
            ctx.strokeStyle = '#f59e0b';
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + threat.velocity.vx * 6, ty - threat.velocity.vy * 6);
            ctx.stroke();
          }
        }
      }

      // 3. Render P2P Mesh & Dynamic ROS 2 DDS Handshake Links
      const currentPeerLinks: PeerLinkTelemetry[] = [];
      const agents = simulationEngine.agents;

      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const a1 = agents[i];
          const a2 = agents[j];
          if (!a1.isAlive || !a2.isAlive) continue;

          const dx = a1.truePose.x - a2.truePose.x;
          const dy = a1.truePose.y - a2.truePose.y;
          const dz = a1.truePose.z - a2.truePose.z;
          const dist = Math.hypot(dx, dy, dz);

          if (dist <= a1.commsRange) {
            const isJammed = a1.gpsStatus === 'denied' || a2.gpsStatus === 'denied';
            const normDist = Math.min(1, dist / Math.max(1, a1.commsRange));
            const baseRate = 28 - normDist * 10;
            const jitter = Math.sin(performance.now() * 0.003 + (i * 7 + j)) * 1.8;
            const handshakeHz = isJammed
              ? Math.max(3.2, 7.5 - normDist * 3 + jitter * 0.4)
              : Math.max(12, baseRate + jitter);
            const latencyMs = Math.round(5 + normDist * 15 + (isJammed ? 38 : 0) + jitter * 0.6);
            const rssiDb = Math.round(-40 - normDist * 42 - (isJammed ? 22 : 0));
            const qos: 'RELIABLE' | 'BEST_EFFORT' = isJammed ? 'BEST_EFFORT' : 'RELIABLE';

            currentPeerLinks.push({
              id: `${a1.id}-${a2.id}`,
              sourceCallsign: a1.callsign,
              targetCallsign: a2.callsign,
              sourceColor: a1.color,
              targetColor: a2.color,
              distanceMeters: dist,
              handshakeHz,
              latencyMs,
              rssiDb,
              isJammed,
              qos,
            });

            if (showMeshLinks) {
              const x1 = toScreenX(a1.truePose.x);
              const y1 = toScreenY(a1.truePose.y);
              const x2 = toScreenX(a2.truePose.x);
              const y2 = toScreenY(a2.truePose.y);

              // Dynamic stroke width and color according to handshake frequency
              const lineWidth = Math.max(1.2, Math.min(3.8, 1.0 + (handshakeHz / 30) * 2.5));
              ctx.lineWidth = lineWidth;

              if (isJammed) {
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
                ctx.setLineDash([4, 4]);
              } else if (handshakeHz > 22) {
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)'; // Emerald for optimal DDS handshake
                ctx.setLineDash([]);
              } else {
                ctx.strokeStyle = 'rgba(6, 182, 212, 0.75)'; // Cyan for nominal
                ctx.setLineDash([]);
              }

              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
              ctx.setLineDash([]);

              // Animated DDS Packet Photons (data flowing between peers)
              if (showPacketPhotons) {
                const tNow = performance.now() * 0.001;
                const flowSpeed = (handshakeHz / 20) * 0.6;
                const phaseA = (tNow * flowSpeed + (i * 0.17)) % 1;
                const phaseB = (1 - (tNow * flowSpeed + (j * 0.17)) % 1);

                const pxA = x1 + (x2 - x1) * phaseA;
                const pyA = y1 + (y2 - y1) * phaseA;
                const pxB = x1 + (x2 - x1) * phaseB;
                const pyB = y1 + (y2 - y1) * phaseB;

                ctx.fillStyle = isJammed ? '#f43f5e' : '#6ee7b7';
                ctx.beginPath();
                ctx.arc(pxA, pyA, 2.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = isJammed ? '#fda4af' : '#67e8f9';
                ctx.beginPath();
                ctx.arc(pxB, pyB, 2.0, 0, Math.PI * 2);
                ctx.fill();
              }

              // Real-Time Handshake Frequency Hz Label at link midpoint
              if (showHandshakeRates) {
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;

                const labelText = `${handshakeHz.toFixed(1)} Hz`;
                ctx.font = '8px "JetBrains Mono", monospace';
                const textWidth = ctx.measureText(labelText).width;

                ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
                ctx.fillRect(mx - textWidth / 2 - 3, my - 6, textWidth + 6, 12);

                ctx.strokeStyle = isJammed ? 'rgba(244, 63, 94, 0.6)' : 'rgba(6, 182, 212, 0.4)';
                ctx.lineWidth = 0.8;
                ctx.strokeRect(mx - textWidth / 2 - 3, my - 6, textWidth + 6, 12);

                ctx.fillStyle = isJammed ? '#fda4af' : handshakeHz > 22 ? '#34d399' : '#38bdf8';
                ctx.fillText(labelText, mx - textWidth / 2, my + 3);

                // Optional RSSI / Latency label
                if (showRssiBadges) {
                  const subText = `${rssiDb}dBm · ${latencyMs}ms`;
                  const subWidth = ctx.measureText(subText).width;
                  ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
                  ctx.fillRect(mx - subWidth / 2 - 2, my + 7, subWidth + 4, 10);
                  ctx.fillStyle = '#94a3b8';
                  ctx.font = '7px "JetBrains Mono", monospace';
                  ctx.fillText(subText, mx - subWidth / 2, my + 15);
                }
              }
            }
          }
        }
      }

      // 4. Render Reconnaissance Targets
      for (const target of simulationEngine.targets) {
        const tgtX = toScreenX(target.position.x);
        const tgtY = toScreenY(target.position.y);

        // Diamond symbol
        ctx.save();
        ctx.translate(tgtX, tgtY);

        const size = 7;
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size, 0);
        ctx.closePath();

        if (target.status === 'scouted') {
          ctx.fillStyle = '#10b981';
          ctx.fill();
        } else if (target.currentWinner) {
          ctx.fillStyle = '#3b82f6';
          ctx.fill();
        } else {
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Scouting progress arc
        if (target.scoutedProgress > 0 && target.scoutedProgress < 1) {
          ctx.beginPath();
          ctx.arc(0, 0, size + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * target.scoutedProgress);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.restore();

        // Target label
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(target.code, tgtX + 10, tgtY + 3);

        if (target.currentWinner) {
          const winnerAgent = simulationEngine.agents.find((a) => a.id === target.currentWinner);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillText(`BID: ${target.winningBid.toFixed(0)} [${winnerAgent?.callsign || target.currentWinner}]`, tgtX + 10, tgtY + 12);
        }
      }

      // 5. Render Swarm Agents & Covariance Ellipses
      for (const agent of simulationEngine.agents) {
        if (!agent.isAlive) continue;
        const ax = toScreenX(agent.truePose.x);
        const ay = toScreenY(agent.truePose.y);

        // Covariance Ellipse (Uncertainty from VIO drift)
        if (showCovariance) {
          const estX = toScreenX(agent.estimatedPose.x);
          const estY = toScreenY(agent.estimatedPose.y);
          const sigmaR = Math.max(3, agent.covarianceSigma * scale);

          ctx.beginPath();
          ctx.arc(estX, estY, sigmaR, 0, Math.PI * 2);
          if (agent.gpsStatus === 'denied') {
            ctx.fillStyle = 'rgba(244, 63, 94, 0.15)';
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
          } else {
            ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
          }
          ctx.fill();
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Agent True Position Marker
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(-agent.truePose.yaw); // Rotate with vehicle heading

        if (agent.type === 'rover') {
          // Rover square with tracks
          ctx.fillStyle = agent.color;
          ctx.fillRect(-5, -5, 10, 10);
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(-5, -5, 10, 10);
        } else {
          // Quadrotor chevron arrow
          ctx.fillStyle = agent.color;
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(-6, -6);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-6, 6);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();

        // Callsign & Status Label
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(agent.callsign, ax + 10, ay - 4);

        if (agent.gpsStatus === 'denied') {
          ctx.fillStyle = '#f43f5e';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillText(`VIO σ: ${agent.covarianceSigma.toFixed(1)}m`, ax + 10, ay + 6);
        }
      }

      // Sync React peerLinksState at 4 Hz (every 250ms)
      const now = performance.now();
      if (now - lastStateSync > 250) {
        lastStateSync = now;
        setPeerLinksState(currentPeerLinks);
      }
    } catch (err) {
      console.warn('Tactical 2D render loop handled frame fault:', err);
    }
  };

  render();

  return () => {
    cancelAnimationFrame(animId);
  };
}, [showMeshLinks, showCovariance, showHandshakeRates, showPacketPhotons, showRssiBadges]);

  // Handle canvas click to spawn target or inspect
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height) / 300;

    const worldX = (clickX - centerX) / scale;
    const worldY = (centerY - clickY) / scale;

    if (clickAction === 'spawn_target') {
      simulationEngine.addDynamicTarget({ x: worldX, y: worldY, z: 15 }, 5);
      setClickAction('inspect');
    } else {
      // Find nearest agent to select
      let nearestAgentId: string | null = null;
      let minDist = 25;
      for (const agent of simulationEngine.agents) {
        const d = Math.hypot(agent.truePose.x - worldX, agent.truePose.y - worldY);
        if (d < minDist) {
          minDist = d;
          nearestAgentId = agent.id;
        }
      }
      simulationEngine.selectAgent(nearestAgentId);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#07090e] border border-slate-800 rounded-lg overflow-hidden select-none">
      {/* 2D Tactical Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0b0f19] border-b border-slate-800 text-xs z-10">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
            Tactical 2D Radar & Comms Mesh
          </span>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-emerald-400">P2P Ad-Hoc</span>
        </div>

        {/* Viewport Toggles & Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTopologyOverlay(!showTopologyOverlay)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              showTopologyOverlay ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
            title="Toggle Swarm Communication Topology HUD"
          >
            <Share2 className="w-3 h-3 text-emerald-400" />
            <span>DDS Topology: {showTopologyOverlay ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setShowMeshLinks(!showMeshLinks)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              showMeshLinks ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>Mesh Links</span>
          </button>

          <button
            onClick={() => setShowCovariance(!showCovariance)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              showCovariance ? 'bg-rose-950/80 text-rose-300 border border-rose-800' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            <ShieldAlert className="w-3 h-3" />
            <span>VIO Covariance</span>
          </button>

          <button
            onClick={() => setClickAction(clickAction === 'spawn_target' ? 'inspect' : 'spawn_target')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-colors ${
              clickAction === 'spawn_target'
                ? 'bg-amber-600 text-white font-bold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <PlusCircle className="w-3 h-3" />
            <span>{clickAction === 'spawn_target' ? 'Click Map to Place' : 'Deploy Target'}</span>
          </button>
        </div>
      </div>

      {/* Canvas Element */}
      <div ref={containerRef} className="relative flex-1 w-full min-h-[340px]">
        <canvas
          ref={canvasRef}
          width={600}
          height={450}
          onClick={handleCanvasClick}
          className="w-full h-full object-cover cursor-crosshair"
        />

        {/* Swarm Communication Topology Real-Time HUD */}
        {showTopologyOverlay && (
          <SwarmTopologyOverlay
            peerLinks={peerLinksState}
            showHandshakeRates={showHandshakeRates}
            onToggleHandshakeRates={() => setShowHandshakeRates(!showHandshakeRates)}
            showPacketPhotons={showPacketPhotons}
            onTogglePacketPhotons={() => setShowPacketPhotons(!showPacketPhotons)}
            showRssiBadges={showRssiBadges}
            onToggleRssiBadges={() => setShowRssiBadges(!showRssiBadges)}
          />
        )}

        {/* Tactical Legend Overlay */}
        <div className="absolute top-2 left-2 z-10 pointer-events-none flex flex-col gap-1 text-[10px] font-mono bg-black/60 backdrop-blur-sm p-2 rounded border border-white/10 text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
            <span>Nominal Swarm Node</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            <span>GPS-Denied / Jammed Node</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rotate-45 bg-amber-400 inline-block" />
            <span>Reconnaissance Target</span>
          </div>
        </div>
      </div>
    </div>
  );
};
