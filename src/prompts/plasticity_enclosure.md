---
name: plasticity_enclosure
description: Design an enclosure around a board or device, with mounting bosses, connector cut-outs and a lid joint.
arguments:
  - name: board
    description: Board or device name and its size, hole positions and connectors.
    required: true
  - name: clearances
    description: Required clearances, wall thickness or outer size limits.
  - name: fasteners
    description: Screws or inserts to use.
---
Design an enclosure in Plasticity.

Board or device: {{board}}
Clearances and limits: {{clearances}}
Fasteners: {{fasteners}}

Answer the user in their language. Work in millimetres.

1. Connect (plasticity_list_windows, plasticity_connect) and read plasticity_status.
2. Confirm the board outline, mounting hole positions, tallest component and connector positions. Ask once if they are missing; do not guess connector positions.
3. Build the outer shell from a box (plasticity_create_box) and hollow it with plasticity_hollow_solids, or build walls explicitly. Keep wall thickness consistent.
4. Add mounting bosses with plasticity_create_screw_boss (or plasticity_create_heat_set_insert_pocket for inserts) at the board's hole positions.
5. Cut connector openings with plasticity_create_connector_opening.
6. Split or design the lid and join it with plasticity_create_mating_enclosure_joint.
7. After each step call plasticity_view; check fit with plasticity_measure_point_distance and plasticity_check_interference against the board volume.
8. Finish with views of the base and the lid, the key dimensions, and offer plasticity_save_copy.
