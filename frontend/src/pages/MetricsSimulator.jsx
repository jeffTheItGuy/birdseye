
import  { useState, useEffect } from 'react';
import { Activity, Cpu, MemoryStick, Clock, Shield, AlertTriangle, CheckCircle, ExternalLink, Timer } from 'lucide-react';
import birdseyeLogo from '../assets/logo.svg';

import SlidingCaptcha from '../components/SlidingCaptcha';
import RateLimitManager from '../components/RateLimitManager'; 
import { getApiBase, handleResponse, checkStatus } from '../utils/Utils';
import InstructionsSection from '../components/Instructions';


const APPLY_LIMIT_PER_15MINUTES = 3; 
const RECOMMENDED_COOLDOWN = 10; 

const MetricsSimulator = () => {

  const [grafanaUrl, setGrafanaUrl] = useState('');

  useEffect(() => {
    fetch('/config.json')
      .then((res) => res.ok ? res.json() : Promise.reject('Failed to load config'))
      .then((data) => {
        setGrafanaUrl(data.GRAFANA_URL);
      })
      .catch((err) => {
        console.warn('Using default Grafana URL:', err);
        setGrafanaUrl('https://birdseye.nimbusurf.com/grafana');
      });
  }, []);

  const [metrics, setMetrics] = useState({
    http_request_duration_seconds: { value: 0.250, scale: 1, icon: Clock, unit: 's', color: 'text-blue-500' },
    cpu_seconds_total: { value: 1540.25, scale: 1, icon: Cpu, unit: 's', color: 'text-red-500' },
    process_memory_bytes: { value: 536870912, scale: 1, icon: MemoryStick, unit: 'bytes', color: 'text-green-500' }
  });

  const [appliedMetrics, setAppliedMetrics] = useState(metrics);
  const [lastApplied, setLastApplied] = useState(Date.now());
  const [isApplying, setIsApplying] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('unknown');
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0); 
  const [debugInfo, setDebugInfo] = useState('');
  const [showGrafanaButton, setShowGrafanaButton] = useState(false);

  // Rate limit state
  const [rateLimitInfo, setRateLimitInfo] = useState({
    isLimited: false,
    remainingTime: 0,
    appliesInLastMinute: 0, 
  });

  // Initialize rate limit info on mount
  useEffect(() => {
    checkStatus(setConnectionStatus, setDebugInfo);
    updateRateLimitInfo();
  }, []);

  // Auto-check backend status
  useEffect(() => {
    const interval = setInterval(() => {
      checkStatus(setConnectionStatus, setDebugInfo);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer for remainingTime
  useEffect(() => {
    let interval;
    if (rateLimitInfo.remainingTime > 0) {
      interval = setInterval(() => {
        setRateLimitInfo((prev) => ({
          ...prev,
          remainingTime: Math.max(0, prev.remainingTime - 1),
        }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [rateLimitInfo.remainingTime]);

  //  F rate limit info
  const updateRateLimitInfo = () => {
    const now = Date.now();
    const fifteenMinutesAgo = now - (15 * 60 * 1000); // 15 minutes in milliseconds

    // Get recent applies from localStorage
    const recentApplies = JSON.parse(localStorage.getItem('recentApplies') || '[]')
      .filter(timestamp => timestamp > fifteenMinutesAgo);
    
    //  
    localStorage.setItem('recentApplies', JSON.stringify(recentApplies));

    const lastApplyTime = recentApplies.length > 0 ? Math.max(...recentApplies) : 0;
    const timeSinceLast = now - lastApplyTime;
    const isInCooldown = timeSinceLast < (RECOMMENDED_COOLDOWN * 1000);
    const isAtLimit = recentApplies.length >= APPLY_LIMIT_PER_15MINUTES;

    console.log('Rate limit debug:', {
      now,
      fifteenMinutesAgo,
      recentApplies: recentApplies.length,
      lastApplyTime,
      timeSinceLast,
      isInCooldown,
      isAtLimit,
      limit: APPLY_LIMIT_PER_15MINUTES
    });

    setRateLimitInfo({
      isLimited: isInCooldown || isAtLimit,
      remainingTime: isInCooldown ? Math.ceil((RECOMMENDED_COOLDOWN * 1000 - timeSinceLast) / 1000) : 0,
      appliesInLastMinute: recentApplies.length, 
    });
  };

  // Revalidate rate limit every second
  useEffect(() => {
    const interval = setInterval(updateRateLimitInfo, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatValue = (value, unit) => {
    if (unit === 'bytes') {
      const units = ['B', 'KB', 'MB', 'GB'];
      let size = value;
      let unitIndex = 0;
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }
      return `${size.toFixed(2)} ${units[unitIndex]}`;
    }
    if (unit === 's') {
      return `${value.toFixed(3)}s`;
    }
    return `${value.toFixed(2)} ${unit}`;
  };

  const handleScaleChange = (metricName, newScale) => {
    setMetrics((prev) => ({
      ...prev,
      [metricName]: {
        ...prev[metricName],
        scale: newScale,
      },
    }));
  };

  const applyChanges = async () => {
    if (!isCaptchaVerified) {
      setLastError('Please complete the security verification first.');
      return;
    }

    if (rateLimitInfo.isLimited) {
      const remainingTime = rateLimitInfo.remainingTime;
      if (remainingTime > 0) {
        setLastError(`Please wait ${remainingTime} seconds before applying again.`);
      } else {
        setLastError(`Rate limit exceeded. You've used all ${APPLY_LIMIT_PER_15MINUTES} applies in the last 15 minutes.`);
      }
      return;
    }

    setIsApplying(true);
    setLastError(null);

    try {
      const newAppliedMetrics = {};
      Object.entries(metrics).forEach(([key, metric]) => {
        const baseValue = appliedMetrics[key].value / appliedMetrics[key].scale;
        newAppliedMetrics[key] = {
          ...metric,
          value: baseValue * metric.scale,
        };
      });

      const metricsPayload = Object.fromEntries(
        Object.entries(newAppliedMetrics).map(([key, metric]) => [
          key,
          { value: metric.value, unit: metric.unit, timestamp: Date.now() },
        ])
      );

      const apiBase = getApiBase();
      const apiUrl = `${apiBase}/api/metrics/apply`;
      setDebugInfo(`Sending to: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics: metricsPayload, timestamp: Date.now() }),
        signal: AbortSignal.timeout(15000),
      });

      const { response: finalResponse, data: responseData } = await handleResponse(response);

      if (!finalResponse.ok) {
        if (finalResponse.status === 429) {
          throw new Error('Rate limit exceeded. Please wait before trying again.');
        } else if (finalResponse.status === 503) {
          throw new Error('Service unavailable. Backend may be down or starting up.');
        } else if ([502, 504].includes(finalResponse.status)) {
          throw new Error('Gateway error. Check if all services are running.');
        } else {
          const message = typeof responseData === 'object' ? responseData.message || responseData.detail : responseData;
          throw new Error(message || `HTTP ${finalResponse.status}`);
        }
      }

      // On success
      setAppliedMetrics(newAppliedMetrics);
      const now = Date.now();
      setLastApplied(now);

      // Update localStorage with proper 15-minute filtering
      const fifteenMinutesAgo = now - (15 * 60 * 1000);
      const recentApplies = JSON.parse(localStorage.getItem('recentApplies') || '[]')
        .filter(timestamp => timestamp > fifteenMinutesAgo);
      recentApplies.push(now);
      localStorage.setItem('recentApplies', JSON.stringify(recentApplies));

      // Reset CAPTCHA, show Grafana button
      setIsCaptchaVerified(false);
      setCaptchaKey(prev => prev + 1); // Force CAPTCHA component to reset
      setShowGrafanaButton(true);
      setTimeout(() => setShowGrafanaButton(false), 10000);

      // Force update rate limit display
      updateRateLimitInfo();

    } catch (error) {
      console.error('Failed to apply metrics:', error);
      let errorMsg = error.message;

      if (error.name === 'AbortError') {
        errorMsg = 'Request timeout. Server may be overloaded.';
      } else if (error.name === 'TypeError') {
        errorMsg = 'Network error. Check your connection.';
      }

      setLastError(errorMsg);
      setDebugInfo(`Error: ${errorMsg}`);
    } finally {
      setIsApplying(false);
    }
  };

  const resetAll = () => {
    const resetMetrics = Object.fromEntries(
      Object.entries(metrics).map(([key, metric]) => [key, { ...metric, scale: 1 }])
    );
    setMetrics(resetMetrics);
  };

  const hasChanges = Object.keys(metrics).some((key) => metrics[key].scale !== appliedMetrics[key].scale);
  const isApplyDisabled = !hasChanges || isApplying || !isCaptchaVerified || rateLimitInfo.isLimited;

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'disconnected': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      default: return <Activity className="w-4 h-4 text-yellow-400 animate-pulse" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex flex-col items-center justify-center">
              <div className="py-10 pt-20">
                <img src={birdseyeLogo} alt="Birdseye Logo" className="w-44 sm:w-94 h-20 sm:h-36 mx-auto" />
              </div>
            <h1 className="text-4xl font-bold pt-4">Birdseye Metrics Simulator</h1>
          </div>
          <p className="text-gray-400">Simulate changes to Prometheus-style metrics</p>
          <div className="text-xs text-gray-500 mt-2">API: {getApiBase()}/api</div>
          <div className="flex justify-center items-center mt-2 space-x-2">
            {getConnectionStatusIcon()}
            <span className="text-sm text-gray-400">
              {connectionStatus === 'connected' ? 'Connected' :
               connectionStatus === 'disconnected' ? 'Disconnected' : 'Checking...'}
            </span>
          </div>
          {debugInfo && (
            <div className="text-xs text-gray-600 mt-2 max-w-2xl mx-auto break-words">
              Debug: {debugInfo}
            </div>
          )}
        </div>

         <InstructionsSection />

        {/* Action Bar */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-6 gap-4">
          {showGrafanaButton && (
            <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl  animate-ping pointer-events-none -z-10"></div>
              
              <div className="relative z-10">
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-1 rounded-xl shadow-2xl">
                  <a
                    href={grafanaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-300 hover:to-red-300 px-6 py-3 rounded-lg font-bold text-white shadow-lg flex items-center space-x-2 transition-all duration-300 transform hover:scale-105 relative z-20"
                    style={{
                      background: 'linear-gradient(135deg, #ff8800 0%, #ff4400 100%)',
                      boxShadow: '0 8px 32px rgba(255, 68, 0, 0.4), 0 0 0 1px rgba(255, 136, 0, 0.3)'
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-white font-bold tracking-wide">
                         View in Grafana Dashboard
                      </span>
                      <ExternalLink className="w-4 h-4 text-white" />
                    </div>
                  </a>
                </div>
              </div>
            </div>
          )}
           
           
          

          <div className="flex-1">
            <div className="text-sm text-gray-400 mb-2">
              Last Applied: {new Date(lastApplied).toLocaleTimeString()}
              {lastError && (
                <div className="text-red-400 text-xs mt-1 flex items-center">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Error: {lastError}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Security Verification</label>
              <SlidingCaptcha 
                key={captchaKey} 
                onVerify={setIsCaptchaVerified} 
                disabled={isApplying} 
              />
              <div className="text-xs text-gray-500 mt-1">
                {isCaptchaVerified ? (
                  <span className="text-green-400">✓ Verification complete</span>
                ) : (
                  <span>Complete verification to enable submission</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={() => checkStatus(setConnectionStatus, setDebugInfo)}
              disabled={isApplying}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors flex items-center space-x-2"
            >
              <Activity className="w-4 h-4" />
              <span>Test</span>
            </button>
            <button
              onClick={resetAll}
              disabled={isApplying}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
            >
              Reset All
            </button>
            <button
              onClick={applyChanges}
              disabled={isApplyDisabled}
              className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center space-x-2 ${
                isApplyDisabled ? 'bg-gray-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/25'
              }`}
            >
              {isApplying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Applying...</span>
                </>
              ) : rateLimitInfo.isLimited ? (
                rateLimitInfo.remainingTime > 0 ? (
                  <>
                    <Timer className="w-4 h-4" />
                    <span>Wait {rateLimitInfo.remainingTime}s</span>
                  </>
                ) : (
                  <>
                    <Timer className="w-4 h-4" />
                    <span>Rate Limited</span>
                  </>
                )
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Apply Changes</span>
                </>
              )}
            </button>
          </div>
        </div>

        

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {Object.entries(metrics).map(([metricName, metric]) => {
            const Icon = metric.icon;
            const currentValue = (appliedMetrics[metricName].value / appliedMetrics[metricName].scale) * metric.scale;
            const hasChanged = metric.scale !== appliedMetrics[metricName].scale;

            return (
              <div
                key={metricName}
                className={`bg-gray-800 rounded-xl p-6 border-2 transition-all ${
                  hasChanged ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <Icon className={`w-6 h-6 ${metric.color}`} />
                  {hasChanged && <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>}
                </div>
                <h3 className="font-mono text-sm text-gray-300 mb-2 break-all">{metricName}</h3>
                <div className="mb-4">
                  <div className="text-2xl font-bold">{formatValue(currentValue, metric.unit)}</div>
                  <div className="text-sm text-gray-400">Scale: {metric.scale}x</div>
                </div>
                <div className="space-y-3">
                  <input
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={metric.scale}
                    onChange={(e) => handleScaleChange(metricName, parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>0.1x</span>
                    <span>10x</span>
                  </div>
                  <div className="flex space-x-1">
                    {[0.5, 1, 2, 5].map((scale) => (
                      <button
                        key={scale}
                        onClick={() => handleScaleChange(metricName, scale)}
                        className={`px-2 py-1 text-xs rounded ${
                          metric.scale === scale
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        }`}
                      >
                        {scale}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Current Status */}
        <div className="mt-8 bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-blue-400" />
            Current Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(appliedMetrics).map(([metricName, metric]) => (
              <div key={metricName} className="flex justify-between items-center py-2 px-3 bg-gray-700 rounded">
                <span className="font-mono text-xs text-gray-300 truncate">{metricName}</span>
                <span className="font-medium">{formatValue(metric.value, metric.unit)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rate Limit Manager */}
        <RateLimitManager rateLimitInfo={rateLimitInfo} />

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <div className="flex justify-center items-center space-x-4">
            <div className="flex items-center space-x-1">
              {getConnectionStatusIcon()}
              <span>Backend: {connectionStatus}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Timer className="w-3 h-3" />
              <span>Rate Limited API v2.1</span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #1e293b;
          box-shadow: 0 0 0 1px #3b82f6;
        }
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #02060cff;
          box-shadow: 0 0 0 1px #3b82f6;
        }
      `}</style>
    </div>
  );
};

export default MetricsSimulator;