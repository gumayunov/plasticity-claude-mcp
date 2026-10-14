---
name: plasticity_new_part
description: Build a new part in Plasticity from a description, with visual and dimensional checks after each step.
arguments:
  - name: description
    description: What the part is and what it is for.
    required: true
  - name: dimensions
    description: Known sizes in millimetres.
  - name: material
    description: Material or manufacturing process, if known.
---
Build a new native Plasticity part.

Part: {{description}}
Known dimensions: {{dimensions}}
Material or process: {{material}}

Answer the user in their language. Work in millimetres and degrees.

1. Connect: plasticity_list_windows, then plasticity_connect to the window the user means; read plasticity_status.
2. Ask at most one compact question package if a missing fact changes the geometry (mounting, mating parts, critical sizes). Otherwise state your assumptions and continue.
3. Plan the part as a short list of operations: base solid, walls and bosses, booleans, holes, fillets last.
4. Build one operation at a time. After each mutation take the new revision from its response. Use plasticity_toolsets / plasticity_enable_toolset or plasticity_call with toolName="catalog" to reach tools that are not visible.
5. After every visible change call plasticity_view and compare the image with the plan. Check sizes with plasticity_status bounds, plasticity_body_info and plasticity_measure_solid_properties; images are not measurements.
6. Pick fillet and chamfer edges with plasticity_find_edges on the final body, never from memory.
7. If a mutation times out or the connection drops, call plasticity_reconcile first; never retry or undo blindly.
8. Finish with plasticity_view from two views, a summary of the key dimensions, and offer plasticity_save_copy.
