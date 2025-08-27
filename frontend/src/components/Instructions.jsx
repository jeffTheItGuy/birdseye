import React from 'react';
import { Info, Clock } from 'lucide-react';

const InstructionsSection = () => {
  const steps = [
    {
      number: "1",
      title: "Adjust Metrics",
      description: "Use the sliders or preset buttons to modify metric scales (0.1x to 10x)",
      color: "text-blue-400"
    },
    {
      number: "2",
      title: "Complete Security Verification", 
      description: "Slide the captcha to verify you're human",
      color: "text-blue-400"
    },
    {
      number: "3",
      title: "Apply Changes",
      description: "Click 'Apply Changes' to submit your metric modifications",
      color: "text-blue-400"
    }
  ];

  return (
    <div className="bg-gray-800 rounded-xl p-6 mb-8 border border-gray-700">
      <div className="flex items-center mb-4">
        <Info className="w-5 h-5 mr-2 text-blue-400" />
        <h2 className="text-xl font-semibold text-white">How to Use</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start space-x-3">
            <div className={`w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold ${step.color} flex-shrink-0`}>
              {step.number}
            </div>
            <div>
              <h3 className="font-medium text-white text-sm mb-1">{step.title}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-gray-700">
        <div className="flex items-start space-x-3">
          <Clock className="w-4 h-4 mt-0.5 text-orange-400 flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-orange-400">Rate Limit:</span>
            <span className="text-sm text-gray-300 ml-2">
              You are limited to 3 applies per 15 minutes with a 10 second cooldown between submissions.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstructionsSection;