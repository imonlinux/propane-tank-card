/**
 * Propane Tank Card
 * A HACS-compliant Lovelace card that shows a propane tank sensor as a
 * realistic cross-section of the tank with a volume-accurate liquid level
 * and a percentage overlay.
 *
 * No build step required - drop-in single file, pure vanilla custom elements.
 *
 * @license MIT
 */

const PTC_VERSION = "1.0.0";

/* ------------------------------------------------------------------ *
 *  Tank presets
 *  aspect (horizontal) = length / diameter
 *  aspect (vertical)   = height / diameter
 *  capacity = nominal gallons (used only for the optional "gallons
 *  remaining" readout). Dimensions are approximate, real-world-ish
 *  ratios and can always be overridden with `aspect_ratio`.
 * ------------------------------------------------------------------ */
const TANK_PRESETS = {
  "20lb_vertical":     { label: "20 lb Cylinder · Vertical (BBQ)", orientation: "vertical",   aspect: 1.65, capacity: 4.6 },
  "30lb_vertical":     { label: "30 lb Cylinder · Vertical",       orientation: "vertical",   aspect: 1.9,  capacity: 7.1 },
  "40lb_vertical":     { label: "40 lb Cylinder · Vertical",       orientation: "vertical",   aspect: 2.2,  capacity: 9.4 },
  "100lb_vertical":    { label: "100 lb Cylinder · Vertical",      orientation: "vertical",   aspect: 3.3,  capacity: 23.6 },
  "120gal_vertical":   { label: "120 Gallon · Vertical",          orientation: "vertical",   aspect: 2.1,  capacity: 120 },
  "250gal_vertical":   { label: "250 Gallon · Vertical",          orientation: "vertical",   aspect: 3.0,  capacity: 250 },
  "500gal_vertical":   { label: "500 Gallon · Vertical",          orientation: "vertical",   aspect: 3.3,  capacity: 500 },
  "120gal_horizontal": { label: "120 Gallon · Horizontal",        orientation: "horizontal", aspect: 2.5,  capacity: 120,  diameter: 24 },
  "250gal_horizontal": { label: "250 Gallon · Horizontal",        orientation: "horizontal", aspect: 3.0,  capacity: 250,  diameter: 30 },
  "330gal_horizontal": { label: "330 Gallon · Horizontal",        orientation: "horizontal", aspect: 3.6,  capacity: 330,  diameter: 30 },
  "500gal_horizontal": { label: "500 Gallon · Horizontal",        orientation: "horizontal", aspect: 3.3,  capacity: 500,  diameter: 37 },
  "1000gal_horizontal":{ label: "1000 Gallon · Horizontal",       orientation: "horizontal", aspect: 4.6,  capacity: 1000, diameter: 41 },
  "custom":            { label: "Custom",                          orientation: "horizontal", aspect: 3.0,  capacity: 250 },
};

const DEFAULTS = {
  tank_preset: "250gal_horizontal",
  value_type: "percentage", // "percentage" | "gallons" | "inches"
  full_scale_inches: null,   // depth reading at 100% (horizontal: inside diameter)
  level_is_volume: true,     // map volume% -> fill height (horizontal tanks, percentage mode)
  fill_color: "#2f9bdb",
  tank_color: "#e7e9ec",
  show_percentage: true,
  show_gallons: false,
  low_threshold: 20,
  warning_color: "#e8623d",
};

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Lighten (+) / darken (-) a hex color by a percentage. Falls back to
// returning the input untouched if it isn't a parseable hex string.
function shade(hex, pct) {
  if (typeof hex !== "string") return hex;
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  let r = parseInt(h.substr(0, 2), 16);
  let g = parseInt(h.substr(2, 2), 16);
  let b = parseInt(h.substr(4, 2), 16);
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  const toHex = (n) => clamp(n, 0, 255).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

// HA's color_rgb selector wants/returns [r, g, b]; the card stores hex.
// These two helpers bridge the gap and tolerate either form on input.
function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex;
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.substr(0, 2), 16),
    parseInt(h.substr(2, 2), 16),
    parseInt(h.substr(4, 2), 16),
  ];
}
function rgbToHex(rgb) {
  if (typeof rgb === "string") return rgb;
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return "#" + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
}

