// src/components/RateLimitManager.jsx - FIXED VERSION
import React from 'react';
import { Timer, AlertCircle } from 'lucide-react';

const APPLY_LIMIT_PER_15MINUTES = 3;
const RECOMMENDED_COOLDOWN = 10; // seconds

const formatTime = (seconds) => `${seconds}s`;

const RateLimitManager = ({ rateLimitInfo, onInfoClick }) => {
  const { isLimited, remainingTime, appliesInLastMinute } = rateLimitInfo;
  
  // Rename for clarity - this is actually applies in last 15 minutes
  const appliesInLast15Minutes = appliesInLastMinute;

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h2 className="text-lg font-bold mb-4 flex items-center text-yellow-400">
        <AlertCircle className="w-5 h-5 mr-2" />
        Rate Limit Status
      </h2>

      {isLimited && (
        <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-500/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-yellow-400">
              <Timer className="w-5 h-5" />
              <span className="font-medium">
                {remainingTime > 0 ? 'Cooldown Active' : 'Rate Limited'}
              </span>
            </div>
            {remainingTime > 0 && (
              <span className="text-lg font-bold text-yellow-300">{formatTime(remainingTime)}</span>
            )}
          </div>
          <p className="text-yellow-200 text-sm mt-1">
            {remainingTime > 0
              ? `Wait ${formatTime(remainingTime)} before applying changes`
              : appliesInLast15Minutes >= APPLY_LIMIT_PER_15MINUTES
                ? `You've used all ${APPLY_LIMIT_PER_15MINUTES} applies in the last 15 minutes`
                : 'Rate limit active'}
          </p>
          {remainingTime > 0 && (
            <div className="mt-2 bg-yellow-800/30 rounded-full h-2">
              <div
                className="bg-yellow-400 h-2 rounded-full transition-all duration-1000"
                style={{
                  width: `${((RECOMMENDED_COOLDOWN - remainingTime) / RECOMMENDED_COOLDOWN) * 100}%`,
                }}
              ></div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="bg-gray-700 rounded p-3">
          <div className="text-gray-400">Limit per 15 Minutes</div>
          <div className="text-xl font-bold text-yellow-400">{APPLY_LIMIT_PER_15MINUTES}</div>
          <div className="text-xs text-gray-500">applies allowed</div>
        </div>
        <div className="bg-gray-700 rounded p-3">
          <div className="text-gray-400">Used Last 15 Minutes</div>
          <div className={`text-xl font-bold ${appliesInLast15Minutes >= APPLY_LIMIT_PER_15MINUTES ? 'text-red-400' : 'text-blue-400'}`}>
            {appliesInLast15Minutes}
          </div>
          <div className="text-xs text-gray-500">applies made</div>
        </div>
        <div className="bg-gray-700 rounded p-3">
          <div className="text-gray-400">Wait Time</div>
          <div className="text-xl font-bold text-green-400">{RECOMMENDED_COOLDOWN}s</div>
          <div className="text-xs text-gray-500">recommended</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-400 flex items-start">
        <AlertCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
        <span>
          <strong>Tip:</strong> You can make {APPLY_LIMIT_PER_15MINUTES} applies every 15 minutes. 
          Wait {RECOMMENDED_COOLDOWN} seconds between applies to avoid hitting the short-term cooldown.
        </span>
      </div>
    </div>
  );
};

export default RateLimitManager;