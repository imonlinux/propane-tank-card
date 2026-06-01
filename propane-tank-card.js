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

const PTC_VERSION = "1.2.0";

/* ------------------------------------------------------------------ *
 *  Tank presets
 *  aspect (horizontal) = length / diameter
 *  aspect (vertical)   = height / diameter
 *  capacity = nominal gallons (used for the optional volume readout).
 *  diameter = inside diameter in inches (horizontal) — the depth reading
 *  at 100% full, used to default full_scale_inches in depth mode.
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
  value_type: "auto",        // auto | percentage | volume | depth
  sensor_unit: "auto",       // auto | in,ft,mm,cm,m | gal,L,mL,m3,ft3 | %
  units: "auto",             // auto | imperial | metric  — display readout only
  full_scale_inches: null,   // depth reading at 100% (horizontal: inside diameter)
  level_is_volume: true,     // map volume% -> fill height (percentage/volume modes)
  fill_color: "#2f9bdb",
  tank_color: "#e7e9ec",
  show_percentage: true,
  show_gallons: false,
  low_threshold: 20,
  warning_color: "#e8623d",
  tint_when_low: true,
};

/* ------------------------------------------------------------------ *
 *  Unit handling — the geometry only ever works in canonical inches
 *  and US gallons. Everything user-facing is converted in (input) or
 *  out (display) of that canonical core. See docs/UNITS.md.
 * ------------------------------------------------------------------ */
const GAL_TO_L = 3.785411784;                 // exact: 1 US gal = 3.785411784 L
const LENGTH_TO_IN = {                          // multiply to get inches
  in: 1, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 39.37007874015748,
};
const VOLUME_TO_GAL = {                         // multiply to get US gallons
  gal: 1, L: 1 / GAL_TO_L, mL: 1 / (GAL_TO_L * 1000), m3: 1000 / GAL_TO_L, ft3: 1728 / 231,
};

const _ptcWarned = new Set();
function warnOnce(msg) {
  if (_ptcWarned.has(msg)) return;
  _ptcWarned.add(msg);
  if (typeof console !== "undefined") console.warn("[propane-tank-card] " + msg);
}

// Normalize an HA unit_of_measurement string to one of our canonical keys.
function normalizeUnit(u) {
  if (typeof u !== "string") return null;
  const s = u.trim().toLowerCase().replace(/\.$/, "");
  const map = {
    '"': "in", "″": "in", in: "in", inch: "in", inches: "in",
    "'": "ft", ft: "ft", foot: "ft", feet: "ft",
    mm: "mm", millimeter: "mm", millimeters: "mm", millimetre: "mm", millimetres: "mm",
    cm: "cm", centimeter: "cm", centimeters: "cm", centimetre: "cm", centimetres: "cm",
    m: "m", meter: "m", meters: "m", metre: "m", metres: "m",
    gal: "gal", gallon: "gal", gallons: "gal", "us gal": "gal",
    l: "L", liter: "L", liters: "L", litre: "L", litres: "L",
    ml: "mL", milliliter: "mL", milliliters: "mL", millilitre: "mL", millilitres: "mL",
    m3: "m3", "m³": "m3", "cubic meter": "m3", "cubic metre": "m3",
    ft3: "ft3", "ft³": "ft3", "cu ft": "ft3", "cubic feet": "ft3", "cubic foot": "ft3",
    "%": "%", percent: "%", percentage: "%", pct: "%",
  };
  return map[s] || null;
}

function unitDimension(nu) {
  if (nu === "%") return "percentage";
  if (LENGTH_TO_IN[nu] != null) return "depth";
  if (VOLUME_TO_GAL[nu] != null) return "volume";
  return null;
}

// value_type is authoritative; "auto" infers the dimension from the unit
// string, falling back to percentage (the only dimension needing no scaling).
function resolveDimension(valueType, normUnit) {
  if (valueType === "percentage" || valueType === "volume" || valueType === "depth") return valueType;
  return unitDimension(normUnit) || "percentage";
}

// Returns { unit, guessed }. The dimension always wins: an override that
// doesn't fit the dimension is ignored (and warned about).
function resolveUnit(dim, sensorUnit, normUnit, entityId) {
  if (dim === "percentage") return { unit: "%", guessed: false };
  const table = dim === "depth" ? LENGTH_TO_IN : VOLUME_TO_GAL;
  if (sensorUnit && sensorUnit !== "auto") {
    if (table[sensorUnit] != null) return { unit: sensorUnit, guessed: false };
    warnOnce(`${entityId}: sensor_unit "${sensorUnit}" is not a ${dim} unit; ignoring it.`);
  }
  if (normUnit && table[normUnit] != null) return { unit: normUnit, guessed: false };
  return { unit: dim === "depth" ? "in" : "gal", guessed: true };
}