/**
 * Convert a VOLUME fraction (0..1) to a FILL-HEIGHT fraction (0..1) for a
 * horizontal cylinder. The cross-section is a circle, so the filled area
 * (== volume for a uniform cylinder) relates to height by the circular
 * segment formula, which is non-linear. Solved by bisection.
 *
 * This is why a horizontal tank reading 25% sits well below the
 * one-quarter line, while 50% is exactly halfway (by symmetry).
 */
function volumeFractionToHeightFraction(f) {
  if (f <= 0) return 0;
  if (f >= 1) return 1;
  const target = f * Math.PI;               // circle area for r = 1 is PI
  let lo = 0, hi = 2, h = 1;                 // h ranges over the diameter [0,2]
  for (let i = 0; i < 48; i++) {
    h = (lo + hi) / 2;
    const area = Math.acos(1 - h) - (1 - h) * Math.sqrt(Math.max(0, 2 * h - h * h));
    if (area < target) lo = h; else hi = h;
  }
  return ((lo + hi) / 2) / 2;               // normalize back to 0..1
}

/**
 * Convert a liquid-depth reading (inches) for a horizontal tank into
 * { gallons, fraction } using the cylinder + two-hemispherical-heads model.
 * The cylindrical length L is derived from the inside diameter and the
 * tank's total capacity, so the formula self-calibrates to your tank.
 *
 * Reduces to a pure cylinder when capacity matches a tank with no head
 * volume, and clamps gracefully when capacity is too small for the
 * derived geometry.
 */
function horizInchesVolume(inches, diameterInches, capacityGal) {
  const R = diameterInches / 2;
  if (!(R > 0)) return { gallons: 0, fraction: 0 };
  const GAL = 231; // cubic inches per US gallon
  const Vtot = (capacityGal > 0 ? capacityGal : 0) * GAL;
  const Vsphere = (4 / 3) * Math.PI * R * R * R;
  let L = Vtot > 0 ? (Vtot - Vsphere) / (Math.PI * R * R) : 0;
  if (!isFinite(L) || L < 0) L = 0; // very short tank — heads dominate
  const h = clamp(inches, 0, 2 * R);
  const u = clamp((R - h) / R, -1, 1);
  const seg = R * R * Math.acos(u) - (R - h) * Math.sqrt(Math.max(0, 2 * R * h - h * h));
  const cap = (Math.PI * h * h / 3) * (3 * R - h);
  const Vh = L * seg + cap;
  const fraction = Vtot > 0 ? clamp(Vh / Vtot, 0, 1) : clamp(seg / (Math.PI * R * R), 0, 1);
  return { gallons: Vh / GAL, fraction };
}

let PTC_UID = 0;

/* ------------------------------------------------------------------ *
 *  SVG builders (pure functions -> string)
 * ------------------------------------------------------------------ */

