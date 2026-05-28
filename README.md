# Propane Tank Card

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card that turns a propane level sensor into a **realistic cross-section of the tank** with a **volume-accurate liquid level** and a percentage overlay.

- Realistic tank artwork drawn as scalable SVG — horizontal ASME tanks (with saddle legs, valve hood, weld seams) and vertical cylinders (domed top, protective collar, foot ring).
- **Volume-accurate fill.** For horizontal tanks the liquid line is placed using the circular-segment formula, so a tank reading 25% shows the liquid sitting at ~30% of the height (the middle of a horizontal cylinder holds the most), not naively at the quarter line. 50% is exactly halfway, as it should be.
- Selectable **size and orientation** (250 gal horizontal, 5/20 lb vertical, 500/1000 gal, and more) plus a Custom option.
- Optional **gallons remaining** readout and a **low-level warning** color.
- Full **visual (GUI) editor** — no YAML required.

## Installation

### Via HACS (recommended)

1. In HACS, open the three-dot menu → **Custom repositories**.
2. Add `https://github.com/imonlinux/propane-tank-card` with category **Dashboard**.
3. Find **Propane Tank Card** in HACS and click **Download**.
4. HACS adds the dashboard resource automatically. (If you run YAML-mode dashboards, add the resource manually — see below.)
5. Hard-refresh your browser (Ctrl/Cmd+Shift+R).

### Manual

1. Copy `dist/propane-tank-card.js` to `/config/www/propane-tank-card.js`.
2. Add the resource (Settings → Dashboards → ⋮ → Resources → Add):
   - URL: `/local/propane-tank-card.js`
   - Type: **JavaScript Module**

HACS-installed resource URL (for reference): `/hacsfiles/propane-tank-card/propane-tank-card.js`.

## Usage

Add a card, search for **Propane Tank Card**, and use the visual editor — or use YAML:

```yaml
type: custom:propane-tank-card
entity: sensor.propane_tank_level
name: Main Tank
tank_preset: 250gal_horizontal
show_percentage: true
show_gallons: true
```

A small portable tank:

```yaml
type: custom:propane-tank-card
entity: sensor.bbq_tank
name: BBQ
tank_preset: 20lb_vertical
fill_color: "#e2902f"
low_threshold: 25
```

A sensor that reports gallons instead of percent:

```yaml
type: custom:propane-tank-card
entity: sensor.tank_gallons
tank_preset: 500gal_horizontal
value_type: gallons
max_capacity: 500
show_gallons: true
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | **required** | Your propane level sensor (`sensor`, `number`, or `input_number`). |
| `name` | string | sensor name | Title shown on the card. |
| `tank_preset` | string | `250gal_horizontal` | Sets orientation, aspect ratio, and capacity. See list below. |
| `orientation` | string | from preset | `horizontal` or `vertical` — overrides the preset. |
| `aspect_ratio` | number | from preset | Length/diameter (horizontal) or height/diameter (vertical). Overrides the preset. |
| `value_type` | string | `percentage` | `percentage` if the sensor reads 0–100, or `gallons` if it reads a volume. |
| `max_capacity` | number | from preset | Tank capacity in gallons, used for the gallons readout (and to convert when `value_type: gallons`). |
| `level_is_volume` | bool | `true` | Treat the reading as a **volume** percentage and place the liquid line accurately. Set `false` if your sensor already reports liquid **height**. |
| `show_percentage` | bool | `true` | Show the big percentage overlay. |
| `show_gallons` | bool | `false` | Show "≈ N gal" beneath the percentage. |
| `low_threshold` | number | `20` | At/below this percent the number turns the warning color. |
| `fill_color` | string | `#2f9bdb` | Liquid color (hex). |
| `tank_color` | string | `#e7e9ec` | Tank body color (hex). |
| `warning_color` | string | `#e8623d` | Color used for the low-level percentage. |

### Built-in presets

`20lb_vertical`, `30lb_vertical`, `40lb_vertical`, `100lb_vertical`,
`120gal_vertical`, `250gal_vertical`, `500gal_vertical`,
`120gal_horizontal`, `250gal_horizontal`, `330gal_horizontal`,
`500gal_horizontal`, `1000gal_horizontal`, `custom`.

## A note on accuracy

Standard propane gauges report **percentage of capacity (volume)**. For a horizontal cylinder the relationship between liquid height and volume is non-linear, so this card converts volume → height for the visual:

| Volume | Liquid line height |
| --- | --- |
| 10% | ~15.6% |
| 25% | ~29.8% |
| 50% | 50.0% |
| 75% | ~70.2% |
| 90% | ~84.4% |

The conversion models the tank as a horizontal cylinder (the standard approximation; the hemispherical end caps are not separately modeled). Vertical tanks are treated linearly. If your sensor already reports liquid height rather than volume, set `level_is_volume: false`.

## License

MIT
