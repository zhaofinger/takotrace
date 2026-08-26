import type { ConnectionState } from "../types";
import { StatusMark } from "./StatusMark";

export function Header({ connection }: { connection: ConnectionState }) {
  const isConnected = connection.status.toLowerCase() === "connected";

  return (
    <header className="vbg-custom-topbar">
      <h1>ThreadScope</h1>
      <div className="vbg-custom-topbar__meta">
        <StatusMark status={isConnected ? "Connected" : connection.status} />
        {isConnected && <><span className="vbg-custom-topbar__divider vbg-custom-topbar__mode" /><span className="vbg-custom-topbar__mode">Desktop snapshots · near real-time</span></>}
        {connection.userAgent && <><span className="vbg-custom-topbar__divider vbg-custom-topbar__client" /><span className="vbg-custom-topbar__client" title={connection.userAgent}>{connection.userAgent}</span></>}
        {connection.error && <><span className="vbg-custom-topbar__divider" /><span className="vbg-custom-topbar__error">{connection.error}</span></>}
        <span className="vbg-custom-topbar__divider" />
        <code>127.0.0.1</code>
      </div>
    </header>
  );
}
