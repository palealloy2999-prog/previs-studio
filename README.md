# FRAME — Previs Studio

[English](README.md) | [日本語](README.ja.md)

Edit simple 3D previs scenes and export MP4 video in a web UI.
Scenes can be loaded and saved as JSON, and can also be built with an LLM using the included Skill.

[GitHub Pages version](https://palealloy2999-prog.github.io/tools/previsstudio/)

## Start

Use Node.js 22.12 or later (Node.js 24 recommended):

```powershell
npm install
npm run dev
```

Open the displayed `http://127.0.0.1:5173` URL in Chrome or Edge. After dependencies are installed, you can also double-click `start.cmd`.

```powershell
npm run build
npm run preview
```

The production build is written to `dist/` and must be served over HTTP. MP4 export requires a browser with WebCodecs and H.264 encoding support, running on localhost or HTTPS. Exported videos do not contain audio.

## Basic workflow

1. Add a mannequin, primitive, or GLB from Assets.
2. Select an object and set its position, rotation, and scale with the gizmo or Inspector. Numeric edits commit on Enter or blur.
3. Move to another time and transform the object. A keyframe is recorded at the current time; the keyframe button stores the current pose explicitly.
4. Add cameras and edit their position, target, and field of view. Rotating the camera gizmo updates its target.
5. Move to a cut time and add a camera to create a hard cut at that point.
6. Preview the production camera, then export MP4 and save the editable scene as JSON.

JSON rotations use degrees. The coordinate system is Y-up, and the mannequin faces +Z. The initial page shows a sample scene; New creates an empty scene with one camera. The editor also autosaves to browser localStorage. Save JSON before replacing a scene with New or Open.

## Controls

| Action | Control |
| --- | --- |
| Orbit editor camera | Left-drag |
| Pan editor camera | Right-drag |
| Zoom editor camera | Mouse wheel |
| Move LIVE preview | Drag its header; double-click to reset |
| Move / rotate gizmo | W / E |
| Switch move / rotate gizmo | Middle-click in the editor view |
| Focus selection | F |
| Play / pause | Space |
| Seek | Click or drag the timeline |
| Select a key | Click its timeline diamond |
| Delete the current key | Move to it and use the Inspector trash button |
| Delete an explicitly selected key | Select its diamond and press Delete |
| Multi-select | Shift+click in Scene, Timeline, or the editor view; objects and cameras are selected separately |
| Add a folder / group selection | Folder button beside Scene; two or more selected objects are grouped immediately |
| Move into or out of folders | Drop on a folder to add; drop on a root row or empty Scene space to remove; multi-selection moves together |
| Reorder Scene / Timeline | Drop an object or camera row on the upper or lower half of another compatible row |
| Collapse Assets | Plus / close button beside Assets |
| Create a named group | Select at least two objects and right-click the editor view |
| Copy / paste | Ctrl+C / Ctrl+V |
| Delete selected items | Delete while no key is explicitly selected |
| Undo | Ctrl+Z |
| Redo | Ctrl+Y or Ctrl+Shift+Z |

Undo and redo retain the latest 100 operations. Object edits, keys, visibility ranges, cameras, scene settings, New, and Open participate in history. Gizmo drags, visibility drags, and name edits are grouped into single operations. Playback and seeking are excluded, and history resets when the page reloads. Text inputs keep their normal editing shortcuts. Every object, camera, and group retains at least one keyframe as its base pose.

Multiple objects or multiple cameras can be selected together; object and camera selections cannot be mixed, and selecting a group makes it the sole selection. The first selected item is the primary selection. Moving or rotating it applies the same delta to the other selected items, preserving their existing offsets and angles. Scene and Timeline show the primary selection with a left accent and additional selections in blue; the editor view outlines additional objects.

## Groups and ordering

Use the folder button beside the Scene heading to group two or more selected objects around their shared center. With fewer than two objects selected, it creates an empty group. When several objects are selected, dragging any selected member moves the entire selection into or out of folders. You can also right-click the editor view to name a new group. A group has its own parent transform track; member animation remains in group-local coordinates. Moving or rotating the group adds a parent key and keeps the assembled shape rigid between keys. Expand the group in Timeline to edit member tracks. Deleting or ungrouping a folder bakes its animated world motion into the members and leaves them in the scene.

Drag object or camera rows in Scene or Timeline to reorder them. Dropping above or below a compatible row controls insertion order, and both panels stay synchronized. Folder rows themselves keep their order. Drop an object on a folder row to add it to that folder. Use the button beside the Assets heading to collapse the asset browser and give Scene more room.

## Animation and visibility

Keyframe interpolation is applied from each key to the next. Poses are held before the first and after the last key. Object rotation uses Euler-angle interpolation, so turns greater than 360 degrees are supported. Group parent rotation uses quaternion slerp to keep grouped shapes rigid. Keys outside a shortened scene duration are preserved.

Drag the ends of an object's timeline strip to set its visible start and end. A tooltip shows the exact time while dragging, and a focused handle moves one frame with Left/Right Arrow. A `2–5` second range is visible at `2 <= time < 5` in the editor, camera preview, and MP4. Hidden objects keep their animation keys and remain selectable from Scene.

### Motion paths

Select an object or group on a segment between two keys, then choose **Bezier path**, **Arc**, or **Barrel roll** under Motion Path in the Inspector. The selected start key stores two editable Bezier control points, optional path-direction following, and a roll angle. Select either colored handle in the editor view and move it with the transform gizmo, or enter exact XYZ values. The timeline shows the resulting motion as one clip and the editor evaluates it at runtime without adding intermediate keys. Use a group path for an aircraft assembled from multiple objects so the complete shape follows and rolls around one parent axis.

## Scale

The Inspector provides independent X, Y, and Z scale plus a uniform multiplier. If XYZ is `2, 1, 0.5` and uniform scale is `1.5`, the displayed scale is `3, 1.5, 0.75`. Changes update the viewport immediately and are saved in JSON.

## External models

Place `.glb` files anywhere under `assets/models/`. Vite scans the directory recursively and adds them to Assets without a hand-written manifest. Restart the development server if a change is not detected; rebuild after adding models to a production build.

JSON stores only safe relative GLB paths, so the same files must exist on another computer. Missing models appear as wireframes and block video export. GLB materials remain independent per object and can be tinted. Embedded glTF animation, Draco, and KTX2 decoding are not included.

## Camera cuts and field of view

Each camera has its own animated position, target, FOV, and active range. Drag the camera strip ends in the timeline to change its range; the drag tooltip shows the exact time. Range boundaries create frame-accurate hard cuts. When ranges overlap, the camera with the earlier start time wins; equal starts use Scene order. Times with no assigned camera render black in both preview and MP4. Legacy JSON containing one `camera` is loaded as a full-duration Camera 01 track.

FOV is stored in camera keyframes. For example, 75° at 0 seconds and 25° at 3 seconds creates an interpolated zoom. The Camera Lens slider covers 5–120°, exact numeric input accepts 5–150°, and the Inspector provides 75°, 50°, and 25° presets.

## Aspect ratio and output size

Choose 1:1, 3:4, 5:8, 9:16, 9:21, 4:3, 3:2, 16:9, or 21:9 and a target size from 0.2 to 1.0 MP. The editor computes even pixel dimensions for H.264 and applies them to LIVE preview and MP4 export.

MP4 output uses Mediabunny, CanvasSource, and WebCodecs. The default frame rate is 24 fps, with 17 and 30 fps available from the FPS menu. It renders at exact `frame / fps` times and excludes the editor grid, camera helpers, selection outlines, and gizmos. Export shows progress and can be canceled. New scenes default to 10 seconds, 16:9, 0.8 MP, and 24 fps.

## LLM scene generation

The repository includes the [`frame-previs-scene-builder`](skills/frame-previs-scene-builder/SKILL.md) Skill for creating importable version 1 scene JSON from shot descriptions. You can also [view the Skill on GitHub](https://github.com/palealloy2999-prog/previs-studio/tree/main/skills/frame-previs-scene-builder). Its references contain the complete field contract, semantic rules, an example, and a JSON Schema. Install or copy the Skill into an LLM agent environment that supports `SKILL.md`, then ask it to build a FRAME scene.

## Validation

```powershell
npm test
npm run build
npm run test:e2e
```

E2E tests use installed Microsoft Edge and `ffprobe` / `ffmpeg` on PATH. They start the development server and create and remove a temporary GLB fixture.

## Main files

- `src/model.ts`: scene JSON parsing, validation, key and motion-path interpolation, and camera priority
- `src/engine.ts`: Three.js viewport, GLB loading, gizmos, motion-path handles, cameras, and MP4 export
- `src/App.tsx`: editor UI, playback, timeline, and persistence
- `src/locales/`: English and Japanese interface text
- `src/SceneTree.tsx`: scene list, group folders, and drag-and-drop ordering
- `skills/frame-previs-scene-builder/`: LLM instructions and scene JSON schema
- `vite.config.ts`: automatic GLB discovery and production bundling

Primary implementation references: [Three.js TransformControls](https://threejs.org/docs/pages/TransformControls.html) and [Mediabunny](https://mediabunny.dev/guide/quick-start).
