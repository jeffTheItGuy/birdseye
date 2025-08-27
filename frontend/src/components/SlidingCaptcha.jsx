import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, RotateCcw } from 'lucide-react';

const SlidingCaptcha = ({ onVerify, disabled = false, className = "" }) => {
  const [isVerified, setIsVerified] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [puzzlePosition, setPuzzlePosition] = useState(0);
  const [tolerance] = useState(5); // Reduced tolerance for more precision
  const sliderRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(300);

  // Constants for handle and target dimensions
  const HANDLE_WIDTH = 40; // 10 * 0.25rem * 16px = 40px (w-10)
  const TARGET_WIDTH = 32; // 8 * 0.25rem * 16px = 32px (w-8)

  // Generate random puzzle position when component mounts or resets
  useEffect(() => {
    generateNewPuzzle();
  }, []);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth - 40); // Account for padding
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const generateNewPuzzle = () => {
    const minPos = containerWidth * 0.15;
    const maxPos = containerWidth * 0.75;
    const newPosition = Math.random() * (maxPos - minPos) + minPos;
    setPuzzlePosition(newPosition);
    setSliderPosition(0);
    setIsVerified(false);
    if (onVerify) onVerify(false);
  };

  const checkVerification = (sliderPos) => {
    // Calculate the center of the slider handle
    const sliderCenter = sliderPos + (HANDLE_WIDTH / 2);
    
    // Calculate the center of the target area
    const targetCenter = puzzlePosition + (TARGET_WIDTH / 2);
    
    // Check if the centers are within tolerance
    return Math.abs(sliderCenter - targetCenter) <= tolerance;
  };

  const handleMouseDown = (e) => {
    if (disabled || isVerified) return;
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || disabled || isVerified) return;
    
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const newPosition = Math.max(0, Math.min(containerWidth - HANDLE_WIDTH, e.clientX - rect.left - (HANDLE_WIDTH / 2)));
    setSliderPosition(newPosition);

    if (checkVerification(newPosition)) {
      setIsVerified(true);
      setIsDragging(false);
      if (onVerify) onVerify(true);
    }
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (!isVerified) {
      setSliderPosition(0);
    }
  };

  const handleTouchStart = (e) => {
    if (disabled || isVerified) return;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging || disabled || isVerified) return;
    
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const touch = e.touches[0];
    const newPosition = Math.max(0, Math.min(containerWidth - HANDLE_WIDTH, touch.clientX - rect.left - (HANDLE_WIDTH / 2)));
    setSliderPosition(newPosition);

    if (checkVerification(newPosition)) {
      setIsVerified(true);
      setIsDragging(false);
      if (onVerify) onVerify(true);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (!isVerified) {
      setSliderPosition(0);
    }
  };

  const handleReset = () => {
    generateNewPuzzle();
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, containerWidth, puzzlePosition, tolerance]);

  return (
    <div className={`select-none ${className}`}>
      {/* Text above the captcha */}
      <div className="text-center mb-1">
        {isVerified ? (
          <span className="text-sm font-semibold text-green-400">
            ✓ Verified Successfully
          </span>
        ) : (
          <span className="text-sm font-medium text-gray-300">
            Slide to verify
          </span>
        )}
      </div>

      {/* Slider container */}
      <div 
        ref={containerRef}
        className="relative bg-gray-700 border-2 border-gray-600 rounded-lg h-12 overflow-hidden"
        style={{ minWidth: '280px' }}
      >
        {/* Background track */}
        <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-700"></div>
        
        {/* Target area indicator */}
        <div 
          className="absolute top-0 bottom-0 w-8 bg-blue-900/50 border-l-2 border-r-2 border-blue-400 border-dashed opacity-80"
          style={{ left: `${puzzlePosition}px` }}
        >
          <div className="flex items-center justify-center h-full">
            <Lock className="w-4 h-4 text-blue-400" />
          </div>
        </div>

        {/* Progress fill */}
        <div 
          className={`absolute top-0 bottom-0 left-0 ${
            isVerified ? 'bg-green-600/30' : 'bg-blue-600/30'
          }`}
          style={{ width: `${sliderPosition + HANDLE_WIDTH}px` }}
        ></div>

        {/* Slider handle */}
        <div
          ref={sliderRef}
          className={`absolute top-1 bottom-1 w-10 rounded-md cursor-grab active:cursor-grabbing flex items-center justify-center ${
            isVerified 
              ? 'bg-green-500 shadow-lg' 
              : isDragging 
                ? 'bg-blue-600 shadow-lg' 
                : 'bg-blue-500 hover:bg-blue-600 shadow-md'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{ left: `${sliderPosition}px` }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {isVerified ? (
            <Unlock className="w-4 h-4 text-white" />
          ) : (
            <Lock className="w-4 h-4 text-white" />
          )}
        </div>
      </div>

      {/* Reset button */}
      <button
        onClick={handleReset}
        className="mt-2 p-1 text-gray-400 hover:text-gray-300 transition-colors"
        title="Reset captcha"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
};

// Demo component to test the captcha
const App = () => {
  const [verificationStatus, setVerificationStatus] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
        <h2 className="text-white text-xl mb-4 text-center">Sliding Captcha Test</h2>
        <SlidingCaptcha onVerify={setVerificationStatus} />
        <div className="mt-4 text-center">
          <span className={`text-sm ${verificationStatus ? 'text-green-400' : 'text-gray-400'}`}>
            Status: {verificationStatus ? 'Verified ✓' : 'Not verified'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SlidingCaptcha;