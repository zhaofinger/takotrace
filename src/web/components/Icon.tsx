import type { SVGProps } from "react";

type IconName =
  | "activity"
  | "alert"
  | "check"
  | "chevron"
  | "code"
  | "copy"
  | "folder"
  | "folderOpen"
  | "message"
  | "search"
  | "tool";

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
      {name === "search" && (
        <>
          <circle cx="8.5" cy="8.5" r="5" />
          <path d="m12.2 12.2 4 4" />
        </>
      )}
      {name === "tool" && <path d="M12.5 3.2a4.1 4.1 0 0 0-4.9 5.2L3 13l4 4 4.6-4.6a4.1 4.1 0 0 0 5.2-4.9l-2.7 2.7-3-3z" />}
    </svg>
  );
}
