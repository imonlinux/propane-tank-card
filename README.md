# Propane Tank Card

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card that turns a propane level sensor into a **realistic cross-section of the tank** with a **volume-accurate liquid level** and a percentage overlay.

- Realistic tank artwork drawn as scalable SVG — horizontal ASME tanks (with saddle legs, valve hood, weld seams) and vertical cylinders (domed top, protective collar, foot ring).
- **Volume-accurate fill.** For horizontal tanks the liquid line is placed using the circular-segment formula, so a tank reading 25% shows the liquid sitting at ~30% of the height (the middle of a horizontal cylinder holds the most), not naively at the quarter line. 50% is exactly halfway, as it should be.
- Selectable **size and orientation** (250 gal horizontal, 5/20 lb vertical, 500/1000 gal, and more) plus a Custom option.
- Optional **gallons remaining** readout and a **low-level warning** color.
- Full **visual (GUI) editor** — no YAML required.
  
<img width="491" height="266" alt="image" src="https://github.com/user-attachments/assets/cdaad639-9b50-45e5-9084-b6dd383098ce" />

<img width="1026" height="1075" alt="image" src="https://github.com/user-attachments/assets/825faaca-3f25-4e64-bbad-33b9878d54e1" />

## Installation

### Via HACS (recommended)

[![Open your Home Assistant instance and add this repository inside HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=imonlinux&repository=propane-tank-card&category=dashboard)

### Or

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

A raw depth sensor that reports **inches of liquid** above the probe (Mopeka, magnetostrictive, ultrasonic, etc.) — **no compensation sensors needed**. The card derives gallons and percentage from the tank geometry using a cylinder + hemispherical-heads model:

```yaml
type: custom:propane-tank-card
entity: sensor.propane_tank_tank_level
tank_preset: 250gal_horizontal
value_type: inches
full_scale_inches: 30   # depth reading at 100% full = inside diameter
max_capacity: 250
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
| `value_type` | string | `percentage` | `percentage` (0–100), `gallons` (volume), or `inches` (raw liquid depth above the sensor). |
| `full_scale_inches` | number | from preset | Used when `value_type: inches`. Depth reading at 100% full. For a horizontal tank this is the inside diameter; for a vertical tank, the inside height. |
| `max_capacity` | number | from preset | Tank capacity in gallons, used for the gallons readout (and to convert when `value_type` is `gallons` or `inches`). |
| `level_is_volume` | bool | `true` | Treat the reading as a **volume** percentage and place the liquid line accurately. Set `false` if your sensor already reports liquid **height**. |
| `show_percentage` | bool | `true` | Show the big percentage overlay. |
| `show_gallons` | bool | `false` | Show "≈ N gal" beneath the percentage. |
| `low_threshold` | number | `20` | At/below this percent the number turns the warning color. |
| `fill_color` | string | `#2f9bdb` | Liquid color — use the visual editor's color picker, or hex in YAML. |
| `tank_color` | string | `#e7e9ec` | Tank body color — use the visual editor's color picker, or hex in YAML. |
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

When you use **`value_type: inches`** the card has the actual liquid height, so it draws the liquid line exactly and computes gallons/percentage from the geometry. For horizontal tanks it uses a cylinder + two hemispherical heads model, deriving the cylindrical length from the inside diameter and total capacity — which self-calibrates to your specific tank. Vertical tanks are treated linearly.

If your sensor already reports liquid height as a percentage (not volume), set `level_is_volume: false`.

## A note on linear compensation sensors

If you prefer to keep standalone gallons/percentage entities (for the Energy dashboard, automations, etc.), use a multi-point table with a low-degree fit. The values below come from a cylinder + hemispherical-heads model of a 30″ × 92″, 250-gallon tank:

```yaml
sensor:
  - platform: compensation
    propane_tank_gallons:
      source: sensor.propane_tank_tank_level
      unit_of_measurement: gal
      precision: 0
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

For a tank with different dimensions, regenerate the points using the same model (R = diameter/2; cylinder length L derived from total capacity; volume(h) = L·segmentArea(h) + sphericalCapVolume(h)). Or skip the compensation sensors entirely and feed the raw inches sensor to this card with `value_type: inches`.

## Report Issues

Use this link to report issues with this card: [Issues](https://github.com/imonlinux/propane-tank-card/issues/)

## License

MIT