function toCanonical(raw, dim, unit) {
  if (dim === "percentage") return raw;             // percent stays percent
  if (dim === "depth") return raw * LENGTH_TO_IN[unit];   // -> inches
  return raw * VOLUME_TO_GAL[unit];                 // -> gallons
}

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
function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex;
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}
function rgbToHex(rgb) {
  if (typeof rgb === "string") return rgb;
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return "#" + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
}

/**
 * VOLUME fraction (0..1) -> FILL-HEIGHT fraction (0..1) for a horizontal
 * cylinder, via the circular-segment formula (non-linear). Bisection.
 */
function volumeFractionToHeightFraction(f) {
  if (f <= 0) return 0;
  if (f >= 1) return 1;
  const target = f * Math.PI;
  let lo = 0, hi = 2, h = 1;
  for (let i = 0; i < 48; i++) {
    h = (lo + hi) / 2;
    const area = Math.acos(1 - h) - (1 - h) * Math.sqrt(Math.max(0, 2 * h - h * h));
    if (area < target) lo = h; else hi = h;
  }
  return ((lo + hi) / 2) / 2;
}

/**
 * Liquid depth (inches) -> { gallons, fraction } for a horizontal tank,
 * modeled as a cylinder + two hemispherical heads. Cylindrical length L
 * is derived from inside diameter and total capacity, self-calibrating.
 */