// Horizontal tank: a capsule (stadium) cross-section with saddle legs,
// a valve hood on top, weld seams and a flat liquid surface.
function buildHorizontalTankSvg(heightFrac, fillColor, tankColor, uid, aspectIn) {
  const BODY_H = 150;
  const aspect = clamp(aspectIn || 3, 1.2, 6);
  const BODY_W = BODY_H * aspect;
  const r = BODY_H / 2;
  const padX = 22, padTop = 30, padBot = 38;
  const x0 = padX, y0 = padTop;
  const VB_W = BODY_W + padX * 2;
  const VB_H = BODY_H + padTop + padBot;
  const cx = x0 + BODY_W / 2;

  const capsule =
    `M ${x0 + r} ${y0} ` +
    `L ${x0 + BODY_W - r} ${y0} ` +
    `A ${r} ${r} 0 0 1 ${x0 + BODY_W - r} ${y0 + 2 * r} ` +
    `L ${x0 + r} ${y0 + 2 * r} ` +
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`;

  const surfaceY = y0 + BODY_H * (1 - heightFrac);
  const fluidH = BODY_H * heightFrac;

  const mLight = shade(tankColor, 26), mMid = tankColor, mDark = shade(tankColor, -16), mEdge = shade(tankColor, -34);
  const fTop = shade(fillColor, 20), fBot = shade(fillColor, -24), fSurf = shade(fillColor, 38);

  // saddle legs
  const legW = 34, legH = padBot - 6;
  const legY = y0 + 2 * r - 2;
  const leg = (lx) =>
    `<path d="M ${lx - legW / 2} ${legY} L ${lx + legW / 2} ${legY} L ${lx + legW / 2 + 8} ${legY + legH} L ${lx - legW / 2 - 8} ${legY + legH} Z" fill="${mEdge}"/>`;

  return `
<svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg" class="ptc-svg" preserveAspectRatio="xMidYMid meet" role="img">
  <defs>
    <linearGradient id="ptc-metal-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${mLight}"/>
      <stop offset="0.45" stop-color="${mMid}"/>
      <stop offset="1" stop-color="${mDark}"/>
    </linearGradient>
    <linearGradient id="ptc-fluid-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${fTop}"/>
      <stop offset="1" stop-color="${fBot}"/>
    </linearGradient>
    <clipPath id="ptc-clip-${uid}"><path d="${capsule}"/></clipPath>
  </defs>

  <ellipse cx="${cx}" cy="${y0 + 2 * r + legH}" rx="${BODY_W * 0.46}" ry="7" fill="rgba(0,0,0,0.16)"/>
  ${leg(x0 + BODY_W * 0.26)}
  ${leg(x0 + BODY_W * 0.74)}

  <!-- tank body -->
  <path d="${capsule}" fill="url(#ptc-metal-${uid})"/>

  <!-- liquid -->
  <g clip-path="url(#ptc-clip-${uid})">
    <rect x="${x0}" y="${surfaceY}" width="${BODY_W}" height="${fluidH}" fill="url(#ptc-fluid-${uid})"/>
    ${heightFrac > 0.003 && heightFrac < 0.997
      ? `<rect x="${x0}" y="${surfaceY - 1}" width="${BODY_W}" height="3.5" fill="${fSurf}" opacity="0.9"/>`
      : ""}
    <!-- inner top shading so the empty space reads as inside the tank -->
    <rect x="${x0}" y="${y0}" width="${BODY_W}" height="${BODY_H}" fill="url(#ptc-metal-${uid})" opacity="0.0"/>
  </g>

  <!-- weld seams where the end caps meet the cylinder -->
  <line x1="${x0 + r}" y1="${y0 + 2}" x2="${x0 + r}" y2="${y0 + 2 * r - 2}" stroke="${mEdge}" stroke-width="1.2" opacity="0.45"/>
  <line x1="${x0 + BODY_W - r}" y1="${y0 + 2}" x2="${x0 + BODY_W - r}" y2="${y0 + 2 * r - 2}" stroke="${mEdge}" stroke-width="1.2" opacity="0.45"/>

  <!-- specular highlight -->
  <path d="${capsule}" fill="none"/>
  <rect x="${x0 + r * 0.4}" y="${y0 + 10}" width="${BODY_W - r * 0.8}" height="14" rx="7" fill="#ffffff" opacity="0.12" clip-path="url(#ptc-clip-${uid})"/>

  <!-- rim -->
  <path d="${capsule}" fill="none" stroke="${mEdge}" stroke-width="2"/>

  <!-- valve hood + handwheel -->
  <rect x="${cx - 26}" y="${y0 - 16}" width="52" height="22" rx="6" fill="${mDark}" stroke="${mEdge}" stroke-width="1.5"/>
  <rect x="${cx - 5}" y="${y0 - 26}" width="10" height="12" rx="2" fill="${mEdge}"/>
  <circle cx="${cx}" cy="${y0 - 27}" r="6" fill="none" stroke="${mEdge}" stroke-width="2.4"/>
</svg>`;
}

// Vertical tank: a domed-top cylinder with a protective collar/valve and
// a foot ring. Liquid level is treated linearly (height == volume), which
// is the standard approximation for vertical cylinders.
function buildVerticalTankSvg(heightFrac, fillColor, tankColor, uid, aspectIn) {
  const BODY_W = 150;
  const aspect = clamp(aspectIn || 2, 1.2, 5);
  const BODY_H = BODY_W * aspect;
  const r = BODY_W / 2;
  const padTop = 36, padBot = 24, padX = 30;
  const x0 = padX, y0 = padTop;
  const W = BODY_W;
  const cx = x0 + W / 2;

  const domeH = W * 0.16;
  const baseDomeH = W * 0.05;
  const ybTop = y0 + domeH;
  const ybBot = y0 + BODY_H - baseDomeH;
  const cyTop = ybTop - 1.333 * domeH;
  const cyBot = ybBot + 1.333 * baseDomeH;

  const body =
    `M ${x0} ${ybTop} ` +
    `C ${x0} ${cyTop} ${x0 + W} ${cyTop} ${x0 + W} ${ybTop} ` +
    `L ${x0 + W} ${ybBot} ` +
    `C ${x0 + W} ${cyBot} ${x0} ${cyBot} ${x0} ${ybBot} Z`;

  const topApex = y0;
  const botApex = y0 + BODY_H;
  const span = botApex - topApex;
  const surfaceY = botApex - heightFrac * span;
  const VB_W = BODY_W + padX * 2;
  const VB_H = BODY_H + padTop + padBot;

  const mLight = shade(tankColor, 26), mMid = tankColor, mDark = shade(tankColor, -16), mEdge = shade(tankColor, -34);
  const fTop = shade(fillColor, 20), fBot = shade(fillColor, -24), fSurf = shade(fillColor, 38);

  return `
<svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg" class="ptc-svg" preserveAspectRatio="xMidYMid meet" role="img">
  <defs>
    <linearGradient id="ptc-vmetal-${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${mDark}"/>
      <stop offset="0.4" stop-color="${mLight}"/>
      <stop offset="0.62" stop-color="${mMid}"/>
      <stop offset="1" stop-color="${mDark}"/>
    </linearGradient>
    <linearGradient id="ptc-vfluid-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${fTop}"/>
      <stop offset="1" stop-color="${fBot}"/>
    </linearGradient>
    <clipPath id="ptc-vclip-${uid}"><path d="${body}"/></clipPath>
  </defs>

  <ellipse cx="${cx}" cy="${botApex + 10}" rx="${W * 0.5}" ry="6" fill="rgba(0,0,0,0.16)"/>

  <!-- foot ring -->
  <rect x="${x0 + W * 0.12}" y="${botApex - 6}" width="${W * 0.76}" height="16" rx="4" fill="${mEdge}"/>

  <!-- body -->
  <path d="${body}" fill="url(#ptc-vmetal-${uid})"/>

  <!-- liquid -->
  <g clip-path="url(#ptc-vclip-${uid})">
    <rect x="${x0}" y="${surfaceY}" width="${W}" height="${botApex - surfaceY}" fill="url(#ptc-vfluid-${uid})"/>
    ${heightFrac > 0.003 && heightFrac < 0.997
      ? `<rect x="${x0}" y="${surfaceY - 1}" width="${W}" height="3.5" fill="${fSurf}" opacity="0.9"/>`
      : ""}
  </g>

  <!-- weld seam near the top dome join -->
  <line x1="${x0 + 2}" y1="${ybTop}" x2="${x0 + W - 2}" y2="${ybTop}" stroke="${mEdge}" stroke-width="1.2" opacity="0.4"/>

  <!-- specular highlight -->
  <rect x="${x0 + W * 0.16}" y="${ybTop + 6}" width="${W * 0.16}" height="${ybBot - ybTop - 12}" rx="${W * 0.08}" fill="#ffffff" opacity="0.14" clip-path="url(#ptc-vclip-${uid})"/>

  <!-- rim -->
  <path d="${body}" fill="none" stroke="${mEdge}" stroke-width="2"/>

  <!-- protective collar + valve -->
  <ellipse cx="${cx}" cy="${y0 + 4}" rx="${W * 0.20}" ry="9" fill="none" stroke="${mEdge}" stroke-width="3"/>
  <rect x="${cx - 7}" y="${y0 - 16}" width="14" height="20" rx="3" fill="${mDark}" stroke="${mEdge}" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${y0 - 18}" r="7" fill="none" stroke="${mEdge}" stroke-width="2.6"/>
</svg>`;
}

/* ------------------------------------------------------------------ *
 *  The card
 * ------------------------------------------------------------------ */
class PropaneTankCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid = ++PTC_UID;
    this._lastSig = null;
  }

  static getConfigElement() {
    return document.createElement("propane-tank-card-editor");
  }

  static getStubConfig(hass) {
    let entity = "sensor.propane_tank";
    if (hass) {
      const guess = Object.keys(hass.states).find(
        (e) => e.startsWith("sensor.") && /propane|tank|lpg/i.test(e)
      );
      if (guess) entity = guess;
    }
    return { entity, tank_preset: "250gal_horizontal", show_percentage: true };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Please define an 'entity' (your propane level sensor).");
    }
    const preset = TANK_PRESETS[config.tank_preset] || TANK_PRESETS[DEFAULTS.tank_preset];
    this._config = {
      ...DEFAULTS,
      ...config,
      orientation: config.orientation || preset.orientation,
      aspect_ratio: config.aspect_ratio != null ? Number(config.aspect_ratio) : preset.aspect,
      max_capacity: config.max_capacity != null ? Number(config.max_capacity) : preset.capacity,
      full_scale_inches: config.full_scale_inches != null
        ? Number(config.full_scale_inches)
        : (preset.diameter != null ? preset.diameter : null),
    };
    this._lastSig = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return this._config && this._config.orientation === "vertical" ? 6 : 4;
  }

  _fireMoreInfo() {
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId: this._config.entity };
    this.dispatchEvent(ev);
  }

  _render() {
    if (!this._config || !this._hass) return;
    const cfg = this._config;
    const st = this._hass.states[cfg.entity];

    const isHorizontal = cfg.orientation === "horizontal";
    let available = !!st && !["unavailable", "unknown", "", "none"].includes(String(st.state).toLowerCase());
    let pct = 0, gallons = 0, heightFrac = 0, raw = NaN;

    if (available) {
      raw = parseFloat(st.state);
      if (!isFinite(raw)) {
        available = false;
      } else if (cfg.value_type === "inches") {
        // Depth sensor: derive everything from the geometry. For horizontal
        // tanks this uses the cylinder + spherical-heads model and is more
        // accurate than a linear inches->gallons compensation. For vertical
        // tanks it is treated linearly (height fraction == volume fraction).
        const fs = Number(cfg.full_scale_inches) || 0;
        if (fs > 0) {
          heightFrac = clamp(raw / fs, 0, 1); // exact physical fill height
          if (isHorizontal) {
            const v = horizInchesVolume(clamp(raw, 0, fs), fs, cfg.max_capacity);
            pct = v.fraction * 100;
            gallons = v.gallons;
          } else {
            pct = heightFrac * 100;
            gallons = cfg.max_capacity * heightFrac;
          }
        } else {
          available = false; // need full_scale_inches to interpret depth
        }
      } else if (cfg.value_type === "gallons") {
        pct = cfg.max_capacity > 0 ? (raw / cfg.max_capacity) * 100 : 0;
        gallons = raw;
        const vf = clamp(pct, 0, 100) / 100;
        heightFrac = (isHorizontal && cfg.level_is_volume)
          ? volumeFractionToHeightFraction(vf) : vf;
      } else { // percentage
        pct = raw;
        gallons = (cfg.max_capacity * pct) / 100;
        const vf = clamp(pct, 0, 100) / 100;
        heightFrac = (isHorizontal && cfg.level_is_volume)
          ? volumeFractionToHeightFraction(vf) : vf;
      }
    }

    const pctClamped = clamp(pct, 0, 100);

    const fillColor = available ? cfg.fill_color : "#9aa0a6";
    const low = available && pctClamped <= cfg.low_threshold;

    // Skip redraw if nothing meaningful changed (perf in busy dashboards).
    const sig = [available, Math.round(pct * 10), cfg.orientation, cfg.aspect_ratio, cfg.fill_color, cfg.tank_color, low, cfg.name].join("|");
    if (sig === this._lastSig) return;
    this._lastSig = sig;

    const name = cfg.name || (st && st.attributes && st.attributes.friendly_name) || cfg.entity;
    const svg = isHorizontal
      ? buildHorizontalTankSvg(heightFrac, fillColor, cfg.tank_color, this._uid, cfg.aspect_ratio)
      : buildVerticalTankSvg(heightFrac, fillColor, cfg.tank_color, this._uid, cfg.aspect_ratio);

    const pctText = available ? `${Math.round(pct)}%` : "—";
    const galText =
      cfg.show_gallons && available
        ? `≈ ${cfg.max_capacity < 30 ? gallons.toFixed(1) : Math.round(gallons)} gal`
        : "";

    this.shadowRoot.innerHTML = `
      <style>
        ha-card {
          padding: 14px 14px 16px;
          height: 100%;
          box-sizing: border-box;
          cursor: pointer;
          display: flex;
          flex-direction: column;
        }
        .ptc-name {
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--primary-text-color);
          margin: 0 2px 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ptc-tankwrap {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 0;
        }
        .ptc-svg {
          width: 100%;
          height: auto;
          max-height: ${isHorizontal ? "260px" : "360px"};
          display: block;
        }
        .ptc-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          text-align: center;
        }
        .ptc-pct {
          font-size: 2.4rem;
          font-weight: 700;
          line-height: 1.05;
          color: ${low ? cfg.warning_color : "#ffffff"};
          text-shadow: 0 1px 2px rgba(0,0,0,0.55), 0 0 3px rgba(0,0,0,0.45);
          padding: 2px 12px;
          border-radius: 10px;
          background: rgba(0,0,0,0.16);
        }
        .ptc-gal {
          margin-top: 4px;
          font-size: 0.95rem;
          font-weight: 600;
          color: #ffffff;
          text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        }
        .ptc-unavail {
          font-size: 0.8rem;
          color: var(--secondary-text-color);
          text-align: center;
          margin-top: 4px;
        }
      </style>
      <ha-card>
        <div class="ptc-name">${name}</div>
        <div class="ptc-tankwrap">
          ${svg}
          <div class="ptc-overlay">
            ${cfg.show_percentage ? `<div class="ptc-pct">${pctText}</div>` : ""}
            ${galText ? `<div class="ptc-gal">${galText}</div>` : ""}
          </div>
        </div>
        ${!available ? `<div class="ptc-unavail">Sensor unavailable</div>` : ""}
      </ha-card>
    `;

    const card = this.shadowRoot.querySelector("ha-card");
    if (card) card.addEventListener("click", () => this._fireMoreInfo());
  }
}

/* ------------------------------------------------------------------ *
 *  The visual (GUI) editor - uses HA's built-in <ha-form>
 * ------------------------------------------------------------------ */
class PropaneTankCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _schema() {
    const presetOptions = Object.keys(TANK_PRESETS).map((k) => ({
      value: k,
      label: TANK_PRESETS[k].label,
    }));
    return [
      { name: "entity", required: true, selector: { entity: { domain: ["sensor", "input_number", "number"] } } },
      { name: "name", selector: { text: {} } },
      {
        name: "tank_preset",
        selector: { select: { mode: "dropdown", options: presetOptions } },
      },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "orientation", selector: { select: { mode: "dropdown", options: [
            { value: "horizontal", label: "Horizontal" },
            { value: "vertical", label: "Vertical" },
          ] } } },
          { name: "value_type", selector: { select: { mode: "dropdown", options: [
            { value: "percentage", label: "Sensor reports %" },
            { value: "gallons", label: "Sensor reports gallons" },
            { value: "inches", label: "Sensor reports inches (depth)" },
          ] } } },
        ],
      },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "max_capacity", selector: { number: { min: 0, max: 5000, step: 0.1, mode: "box", unit_of_measurement: "gal" } } },
          { name: "aspect_ratio", selector: { number: { min: 1.2, max: 6, step: 0.1, mode: "box" } } },
        ],
      },
      { name: "full_scale_inches", selector: { number: { min: 0, max: 200, step: 0.1, mode: "box", unit_of_measurement: "in" } } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "show_percentage", selector: { boolean: {} } },
          { name: "show_gallons", selector: { boolean: {} } },
        ],
      },
      { name: "low_threshold", selector: { number: { min: 0, max: 100, step: 1, mode: "slider", unit_of_measurement: "%" } } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "fill_color", selector: { color_rgb: {} } },
          { name: "tank_color", selector: { color_rgb: {} } },
        ],
      },
      { name: "level_is_volume", selector: { boolean: {} } },
    ];
  }

  _labels() {
    return {
      entity: "Propane level sensor (required)",
      name: "Card name (optional)",
      tank_preset: "Tank size & orientation",
      orientation: "Orientation override",
      value_type: "Sensor value type",
      max_capacity: "Tank capacity (for gallons readout)",
      aspect_ratio: "Aspect ratio override",
      full_scale_inches: "Depth at 100% full — inches (horizontal: inside diameter)",
      show_percentage: "Show percentage overlay",
      show_gallons: "Show gallons remaining",
      low_threshold: "Low-level warning threshold",
      fill_color: "Liquid color",
      tank_color: "Tank color",
      level_is_volume: "Treat reading as volume % (volume-accurate fill)",
    };
  }

  _render() {
    if (!this._hass) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        // ha-form's color_rgb selector emits [r,g,b]; convert back to hex
        // so the rest of the card (and YAML) keeps seeing "#rrggbb" strings.
        const incoming = { ...ev.detail.value };
        if (Array.isArray(incoming.fill_color)) {
          incoming.fill_color = rgbToHex(incoming.fill_color);
        }
        if (Array.isArray(incoming.tank_color)) {
          incoming.tank_color = rgbToHex(incoming.tank_color);
        }
        const next = { ...this._config, ...incoming };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: next } }));
      });
      this.appendChild(this._form);
    }
    const labels = this._labels();
    // Going into ha-form: hand the color selectors [r,g,b] so the picker
    // displays the current swatch correctly.
    const data = { ...DEFAULTS, ...this._config };
    if (typeof data.fill_color === "string") {
      const rgb = hexToRgb(data.fill_color);
      if (rgb) data.fill_color = rgb;
    }
    if (typeof data.tank_color === "string") {
      const rgb = hexToRgb(data.tank_color);
      if (rgb) data.tank_color = rgb;
    }
    this._form.hass = this._hass;
    this._form.data = data;
    this._form.schema = this._schema();
    this._form.computeLabel = (s) => labels[s.name] || s.name;
  }
}

/* ------------------------------------------------------------------ *
 *  Registration
 * ------------------------------------------------------------------ */
if (!customElements.get("propane-tank-card")) {
  customElements.define("propane-tank-card", PropaneTankCard);
}
if (!customElements.get("propane-tank-card-editor")) {
  customElements.define("propane-tank-card-editor", PropaneTankCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "propane-tank-card",
  name: "Propane Tank Card",
  description: "Realistic, volume-accurate propane tank level visualization.",
  preview: true,
  documentationURL: "https://github.com/YOUR_GITHUB_USERNAME/propane-tank-card",
});

console.info(
  `%c PROPANE-TANK-CARD %c v${PTC_VERSION} `,
  "color:white;background:#2f9bdb;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px",
  "color:#2f9bdb;background:#222;border-radius:0 3px 3px 0;padding:2px 4px"
);
