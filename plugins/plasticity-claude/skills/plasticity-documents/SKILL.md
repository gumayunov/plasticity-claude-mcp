---
name: plasticity-documents
description: Use when opening, inspecting or exporting an existing Plasticity document or assembly through the plasticity MCP server - large files, nested groups, hidden bodies, linked or mirrored instances, exporting many bodies to STL or STEP, saving, plasticity_open_document timeouts, "snapshot(): scratch active" errors, or Plasticity getting slow or using a lot of memory.
---

# Working with Plasticity documents

Session basics (connect, revisions, catalog) are in `plasticity-modeling`.

## Which document is open

- No MCP response contains the open file's path: `documentToken` is an id, and the window title shows at most the file name.
- Plasticity reopens the last document on start. To work on a known file, open it explicitly: `plasticity_open_document` with `path`, a new `backupPath` in a temporary directory (the current document, unsaved changes included, is written there first), `intent` and `revision`.
- A large file keeps loading for about a minute after the window looks ready. If the call times out, do not call it again: `plasticity_reconcile`, then check the body count. Retrying opens the file twice.

## Reading a large document

- Every `plasticity_status` page carries the whole group tree, instances and regions, so on an assembly it overflows the tool output: read the saved file with a script. Page bodies with `bodyOffset`/`bodyLimit` (up to 200) and `expectedRevision`.
- Body `type` is `Solid`, `Sheet` or `Wire`; only a Solid gives a closed mesh. `plasticity_list_bodies` returns full topology and is slow; use `plasticity_body_info` for the few bodies you need.
- Hierarchy, visibility and lock state: `plasticity_list_groups`. A body is visible only if it and every ancestor group are `visible` and not `hidden`.
- Linked instances (mirrored arms, repeated parts): `plasticity_list_instances`, with `sourceBodyIds`/target group and `matrixWorldMm` (4x4, column-major, millimetres).

## Exporting

- `plasticity_export_stl` / `plasticity_export_step` write all `ids` into one new file and never overwrite. For one file per body, call once per body. Export into a fresh directory and replace the destination once the whole set is checked.
- Instances are not bodies and are not exported. Export the source bodies and apply `matrixWorldMm` to the mesh yourself; with a negative determinant (a mirror) swap two vertices of every triangle so normals point outward. `plasticity_realize_instances` would turn them into bodies, but it edits the document: only with the user's consent.
- Check every STL: signed volume > 0 and the mesh inside the body's `boundsMm`, a loose box that is a few millimetres larger on curved bodies.

## Errors and the user's work

- `snapshot(): scratch active` means the user has an interactive command running in the window. Do not read or edit; tell the user and wait until a read succeeds. Never run a delete or other edit while they are in a command.
- Inspection and export are read-only. Save with `plasticity_save` (`expectedPath` = the file you opened) only when the user asks; otherwise `plasticity_save_copy` to a new file.

## Memory and slowness

- Measure with `footprint -p <pid>` for every pid from `pgrep -f 'Plasticity Helper \(Renderer\)'`. `ps` RSS misses compressed pages: it showed 1 GB at a real 11 GB.
- Plasticity's kernel binding never frees face/edge/vertex wrappers. The MCP caches each body version's topology, so the first full read of a large document costs about 0.5 GB, reopening it costs that again, and each edit adds little.
- If the footprint passes 6-8 GB, ask the user to save and restart Plasticity (`npm run start:plasticity` in the plasticity-mcp checkout), then reopen the document explicitly.