function horizInchesVolume(inches, diameterInches, capacityGal) {
  const R = diameterInches / 2;
  if (!(R > 0)) return { gallons: 0, fraction: 0 };
  const GAL = 231;
  const Vtot = (capacityGal > 0 ? capacityGal : 0) * GAL;
  const Vsphere = (4 / 3) * Math.PI * R * R * R;
  let L = Vtot > 0 ? (Vtot - Vsphere) / (Math.PI * R * R) : 0;
  if (!isFinite(L) || L < 0) L = 0;
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
function buildHorizontalTankSvg(heightFrac, fillColor, tankColor, uid, aspectIn, prevHeightFrac, animDur) {
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

  const doAnim = prevHeightFrac != null && animDur > 0 && Math.abs(prevHeightFrac - heightFrac) > 0.0005;
  const prevSurfaceY = y0 + BODY_H * (1 - prevHeightFrac);
  const prevFluidH = BODY_H * prevHeightFrac;
  const anim = (attr, from, to) => doAnim
    ? `<animate attributeName="${attr}" from="${from}" to="${to}" dur="${animDur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/>`
    : "";

  const mLight = shade(tankColor, 26), mMid = tankColor, mDark = shade(tankColor, -16), mEdge = shade(tankColor, -34);
  const fTop = shade(fillColor, 20), fBot = shade(fillColor, -24), fSurf = shade(fillColor, 38);

  const legW = 34, legH = padBot - 6;
  const legY = y0 + 2 * r - 2;
  const leg = (lx) =>
    `<path d="M ${lx - legW / 2} ${legY} L ${lx + legW / 2} ${legY} L ${lx + legW / 2 + 8} ${legY + legH} L ${lx - legW / 2 - 8} ${legY + legH} Z" fill="${mEdge}"/>`;

  return `
<svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg" class="ptc-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
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

  <path d="${capsule}" fill="url(#ptc-metal-${uid})"/>

  <g clip-path="url(#ptc-clip-${uid})">
    <rect x="${x0}" y="${surfaceY}" width="${BODY_W}" height="${fluidH}" fill="url(#ptc-fluid-${uid})">
      ${anim("y", prevSurfaceY, surfaceY)}${anim("height", prevFluidH, fluidH)}
    </rect>
    ${heightFrac > 0.003 && heightFrac < 0.997
      ? `<rect x="${x0}" y="${surfaceY - 1}" width="${BODY_W}" height="3.5" fill="${fSurf}" opacity="0.9">${anim("y", prevSurfaceY - 1, surfaceY - 1)}</rect>`
      : ""}
  </g>

  <line x1="${x0 + r}" y1="${y0 + 2}" x2="${x0 + r}" y2="${y0 + 2 * r - 2}" stroke="${mEdge}" stroke-width="1.2" opacity="0.45"/>
  <line x1="${x0 + BODY_W - r}" y1="${y0 + 2}" x2="${x0 + BODY_W - r}" y2="${y0 + 2 * r - 2}" stroke="${mEdge}" stroke-width="1.2" opacity="0.45"/>

  <rect x="${x0 + r * 0.4}" y="${y0 + 10}" width="${BODY_W - r * 0.8}" height="14" rx="7" fill="#ffffff" opacity="0.12" clip-path="url(#ptc-clip-${uid})"/>

  <path d="${capsule}" fill="none" stroke="${mEdge}" stroke-width="2"/>

  <rect x="${cx - 26}" y="${y0 - 16}" width="52" height="22" rx="6" fill="${mDark}" stroke="${mEdge}" stroke-width="1.5"/>
  <rect x="${cx - 5}" y="${y0 - 26}" width="10" height="12" rx="2" fill="${mEdge}"/>
  <circle cx="${cx}" cy="${y0 - 27}" r="6" fill="none" stroke="${mEdge}" stroke-width="2.4"/>
</svg>`;
}

function buildVerticalTankSvg(heightFrac, fillColor, tankColor, uid, aspectIn, prevHeightFrac, animDur) {
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

  const doAnim = prevHeightFrac != null && animDur > 0 && Math.abs(prevHeightFrac - heightFrac) > 0.0005;
  const prevSurfaceY = botApex - prevHeightFrac * span;
  const anim = (attr, from, to) => doAnim
    ? `<animate attributeName="${attr}" from="${from}" to="${to}" dur="${animDur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/>`
    : "";

  const mLight = shade(tankColor, 26), mMid = tankColor, mDark = shade(tankColor, -16), mEdge = shade(tankColor, -34);
  const fTop = shade(fillColor, 20), fBot = shade(fillColor, -24), fSurf = shade(fillColor, 38);

  return `
<svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg" class="ptc-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
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

  <rect x="${x0 + W * 0.12}" y="${botApex - 6}" width="${W * 0.76}" height="16" rx="4" fill="${mEdge}"/>

  <path d="${body}" fill="url(#ptc-vmetal-${uid})"/>

  <g clip-path="url(#ptc-vclip-${uid})">
    <rect x="${x0}" y="${surfaceY}" width="${W}" height="${botApex - surfaceY}" fill="url(#ptc-vfluid-${uid})">
      ${anim("y", prevSurfaceY, surfaceY)}${anim("height", botApex - prevSurfaceY, botApex - surfaceY)}
    </rect>
    ${heightFrac > 0.003 && heightFrac < 0.997
      ? `<rect x="${x0}" y="${surfaceY - 1}" width="${W}" height="3.5" fill="${fSurf}" opacity="0.9">${anim("y", prevSurfaceY - 1, surfaceY - 1)}</rect>`
      : ""}
  </g>

  <line x1="${x0 + 2}" y1="${ybTop}" x2="${x0 + W - 2}" y2="${ybTop}" stroke="${mEdge}" stroke-width="1.2" opacity="0.4"/>

  <rect x="${x0 + W * 0.16}" y="${ybTop + 6}" width="${W * 0.16}" height="${ybBot - ybTop - 12}" rx="${W * 0.08}" fill="#ffffff" opacity="0.14" clip-path="url(#ptc-vclip-${uid})"/>

  <path d="${body}" fill="none" stroke="${mEdge}" stroke-width="2"/>

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
    this._prevHeightFrac = null;
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
    // Migrate legacy keys so older configs keep working unchanged.
    const cfg = { ...config };
    if (cfg.value_type === "gallons") cfg.value_type = "volume";
    if (cfg.value_type === "inches") cfg.value_type = "depth";
    if (cfg.volume_unit != null && cfg.units == null) {
      cfg.units = cfg.volume_unit === "L" ? "metric" : "imperial";
    }
    delete cfg.volume_unit;

    const preset = TANK_PRESETS[cfg.tank_preset] || TANK_PRESETS[DEFAULTS.tank_preset];
    this._config = {
      ...DEFAULTS,
      ...cfg,
      orientation: cfg.orientation || preset.orientation,
      aspect_ratio: cfg.aspect_ratio != null ? Number(cfg.aspect_ratio) : preset.aspect,
      max_capacity: cfg.max_capacity != null ? Number(cfg.max_capacity) : preset.capacity,
      full_scale_inches: cfg.full_scale_inches != null
        ? Number(cfg.full_scale_inches)
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

  getGridOptions() {
    const vertical = this._config && this._config.orientation === "vertical";
    return vertical
      ? { rows: 6, columns: 6, min_rows: 4, min_columns: 4 }
      : { rows: 4, columns: 12, min_rows: 3, min_columns: 6 };
  }

  // Resolve the display unit system: explicit override, else follow HA.
  _useMetric() {
    const u = this._config.units;
    if (u === "metric") return true;
    if (u === "imperial") return false;
    const us = this._hass && this._hass.config && this._hass.config.unit_system;
    return us ? us.length === "km" : false; // km => metric; mi => US customary
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
    let pct = 0, gallons = 0, heightFrac = 0;

    if (available) {
      const raw = parseFloat(st.state);
      if (!isFinite(raw)) {
        available = false;
      } else {
        // --- resolve units, then convert to canonical inches / gallons ---
        const normUnit = normalizeUnit(st.attributes && st.attributes.unit_of_measurement);
        const dim = resolveDimension(cfg.value_type, normUnit);
        const ru = resolveUnit(dim, cfg.sensor_unit, normUnit, cfg.entity);
        if (ru.guessed) {
          warnOnce(`${cfg.entity}: couldn't determine the ${dim} unit; assuming "${ru.unit}". Set "sensor_unit" to silence this.`);
        }
        const canon = toCanonical(raw, dim, ru.unit);

        if (dim === "depth") {
          const fs = Number(cfg.full_scale_inches) || 0;
          if (fs > 0) {
            heightFrac = clamp(canon / fs, 0, 1); // exact physical fill height
            if (isHorizontal) {
              const v = horizInchesVolume(clamp(canon, 0, fs), fs, cfg.max_capacity);
              pct = v.fraction * 100;
              gallons = v.gallons;
            } else {
              pct = heightFrac * 100;
              gallons = cfg.max_capacity * heightFrac;
            }
          } else {
            available = false; // need full_scale_inches to interpret depth
          }
        } else if (dim === "volume") {
          gallons = canon;
          pct = cfg.max_capacity > 0 ? (canon / cfg.max_capacity) * 100 : 0;
          const vf = clamp(pct, 0, 100) / 100;
          heightFrac = (isHorizontal && cfg.level_is_volume) ? volumeFractionToHeightFraction(vf) : vf;
        } else { // percentage
          pct = canon;
          gallons = (cfg.max_capacity * pct) / 100;
          const vf = clamp(pct, 0, 100) / 100;
          heightFrac = (isHorizontal && cfg.level_is_volume) ? volumeFractionToHeightFraction(vf) : vf;
        }
      }
    }

    const pctClamped = clamp(pct, 0, 100);
    const metric = this._useMetric();
    const low = available && pctClamped <= cfg.low_threshold;
    const fillColor = !available
      ? "#9aa0a6"
      : (low && cfg.tint_when_low !== false ? cfg.warning_color : cfg.fill_color);

    const sig = [
      available, Math.round(pct * 10), cfg.orientation, cfg.aspect_ratio,
      fillColor, cfg.tank_color, cfg.warning_color, low,
      metric, cfg.show_gallons, cfg.show_percentage, cfg.name,
    ].join("|");
    if (sig === this._lastSig) return;
    this._lastSig = sig;

    const reduce = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animDur = reduce ? 0 : 0.6;

    const name = cfg.name || (st && st.attributes && st.attributes.friendly_name) || cfg.entity;
    const svg = isHorizontal
      ? buildHorizontalTankSvg(heightFrac, fillColor, cfg.tank_color, this._uid, cfg.aspect_ratio, this._prevHeightFrac, animDur)
      : buildVerticalTankSvg(heightFrac, fillColor, cfg.tank_color, this._uid, cfg.aspect_ratio, this._prevHeightFrac, animDur);
    this._prevHeightFrac = heightFrac;

    const pctText = available ? `${Math.round(pct)}%` : "—";
    let galText = "";
    if (cfg.show_gallons && available) {
      const val = metric ? gallons * GAL_TO_L : gallons;
      galText = `≈ ${val < 100 ? val.toFixed(1) : Math.round(val)} ${metric ? "L" : "gal"}`;
    }
    const ariaLabel = `${name}: ${available ? Math.round(pct) + " percent" : "sensor unavailable"}`;

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
        <div class="ptc-tankwrap" role="img" aria-label="${ariaLabel}">
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
    const unitOptions = [
      { value: "auto", label: "Auto-detect from sensor" },
      { value: "in", label: "Inches" },
      { value: "ft", label: "Feet" },
      { value: "mm", label: "Millimeters" },
      { value: "cm", label: "Centimeters" },
      { value: "m", label: "Meters" },
      { value: "gal", label: "Gallons" },
      { value: "L", label: "Liters" },
      { value: "mL", label: "Milliliters" },
      { value: "m3", label: "Cubic meters" },
      { value: "ft3", label: "Cubic feet" },
      { value: "%", label: "Percent" },
    ];
    return [
      { name: "entity", required: true, selector: { entity: { domain: ["sensor", "input_number", "number"] } } },
      { name: "name", selector: { text: {} } },
      { name: "units", selector: { select: { mode: "dropdown", options: [
        { value: "auto", label: "Follow Home Assistant" },
        { value: "imperial", label: "Imperial (gallons)" },
        { value: "metric", label: "Metric (liters)" },
      ] } } },
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
            { value: "auto", label: "Auto-detect" },
            { value: "percentage", label: "Percentage (0–100)" },
            { value: "volume", label: "Volume" },
            { value: "depth", label: "Depth (liquid height)" },
          ] } } },
        ],
      },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "sensor_unit", selector: { select: { mode: "dropdown", options: unitOptions } } },
          { name: "full_scale_inches", selector: { number: { min: 0, max: 200, step: 0.1, mode: "box", unit_of_measurement: "in" } } },
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
      {
        type: "grid",
        name: "",
        schema: [
          { name: "show_percentage", selector: { boolean: {} } },
          { name: "show_gallons", selector: { boolean: {} } },
        ],
      },
      { name: "tint_when_low", selector: { boolean: {} } },
      { name: "low_threshold", selector: { number: { min: 0, max: 100, step: 1, mode: "slider", unit_of_measurement: "%" } } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "fill_color", selector: { color_rgb: {} } },
          { name: "tank_color", selector: { color_rgb: {} } },
          { name: "warning_color", selector: { color_rgb: {} } },
        ],
      },
      { name: "level_is_volume", selector: { boolean: {} } },
    ];
  }

  _labels() {
    return {
      entity: "Propane level sensor (required)",
      name: "Card name (optional)",
      units: "Units (display)",
      tank_preset: "Tank size & orientation",
      orientation: "Orientation override",
      value_type: "What the sensor reports",
      sensor_unit: "Sensor's unit of measure",
      full_scale_inches: "Depth at 100% full (horizontal: inside diameter)",
      max_capacity: "Tank capacity (for volume readout)",
      aspect_ratio: "Aspect ratio override",
      show_percentage: "Show percentage overlay",
      show_gallons: "Show volume remaining",
      tint_when_low: "Tint liquid when low",
      low_threshold: "Low-level warning threshold",
      fill_color: "Liquid color",
      tank_color: "Tank color",
      warning_color: "Low-level color",
      level_is_volume: "Treat reading as volume % (volume-accurate fill)",
    };
  }

  _render() {
    if (!this._hass) return;
    const COLOR_KEYS = ["fill_color", "tank_color", "warning_color"];
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const incoming = { ...ev.detail.value };
        COLOR_KEYS.forEach((k) => {
          if (Array.isArray(incoming[k])) incoming[k] = rgbToHex(incoming[k]);
        });
        // When the tank preset changes, snap the preset-derived fields to the
        // newly selected tank. Direct edits to those fields (without changing
        // the preset) are preserved.
        const prevPreset = (this._config && this._config.tank_preset) || DEFAULTS.tank_preset;
        if (incoming.tank_preset && incoming.tank_preset !== prevPreset) {
          const p = TANK_PRESETS[incoming.tank_preset] || TANK_PRESETS[DEFAULTS.tank_preset];
          incoming.orientation = p.orientation;
          incoming.aspect_ratio = p.aspect;
          incoming.max_capacity = p.capacity;
          incoming.full_scale_inches = p.diameter != null ? p.diameter : null;
        }
        const next = { ...(this._config || {}), ...incoming };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: next } }));
      });
      this.appendChild(this._form);
    }
    const labels = this._labels();
    const cfg = this._config || {};
    // Show preset-derived values (shape, capacity, full-scale) so these fields
    // are populated from the tank selection rather than blank. Explicit user
    // values still win.
    const preset = TANK_PRESETS[cfg.tank_preset] || TANK_PRESETS[DEFAULTS.tank_preset];
    const presetDefaults = {
      orientation: preset.orientation,
      aspect_ratio: preset.aspect,
      max_capacity: preset.capacity,
      full_scale_inches: preset.diameter != null ? preset.diameter : null,
    };
    const data = { ...DEFAULTS, ...presetDefaults, ...cfg };
    COLOR_KEYS.forEach((k) => {
      if (typeof data[k] === "string") {
        const rgb = hexToRgb(data[k]);
        if (rgb) data[k] = rgb;
      }
    });
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
  documentationURL: "https://github.com/imonlinux/propane-tank-card",
});

console.info(
  `%c PROPANE-TANK-CARD %c v${PTC_VERSION} `,
  "color:white;background:#2f9bdb;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px",
  "color:#2f9bdb;background:#222;border-radius:0 3px 3px 0;padding:2px 4px"
);
