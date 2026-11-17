import type { Endpoint, PortCell } from "../../types";
import { findPortConflicts } from "../../lib/conflicts";

export type PortProtocol = "tcp" | "udp";

export type PortState = "used" | "conflict" | "hidden" | "inferred" | "reserved" | "free";

export interface PortRange {
  label: string;
  start: number;
  end: number;
}

export const MIN_PORT = 1;
export const MAX_PORT = 65535;
export const PORT_WINDOW_SIZE = 256;

export function createWindow(start: number): PortRange {
  const parsed = Number.isFinite(start) ? Math.trunc(start) : MIN_PORT;
  const safeStart = Math.min(Math.max(parsed, MIN_PORT), MAX_PORT);
  const end = Math.min(safeStart + PORT_WINDOW_SIZE - 1, MAX_PORT);
  return { label: `${safeStart}–${end}`, start: safeStart, end };
}

export function shiftWindow(start: number, direction: -1 | 1): PortRange {
  return createWindow(start + direction * PORT_WINDOW_SIZE);
}

export function windowForPort(port: number): PortRange {
  const target = Math.min(Math.max(Math.trunc(port) || MIN_PORT, MIN_PORT), MAX_PORT);
  return createWindow(target - Math.floor(PORT_WINDOW_SIZE / 2));
}

export const PORT_RANGES: PortRange[] = [
  { label: "1–256", start: 1, end: 256 },
  { label: "257–512", start: 257, end: 512 },
  { label: "513–768", start: 513, end: 768 },
  { label: "769–1024", start: 769, end: 1024 },
  { label: "1025–1280", start: 1025, end: 1280 },
  { label: "1281–1536", start: 1281, end: 1536 },
  { label: "1537–1792", start: 1537, end: 1792 },
  { label: "1793–2048", start: 1793, end: 2048 },
];

export interface PortSlot {
  port: number;
  protocol: PortProtocol;
  state: PortState;
  endpoints: Endpoint[];
  services: string[];
}

export interface FreeRange {
  start: number;
  end: number;
  count: number;
}

export const portStateLabels: Record<PortState, string> = {
  used: "已占用",
  conflict: "冲突",
  hidden: "已隐藏",
  inferred: "推断",
  reserved: "保留",
  free: "空闲",
};

function keyFor(protocol: string, port: number): string {
  return `${protocol}:${port}`;
}

export function groupEndpoints(endpoints: Endpoint[]): Map<string, Endpoint[]> {
  const grouped = new Map<string, Endpoint[]>();
  for (const endpoint of endpoints) {
    const key = keyFor(endpoint.protocol, endpoint.port);
    const list = grouped.get(key);
    if (list) {
      list.push(endpoint);
    } else {
      grouped.set(key, [endpoint]);
    }
  }
  return grouped;
}

export function findConflicts(
  endpoints: Endpoint[],
): { protocol: PortProtocol; port: number; endpoints: Endpoint[] }[] {
  return findPortConflicts(endpoints).map((item) => ({
    protocol: item.protocol === "udp" ? "udp" : "tcp",
    port: item.port,
    endpoints: item.endpoints,
  }));
}

export function usedPortsFor(
  protocol: PortProtocol,
  endpoints: Endpoint[],
  portCells: PortCell[],
  udpPorts: PortCell[] = [],
): Set<number> {
  const used = new Set<number>();
  for (const endpoint of endpoints) {
    if (endpoint.protocol === protocol) used.add(endpoint.port);
  }
  const cells = protocol === "tcp" ? portCells : udpPorts;
  for (const cell of cells) {
    if (cell.state !== "free") used.add(cell.port);
  }
  return used;
}

function stateFromCell(cell: PortCell): PortState {
  if (cell.state === "used") return "used";
  if (cell.state === "hidden") return "hidden";
  if (cell.state === "inferred") return "inferred";
  if (cell.state === "reserved") return "reserved";
  return "free";
}

export function buildPortSlots(
  protocol: PortProtocol,
  start: number,
  end: number,
  endpoints: Endpoint[],
  portCells: PortCell[],
  udpPorts: PortCell[] = [],
): PortSlot[] {
  const grouped = groupEndpoints(endpoints);
  const conflictKeys = new Set(
    findPortConflicts(endpoints).map((item) => keyFor(item.protocol, item.port)),
  );
  const cells = new Map<number, PortCell>();
  const sourceCells = protocol === "tcp" ? portCells : udpPorts;
  for (const cell of sourceCells) {
    if (cell.port >= start && cell.port <= end) cells.set(cell.port, cell);
  }

  const slots: PortSlot[] = [];
  for (let port = start; port <= end; port += 1) {
    const matching = grouped.get(keyFor(protocol, port)) ?? [];
    const cell = cells.get(port);
    let state: PortState = "free";
    if (conflictKeys.has(keyFor(protocol, port))) {
      state = "conflict";
    } else if (matching.length > 0) {
      const endpoint = matching[0];
      if (endpoint.hidden) {
        state = "hidden";
      } else if (endpoint.source === "INFERRED") {
        state = "inferred";
      } else {
        state = "used";
      }
    } else if (cell) {
      state = stateFromCell(cell);
    }

    const services = Array.from(
      new Set([
        ...matching.map((endpoint) => endpoint.service),
        ...(cell?.service ? [cell.service] : []),
      ]),
    );

    slots.push({ port, protocol, state, endpoints: matching, services });
  }
  return slots;
}

export function getFreeRanges(start: number, end: number, used: Set<number>): FreeRange[] {
  const ranges: FreeRange[] = [];
  let cursor: number | null = null;
  for (let port = start; port <= end; port += 1) {
    if (!used.has(port)) {
      if (cursor === null) cursor = port;
    } else if (cursor !== null) {
      ranges.push({ start: cursor, end: port - 1, count: port - cursor });
      cursor = null;
    }
  }
  if (cursor !== null) {
    ranges.push({ start: cursor, end, count: end - cursor + 1 });
  }
  return ranges;
}

export function findFreePorts(start: number, end: number, count: number, used: Set<number>): number[] {
  const found: number[] = [];
  for (let port = start; port <= end && found.length < count; port += 1) {
    if (!used.has(port)) found.push(port);
  }
  return found;
}

export function formatHostPort(ip: string, port: number): string {
  return ip.includes(":") ? `[${ip}]:${port}` : `${ip}:${port}`;
}
