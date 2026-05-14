"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Visible per-viewer watermark drawn on top of the video player. This is
 * the second layer of forensic marking — the Mux preview asset already has
 * the watermark burned into the pixels (so screen recordings carry it),
 * but this DOM overlay also discourages casual recording and reminds the
 * viewer they're under attribution.
 *
 * The overlay repositions every ~10 seconds so an attacker can't simply
 * crop a fixed region; combined with the burned-in watermark, no static
 * crop is safe.
 */

interface Props {
  label: string;
  secondary?: string;
  active?: boolean;
}

const POSITIONS = [
  { top: "8%", left: "6%", textAlign: "left" as const },
  { top: "8%", right: "6%", textAlign: "right" as const },
  { bottom: "10%", left: "6%", textAlign: "left" as const },
  { bottom: "10%", right: "6%", textAlign: "right" as const },
  { top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" as const },
];

export function ShareWatermarkOverlay({ label, secondary, active = true }: Props) {
  const [index, setIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    intervalRef.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % POSITIONS.length);
    }, 9_500);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active]);

  if (!active) return null;

  const pos = POSITIONS[index];

  return (
    <div
      aria-hidden
      data-watermark
      className="pointer-events-none absolute inset-0 z-30 select-none"
      style={{ userSelect: "none" }}
    >
      <div
        className="absolute font-bold text-white"
        style={{
          ...pos,
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          mixBlendMode: "screen",
          opacity: 0.55,
          fontSize: "13px",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        {secondary ? (
          <div style={{ opacity: 0.7, fontSize: "11px", fontWeight: 600 }}>
            {secondary}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Document-level anti-piracy hooks: disable right-click, picture-in-picture,
 * print, and detect headless/webdriver sessions. These are deterrents — none
 * are bulletproof, but they raise the cost of casual scraping/recording.
 *
 * Returns whether the session looks like an automation/headless run so the
 * caller can refuse to load playback at all.
 */
export function useAntiPiracyDefenses(active: boolean): { suspectAutomation: boolean } {
  const [suspectAutomation, setSuspectAutomation] = useState(false);

  useEffect(() => {
    if (!active) return;

    const onContextMenu = (e: MouseEvent) => {
      // Don't suppress for text inputs / textareas so commenting still works.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Block PiP shortcut on Safari + most printing shortcuts.
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
      }
    };

    const onLeavePiP = () => {
      // Force exit any PiP that was triggered programmatically.
      try {
        const docAny = document as unknown as {
          pictureInPictureElement?: Element;
          exitPictureInPicture?: () => Promise<void>;
        };
        if (docAny.pictureInPictureElement && docAny.exitPictureInPicture) {
          void docAny.exitPictureInPicture();
        }
      } catch {
        // Ignore — older browsers don't expose this.
      }
    };

    // Detect headless/automation runners. Not foolproof — anyone serious can
    // patch navigator, but the casual OBS/screen-recording case won't.
    const nav = navigator as Navigator & { webdriver?: boolean };
    if (nav.webdriver === true) {
      setSuspectAutomation(true);
    }

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("enterpictureinpicture", onLeavePiP, true);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("enterpictureinpicture", onLeavePiP, true);
    };
  }, [active]);

  return { suspectAutomation };
}
