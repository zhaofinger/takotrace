import type { SVGProps } from "react";

export type IconName =
  | "activity"
  | "agent"
  | "alert"
  | "braces"
  | "check"
  | "chevron"
  | "close"
  | "copy"
  | "file"
  | "folder"
  | "folderOpen"
  | "history"
  | "mcp"
  | "message"
  | "monitor"
  | "moon"
  | "search"
  | "skill"
  | "statusActive"
  | "statusDanger"
  | "statusSuccess"
  | "statusWarning"
  | "subagent"
  | "sun"
  | "terminal"
  | "tool"
  | "user"
  | "web";

// SVG geometry selected from the Lucide collection with better-icons.
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
  };

  return (
    <svg viewBox="0 0 24 24" {...common} {...props} aria-hidden="true" focusable="false">
      {name === "activity" && <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />}
      {name === "agent" && (
        <>
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2m16 0h2m-7-1v2m-6-2v2" />
        </>
      )}
      {name === "alert" && <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01" />}
      {name === "braces" && <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1m8 0h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />}
      {name === "check" && <path d="M20 6 9 17l-5-5" />}
      {name === "chevron" && <path d="m9 18 6-6-6-6" />}
      {name === "close" && <path d="M18 6 6 18M6 6l12 12" />}
      {name === "copy" && (
        <>
          <rect width="14" height="14" x="8" y="8" rx="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </>
      )}
      {name === "file" && (
        <>
          <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4M5 12l-3 3 3 3m4 0 3-3-3-3" />
        </>
      )}
      {name === "folder" && <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />}
      {name === "folderOpen" && <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />}
      {name === "history" && (
        <>
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5m4-1v5l4 2" />
        </>
      )}
      {name === "mcp" && <path d="M12 22v-5m3-9V2m2 6a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1zm-8 0V2" />}
      {name === "message" && <path d="M22 17a2 2 0 0 1-2 2H6.83a2 2 0 0 0-1.42.59l-2.2 2.2A.71.71 0 0 1 2 21.29V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2Z" />}
      {name === "monitor" && (
        <>
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <path d="M8 21h8m-4-4v4" />
        </>
      )}
      {name === "moon" && <path d="M20.99 12.49a9 9 0 1 1-9.48-9.48c.41-.02.62.46.4.81a6 6 0 0 0 8.27 8.27c.35-.22.83 0 .81.4" />}
      {name === "search" && (
        <>
          <path d="m21 21-4.34-4.34" />
          <circle cx="11" cy="11" r="8" />
        </>
      )}
      {name === "skill" && <path d="M12 5v16m8-2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4a5 5 0 0 0-4 2 5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4a5 5 0 0 1 4 2 5 5 0 0 1 4-2Z" />}
      {name === "statusActive" && (
        <>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="1" />
        </>
      )}
      {name === "statusDanger" && (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6m0-6 6 6" />
        </>
      )}
      {name === "statusSuccess" && (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === "statusWarning" && (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4m0 4h.01" />
        </>
      )}
      {name === "subagent" && (
        <>
          <circle cx="12" cy="18" r="3" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9m6 3v3" />
        </>
      )}
      {name === "sun" && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </>
      )}
      {name === "terminal" && (
        <>
          <path d="m7 11 2-2-2-2m4 6h4" />
          <rect width="18" height="18" x="3" y="3" rx="2" />
        </>
      )}
      {name === "tool" && <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.11-3.1c.32-.33.86-.22.98.21a6 6 0 0 1-8.26 7.06l-7.91 7.91a1 1 0 0 1-3-3l7.91-7.91a6 6 0 0 1 7.06-8.26c.43.12.54.66.22.98Z" />}
      {name === "user" && (
        <>
          <circle cx="12" cy="8" r="5" />
          <path d="M20 21a8 8 0 0 0-16 0" />
        </>
      )}
      {name === "web" && (
        <>
          <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54M7 3.34V5a3 3 0 0 0 3 3 2 2 0 0 1 2 2c0 1.1.9 2 2 2s2-.9 2-2 .9-2 2-2h3.17M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" />
          <circle cx="12" cy="12" r="10" />
        </>
      )}
    </svg>
  );
}
