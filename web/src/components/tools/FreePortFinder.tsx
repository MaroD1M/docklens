import { useState, type FormEvent } from "react";
import { CheckCircle2, Search, TriangleAlert } from "lucide-react";
import { endpoints, portCells } from "../../data/mock";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { HoloCard } from "../ui/HoloCard";
import { SectionHeader } from "../ui/SectionHeader";

type Protocol = "tcp" | "udp";

interface RangeQuery {
  start: number;
  end: number;
  count: number;
  protocol: Protocol;
}

function findFreePorts(query: RangeQuery): number[] {
  const occupied = new Set<number>();
  endpoints.forEach((endpoint) => {
    if (endpoint.protocol === query.protocol) occupied.add(endpoint.port);
  });

  if (query.protocol === "tcp") {
    portCells.forEach((cell) => {
      if (cell.state !== "free") occupied.add(cell.port);
    });
  }

  const free: number[] = [];
  for (let port = query.start; port <= query.end && free.length < query.count; port += 1) {
    if (!occupied.has(port)) free.push(port);
  }
  return free;
}

export function FreePortFinder() {
  const [start, setStart] = useState("8000");
  const [end, setEnd] = useState("8100");
  const [count, setCount] = useState("5");
  const [protocol, setProtocol] = useState<Protocol>("tcp");
  const [error, setError] = useState("");
  const [query, setQuery] = useState<RangeQuery | null>(null);
  const [result, setResult] = useState<number[] | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedStart = Number(start);
    const parsedEnd = Number(end);
    const parsedCount = Number(count);

    if (
      !Number.isInteger(parsedStart) ||
      parsedStart < 1 ||
      parsedStart > 65535 ||
      !Number.isInteger(parsedEnd) ||
      parsedEnd < 1 ||
      parsedEnd > 65535
    ) {
      setError("起止端口必须是 1–65535 之间的整数。");
      setQuery(null);
      setResult(null);
      return;
    }

    if (parsedStart > parsedEnd) {
      setError("起始端口不能大于结束端口。");
      setQuery(null);
      setResult(null);
      return;
    }

    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 64) {
      setError("查找数量必须是 1–64 之间的整数。");
      setQuery(null);
      setResult(null);
      return;
    }

    const nextQuery: RangeQuery = {
      start: parsedStart,
      end: parsedEnd,
      count: parsedCount,
      protocol,
    };
    setError("");
    setQuery(nextQuery);
    setResult(findFreePorts(nextQuery));
  };

  return (
    <HoloCard className="tools-card">
      <SectionHeader title="空闲端口" />
      <form className="tools-form" onSubmit={handleSubmit}>
        <div className="tools-form-grid">
          <label className="tools-field">
            <span>起始端口</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label className="tools-field">
            <span>结束端口</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <label className="tools-field">
            <span>数量</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={count}
              placeholder="1–64"
              onChange={(event) => setCount(event.target.value)}
            />
          </label>
          <label className="tools-field">
            <span>协议</span>
            <select
              className="select"
              value={protocol}
              onChange={(event) => setProtocol(event.target.value as Protocol)}
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </label>
        </div>
        <div className="tools-actions">
          <button type="submit" className="btn btn-primary">
            <Search size={14} />
            查找
          </button>
        </div>
        {error && (
          <p className="tools-error" role="alert">
            <TriangleAlert size={13} />
            {error}
          </p>
        )}
      </form>

      {query && result && result.length > 0 && (
        <div className="tools-result is-free">
          <div className="tools-result-head">
            <CheckCircle2 size={17} />
            <strong>找到 {result.length} 个空闲端口</strong>
            <Badge tone="green" dot>
              {query.start}–{query.end} / {query.protocol}
            </Badge>
          </div>
          <div className="tools-free-summary">
            <div className="tools-free-next">
              <span>下一个空闲端口</span>
              <strong className="mono">{result[0]}</strong>
            </div>
            <CopyButton
              value={result.join("\n")}
              label="复制全部端口"
              variant="solid"
              toast={`已复制 ${result.length} 个空闲端口`}
            />
          </div>
          <div className="tools-port-chips">
            {result.map((port) => (
              <CopyButton
                key={port}
                value={String(port)}
                label={String(port)}
                variant="chip"
                toast={`已复制端口 ${port}`}
              />
            ))}
          </div>
          {result.length < query.count && (
            <p className="tools-hint">仅找到 {result.length} 个，可扩大范围。</p>
          )}
        </div>
      )}

      {query && result && result.length === 0 && (
        <div className="tools-result is-occupied">
          <div className="tools-result-head">
            <TriangleAlert size={17} />
            <strong>范围内没有空闲端口</strong>
            <Badge tone="amber" dot>
              {query.start}–{query.end} / {query.protocol}
            </Badge>
          </div>
          <p className="tools-hint">扩大范围或切换协议重试。</p>
        </div>
      )}
    </HoloCard>
  );
}
