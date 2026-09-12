# FRAME scene JSON format

The application imports one UTF-8 JSON object with `version: 1`. Unknown properties are ignored during import and disappear on the next save, so omit them.

## Root object

| Field | Type and limits | Meaning |
| --- | --- | --- |
| `version` | literal `1` | File format version |
| `name` | string, up to 100 characters recommended | Scene title |
| `duration` | number, 0.1–600 | Scene duration in seconds |
| `fps` | integer: `17`, `24`, or `30` | Playback and export frame rate; default is 24 |
| `resolution` | object | Even `width` 16–3840 and even `height` 16–2160 |
| `output` | object | Canonical aspect-ratio and megapixel selections |
| `objects` | array, up to 500 | Ordered scene objects |
| `cameras` | array, up to 50 | Ordered production cameras |
| `groups` | array, up to 100 | Animated object parent groups |

All IDs and entity names must be non-empty strings no longer than 500 characters. IDs must be unique across objects, cameras, and groups.

## Output settings

`output.aspectRatio` must be exactly one of:

- `1:1 square`
- `3:4 portrait`
- `5:8 portrait`
- `9:16 portrait`
- `9:21 portrait`
- `4:3 landscape`
- `3:2 landscape`
- `16:9 landscape`
- `21:9 landscape`

`output.megapixels` must be the string `0.2`, `0.4`, `0.6`, `0.8`, or `1.0`.

Keep `resolution` consistent with `output`. Parse the leading ratio as `w:h`, calculate `scale = sqrt(Number(megapixels) * 1024 * 1024 / (w * h))`, then calculate each dimension as the nearest even integer to `ratioPart * scale`. The editor uses round-half-to-even when an exact `.5` tie occurs.

## Objects

Each object has:

```json
{
  "id": "actor-a",
  "name": "Actor A",
  "asset": "primitive:mannequin",
  "color": "#eaa36b",
  "scale": [1, 1, 1],
  "uniformScale": 1,
  "visibility": { "start": 0, "end": 8 },
  "keyframes": []
}
```

`asset` is one of the following exact built-in identifiers or a safe relative path under `assets/models/`:

- `primitive:mannequin`
- `primitive:box`
- `primitive:sphere`
- `primitive:cylinder`
- `primitive:triangle`
- `primitive:tetrahedron`

For an external file stored at `assets/models/props/chair.glb`, use `props/chair.glb`. Do not prefix it with `assets/models/`.

`color` is `#RRGGBB`. `scale` is an XYZ triple in which every value is greater than 0 and at most 1000. `uniformScale` is 0.001–1000. Effective display scale is `scale * uniformScale`. `visibility` is optional; omission means the full scene duration. A supplied range uses seconds from 0–600 and requires `end > start`.

An object keyframe contains `time`, `position`, `rotation`, and optional `easing`. Position and rotation are finite XYZ numbers from -1,000,000 through 1,000,000. Rotation is in degrees. Easing is `linear`, `ease-in`, `ease-out`, or `ease-in-out`, and defaults to `linear`. Easing belongs to the outgoing segment from that key. Poses hold before the first key and after the final key. An ungrouped object's transform is in world space. A grouped object's transform is local to its parent group.

## Cameras and cuts

Each camera has `id`, `name`, `color`, `range`, and `keyframes`. Color should be `#RRGGBB`. A camera keyframe contains `time`, `position`, `target`, `fov`, and optional `easing`. FOV is 5–150 degrees. Position, target, FOV, and easing interpolate between keys.

Camera `range` is half-open and requires `end > start`. At any time, the active camera is the covering camera whose `range.start` is smallest. If starts are equal, the first camera in the array wins. A time covered by no camera renders black. Use adjoining ranges for a hard cut, for example camera A `[0, 3)` and camera B `[3, 8)`.

## Groups

A group has `id`, `name`, `objectIds`, and `keyframes`. Group keys use the object-key shape and provide the shared parent position and rotation. Group rotation interpolates with quaternion slerp so members retain a rigid arrangement; member keys remain available for local animation. Every member ID must refer to an object; cameras cannot be grouped. An object may occur once in one group at most. Group array order and `objectIds` order control the scene-tree and timeline layout.

## Semantic validation checklist

JSON Schema cannot enforce all cross-field rules. Check these separately:

- Keyframe times within each object, camera, or group are unique to a tolerance of `0.00001` seconds.
- Object, camera, and group IDs do not collide.
- Group member IDs exist, are not duplicated, and are not assigned to another group.
- Ranges have `end > start`.
- `resolution` corresponds to the selected output ratio and megapixel value.
- Timeline intent fits the root duration. The parser permits key and range times through 600 seconds even when they exceed duration, but they will not play until duration is extended.
