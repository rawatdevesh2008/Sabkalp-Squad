import React from 'react';
import { UserScore } from '../types';

interface ScoreBoardProps {
  score: UserScore | null;
  isLoading: boolean;
  hasInspectedItem?: boolean;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({ score, isLoading, hasInspectedItem = false }) => {
  if (!score) {
    return (
      <div className="glass-panel rounded-2xl p-5 sm:p-6 text-center border border-slate-200 dark:border-slate-800/80">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/40 border-t-emerald-400 animate-spin mx-auto mb-2" />
        <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-medium">Syncing Household Telemetry...</p>
      </div>
    );
  }

  // Zero State Rule: The accuracy level and contamination must be strictly 0 until an object is shown or its photo is uploaded
  const hasActiveScan = Boolean(hasInspectedItem && score.total_scans > 0);
  const accuracy = hasActiveScan ? Math.min(100, Math.max(0, score.segregation_accuracy_pct)) : 0;
  const contaminationStopped = hasActiveScan ? score.contamination_prevented : 0;

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800/80 relative overflow-hidden group">
      {/* Subtle Polished Gold & Emerald Ambient Lighting */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header Row with Polished Gold Leaderboard Aesthetic */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl badge-gold flex items-center justify-center text-lg shadow-md shrink-0">
            🏆
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight">
                Household Leaderboard
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/30 font-bold">
                Tier 1
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
              <span>Household ID:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{score.user_id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shrink-0 shadow-sm shadow-emerald-500/5 font-mono">
            <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 ${isLoading ? 'animate-ping' : ''}`} />
            <span>{isLoading ? 'Syncing...' : 'DynamoDB Live'}</span>
          </span>
        </div>
      </div>

      {/* 2-Column Metrics Cards with Zero State Handling */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4">
        {/* Metric 1: Segregation Accuracy */}
        <div className="bg-slate-50/90 dark:bg-[#070A0F]/70 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:border-cyan-500/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold font-mono">
                Accuracy Rate
              </span>
              <span className="text-sm">🎯</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent mt-1.5 font-mono tracking-tight">
              {accuracy}%
            </p>
          </div>

          <div className="mt-3">
            {/* Visual Progress Bar Gauge */}
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${accuracy}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate mt-1.5 font-mono">
              {hasActiveScan ? `${score.correct_scans} of ${score.total_scans} verified clean` : 'Awaiting initial waste scan'}
            </span>
          </div>
        </div>

        {/* Metric 2: Contamination Prevented */}
        <div className="bg-slate-50/90 dark:bg-[#070A0F]/70 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:border-rose-500/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold font-mono">
                Contamination Stopped
              </span>
              <span className="text-sm">🛑</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent mt-1.5 font-mono tracking-tight">
              {contaminationStopped}
            </p>
          </div>

          <div className="mt-3">
            {/* Progress track */}
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${hasActiveScan ? Math.min(100, contaminationStopped * 10) : 0}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate mt-1.5 font-mono">
              {hasActiveScan ? 'Cross-contamination averted' : '0 violations detected'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Meta Row */}
      <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800/80 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 font-mono">
        <span className="truncate">Sankalp Squad • Bharat Builds Tour</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Telemetry Active</span>
        </span>
      </div>
    </div>
  );
};

export default ScoreBoard;
