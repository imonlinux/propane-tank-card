# Propane Tank Card

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card that turns a propane level sensor into a **realistic cross-section of the tank**, with a **volume-accurate liquid level**, a percentage overlay, and an optional volume-remaining readout.

- Realistic SVG artwork — horizontal ASME tanks (saddle legs, valve hood, weld seams) and vertical cylinders (domed top, protective collar, foot ring), with a smooth, eased liquid animation when the level changes.
- **Volume-accurate fill.** For horizontal tanks the liquid line is placed with the circular-segment formula, so a tank reading 25% sits at ~30% of the height (the middle of a cylinder holds the most), and 50% is exactly halfway.
- **Works with any sensor.** Feed it a percentage, a volume (gallons/liters), or a raw depth reading (inches/mm) — the card detects the unit from the sensor and converts. No helper sensors required.
- **Metric or imperial** display, following Home Assistant or set explicitly.
- Selectable **size & orientation** (20 lb up to 1000 gal) plus a Custom option, with capacity and shape derived from the tank you pick.
- Optional **volume-remaining** readout and a **low-level warning** that tints the number and the liquid.
- Full **visual (GUI) editor** — no YAML required.

<img width="386" height="210" alt="image" src="https://github.com/user-attachments/assets/a164d59a-fe14-40c2-bd32-c18456bf6f32" />

<img width="822" height="1058" alt="image" src="https://github.com/user-attachments/assets/cba16cc9-566c-4543-8e42-1629af63f739" />

## Installation

### Via HACS (recommended)

