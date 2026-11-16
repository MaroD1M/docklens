import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { applyOverview, applySnapshot } from "./mock";

type DataSource = "live" | "mock";

interface HostState {
  name: string;
  ip: string;
  dockerVersion: string;
  source: "live" | "mock";
}

const DataVersionContext = createContext(0);
const HostContext = createContext<HostState>({
  name: "本地 Docker",
  ip: "",
  dockerVersion: "",
  source: "mock",
});

export function useDataVersion(): number {
  return useContext(DataVersionContext);
}

export function useHostInfo(): HostState {
  return useContext(HostContext);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [source, setSource] = useState<DataSource>("mock");
  const [host, setHost] = useState<HostState>({
    name: "本地 Docker",
    ip: "",
    dockerVersion: "",
    source: "mock",
  });
  const liveLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let events: EventSource | null = null;
    let pollTimer: number | undefined;

    const startPolling = () => {
      if (pollTimer !== undefined || !liveLoaded.current) return;
      pollTimer = window.setInterval(() => {
        if (events?.readyState === EventSource.OPEN) return;
        void load();
      }, 30000);
    };

    const stopPolling = () => {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const load = async () => {
      try {
        const [snapshotResponse, overviewResponse] = await Promise.all([
          fetch("/api/v1/snapshot", { headers: { Accept: "application/json" } }),
          fetch("/api/v1/overview", { headers: { Accept: "application/json" } }),
        ]);
        if (!snapshotResponse.ok || !overviewResponse.ok) return;
        const snapshot = await snapshotResponse.json();
        const overview = await overviewResponse.json();
        if (cancelled) return;
        if (applySnapshot(snapshot)) {
          applyOverview(overview);
          liveLoaded.current = true;
          setSource("live");
          setHost({
            name: snapshot.host?.name || "本地 Docker",
            ip: snapshot.host?.preferredIp || "",
            dockerVersion: snapshot.host?.dockerVersion || "",
            source: "live",
          });
          setVersion((value) => value + 1);
          window.dispatchEvent(new CustomEvent("docklens:source", { detail: "live" }));
          if (!events || events.readyState !== EventSource.OPEN) startPolling();
        }
      } catch {
        if (!cancelled && !liveLoaded.current) {
          setSource("mock");
          setHost({ name: "本地 Docker", ip: "", dockerVersion: "", source: "mock" });
          window.dispatchEvent(new CustomEvent("docklens:source", { detail: "mock" }));
        }
      }
    };

    void load();

    try {
      events = new EventSource("/api/v1/events");
      events.addEventListener("snapshot", () => {
        void load();
      });
      events.addEventListener("endpoint.updated", () => {
        void load();
      });
      events.onopen = () => {
        stopPolling();
      };
      events.onerror = () => {
        startPolling();
      };
    } catch {
      events = null;
      startPolling();
    }

    return () => {
      cancelled = true;
      stopPolling();
      events?.close();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.source = source;
  }, [source]);

  return (
    <HostContext.Provider value={host}>
      <DataVersionContext.Provider value={version}>{children}</DataVersionContext.Provider>
    </HostContext.Provider>
  );
}
