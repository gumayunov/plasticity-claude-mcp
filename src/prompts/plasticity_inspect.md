---
name: plasticity_inspect
description: Answer a question about the open model with measurements, without changing it.
arguments:
  - name: question
    description: What the user wants to know about the model.
    required: true
---
Answer a question about the open Plasticity model without changing it.

Question: {{question}}

Answer the user in their language.

1. Connect (plasticity_list_windows, plasticity_connect) and read plasticity_status.
2. Look at the model with plasticity_view to orient yourself.
3. Find the relevant geometry with plasticity_find_faces, plasticity_find_edges and plasticity_body_info.
4. Measure with plasticity_measure_point_distance, plasticity_measure_solid_properties, plasticity_measure_face_properties or plasticity_check_interference. Report numbers with units and say which references you measured between.
5. Do not call any tool that changes the document.
