---
name: plasticity-modeling
description: Use when building, editing, measuring or exporting a part in Plasticity CAD through the plasticity MCP server - boxes, cylinders, ribs, booleans, fillets, holes, brackets, enclosures.
---

# Modeling in Plasticity

Plasticity is driven over a loopback CDP connection. Units are millimetres and degrees.

## Session

1. `plasticity_list_windows`, then `plasticity_connect` to the window the user means. If Plasticity is not running, ask the user to start it with `npm run start:plasticity` in the plasticity-mcp checkout.
2. `plasticity_status` for the document, `revision`, bodies and Undo state. Every mutation needs the current `revision` string; take it from the latest response.
3. Only a few core tools are visible directly. For anything else call `plasticity_call` with `toolName: "catalog"` and a `query`, read the operation's input schema, then call `plasticity_call` with that exact `toolName` and `arguments`.

## Rules

- Serialize edits. Face, edge and body ids belong to one revision: re-read them after every edit (`plasticity_body_info`, `plasticity_changes_since`).
- If a mutation times out or the connection drops, run `plasticity_reconcile` first. Never retry or undo blindly.
- Verify results from native read-back: bounds from `plasticity_status`, exact geometry from `plasticity_body_info`, distances from the `plasticity_measure_*` operations. A screenshot is a visual check, not a measurement.
- There is no "new document" operation. Ask the user to create one, or `plasticity_open_document` an existing file. Keep work with `plasticity_save_copy`.

## Gotchas

- `plasticity_create_cylinder`: `centerMm` is the centre of the base circle, not of the cylinder; height runs along `axis`.
- `plasticity_create_rib` takes the extrusion direction from the profile normal, which follows the point winding. Check the bounds after the first rib; if it went the wrong way, undo and either reverse the point order or use `plasticity_extrude_profile` with a negative distance, then `plasticity_boolean` union.
- `plasticity_measure_solid_properties` takes `ids` (an array) and `revision`. Its `volumeCentroidMm` is currently the bounding-box centre, not the centre of mass (upstream issue Mesteriis/plasticity-mcp#1). Volume and area are correct. For a true centroid, export OBJ and integrate, or wait for the fix.
- Catalog and `plasticity_body_info` responses for detailed bodies can exceed the tool-output limit. Narrow the catalog `query`, use `limit`/`offset`, and request one body at a time.

## Typical part

Base solid → bosses and walls → booleans → holes → fillets last, on the edges you read back after the final boolean. Check bounds after every step, and screenshot with `plasticity_screenshot` at milestones.