[![Open your Home Assistant instance and add this repository inside HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=imonlinux&repository=propane-tank-card&category=dashboard)

Or add it manually as a custom repository:

1. In HACS, open the three-dot menu → **Custom repositories**.
2. Add `https://github.com/imonlinux/propane-tank-card` with category **Dashboard**.
3. Find **Propane Tank Card** in HACS and click **Download**.
4. HACS registers the dashboard resource automatically. (If you run YAML-mode dashboards, add the resource manually — see below.)
5. Hard-refresh your browser (Ctrl/Cmd+Shift+R).

### Manual

1. Copy `propane-tank-card.js` to `/config/www/propane-tank-card.js`.
2. Add the resource (Settings → Dashboards → ⋮ → Resources → Add):
   - URL: `/local/propane-tank-card.js`
   - Type: **JavaScript Module**
3. Hard-refresh your browser.

HACS-installed resource URL, for reference: `/hacsfiles/propane-tank-card/propane-tank-card.js`.

## Quick start

Add a card, search for **Propane Tank Card**, and use the visual editor — or drop in this minimum config:

```yaml
type: custom:propane-tank-card
entity: sensor.propane_tank_level
tank_preset: 250gal_horizontal
```

That's it. The card reads your sensor's unit to decide whether it's a percentage, a volume, or a depth, and pulls the tank's capacity and shape from the preset.

## Examples

A standard percentage gauge, with the gallons remaining shown:

```yaml
type: custom:propane-tank-card
entity: sensor.propane_tank_level
name: Main Tank
tank_preset: 250gal_horizontal
show_gallons: true
```

A raw **depth** sensor (Mopeka, magnetostrictive, ultrasonic) reporting inches or millimeters above the probe — no compensation sensors needed. The card derives gallons and percentage from the tank geometry:

```yaml
type: custom:propane-tank-card
entity: sensor.propane_tank_tank_level
name: Propane
tank_preset: 250gal_horizontal
value_type: depth         # usually auto-detected from the sensor's unit
full_scale_inches: 30     # depth at 100% = inside diameter (defaults from preset)
show_gallons: true
```

A sensor that reports a **volume** instead of a percentage:

```yaml
type: custom:propane-tank-card
entity: sensor.tank_gallons
tank_preset: 500gal_horizontal
value_type: volume
max_capacity: 500
show_gallons: true
```

**Metric** display (litres), e.g. for a Canadian install on the same physical tank:

```yaml
type: custom:propane-tank-card
entity: sensor.propane_tank_level
tank_preset: 250gal_horizontal
units: metric
show_gallons: true
```

A small portable cylinder with a custom liquid color:

```yaml
type: custom:propane-tank-card
entity: sensor.bbq_tank
name: BBQ
tank_preset: 20lb_vertical
fill_color: "#e2902f"
low_threshold: 25
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | **required** | Your propane level sensor (`sensor`, `number`, or `input_number`). |
| `name` | string | sensor name | Title shown on the card. |
| `units` | string | `auto` | Display units for the volume readout: `auto` (follow Home Assistant), `imperial` (gallons), or `metric` (liters). |
| `tank_preset` | string | `250gal_horizontal` | Sets orientation, aspect ratio, capacity, and full-scale depth. See list below. |
| `value_type` | string | `auto` | What the sensor reports: `auto`, `percentage` (0–100), `volume`, or `depth` (liquid height). `auto` infers it from the sensor's unit. |
| `sensor_unit` | string | `auto` | The unit the sensor's value is in. `auto` reads the sensor's `unit_of_measurement`. Override with `in`, `ft`, `mm`, `cm`, `m`, `gal`, `L`, `mL`, `m3`, `ft3`, or `%`. |
| `full_scale_inches` | number | from preset | Depth reading at 100% full (used when `value_type` resolves to `depth`). For a horizontal tank this is the inside diameter; for a vertical tank, the inside height. |
| `max_capacity` | number | from preset | Tank capacity in gallons. Derived from the preset; override only for the `custom` preset or to show usable rather than nominal capacity. |
| `orientation` | string | from preset | `horizontal` or `vertical` — overrides the preset. |
| `aspect_ratio` | number | from preset | Length/diameter (horizontal) or height/diameter (vertical). Overrides the preset. |
| `level_is_volume` | bool | `true` | Treat a percentage/volume reading as **volume** and place the liquid line accurately. Set `false` if your sensor already reports liquid **height** as a percentage. |
| `show_percentage` | bool | `true` | Show the large percentage overlay. |
| `show_gallons` | bool | `false` | Show the volume remaining beneath the percentage. |
| `tint_when_low` | bool | `true` | Tint the liquid (not just the number) with the warning color below the threshold. |
| `low_threshold` | number | `20` | At/below this percent, the number and (optionally) the liquid turn the warning color. |
| `fill_color` | string | `#2f9bdb` | Liquid color — use the editor's color picker, or hex in YAML. |
| `tank_color` | string | `#e7e9ec` | Tank body color — use the editor's color picker, or hex in YAML. |
| `warning_color` | string | `#e8623d` | Color used for the low-level state. |

> **Units in three parts.** `value_type` is *what* the number means, `sensor_unit` is *what unit it's in*, and `units` is *how the volume is displayed*. The first two describe your sensor (and are usually auto-detected); the last is your display preference. See [docs/UNITS.md](docs/UNITS.md) for the full model.

### Built-in presets

`20lb_vertical`, `30lb_vertical`, `40lb_vertical`, `100lb_vertical`,
`120gal_vertical`, `250gal_vertical`, `500gal_vertical`,
`120gal_horizontal`, `250gal_horizontal`, `330gal_horizontal`,
`500gal_horizontal`, `1000gal_horizontal`, `custom`.

The presets use North American tank sizes. They work anywhere — Canada uses identical tanks sold by the litre, so set `units: metric` and you're done. Elsewhere (UK/EU/AU, where LPG is sold by mass and tank shapes differ), use the `custom` preset with your own `aspect_ratio`, `max_capacity`, and `full_scale_inches`.

## How the fill is calculated

Standard propane gauges report **percentage of capacity (volume)**. For a horizontal cylinder the relationship between liquid height and volume is non-linear, so the card converts volume → height for the drawing:

| Volume | Liquid line height |
| --- | --- |
| 10% | ~15.6% |
| 25% | ~29.8% |
| 50% | 50.0% |
| 75% | ~70.2% |
| 90% | ~84.4% |

When the input is a **depth** reading the card already has the true liquid height, so it draws the line exactly and computes gallons/percentage from the geometry. Horizontal tanks use a cylinder + two-hemispherical-heads model, deriving the cylindrical length from the inside diameter and total capacity — which self-calibrates to your tank. Vertical tanks are treated linearly.

If your sensor reports liquid **height** as a percentage rather than volume, set `level_is_volume: false`.

### Standalone gallons / percentage (optional)

If you'd rather keep separate gallons and percentage entities, use the `compensation` integration with a multi-point table. A two-point table is linear and overstates the lower half of a tank — these points come from the cylinder + hemispherical-heads model of a 30″ × 92″, 250-gallon tank:

```yaml
sensor:
  - platform: compensation
    propane_tank_gallons:
      source: sensor.propane_tank_tank_level
      unit_of_measurement: gal
      precision: 1
      degree: 3
      data_points:
        - [0, 0.0]
        - [3, 11.5]
        - [6, 33.2]
        - [9, 60.9]
        - [12, 92.1]
        - [15, 125.0]
        - [18, 157.9]
        - [21, 189.1]
        - [24, 216.8]
        - [27, 238.5]
        - [30, 250.0]
    propane_tank_percentage:
      source: sensor.propane_tank_tank_level
      unit_of_measurement: '%'
      precision: 0
      degree: 3
      data_points:
        - [0, 0.0]
        - [3, 4.6]
        - [6, 13.3]
        - [9, 24.3]
        - [12, 36.8]
        - [15, 50.0]
        - [18, 63.2]
        - [21, 75.7]
        - [24, 86.7]
        - [27, 95.4]
        - [30, 100.0]
```

For a tank with different dimensions, regenerate the points with the same model (R = diameter/2; cylinder length L derived from capacity; volume(h) = L·segmentArea(h) + sphericalCapVolume(h)). Or skip these entirely and feed the raw depth sensor straight to the card.

## Troubleshooting

- **Liquid line looks wrong with a depth sensor.** Check `full_scale_inches` matches the inside diameter (horizontal) or inside height (vertical) at a full tank.
- **Console warning about an assumed unit.** The card couldn't read the sensor's `unit_of_measurement` and fell back to inches/gallons. Set `sensor_unit` to the correct unit to silence it.
- **Editor doesn't reflect a change.** Hard-refresh the browser so the updated resource loads.

## Report issues

[Open an issue](https://github.com/imonlinux/propane-tank-card/issues/) with your card YAML and the sensor's state and unit.

## License

MIT
