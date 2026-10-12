/**
 * CBBA (Consensus-Based Bundle Algorithm) Auction Ledger & Consensus Inspector.
 * Displays real-time decentralized bundle allocations, marginal bid matrices,
 * convergence status, and conflict resolution events.
 */

import React from 'react';
import { simulationEngine } from '../../engine/simulationEngine';
import { CheckCircle2, Flame, RefreshCw, Zap } from 'lucide-react';

export const CbbaLedgerInspector: React.FC = () => {
  const { targets, agents, consensusRound, isConsensusSettled, cbbaEvents } = simulationEngine;

  return (
    <div className="h-full flex flex-col bg-[#0b0f19] text-slate-200 text-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e1422] border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>CBBA Consensus Ledger</span>
          </div>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-slate-400">Round #{consensusRound}</span>
          <span className="text-slate-500">·</span>
          <div className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${
                isConsensusSettled ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="font-mono text-[11px] text-slate-300">
              {isConsensusSettled ? 'Consensus Settled' : 'Bids Active'}
            </span>
          </div>
        </div>

        <button
          onClick={() => simulationEngine.runCbbaStep()}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-[11px] border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3 h-3 text-cyan-400" />
          <span>Force Auction Round</span>
        </button>
      </div>

      {/* Main Grid: Target Allocation Matrix + Live Event Log */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-hidden">
        {/* Left 2 Cols: Target Bidding Table */}
        <div className="lg:col-span-2 overflow-auto p-3">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-1.5 font-medium">TARGET</th>
                <th className="pb-1.5 font-medium">PRIORITY</th>
                <th className="pb-1.5 font-medium">WINNING AGENT</th>
                <th className="pb-1.5 font-medium">HIGH BID</th>
                <th className="pb-1.5 font-medium">SCOUT STATUS</th>
                <th className="pb-1.5 font-medium">PEER BIDDERS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {targets.map((tgt) => {
                const winnerAgent = agents.find((a) => a.id === tgt.currentWinner);
                return (
                  <tr key={tgt.id} className="hover:bg-slate-900/40">
                    <td className="py-2 font-bold text-amber-400">{tgt.code}</td>
                    <td className="py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-semibold">
                        P{tgt.priority}
                      </span>
                    </td>
                    <td className="py-2">
                      {winnerAgent ? (
                        <span className="flex items-center gap-1.5 font-bold" style={{ color: winnerAgent.color }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: winnerAgent.color }} />
                          {winnerAgent.callsign}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2 text-cyan-400 font-semibold tabular-nums">
                      {tgt.winningBid > 0 ? tgt.winningBid.toFixed(1) : '-'}
                    </td>
                    <td className="py-2">
                      {tgt.status === 'scouted' ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Scouted (100%)</span>
                        </span>
                      ) : tgt.scoutedProgress > 0 ? (
                        <span className="text-cyan-400">
                          Recon ({Math.round(tgt.scoutedProgress * 100)}%)
                        </span>
                      ) : (
                        <span className="text-slate-400">Queued</span>
                      )}
                    </td>
                    <td className="py-2 text-[10px] text-slate-400">
                      <div className="flex gap-1.5 flex-wrap">
                        {Object.entries(tgt.bidLedger)
                          .filter(([, bid]) => bid > 0)
                          .map(([agentId, bid]) => {
                            const ag = agents.find((a) => a.id === agentId);
                            const isWin = tgt.currentWinner === agentId;
                            return (
                              <span
                                key={agentId}
                                className={`px-1 rounded ${
                                  isWin ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'bg-slate-900 text-slate-500'
                                }`}
                              >
                                {ag?.callsign?.slice(0, 3)}: {bid.toFixed(0)}
                              </span>
                            );
                          })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right Col: Conflict Resolution & Auction Event Log */}
        <div className="flex flex-col p-3 overflow-hidden bg-[#090d16]">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold mb-2">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>Consensus Resolution Log</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono text-[10px]">
            {cbbaEvents.map((evt, idx) => (
              <div
                key={idx}
                className="p-1.5 rounded bg-slate-900/60 border border-slate-800/80 text-slate-300 leading-snug"
              >
                <span className="text-slate-500 mr-1.5">[{idx + 1}]</span>
                {evt}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
