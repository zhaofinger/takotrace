import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function PreviewableImage({ alt, src }: { alt: string; src?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown, true);
      triggerRef.current?.focus();
    };
  }, [isOpen]);

  const label = alt || "Image";

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={`Enlarge ${label}`}
        className="vbg-custom-image-thumbnail"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
        ref={triggerRef}
        title={`Enlarge ${label}`}
        type="button"
      >
        <img alt={alt} loading="lazy" src={src} />
      </button>
      {isOpen && typeof document !== "undefined" && createPortal(
        <div
          aria-label={`Image preview: ${label}`}
          aria-modal="true"
          className="vbg-custom-image-lightbox"
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus();
            }
            event.stopPropagation();
          }}
          onClick={() => setIsOpen(false)}
          role="dialog"
        >
          <div className="vbg-custom-image-lightbox__content" onClick={(event) => event.stopPropagation()}>
            <img alt={alt} src={src} />
            <button
              aria-label="Close image preview"
              autoFocus
              className="vbg-custom-image-lightbox__close"
              onClick={() => setIsOpen(false)}
              title="Close"
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
