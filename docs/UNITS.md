# Units & unit resolution

The card has one invariant: **the geometry never sees user units.** All tank
math runs in canonical **inches** (depth, diameter) and canonical **US
gallons** (volume), with percentage as a pure ratio. Everything else is a
conversion applied *before* the geometry (input) or *after* it (display).

## Three independent axes

| Axis | Config key | Values | Default | Controls |
| --- | --- | --- | --- | --- |
| Meaning (dimension) | `value_type` | `auto` · `percentage` · `volume` · `depth` | `auto` | What the sensor number represents |
| Input unit | `sensor_unit` | `auto` · `in` `ft` `mm` `cm` `m` · `gal` `L` `mL` `m3` `ft3` · `%` | `auto` | The unit the sensor's number is in |
| Display | `units` | `auto` · `imperial` · `metric` | `auto` | How the volume readout is shown |

`value_type` is authoritative for the dimension; `sensor_unit` only chooses the
unit *within* that dimension; `units` is display-only and never reinterprets
input. When `units: auto`, the readout follows Home Assistant's configured unit
system (metric → liters, US customary → gallons).

## Legacy keys (migrated automatically)

| Old | New |
| --- | --- |
| `value_type: gallons` | `value_type: volume` |
| `value_type: inches` | `value_type: depth` |
| `volume_unit: gal` | `units: imperial` |
| `volume_unit: L` | `units: metric` |

Existing configs keep working unchanged; migration happens in `setConfig`.

## Resolution order

**Dimension** — if `value_type` is explicit, use it; if `auto`, infer from the
sensor's normalized `unit_of_measurement` (`%`→percentage, a volume unit→volume,
a length unit→depth); if still unknown, fall back to **percentage** (the only
dimension that needs no scaling, so a wrong guess is the least harmful).

**Unit within the dimension** — use `sensor_unit` if set and compatible with the
dimension (an incompatible override is ignored with a console warning, because
the dimension always wins); else read the entity's `unit_of_measurement`; else
fall back to the **imperial canonical** (`in` for depth, `gal` for volume) and
emit a one-time console warning naming the entity. Imperial-canonical is the
fallback because a gross mismatch then pegs the tank to full/empty rather than
showing a plausible-but-wrong number — the error is visible during setup.

## Conversion factors

Length → inches: `in` ×1, `ft` ×12, `mm` ×(1/25.4), `cm` ×(1/2.54), `m` ×39.3700787.

Volume → US gallons: `gal` ×1, `L` ×(1/3.785411784), `mL` ×(1/3785.411784),
`m3` ×264.172052, `ft3` ×(1728/231 = 7.4805195).

Display: imperial shows gallons; metric multiplies by 3.785411784 and shows
liters. Percentage is shown as-is. (US gallon = 3.785411784 L, exact. Imperial
gallons are intentionally not supported — UK/AU LPG is sold by litre/kg.)

## Pipeline

```
raw   = parseFloat(state)                  // unavailable if NaN
dim   = resolveDimension(value_type, normUnit)
unit  = resolveUnit(dim, sensor_unit, normUnit)
canon = toCanonical(raw, dim, unit)        // inches | gallons | percent

depth:       heightFrac = clamp(canon / full_scale_inches, 0, 1)
             horizontal → horizInchesVolume(canon, full_scale_inches, max_capacity)
             vertical   → linear (heightFrac == volume fraction)
volume:      pct = canon / max_capacity * 100;  gallons = canon
             heightFrac = (horizontal && level_is_volume) ? volume→height(pct) : pct
percentage:  pct = canon;  gallons = max_capacity * pct/100;  heightFrac (same rule)

display:     metric ? round(gallons * 3.785411784) + " L" : round(gallons) + " gal"
```

`full_scale_inches` and `max_capacity` are stored canonically (inches/gallons,
from the presets). `level_is_volume` applies only in percentage/volume modes; in
depth mode the true liquid height is already known.

## Worked examples (250 gal / 30″ horizontal)

| Sensor | `value_type` | unit attr | `sensor_unit` | → result |
| --- | --- | --- | --- | --- |
| Mopeka, US HA | `auto` | `in` | `auto` | 15 → 50% / 125 gal |
| Mopeka, metric HA | `auto` | `mm` | `auto` | 381 → 50% / 125 gal |
| Gallons compensation | `auto` | `gal` | `auto` | 125 → 50% |
| UK helper in litres | `volume` | `L` | `auto` | 473.18 → 50% |
| No unit, cm override | `depth` | *(none)* | `cm` | 38.1 → 50% |
| No unit, no override | `depth` | *(none)* | `auto` | assumes inches + warns |
| Standard % gauge | `auto` | `%` | `auto` | 50 → 50% |

## Notes

- The native Mopeka `tank_level` is `device_class: distance`, so Home Assistant
  auto-converts it to the user's unit system (US → inches, metric → millimeters).
  Reading `unit_of_measurement` therefore "just works" for that sensor.
- Template/helper sensors usually carry a hardcoded unit and no device_class, so
  their unit does **not** follow the locale — which is exactly why the input unit
  is resolved from the data source, not from the display toggle.
