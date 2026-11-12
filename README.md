# hass-house-control

Bring **[House Control](https://github.com/0xProbabillity/house-control)**'s live 3D floor plan into Home Assistant as a Lovelace card: your rooms, walls and furniture in 3D, with every lamp and AC in the model wired to a real Home Assistant entity.

![3D floor plan in a Home Assistant panel view](docs/screenshots/showcase-desktop.jpg)

> [!NOTE]
> **This is a fork** of [wzpan/hass-house-control](https://github.com/wzpan/hass-house-control). Branch
> [`ha-devices`](../../tree/ha-devices) builds the 3D app from the
> [ha-devices fork of House Control](https://github.com/Silverviql/house-control/tree/ha-devices) and adds
> appliances, underfloor heating, room climate and the weather outside, and a Russian interface. See
> [What this fork adds](#what-this-fork-adds).

> **Credit:** the 3D stage, the `plan.json` format and the Mac App / web editor are all **[House Control](https://github.com/0xProbabillity/house-control)** by **[0xProbability](https://github.com/0xProbabillity)** (MIT, © 2026). This repository only contains the thin Home Assistant card that runs that app inside a Lovelace view. Please star the upstream project — that's where the real work happens.

## Features

- **3D model of your home** as a Lovelace panel view — rooms, walls, doors/windows and furniture.
- **Tap a lamp or AC in the model to control the real entity.** Every fixture in the plan is bound to an entity: toggle it in HA and the model follows; tap the model and `light.turn_on` / `climate.set_temperature` goes out.
- **Device panel grouped by room** with brightness / colour temperature for lights and mode, fan and swing for ACs.
- **Import / export the floor plan** from the card: a read-only preview (device control paused), admin-only save into the current card via `lovelace/config/save`, with an automatic backup download of the previous plan.
- **Three rendering tiers with automatic step-down** — every lamp is a real three.js light, so the card watches frame times and drops quality before it gets janky.

![Toolbar expanded: import / export / save](docs/screenshots/showcase-editor.jpg)

## What this fork adds

**Devices.** Besides lamps and wall ACs, a plan can hold:

| In the plan | Home Assistant entity | What a tap sends |
| --- | --- | --- |
| `downlights` — several recessed spots on one switch | `light.*`, `switch.*` | `turn_on` / `turn_off` |
| `strip` with `paths` — a light line that turns corners | `light.*`, `switch.*` | `turn_on` / `turn_off` |
| `towelRail`, `fan` (extractor), `kettle` | `switch.*`, `input_boolean.*`, `fan.*` | `turn_on` / `turn_off` |
| `blind` — roller blind | `cover.*` | `open_cover` / `close_cover`, `set_cover_position` when dragged |
| `vacuum` — robot vacuum | `vacuum.*` | `start` / `return_to_base` |
| AC with `"type": "floor"` — underfloor heating | `climate.*` | `set_hvac_mode`, `set_temperature` |

- **Appliances are kept apart from lighting.** The panel's buttons are called **Light on / Light off** and never
  start a kettle, open a blind or switch heating; neither does a scene's `"*"`. Only a scene that names an appliance
  changes it.
- **Lamps behind a shared wall switch** (`power`): when the switch is off they are dark and get no commands; a tap
  on one switches the wall switch on first, then the lamp a few seconds later.
- **A thermostat that has reached its target** (`hvac_action: idle`) is shown as idle.
- **Numbered fan speeds** (`fan_modes: ["1", "2", "3", "4"]`) are offered as low, medium, high and turbo.

**Climate.** `sensors` in the plan names each room's temperature and humidity sensors, `outdoor` a `weather.*`
entity (and optionally sensors of your own). The card shows them as chips over the rooms in 3D, next to the room
headings and in a line under the home's name: outside temperature, humidity, sky and pressure in mmHg. Rooms above
65 % or below 30 % humidity are highlighted. A device's `sensor` (the water in a kettle) is shown on its tile.

**Day and night.** With `"sun": "sun.sun"` in `outdoor`, the model is lit by daylight while the sun is up and
by the moon at night.

**Rooms of several rectangles.** A rectangle with `"part": "<room id>"` belongs to that room: one name, one tab.

**Interface.** The card and the 3D app are in Russian, and the scene buttons are shown (upstream hides them).
The room last looked at and the climate chips' on/off are remembered per dashboard in the browser (the card keeps
them for the sandboxed 3D app). A card taller than it is wide (a tablet held upright) puts the model above the
controls instead of beside them.

**Plan editor.** The tools bar (the sliders button beside the home's name) has an **Редактор** button for
administrators. It opens House Control's own editor over the card: a top-down plan to drag rooms, furniture, lamps,
doors and windows on, an inspector, a 3D preview, undo and redo, and pickers that link a lamp or an AC to an entity
of this Home Assistant. The editor never writes to the dashboard itself: **Save & apply** hands the plan back to the
card as a read-only preview, and the card's own save (registry check, confirmation, backup download) stores it.
It knows this fork's shapes: a group of spots is dragged as one and each spot by its own dot, a light line has a
dot on every corner (and buttons to add corners and separate runs), and the inspector covers appliances, underfloor
heating, lamps behind a shared switch, pieces of a room, each room's climate sensors and the weather, sun and
pressure outside. The editor is still in English.

**Wall tablet.** With [kiosk-mode](https://github.com/NemesisRE/kiosk-mode) installed, open the dashboard with
`?kiosk` (for example `/dom-3d/home?kiosk`) to hide Home Assistant's header and sidebar. Add `&cache` to keep it
on that device across reloads, and open `?clear_km_cache` to undo that.

The new plan fields are described in the House Control fork's
[docs/floor-plan.md](https://github.com/Silverviql/house-control/blob/ha-devices/docs/floor-plan.md). Every entity
they name is checked against the entity registry like any other binding, so `platform` applies to them too.

## Install

Two files, no build step:

| File | What it is |
| --- | --- |
| `house-control-card.js` | the custom Lovelace card |
| `embed.html` | the self-contained 3D app (bundle, styles and the HA shim inlined) |

1. Copy both into `<config>/www/house-control/`.
2. **Settings → Dashboards → Resources → Add resource**: `/local/house-control/house-control-card.js`, type **JavaScript module**.
3. Add the card to a **panel view**:

```yaml
type: custom:house-control-card
height: 900
plan: { ... }   # your plan.json contents (see examples/demo-plan.json)
```

> Home Assistant caches `/local` for ~31 days. After updating the files, bump the resource URL to
> `/local/house-control/house-control-card.js?v=2`, otherwise you keep loading the old version. The card loads
> `embed.html` relative to its own URL without the `?v=`, so bump that too with `app_url:
> /local/house-control/embed.html?v=2`.

Want to try it before wiring your own home? Paste [`examples/demo-plan.json`](examples/demo-plan.json) into the `plan:` field — it renders the "Demo Apartment" used in the screenshots, with entities like `light.living_room_ceiling` that you can point at your own lights.

## Card options

```yaml
type: custom:house-control-card
height: 900                # card height in px (ignored in a panel view, which fills the window)
plan: { ... }              # required: the floor plan (House Control's plan.json)
quality: high              # optional: high | medium | low  (omit = pick from the device and auto step-down)
platform: "*"              # optional: require plan entities to come from one integration.
                           # default "xiaomi_home"; set another id, or "*" to accept any integration
ac_rule: true              # optional: only the Away scene may switch ACs off (default true)
away_scene: away           # optional: the id of that "Away" scene (default "away")
app_url: /local/house-control/embed.html   # optional: serve the app from somewhere else
dashboard_path: null       # optional: which dashboard to save an imported plan into
                           # (null = /lovelace; set an url_path for a named storage dashboard)
```

## How it is put together (and why it is safe to embed)

- The card is a **thin shell**. The 3D app runs in an **iframe with `sandbox="allow-scripts"` only** — no `allow-same-origin`, so it gets an opaque origin: no cookies, no `localStorage`, no reach into the Home Assistant frontend.
- The **floor plan travels in the URL fragment** (`#...`), which browsers never send to any server. `embed.html` never leaves your HA instance.
- **Credentials stay outside the sandbox.** The parent card owns `hass`; every device action goes through `hass.callService()` from the parent frame.
- The **plan lives in the card config** (`plan:`), i.e. in your dashboard storage — versioned and backed up with the rest of your configuration.
- Imports are validated before they are applied: JSON shape, size (≤ 1 MB), unique ids, no prototype-polluting keys, entity ids must exist in your registry and must not be disabled.

![Import shows a read-only preview; device control is paused](docs/screenshots/showcase-import.jpg)

## Performance

Each lamp becomes a real three.js light that is evaluated per fragment, so cost is driven by pixels shaded, MSAA samples and shadow-casting lamps. The card ships three tiers and drops one step when the median frame time stays slow, never upgrading back so a borderline device settles:

| tier | MSAA | lamp shadows | max pixel ratio |
| --- | --- | --- | --- |
| high | 2 (off on very dense displays) | 3 | 2 |
| medium | 0 | 2 | 1.5 |
| low | 0 | 1 | 1 |

Pin a tier with `quality:` if you prefer a fixed look. Mobile browsers start one step down.

![Phone view](docs/screenshots/showcase-phone.jpg)

## The floor plan

A plan is one JSON document (`rooms`, `openings`, `furniture`, `lights`, `acs`, `scenes`) — see [`examples/demo-plan.json`](examples/demo-plan.json) for a complete small example. The easiest way to make one is the upstream project: **House Control** has a Mac App and a web studio for drawing the plan, and can even rebuild one from a robot-vacuum map.

A lamp or AC becomes controllable when it carries a Home Assistant binding:

```json
{ "id": "living.main", "name": "Ceiling Light", "room": "living", "type": "ceiling",
  "pos": [2.9, 6.0], "capabilities": ["brightness", "temp"],
  "link": { "service": "homeassistant", "id": "light.living_room_ceiling" } }
```

## Building from source

`src/` holds the card, the iframe shim and the embed stylesheet. `build.sh` bundles the upstream web app into the self-contained `embed.html` and copies the card next to it:

```bash
HC=/path/to/house-control ./build.sh    # expects ../house-control by default
```

For this fork, check out the `ha-devices` branch of both repositories side by side. The web app's build needs
Node.js 20.19 or 22.12 or newer:

```bash
git clone -b ha-devices https://github.com/Silverviql/house-control.git
git clone -b ha-devices https://github.com/Silverviql/hass-house-control.git
(cd house-control/web && npm install)
cd hass-house-control && ./build.sh
```

It runs `npm run build` inside the upstream `web/` directory, inlines the JS/CSS and the shim into one HTML file, and fails loudly if anything still references `./assets` (the sandbox has an opaque origin, so relative asset fetches would fail there).

### Preview stand

[`tools/preview.mjs`](tools/preview.mjs) renders the card in headless Chromium with a fake `hass` (every linked
entity on, sensors with sample values), saves a screenshot and prints the service calls the card made. It is how
the fork's changes were checked without touching a real home.

```bash
npm i --no-save playwright && npx playwright install chromium-headless-shell   # once, in the repo root
node tools/preview.mjs . my-plan.json shot.png on                    # on|off: state of lights and switches
CLICK="Кухня" node tools/preview.mjs . my-plan.json shot.png         # click a text in the 3D app first
TAP="Люстра" node tools/preview.mjs . my-plan.json shot.png off 900 560 # find a device by its tooltip and tap it
TOUCH=1 SUN=-10 node tools/preview.mjs . my-plan.json shot.png      # a phone's touch screen, at night
WHEEL="640,330,-240,8" node tools/preview.mjs . my-plan.json shot.png # zoom in at x,y
```

## Known limitations

- The interface is **Russian** in this fork (upstream: Chinese); there is no language switch. Room and device names come from your plan.
- Parts of the 3D app the card does not show (the plan editor, AI access) are still in English.
- The guard that checks which integration plan entities come from defaults to `xiaomi_home` (the setup this was built against); set `platform` to match yours.
- The card is tested against Home Assistant's modern storage dashboards; YAML-mode dashboards are untested.
- Lamps behind a shared switch get their "on" about 4 seconds after the switch, to let them boot; slower lamps may miss it.

## Credits

- **[House Control](https://github.com/0xProbabillity/house-control)** — by **[0xProbability](https://github.com/0xProbabillity)**, MIT © 2026. The 3D stage, `plan.json`, the editor and the Mac/web apps are theirs.
- **[hass-house-control](https://github.com/wzpan/hass-house-control)** — by **[wzpan](https://github.com/wzpan)**, MIT. The card this fork is built on.
- [three.js](https://threejs.org/) — the renderer behind the stage.
- Home Assistant frontend / WebSocket API — everything the card talks to.

## License

The card in `src/` is MIT licensed — see [LICENSE](LICENSE). `embed.html` bundles the upstream House Control web app; see [NOTICE](NOTICE.md).
