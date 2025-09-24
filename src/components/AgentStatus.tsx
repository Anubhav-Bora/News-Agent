// Displays pipeline progress/logs
'use client';

import { useState, useEffect } from 'react';

interface AgentStatus {
  collector: 'idle' | 'running' | 'success' | 'error';
  summarizer: 'idle' | 'running' | 'success' | 'error';
  pdfGenerator: 'idle' | 'running' | 'success' | 'error';
  audioGenerator: 'idle' | 'running' | 'success' | 'error';
  emailer: 'idle' | 'running' | 'success' | 'error';
}

export default function AgentStatus() {
  const [status, setStatus] = useState<AgentStatus>({
    collector: 'idle',
    summarizer: 'idle',
    pdfGenerator: 'idle',
    audioGenerator: 'idle',
    emailer: 'idle',
  });

  const getStatusColor = (agentStatus: string) => {
    switch (agentStatus) {
      case 'running': return 'text-yellow-600';
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (agentStatus: string) => {
    switch (agentStatus) {
      case 'running': return '⏳';
      case 'success': return '✅';
      case 'error': return '❌';
      default: return '⚪';
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Agent Pipeline Status</h2>
      
      <div className="space-y-3">
        {Object.entries(status).map(([agent, agentStatus]) => (
          <div key={agent} className="flex items-center justify-between">
            <span className="capitalize font-medium">
              {agent.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <div className={`flex items-center space-x-2 ${getStatusColor(agentStatus)}`}>
              <span>{getStatusIcon(agentStatus)}</span>
              <span className="capitalize">{agentStatus}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}