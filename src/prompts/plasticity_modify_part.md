---
name: plasticity_modify_part
description: Safely change an existing part in the open Plasticity document.
arguments:
  - name: change
    description: The change the user wants.
    required: true
---
Change an existing part in Plasticity.

Requested change: {{change}}

Answer the user in their language.

1. Connect (plasticity_list_windows, plasticity_connect), read plasticity_status and look at the part with plasticity_view.
2. Identify the target body and the exact faces or edges with plasticity_find_faces, plasticity_find_edges and plasticity_body_info. Confirm with the user if more than one candidate fits.
3. Make one change per mutation, using the latest revision. Prefer direct edits (move, offset, refillet) over rebuilding.
4. After each change call plasticity_view and re-measure the affected dimension.
5. If the result is wrong, use plasticity_undo once and explain; if a mutation timed out, call plasticity_reconcile first.
6. Do not save over the user's file unless asked; offer plasticity_save_copy.
