---
name: plasticity-modeling
description: Use when building, editing, measuring or exporting a part in Plasticity CAD through the plasticity MCP server - boxes, cylinders, ribs, booleans, fillets, holes, brackets, enclosures.
---

# Modeling in Plasticity

Plasticity is driven over a loopback CDP connection. Units are millimetres and degrees.

## Session

1. `plasticity_list_windows`, then `plasticity_connect` to the window the user means. If Plasticity is not running, ask the user to start it with `npm run start:plasticity` in the plasticity-mcp checkout.
2. `plasticity_status` for the document, `revision`, bodies and Undo state. Every mutation needs the current `revision` string; take it from the latest response.
3. Only a few core tools are visible directly. For anything else call `plasticity_call` with `toolName: "catalog"` and a `query`. A broad query lists one-line summaries; query the exact operation name to get its input schema, then call `plasticity_call` with that `toolName` and `arguments`.

## Rules

- Serialize edits. Face, edge and body ids belong to one revision: re-read them after every edit (`plasticity_find_edges`, `plasticity_find_faces`, `plasticity_body_info`).
- A mutation answers with its `change` (added, removed and modified bodies with bounds) and the new `revision`, not the whole scene. Read unchanged bodies with `plasticity_status`.
- If a mutation times out or the connection drops, run `plasticity_reconcile` first. Never retry or undo blindly.
- Verify results from native read-back: bounds from `plasticity_status`, exact geometry from `plasticity_body_info`, distances from the `plasticity_measure_*` operations. A screenshot is a visual check, not a measurement.
- There is no "new document" operation. Ask the user to create one, or `plasticity_open_document` an existing file. Keep work with `plasticity_save_copy`.
- `plasticity_save` saves the open document over its own file, like Cmd+S, and needs that file as `expectedPath`. Save only when the user asked for it.

## Gotchas

- `plasticity_create_cylinder`: `centerMm` is the centre of the base circle, not of the cylinder; height runs along `axis`.
- `plasticity_create_rib` takes the extrusion direction from the profile normal, which follows the point winding. Check the bounds after the first rib; if it went the wrong way, undo and either reverse the point order or use `plasticity_extrude_profile` with a negative distance, then `plasticity_boolean` union.
- `plasticity_measure_solid_properties` takes `ids` (an array) and `revision`. Volume, area and `volumeCentroidMm` (the kernel's centre of volume) are exact.
- The area centroid from `plasticity_measure_face_properties` is currently the centre of the face's bounding box, not its area centroid. Area and boundary length are correct.
- `plasticity_revolve_profile` fails with `PK_ERROR_impossible_spin` when a profile edge lies on the axis. For a solid of revolution draw an open polyline (`closed: false`) that starts and ends on the axis, with the whole profile on one side of it.
- Prefer `plasticity_find_edges` / `plasticity_find_faces` with bounds or a centre to pick fillet and chamfer targets. `plasticity_body_info` pages faces, edges and vertices (`include`, `offset`, `limit`, `expectedRevision`); read only the collection you need.

## Typical part

Base solid → bosses and walls → booleans → holes → fillets last, on the edges you read back after the final boolean. Check bounds after every step, and screenshot with `plasticity_screenshot` at milestones.
