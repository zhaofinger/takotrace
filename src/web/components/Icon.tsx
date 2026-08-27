import type { SVGProps } from "react";

export type IconName =
  | "agent"
  | "activity"
  | "alert"
  | "check"
  | "chevron"
  | "code"
  | "copy"
  | "folder"
  | "folderOpen"
  | "message"
  | "monitor"
  | "moon"
  | "network"
  | "search"
  | "subagent"
  | "sun"
  | "terminal"
  | "tool"
  | "user";

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" {...common} {...props}>
      {name === "agent" && (
        <>
          <path d="M10 2.5c.5 3.2 2.3 5 5.5 5.5-3.2.5-5 2.3-5.5 5.5C9.5 10.3 7.7 8.5 4.5 8 7.7 7.5 9.5 5.7 10 2.5Z" />
          <path d="M15.5 13.2c.2 1.3 1 2.1 2.3 2.3-1.3.2-2.1 1-2.3 2.3-.2-1.3-1-2.1-2.3-2.3 1.3-.2 2.1-1 2.3-2.3Z" />
        </>
      )}
      {name === "activity" && <path d="M2.5 10h3l2-5.5 4 11 2-5.5h4" />}
      {name === "alert" && (
        <>
          <path d="M10 2.6 18 17H2z" />
          <path d="M10 7v4.5M10 14.4v.1" />
        </>
      )}
      {name === "check" && (
        <>
          <circle cx="10" cy="10" r="7" />
          <path d="m6.7 10.1 2.1 2.1 4.6-4.7" />
        </>
      )}
      {name === "chevron" && <path d="m7.5 5 5 5-5 5" />}
      {name === "code" && (
        <>
          <path d="m7 5-5 5 5 5M13 5l5 5-5 5M11.5 3 8.5 17" />
        </>
      )}
      {name === "copy" && <><rect x="6" y="6" width="10" height="10" rx="1.5" /><path d="M13 6V4H4v9h2" /></>}
      {name === "folder" && <path d="M2.5 5.5h5l1.7 2H17.5v8.5h-15zM2.5 7.5h15" />}
      {name === "folderOpen" && <path d="M2.5 7.5V5.5h5l1.7 2h8.3M3.5 16h12.7l1.3-8.5H5z" />}
      {name === "message" && <path d="M3 4.5h14v9H8l-3.5 3v-3H3z" />}
      {name === "monitor" && <><rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5" /><path d="M7 17h6M10 14v3" /></>}
      {name === "moon" && <path d="M15.8 12.7A6.5 6.5 0 0 1 7.3 4.2a6.5 6.5 0 1 0 8.5 8.5Z" />}
      {name === "network" && (
        <>
          <circle cx="4" cy="10" r="2" />
          <circle cx="15.5" cy="5" r="2" />
          <circle cx="15.5" cy="15" r="2" />
          <path d="m5.8 9.1 7.8-3.2M5.8 10.9l7.8 3.2" />
        </>
      )}
      {name === "search" && (
        <>
          <circle cx="8.5" cy="8.5" r="5" />
          <path d="m12.2 12.2 4 4" />
        </>
      )}
      {name === "subagent" && (
        <>
          <circle cx="5" cy="4.5" r="2" />
          <circle cx="15" cy="5.5" r="2" />
          <circle cx="15" cy="14.5" r="2" />
          <path d="M5 6.5v3.7a4.3 4.3 0 0 0 4.3 4.3H13M7 8.5h3.7A4.3 4.3 0 0 0 15 4.2" />
        </>
      )}
      {name === "sun" && <><circle cx="10" cy="10" r="3.2" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4" /></>}
      {name === "terminal" && (
        <>
          <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
          <path d="m5.5 8 2 2-2 2M10 12h4" />
        </>
      )}
      {name === "tool" && <path d="M12.5 3.2a4.1 4.1 0 0 0-4.9 5.2L3 13l4 4 4.6-4.6a4.1 4.1 0 0 0 5.2-4.9l-2.7 2.7-3-3z" />}
      {name === "user" && (
        <>
          <circle cx="10" cy="6.5" r="3" />
          <path d="M4.5 17c.5-3 2.4-4.6 5.5-4.6s5 1.6 5.5 4.6" />
        </>
      )}
    </svg>
  );
}
