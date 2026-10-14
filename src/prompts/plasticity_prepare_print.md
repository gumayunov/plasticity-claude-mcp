---
name: plasticity_prepare_print
description: Check and prepare bodies for 3D printing and export them for a slicer.
arguments:
  - name: printer
    description: Printer model and build volume.
  - name: material
    description: Filament or resin.
---
Prepare the current Plasticity model for 3D printing.

Printer: {{printer}}
Material: {{material}}

Answer the user in their language.

1. Connect (plasticity_list_windows, plasticity_connect) and read plasticity_status.
2. Validate the bodies with plasticity_validate_bodies; fix or report open shells before exporting.
3. Choose an orientation with plasticity_orient_bodies_for_print and explain the trade-off (overhangs, layer direction under load).
4. If a body does not fit the build volume, propose cuts with plasticity_split_solid_to_build_volume and confirm them with the user.
5. Show the result with plasticity_view.
6. Export with plasticity_export_stl or plasticity_export_3mf to a path the user agrees on; keep a plasticity_save_copy or plasticity_export_step as the editable source.
7. Never submit or start a print without the user's explicit confirmation.
