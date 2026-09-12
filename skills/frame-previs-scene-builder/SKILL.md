---
name: frame-previs-scene-builder
description: Create or revise FRAME Previs Studio version 1 scene JSON from a shot description, including objects, animation, visibility, cameras, hard cuts, FOV, output format, and groups. Use when an LLM needs to produce a JSON file that this repository's WebGL previs editor can import.
---

# FRAME Previs Scene Builder

Build a complete, importable scene rather than explaining how the user could build one.

1. Read [references/scene-format.md](references/scene-format.md) before authoring or editing a scene.
2. Read [references/example-scene.json](references/example-scene.json) when a concrete structural example is useful.
3. Convert the requested action into a small set of intentional keyframes. Do not emit one key per frame.
4. Preserve existing IDs, object order, camera order, asset paths, and unrelated values when revising supplied JSON.
5. Validate the result against [references/scene.schema.json](references/scene.schema.json), then check the semantic rules that JSON Schema cannot express.
6. Return strict JSON with no comments or Markdown fences when the requested deliverable is an import file.

Choose stable, unique, descriptive IDs such as `actor-a`, `table-1`, and `camera-wide`. Use Y-up coordinates, degrees for object rotations, seconds for time, and +Z as the mannequin's forward direction.

Use half-open time ranges: an object or camera with `{ "start": 2, "end": 5 }` is active at 2 seconds and inactive at 5 seconds. Leave camera gaps deliberately when the user wants black frames. Where camera ranges overlap, the camera with the earliest range start wins; equal starts are resolved by camera array order.

Before returning JSON, confirm that:

- every object and camera has at least one keyframe;
- keyframe times are unique within each track;
- every group member names an existing object and belongs to at most one group;
- IDs are unique across objects, cameras, and groups;
- built-in asset names and output enum strings match the reference exactly;
- external assets use forward-slash relative `.glb` paths with no drive letter, leading slash, backslash, or `..` segment;
- `resolution` is consistent with `output` using the calculation in the reference.
