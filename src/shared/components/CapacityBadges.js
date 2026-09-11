"use client";

import { CAPACITY_META } from "@/shared/constants/models";
import Tooltip from "./Tooltip";

// Render small icon badges for a model's capabilities.
//
// Read-only by default: only capabilities that are true are shown (this is how
// the combo picker and model-select modal use it).
//
// In editable mode the listed capabilities are always rendered so they can be
// clicked, cycling auto -> on -> off -> auto. `overrides` carries what the user
// has forced ({ vision: true }), which is what distinguishes a capability that
// happens to be on from one the user pinned on.
//
// colorOverride: force a single color class for all badges (default: per-cap color).
// size: icon font-size in px (default 16).
export default function CapacityBadges({
  caps,
  className = "",
  colorOverride,
  size = 16,
  editable = false,
  editableKeys,
  overrides,
  onToggle,
}) {
  if (!caps && !editable) return null;

  const keys = Object.keys(CAPACITY_META);
  const active = keys.filter((k) => caps?.[k]);
  const shown = editable ? keys.filter((k) => (editableKeys || keys).includes(k) || active.includes(k)) : active;
  if (shown.length === 0) return null;

  const nextValue = (forced) => (forced === undefined ? true : forced === true ? false : undefined);

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {shown.map((k) => {
        const meta = CAPACITY_META[k];
        const on = Boolean(caps?.[k]);
        const forced = overrides?.[k];
        const canEdit = editable && typeof onToggle === "function" && (editableKeys || keys).includes(k);

        // Off + not editable never renders (matches the read-only contract above).
        if (!on && !canEdit) return null;

        const state = forced === undefined ? "auto" : forced ? "forced on" : "forced off";
        const tip = canEdit
          ? `${meta.label} — ${meta.desc}\n${on ? "On" : "Off"} (${state}). Click to change.`
          : `${meta.label} — ${meta.desc}`;

        // Four states have to be told apart at 12px, so they do not rely on one
        // signal alone. A pinned capability ignores colorOverride and wears its
        // own colour, because "I set this" is exactly what should stand out
        // against a row the override is there to keep calm:
        //   inherited off -> faint, no ring      pinned off -> faint + ring (+ slashed icon)
        //   inherited on  -> muted, no ring      pinned on  -> full colour + ring
        const pinned = forced !== undefined;
        const color = on
          ? (pinned ? meta.color : (colorOverride || meta.color))
          : "text-text-muted/30";
        const ring = pinned ? "ring-1 ring-primary/50 rounded-sm" : "";
        const glyph = (!on && pinned && meta.offIcon) ? meta.offIcon : meta.icon;

        const icon = (
          <span
            className={`material-symbols-outlined leading-none ${canEdit ? "cursor-pointer hover:opacity-70" : "cursor-help"} ${color} ${ring}`}
            style={{ fontSize: `${size}px` }}
          >
            {glyph}
          </span>
        );

        return (
          <Tooltip key={k} text={tip}>
            {canEdit ? (
              <button
                type="button"
                aria-label={`${meta.label}: ${state}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(k, nextValue(forced));
                }}
                className="inline-flex items-center leading-none"
              >
                {icon}
              </button>
            ) : (
              icon
            )}
          </Tooltip>
        );
      })}
    </span>
  );
}
