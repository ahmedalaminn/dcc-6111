import { useEffect, useRef, useState } from "react";

const MAX_LOG_MESSAGES = 500;

interface Node {
  id: string;
  status: "connected" | "disconnected";
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) {
      return;
    }

    const threshold = 56;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;

    if (isAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logMessages]);

  useEffect(() => {
    const eventSource = new EventSource("http://localhost:5001/stream");

    eventSource.addEventListener("logging_toggle", (event) => {
      const data = JSON.parse(event.data);
      setDiagnosticLoggingEnabled(data.enabled);
    });

    eventSource.addEventListener("node_status", (event) => {
      const data = JSON.parse(event.data);
      const mappedStatus = data.status === "ok" ? "connected" : "disconnected";

      setNodes((prevNodes) => {
        const existingIndex = prevNodes.findIndex((node) => node.id === data.node_id);
        if (existingIndex >= 0) {
          const next = [...prevNodes];
          next[existingIndex].status = mappedStatus;
          return next;
        }
        return [...prevNodes, { id: data.node_id, status: mappedStatus, isLocal: false }];
      });
    });

    eventSource.addEventListener("log", (event) => {
      const data = JSON.parse(event.data);
      const nextMessage: LogMessage = {
        timestamp: data.ts,
        producerId: data.node_id,
        payload: data.payload,
      };

      setLogMessages((prev) => {
        const next = [...prev, nextMessage];
        if (next.length > MAX_LOG_MESSAGES) {
          return next.slice(next.length - MAX_LOG_MESSAGES);
        }
        return next;
      });

      setNodes((prevNodes) => {
        const existingIndex = prevNodes.findIndex((node) => node.id === data.node_id);
        if (existingIndex < 0) {
          return [...prevNodes, { id: data.node_id, status: "connected", isLocal: false }];
        }
        return prevNodes;
      });
    });

    return () => eventSource.close();
  }, []);

  async function toggleDiagnosticLogging() {
    const nextState = !diagnosticLoggingEnabled;
    try {
      const response = await fetch("http://localhost:5001/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState }),
      });
      if (response.ok) {
        setDiagnosticLoggingEnabled(nextState);
      }
    } catch (error) {
      console.error("Failed to toggle logging:", error);
    }
  }

  function toggleNodeSelection(nodeId: string) {
    setSelectedNodeIds((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId],
    );
  }

  const displayedLogs =
    selectedNodeIds.length > 0
      ? logMessages.filter((message) => selectedNodeIds.includes(message.producerId))
      : logMessages;

  const activeNodes = nodes.filter((node) => node.status === "connected").length;

  return (
    <div className="min-h-screen bg-[#eef1f6] text-[#091426]">
      <header className="bg-[#0014dc] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-6 py-5 lg:px-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">SLB Internal Tool Suite</p>
            <h1 className="mt-1 text-4xl font-normal tracking-[-0.05em]">Node Communication Logger</h1>
          </div>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-white/80">
            <span>Project 2</span>
            <span className="h-4 w-px bg-white/25" />
            <span>Communication Diagnostics</span>
          </div>
        </div>
      </header>

      <div className="border-b border-[#d7dce6] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-4 text-[11px] uppercase tracking-[0.18em] text-[#667085] lg:px-8">
          <span>Network Overview</span>
          <span className="font-bold text-[#0014dc]">-&gt;</span>
          <span>Live Diagnostics</span>
          <span className="font-bold text-[#0014dc]">-&gt;</span>
          <span>Node-Level Filtering</span>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-4">
          <article className="border border-[#d7dce6] bg-white p-4 shadow-[0_20px_40px_rgba(0,20,220,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0014dc]">Nodes Seen</p>
            <p className="mt-3 text-3xl font-normal tracking-[-0.04em]">{nodes.length}</p>
          </article>
          <article className="border border-[#d7dce6] bg-white p-4 shadow-[0_20px_40px_rgba(0,20,220,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0014dc]">Active Nodes</p>
            <p className="mt-3 text-3xl font-normal tracking-[-0.04em]">{activeNodes}</p>
          </article>
          <article className="border border-[#d7dce6] bg-white p-4 shadow-[0_20px_40px_rgba(0,20,220,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0014dc]">Messages Buffered</p>
            <p className="mt-3 text-3xl font-normal tracking-[-0.04em]">{logMessages.length}</p>
          </article>
          <article className="border border-[#d7dce6] bg-white p-4 shadow-[0_20px_40px_rgba(0,20,220,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0014dc]">Visible Records</p>
            <p className="mt-3 text-3xl font-normal tracking-[-0.04em]">{displayedLogs.length}</p>
          </article>
        </section>

        <section className="border border-[#d7dce6] bg-white shadow-[0_20px_40px_rgba(0,20,220,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d7dce6] bg-[#f6f8fb] px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0014dc]">Control Rail</p>
              <h2 className="mt-1 text-2xl font-normal tracking-[-0.04em]">Diagnostic Logging</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] uppercase tracking-[0.16em] text-[#667085]">
                State: {diagnosticLoggingEnabled ? "ON" : "OFF"}
              </span>
              <button
                type="button"
                onClick={toggleDiagnosticLogging}
                className={`border px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
                  diagnosticLoggingEnabled
                    ? "border-[#0014dc] bg-[#0014dc] text-white hover:bg-[#0010b6]"
                    : "border-[#bcc5d3] bg-white text-[#091426] hover:border-[#0014dc] hover:text-[#0014dc]"
                }`}
                aria-pressed={diagnosticLoggingEnabled}
              >
                {diagnosticLoggingEnabled ? "Disable Logging ->" : "Enable Logging ->"}
              </button>
            </div>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <section className="border border-[#d7dce6] bg-white">
              <div className="border-b border-[#d7dce6] bg-[#f6f8fb] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0014dc]">Section 1</p>
                    <h3 className="mt-1 text-xl font-normal tracking-[-0.04em]">Network Overview</h3>
                  </div>
                  {selectedNodeIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedNodeIds([])}
                      className="border border-[#bcc5d3] bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#091426] transition hover:border-[#0014dc] hover:text-[#0014dc]"
                    >
                      {"Clear Filter ->"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-3 p-4">
                {nodes.length === 0 ? (
                  <div className="border border-dashed border-[#d7dce6] bg-[#f6f8fb] px-4 py-8 text-sm text-[#667085]">
                    No nodes seen yet.
                  </div>
                ) : null}
                {nodes.map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    onClick={() => toggleNodeSelection(node.id)}
                    className={`block w-full border p-4 text-left transition ${
                      selectedNodeIds.includes(node.id)
                        ? "border-[#0014dc] bg-[#eef2ff] shadow-[inset_3px_0_0_0_#0014dc]"
                        : "border-[#d7dce6] bg-white hover:border-[#0014dc] hover:bg-[#f6f8fb]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#667085]">Node ID</span>
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                          node.status === "connected" ? "text-[#0014dc]" : "text-[#b42318]"
                        }`}
                      >
                        {node.status}
                      </span>
                    </div>
                    <div className="mt-3 break-all font-mono text-sm text-[#091426]">{node.id}</div>
                    <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#667085]">
                      <span
                        className={`h-2.5 w-2.5 ${
                          node.status === "connected" ? "bg-[#0014dc]" : "bg-[#b42318]"
                        }`}
                      />
                      <span>{selectedNodeIds.includes(node.id) ? "Filter Active" : "Available for Filter"}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="border border-[#d7dce6] bg-white">
              <div className="border-b border-[#d7dce6] bg-[#f6f8fb] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0014dc]">Section 2</p>
                    <h3 className="mt-1 text-xl font-normal tracking-[-0.04em]">Live Diagnostic Log</h3>
                  </div>
                  {selectedNodeIds.length > 0 ? (
                    <div className="max-w-full border border-[#d7dce6] bg-white px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#667085]">
                      Filtering: {selectedNodeIds.join(", ")}
                    </div>
                  ) : (
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#667085]">All nodes visible</div>
                  )}
                </div>
              </div>

              <div className="relative h-[620px] overflow-hidden">
                <div className="h-full overflow-auto" ref={logContainerRef}>
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 border-b border-[#d7dce6] bg-white">
                      <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-[#667085]">
                        <th className="border-r border-[#e6ebf2] px-4 py-3 font-semibold">Timestamp</th>
                        <th className="border-r border-[#e6ebf2] px-4 py-3 font-semibold">Producer ID</th>
                        <th className="px-4 py-3 font-semibold">Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedLogs.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-10 text-center text-sm text-[#667085]">
                            No diagnostic messages available for the current filter.
                          </td>
                        </tr>
                      ) : null}
                      {displayedLogs.map((message, index) => (
                        <tr key={`${message.producerId}-${message.timestamp}-${index}`} className="border-b border-[#edf1f6]">
                          <td className="border-r border-[#edf1f6] px-4 py-3 font-mono text-xs text-[#667085]">
                            {message.timestamp}
                          </td>
                          <td className="border-r border-[#edf1f6] px-4 py-3 font-mono text-xs text-[#0014dc]">
                            {message.producerId}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#091426]">{message.payload}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!diagnosticLoggingEnabled ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/88">
                    <div className="border border-[#0014dc] bg-white px-8 py-6 text-center shadow-[0_24px_40px_rgba(0,20,220,0.08)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0014dc]">Logging Disabled</p>
                      <p className="mt-2 text-sm text-[#667085]">Re-enable logging to resume live diagnostic capture.</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
