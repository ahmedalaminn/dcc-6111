import { useState, useEffect, useRef } from 'react';

// Mock data types
interface Node {
  id: string;
  status: 'connected' | 'disconnected';
  isLocal: boolean;
}

interface LogMessage {
  timestamp: string;
  producerId: string;
  payload: string;
}

export default function App() {
  const [diagnosticLoggingEnabled, setDiagnosticLoggingEnabled] = useState(true);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [logMessages, setLogMessages] = useState<LogMessage[]>([]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logMessages]);

  // Get data from back end
  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5000/stream')

    eventSource.addEventListener('node_status', (event) => {
      const data = JSON.parse(event.data)
      const mappedStatus = data.status === 'ok' ? 'connected' : 'disconnected'

      setNodes((prevNodes) => {
        const existingIndex = prevNodes.findIndex((n) => n.id === data.node_id)
        if (existingIndex >= 0) {
          const newNodes = [...prevNodes]
          newNodes[existingIndex].status = mappedStatus
          return newNodes
        }
        return [...prevNodes, { id: data.node_id, status: mappedStatus, isLocal: false }]
      })
    })

    eventSource.addEventListener('log', (event) => {
      const data = JSON.parse(event.data)
      const newMessage: LogMessage = {
        timestamp: data.ts,
        producerId: data.node_id,
        payload: data.payload,
      }
      
      setLogMessages((prev) => [...prev, newMessage])

      setNodes((prevNodes) => {
        const existingIndex = prevNodes.findIndex((n) => n.id === data.node_id)
        if (existingIndex < 0) {
          return [...prevNodes, { id: data.node_id, status: 'connected', isLocal: false }]
        }
        return prevNodes
      })
    })

    return () => eventSource.close()
  }, [])

  return (
    <div className="size-full bg-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 pb-6 border-b-2 border-gray-300">
          <h1 className="text-3xl font-mono mb-6">DISTRIBUTED PUBSUB NETWORK LOGGER</h1>
          
          {/* Diagnostic Logging Toggle */}
          <div className="flex items-center gap-4 p-4 border-2 border-gray-400 bg-gray-50">
            <label htmlFor="diagnostic-toggle" className="font-mono font-semibold text-lg">
              DIAGNOSTIC LOGGING:
            </label>
            <button
              id="diagnostic-toggle"
              onClick={() => setDiagnosticLoggingEnabled(!diagnosticLoggingEnabled)}
              className={`relative w-16 h-8 border-2 border-gray-800 transition-colors ${
                diagnosticLoggingEnabled ? 'bg-gray-800' : 'bg-white'
              }`}
              aria-pressed={diagnosticLoggingEnabled}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 bg-white border-2 border-gray-800 transition-transform ${
                  diagnosticLoggingEnabled ? 'translate-x-8 bg-gray-800' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="font-mono font-semibold">
              {diagnosticLoggingEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Section 1: Network Overview */}
          <div className="lg:col-span-1">
            <div className="border-2 border-gray-400">
              <div className="bg-gray-200 border-b-2 border-gray-400 p-4">
                <h2 className="font-mono font-semibold text-lg">SECTION 1: NETWORK OVERVIEW</h2>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {nodes.map((node) => (
                    <div
                      key={node.id}
                      className="border-2 border-gray-300 p-3 bg-white"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-mono text-sm font-semibold">NODE ID:</div>
                        {node.isLocal && (
                          <div className="px-2 py-1 border-2 border-gray-800 bg-gray-800 text-white text-xs font-mono font-semibold">
                            LOCAL
                          </div>
                        )}
                      </div>
                      <div className="font-mono text-sm mb-2 break-all">{node.id}</div>
                      <div className="flex items-center gap-2">
                        <div className="font-mono text-xs font-semibold">STATUS:</div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 border-2 ${
                              node.status === 'connected'
                                ? 'bg-gray-800 border-gray-800'
                                : 'bg-white border-gray-400'
                            }`}
                          />
                          <span className="font-mono text-xs">
                            {node.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Local Node Activity Indicator */}
            <div className="mt-4 border-2 border-gray-400 bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-4 h-4 border-2 border-gray-800 ${
                    diagnosticLoggingEnabled ? 'bg-gray-800 animate-pulse' : 'bg-white'
                  }`}
                />
                <div className="font-mono text-sm font-semibold">
                  LOCAL NODE ACTIVITY: {diagnosticLoggingEnabled ? 'ACTIVE' : 'IDLE'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Live Diagnostic Log */}
          <div className="lg:col-span-2">
            <div className="border-2 border-gray-400 h-[600px] flex flex-col">
              <div className="bg-gray-200 border-b-2 border-gray-400 p-4">
                <h2 className="font-mono font-semibold text-lg">SECTION 2: LIVE DIAGNOSTIC LOG</h2>
              </div>
              
              <div className="flex-1 overflow-auto" ref={logContainerRef}>
                <table className="w-full border-collapse font-mono text-sm">
                  <thead className="sticky top-0 bg-gray-100 border-b-2 border-gray-400">
                    <tr>
                      <th className="text-left p-3 border-r-2 border-gray-300 font-semibold">
                        TIMESTAMP
                      </th>
                      <th className="text-left p-3 border-r-2 border-gray-300 font-semibold">
                        PRODUCER ID
                      </th>
                      <th className="text-left p-3 font-semibold">
                        PAYLOAD (PROTOBUF DATA)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logMessages.map((message, index) => (
                      <tr
                        key={index}
                        className="border-b border-gray-200 hover:bg-gray-50"
                      >
                        <td className="p-3 border-r border-gray-200 whitespace-nowrap">
                          {message.timestamp}
                        </td>
                        <td className="p-3 border-r border-gray-200">
                          {message.producerId}
                        </td>
                        <td className="p-3 text-xs break-all">
                          {message.payload}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!diagnosticLoggingEnabled && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-gray-400 bg-white p-6 text-center">
                    <div className="font-mono font-semibold">
                      LOGGING DISABLED
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 border-2 border-gray-300 bg-gray-50 p-3">
              <div className="font-mono text-xs">
                TOTAL MESSAGES LOGGED: {logMessages.length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}