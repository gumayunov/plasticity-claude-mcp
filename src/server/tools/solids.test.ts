import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer as createPlasticityServer, type ServerOptions, type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import type { RuntimeState } from "../../plasticity/runtime.ts";
import { ConstructionHistoryStore } from "../../plasticity/construction-history.ts";
import { createServer, emptyState, parseToolJson, unavailableConstruction } from "../test-support.ts";

test("MCP initializes, lists tools, and validates tool input", async () => {
  const fake = {
    async windows() { return [{ id: "window-1", title: "Untitled - Plasticity", url: "file:///app_window/index.html" }]; },
    async connect() { return {}; },
    get() { throw new Error("not connected"); },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const instructions = client.getInstructions() ?? "";
  assert.match(instructions, /If the needed operation is missing from the client's visible tool list, call plasticity_call with toolName="catalog"/);
  assert.match(instructions, /photos and sketches, treat observations as references, not exact dimensions/i);
  assert.match(instructions, /Ask one compact, decision-relevant question package at a time/i);
  assert.match(instructions, /Keep strength checks proportional to risk/i);
  assert.match(instructions, /plasticity_measure_nonparallel_planar_polygon_clearance when both trimmed faces have simple straight-edged loops; concave outlines, holes, and multiple loops are supported/i);
  assert.match(instructions, /Workbench is optional; the user may inspect the model in Plasticity and continue in this chat/i);
  assert.match(instructions, /wait for the user's explicit confirmation before calling any print-submission tool/i);

  const tools = await client.listTools();
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_box"));
  const downloadImport = tools.tools.find((tool) => tool.name === "plasticity_download_and_import_step");
  assert.equal(downloadImport?.annotations?.openWorldHint, true);
  assert.equal(downloadImport?.annotations?.destructiveHint, true);
  const listReferenceAssets = tools.tools.find((tool) => tool.name === "plasticity_list_reference_assets");
  assert.equal(listReferenceAssets?.annotations?.openWorldHint, true);
  assert.equal(listReferenceAssets?.annotations?.destructiveHint, false);
  const listBodies = tools.tools.find((tool) => tool.name === "plasticity_list_bodies");
  assert.match(listBodies?.description ?? "", /cone faces.*basis radius.*axis origin\/direction.*semi-angle in radians/i);
  const nonparallelClearance = tools.tools.find((tool) => tool.name === "plasticity_measure_nonparallel_planar_polygon_clearance");
  assert.match(nonparallelClearance?.description ?? "", /Concave outlines, holes and multiple nested\/disjoint loops are supported.*512 boundary vertices and 4096 exact decomposition triangles/i);
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_cone"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_torus"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_two_point_circle"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_three_point_circle"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_slot_profiles"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_export_step"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_export_parasolid"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_import_parasolid"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_cad_reference_imports"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_get_cad_reference_import"));
  const downloadParasolid = tools.tools.find((tool) => tool.name === "plasticity_download_and_import_parasolid");
  assert.equal(downloadParasolid?.annotations?.openWorldHint, true);
  assert.equal(downloadParasolid?.annotations?.destructiveHint, true);
  const downloadReferenceMesh = tools.tools.find((tool) => tool.name === "plasticity_download_and_import_reference_mesh");
  assert.equal(downloadReferenceMesh?.annotations?.openWorldHint, true);
  assert.equal(downloadReferenceMesh?.annotations?.destructiveHint, true);
  assert.match(downloadReferenceMesh?.description ?? "", /not native B-rep/i);
  const downloadReference3mf = tools.tools.find((tool) => tool.name === "plasticity_download_and_import_reference_3mf");
  assert.equal(downloadReference3mf?.annotations?.openWorldHint, true);
  assert.equal(downloadReference3mf?.annotations?.destructiveHint, true);
  assert.match(downloadReference3mf?.description ?? "", /approximate reference mesh.*embedded 3MF unit/i);
  assert(tools.tools.some((tool) => tool.name === "plasticity_import_svg"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_import_reference_mesh"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_import_reference_3mf"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_export_stl"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_export_3mf"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_export_obj"));
  const nonDestructiveOutputs = [
    "plasticity_screenshot",
    "plasticity_save_copy",
    "plasticity_export_step",
    "plasticity_export_parasolid",
    "plasticity_export_stl",
    "plasticity_export_3mf",
    "plasticity_export_obj",
    "plasticity_export_svg",
    "plasticity_export_hiddenline_svg",
  ];
  for (const name of nonDestructiveOutputs) {
    const output = tools.tools.find((tool) => tool.name === name);
    assert.equal(output?.annotations?.readOnlyHint, false, `${name} writes a new artifact and is not read-only`);
    assert.equal(output?.annotations?.destructiveHint, false, `${name} refuses overwrites and must not be marked destructive`);
  }
  const save = tools.tools.find((tool) => tool.name === "plasticity_save");
  assert.equal(save?.annotations?.destructiveHint, true, "plasticity_save overwrites the open document's file");
  assert.match(save?.description ?? "", /plasticity_save_copy/u);
  const matchFaces = tools.tools.find((tool) => tool.name === "plasticity_match_faces");
  assert.equal(matchFaces?.annotations?.readOnlyHint, false);
  assert.equal(matchFaces?.annotations?.destructiveHint, true, "surface replacement edits native CAD and remains destructive");
  const exportSvg = tools.tools.find((tool) => tool.name === "plasticity_export_svg");
  assert.match(exportSvg?.description ?? "", /non-rational polynomial BCurves of integer degree 1 through 3/i);
  assert(tools.tools.some((tool) => tool.name === "plasticity_export_hiddenline_svg"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_changes_since"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_construction_history"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rectangular_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_radial_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_cut_with_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_split_solid_by_plane"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_split_solid_by_planes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_split_solid_to_build_volume"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_appearance_materials"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_set_appearance_material"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_set_block_dimensions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_set_radius_dimension"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_set_rectangle_dimensions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_point_distance"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_point_to_linear_edge"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_point_to_curved_edge"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_point_to_circular_edge"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_point_to_planar_face"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_planar_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_fastener_grip_stack"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_linear_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_analyze_edge_curvature"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_analyze_face_draft"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_face_properties"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_analyze_surface_continuity"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_measurements"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_vertex_distance_measurement"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_topology_distance_measurement"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_radius_measurement"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_delete_measurement"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_section_analyses"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_section_analysis"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_delete_section_analysis"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_instances"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_instance"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_duplicate_bodies"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_move_instances"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rotate_instances"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_scale_instances"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_orient_bodies_for_print"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_realize_instances"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_delete_instances"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_reference_meshes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_select_reference_meshes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_move_reference_meshes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rotate_reference_meshes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_scale_reference_meshes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_delete_reference_meshes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_groups"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_select_nodes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_select_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_select_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_select_curve_control_points"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_align_planar_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_align_cylindrical_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_align_vertices"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_align_linear_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_check_interference"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_measure_solid_properties"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_group"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_move_to_group"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rename_group"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_activate_group"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_dissolve_groups"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_set_visibility"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_set_locked"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_chamfer"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_remove_fillets"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_refillet_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_revolve_profile"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_thicken_sheets"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_hollow_solids"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_draft_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_move_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rotate_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_scale_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_thicken_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_offset_face_loops"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_patch_solid_edge_loops"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_move_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_offset_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_delete_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_offset_vertices"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rectangular_face_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_radial_face_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_regions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_extrude_regions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_offset_planar_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_offset_regions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_curve_fragments"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_trim_curve_fragments"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_curve_endpoints"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_curve_vertices"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_curve_directions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_evaluate_curve_segments"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_inspect_curve_structure"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_inspect_curve_planarity"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_curve_control_points"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_move_curve_control_points"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_slide_curve_control_points"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rotate_curve_control_points"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_scale_curve_control_points"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_delete_curve_control_points"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_curve_intersections"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_extend_curve_endpoints"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_convert_curve_vertices_to_control_points"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_fillet_curve_vertices"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_unjoin_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_join_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rebuild_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_raise_curve_degree"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_subdivide_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_insert_curve_knot"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_split_curve_segment"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_planarize_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_reverse_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_reverse_sheets"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_body_outlines"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_curve_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_project_curves_onto_body"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_body_intersection_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_project_curve_pair"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_insert_isoparam_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_inspect_surface_structure"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_raise_surface_degree"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_rebuild_face"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_match_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_untrim_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_imprint_curves_on_body"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_imprint_bodies"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_sweep_regions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_loft_regions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_loft_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_loft_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_patch_regions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_patch_closed_wires"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_join_sheets"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_bridge_surface"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_constrained_surface"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_extract_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_unwrap_face"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_analyze_cone_development"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_cone_development"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_deform_bodies_between_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_deform_curves_between_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_extract_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_unjoin_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_insert_sheet"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_unjoin_shells"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_solid_from_sheet"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_delete_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_dissolve_faces"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_patch_sheet_hole"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_cap_sheet_holes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_extend_sheet_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_validate_bodies"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_pipes"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_nurbs_curve"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_helix"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_center_arc"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_three_point_arc"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_tangent_arc"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_tangent_circle"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_bridge_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_bridge_curve_vertices"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_bridge_shell_edges"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_ellipse"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_regular_polygon"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_rectangle"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_text"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_duplicate_curves"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_curves_from_regions"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_counterbore"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_counterbore_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_through_hole"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_through_hole_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_blind_hole"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_blind_hole_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_countersink"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_countersink_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_hex_nut_pocket"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_hex_nut_pocket_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_printed_external_thread"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_cut_printed_internal_thread"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_printed_hex_nut"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_printed_hex_screw"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_printed_hex_pair"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_printed_thread_calibration_set"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_record_printed_thread_qualification"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_list_printed_thread_qualifications"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_match_printed_thread_qualification"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_slotted_hole"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_slotted_hole_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_heat_set_insert_pocket"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_heat_set_insert_pocket_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_screw_boss"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_screw_boss_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_resolve_fastener_designation"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_check_fastener_stack"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_inspect_fastener_group"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_check_fastener_group_layout"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_rib"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_round_vent_array"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_cantilever_snap_fit"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_hinge_barrel"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_cut_cable_channel"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_connector_opening"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_mating_enclosure_joint"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_locating_pin_pair"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_locating_pin_pair_pattern"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_split_screw_insert_joint"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_tongue_groove_joint"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_create_dovetail_joint"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_strength_methods"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_construction_history"));
  assert(tools.tools.some((tool) => tool.name === "plasticity_verify_member_strength"));
  for (const name of [
    "plasticity_define_datum_point",
    "plasticity_define_datum_axis",
    "plasticity_create_construction_plane",
    "plasticity_list_construction_geometry",
    "plasticity_set_workplane",
    "plasticity_remove_construction_plane",
    "plasticity_refresh_datum",
  ]) assert(tools.tools.some((tool) => tool.name === name), `missing tool ${name}`);
  const svgToolDescription = tools.tools.find((tool) => tool.name === "plasticity_export_svg")?.description ?? "";
  assert.match(svgToolDescription, /Degree-1 and degree-2 non-rational fixtures have live production stdio verification/i);
  assert.doesNotMatch(svgToolDescription, /still need live acceptance/i);

  const prompts = await client.listPrompts();
  assert(prompts.prompts.some((prompt) => prompt.name === "plasticity_model_from_reference"));
  assert(prompts.prompts.some((prompt) => prompt.name === "plasticity_strength_first"));
  const resources = await client.listResources();
  assert(resources.resources.some((resource) => resource.uri === "plasticity://strength/workflow"));
  const prompt = await client.getPrompt({
    name: "plasticity_model_from_reference",
    arguments: { referenceDescription: "dimensioned bracket sketch", defaultUnits: "mm" },
  });
  assert.match(JSON.stringify(prompt.messages), /Ask concise questions/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_strength_first/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_export_svg.*native Ellipse segments.*quarter-point checks/i);
  assert.match(JSON.stringify(prompt.messages), /Non-rational degree-1 and degree-2 fixtures now also have live production-stdio coverage.*accept:native-svg-polynomial-degrees/i);
  assert.match(JSON.stringify(prompt.messages), /plasticity_export_hiddenline_svg.*native hidden-line projector/i);
  assert.match(JSON.stringify(prompt.messages), /plasticity_analyze_design_reference/);
  assert.match(JSON.stringify(prompt.messages), /single next question package/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_design_reference_request/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_construction_history/);
  assert.match(JSON.stringify(prompt.messages), /durableSyncStatus/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_get_cad_reference_import/);
  assert.match(JSON.stringify(prompt.messages), /persistent provenance record/i);
  assert.match(JSON.stringify(prompt.messages), /direct asset URLs exposed by web-search\/open-page results/i);
  assert.match(JSON.stringify(prompt.messages), /do not invent or construct file URLs/i);
  assert.match(JSON.stringify(prompt.messages), /plasticity_download_and_import_parasolid/);
  assert.match(JSON.stringify(prompt.messages), /never infer it when the candidate omits it/);
  assert.match(JSON.stringify(prompt.messages), /sourcePageUrl/);
  assert.match(JSON.stringify(prompt.messages), /historical document\/revision/i);
  assert.match(JSON.stringify(prompt.messages), /never derive exact millimeters from an unscaled photo or sketch/i);
  assert.match(JSON.stringify(prompt.messages), /Use strength checks at the decision point where they help/);
  assert.match(JSON.stringify(prompt.messages), /Do not require physical coupon campaigns or detailed FEA before making a useful first model/);
  assert.match(JSON.stringify(prompt.messages), /before presenting a load-bearing design as ready to manufacture/);
  assert.match(JSON.stringify(prompt.messages), /one compact logical package at a time/);
  assert.match(JSON.stringify(prompt.messages), /Workbench is optional; keep the conversation in this chat/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_resolve_fastener_designation/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_check_fastener_stack/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_check_fastener_group_layout/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_fastener_grip_stack/);
  assert.match(JSON.stringify(prompt.messages), /Before any CAD split or joint mutation, explain why the DFM plan needs multiple parts/);
  assert.match(JSON.stringify(prompt.messages), /Never invent fit clearance/);
  assert.match(JSON.stringify(prompt.messages), /Geometric non-interference is not proof of assembly clearance/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_locating_pin_pair_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_split_screw_insert_joint/);
  assert.match(JSON.stringify(prompt.messages), /nextQuestionPackage/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_countersink/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_countersink_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_counterbore_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_through_hole/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_through_hole_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_blind_hole/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_blind_hole_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_heat_set_insert_pocket_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_screw_boss_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_hex_nut_pocket/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_hex_nut_pocket_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_printed_hex_pair/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_printed_thread_calibration_set/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_match_printed_thread_qualification/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_record_printed_thread_qualification/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_center_arc/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_two_point_circle/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_three_point_circle/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_three_point_arc/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_tangent_arc/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_tangent_circle/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_bridge_curves/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_bridge_curve_vertices/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_bridge_shell_edges/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_ellipse/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_regular_polygon/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_inspect_curve_structure/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_inspect_surface_structure/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_raise_surface_degree/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_rebuild_face/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_match_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_untrim_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_unwrap_face/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_analyze_cone_development/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_patch_closed_wires/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_deform_bodies_between_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_deform_curves_between_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_unjoin_shells/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_inspect_curve_planarity/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_rebuild_curves/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_raise_curve_degree/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_subdivide_curves/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_insert_curve_knot/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_evaluate_curve_segments/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_split_curve_segment/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_planarize_curves/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_select_curve_control_points/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_slide_curve_control_points/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_move_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_rotate_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_scale_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_thicken_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_offset_face_loops/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_patch_solid_edge_loops/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_move_edges/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_offset_edges/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_delete_edges/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_offset_vertices/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_rectangular_face_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_radial_face_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_convert_curve_vertices_to_control_points/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_fillet_curve_vertices/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_hollow_solids/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_body_outlines/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_curve_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_slotted_hole_pattern/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_bridge_surface/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_loft_curves/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_loft_faces/);
  assert.match(JSON.stringify(prompt.messages), /guideIds/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_set_block_dimensions/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_set_radius_dimension/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_set_rectangle_dimensions/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_point_distance/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_point_to_linear_edge/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_point_to_curved_edge only as an explicitly approximate sampled estimate/);
  assert.match(JSON.stringify(prompt.messages), /Wire segments identified by segmentEntityId/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_point_to_curved_edge/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_point_to_circular_edge/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_point_to_planar_face/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_planar_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_linear_edges/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_analyze_face_draft/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_vertex_distance_measurement/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_topology_distance_measurement/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_section_analysis/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_delete_section_analysis/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_instance/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_duplicate_bodies/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_realize_instances/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_group/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_activate_group/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_select_nodes/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_select_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_select_edges/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_align_planar_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_align_cylindrical_faces/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_align_vertices/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_align_linear_edges/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_check_interference/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_solid_properties/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_measure_face_properties/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_set_visibility/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_duplicate_curves/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_create_curves_from_regions/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_export_parasolid/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_import_parasolid/);
  assert.match(JSON.stringify(prompt.messages), /plasticity_import_reference_mesh/);
  assert.match(JSON.stringify(prompt.messages), /measurementSource=reference-mesh/);

  const fastener = await client.callTool({
    name: "plasticity_resolve_fastener_designation",
    arguments: { designation: "винт m5х10" },
  });
  assert.equal(fastener.isError, undefined);
  assert.match(JSON.stringify(fastener.content), /M5×0\.8×10/);
  assert.match(JSON.stringify(fastener.content), /joint-target/);
  const fastenerText = (fastener.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const fastenerResult = JSON.parse(fastenerText ?? "null") as { analysisIntent: string; nextQuestionPackage: { id: string; questions: unknown[] } };
  assert.equal(fastenerResult.analysisIntent, "both");
  assert.equal(fastenerResult.nextQuestionPackage.id, "strength-basis");
  assert.equal(fastenerResult.nextQuestionPackage.questions.length, 3);

  const printedPairArguments = {
    designation: "печатная пара M5x1.5x10",
    pitchMm: 1.25,
    threadDepthMm: 0.6,
    profileClearanceMm: 0.15,
    screwAxisStartMm: [0, 0, 0],
    nutEntryCenterMm: [15, 0, 0],
    axis: [0, 0, 1],
    flatNormalDirection: [1, 0, 0],
    screwHeadAcrossFlatsMm: 9,
    screwHeadHeightMm: 3,
    screwJunctionOverlapMm: 0.2,
    nutAcrossFlatsMm: 9,
    nutThicknessMm: 8,
    nutMinimumWallThicknessMm: 1.5,
    process: {
      printerId: "Creality K1C",
      materialId: "Generic PLA",
      slicingProfileId: "0.20mm Standard",
      nozzleDiameterMm: 0.4,
      layerHeightMm: 0.2,
      orientation: "both axes vertical",
      clearanceBasis: "qualified calibration specimen",
    },
    sizingBasis: "fit-calibration specimen only",
    revision: "r1",
  };
  const mismatchedPrintedPair = await client.callTool({
    name: "plasticity_create_printed_hex_pair",
    arguments: printedPairArguments,
  });
  assert.equal(mismatchedPrintedPair.isError, true);
  assert.match(JSON.stringify(mismatchedPrintedPair.content), /does not match.*profile pitch/i);
  const standardizedPrintedPair = await client.callTool({
    name: "plasticity_create_printed_hex_pair",
    arguments: { ...printedPairArguments, designation: "ISO 4017 M5x10" },
  });
  assert.equal(standardizedPrintedPair.isError, true);
  assert.match(JSON.stringify(standardizedPrintedPair.content), /must not name.*standard/i);
  const printedCalibrationArguments = {
    designation: "печатная калибровочная пара M5x10",
    pitchMm: 1.25,
    threadDepthMm: 0.6,
    screwAxisStartMm: [0, 0, 0],
    axis: [0, 0, 1],
    flatNormalDirection: [1, 0, 0],
    screwHeadAcrossFlatsMm: 9,
    screwHeadHeightMm: 3,
    screwJunctionOverlapMm: 0.2,
    nutAcrossFlatsMm: 9,
    nutThicknessMm: 8,
    nutMinimumWallThicknessMm: 1.5,
    samples: [
      { id: "tight", nutEntryCenterMm: [15, 0, 0], profileClearanceMm: 0.1 },
      { id: "normal", nutEntryCenterMm: [30, 0, 0], profileClearanceMm: 0.2 },
    ],
    process: {
      printerId: "Creality K1C",
      materialId: "Generic PLA",
      slicingProfileId: "0.20mm Standard",
      nozzleDiameterMm: 0.4,
      layerHeightMm: 0.2,
      orientation: "all thread axes vertical",
      clearanceBasis: "unqualified calibration ladder",
    },
    sizingBasis: "candidate clearances pending physical fit test",
    revision: "r1",
  };
  const duplicatePrintedCalibration = await client.callTool({
    name: "plasticity_create_printed_thread_calibration_set",
    arguments: {
      ...printedCalibrationArguments,
      samples: [
        printedCalibrationArguments.samples[0],
        { ...printedCalibrationArguments.samples[1], profileClearanceMm: 0.1 },
      ],
    },
  });
  assert.equal(duplicatePrintedCalibration.isError, true);
  assert.match(JSON.stringify(duplicatePrintedCalibration.content), /clearances must be unique/i);
  const standardizedPrintedCalibration = await client.callTool({
    name: "plasticity_create_printed_thread_calibration_set",
    arguments: { ...printedCalibrationArguments, designation: "ISO 4017 M5x10" },
  });
  assert.equal(standardizedPrintedCalibration.isError, true);
  assert.match(JSON.stringify(standardizedPrintedCalibration.content), /must not name.*standard/i);
  const boltedJoint = await client.callTool({
    name: "plasticity_resolve_fastener_designation",
    arguments: { designation: "регулируемое крепление на 4 болта M5x10 с гайками" },
  });
  assert.equal(boltedJoint.isError, undefined);
  const boltedJointText = (boltedJoint.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const boltedJointResult = JSON.parse(boltedJointText ?? "null") as {
    jointIntent: string;
    interpretation: { quantity: number; jointIntentSource: string; mountingIntent: string };
    workflow: { compatibleTools: string[] };
  };
  assert.equal(boltedJointResult.jointIntent, "through-bolt-with-nut");
  assert.equal(boltedJointResult.interpretation.jointIntentSource, "designation-phrase");
  assert.equal(boltedJointResult.interpretation.quantity, 4);
  assert.equal(boltedJointResult.interpretation.mountingIntent, "adjustable");
  assert.ok(boltedJointResult.workflow.compatibleTools.includes("plasticity_create_slotted_hole_pattern"));
  const printedMatingPart = await client.callTool({
    name: "plasticity_resolve_fastener_designation",
    arguments: { designation: "нужна печать винта M6x20 и ответной части", mountingIntent: "fixed", analysisIntent: "geometry" },
  });
  assert.equal(printedMatingPart.isError, undefined);
  const printedMatingPartText = (printedMatingPart.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const printedMatingPartResult = JSON.parse(printedMatingPartText ?? "null") as {
    jointIntent: string;
    thread: { system: string; nominalDiameterMm: number; pitchMm?: number };
    workflow: { compatibleTools: string[] };
  };
  assert.equal(printedMatingPartResult.jointIntent, "printed-threaded-pair");
  assert.equal(printedMatingPartResult.thread.system, "custom-rounded-print");
  assert.equal(printedMatingPartResult.thread.nominalDiameterMm, 6);
  assert.equal(printedMatingPartResult.thread.pitchMm, undefined);
  assert.ok(printedMatingPartResult.workflow.compatibleTools.includes("plasticity_create_printed_external_thread"));
  assert.ok(printedMatingPartResult.workflow.compatibleTools.includes("plasticity_cut_printed_internal_thread"));
  const standardizedFastener = await client.callTool({
    name: "plasticity_resolve_fastener_designation",
    arguments: {
      designation: "винт ISO 14581 M5x10 с гайкой",
      mountingIntent: "fixed",
      analysisIntent: "geometry",
    },
  });
  assert.equal(standardizedFastener.isError, undefined);
  const standardizedFastenerText = (standardizedFastener.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const standardizedFastenerResult = JSON.parse(standardizedFastenerText ?? "null") as {
    form: string;
    headStyle: string;
    driveStyle: string;
    standard: { sourceUrl: string };
    workflow: { compatibleTools: string[] };
  };
  assert.equal(standardizedFastenerResult.form, "countersunk-screw");
  assert.equal(standardizedFastenerResult.headStyle, "countersunk");
  assert.equal(standardizedFastenerResult.driveStyle, "hexalobular-socket");
  assert.equal(standardizedFastenerResult.standard.sourceUrl, "https://www.iso.org/standard/78695.html");
  assert.ok(standardizedFastenerResult.workflow.compatibleTools.includes("plasticity_create_countersink"));
  const setScrew = await client.callTool({
    name: "plasticity_resolve_fastener_designation",
    arguments: {
      designation: "установочный винт ISO 4029 M5x10 в резьбовое отверстие в металле",
      mountingIntent: "fixed",
      analysisIntent: "geometry",
    },
  });
  assert.equal(setScrew.isError, undefined);
  const setScrewText = (setScrew.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const setScrewResult = JSON.parse(setScrewText ?? "null") as {
    form: string;
    headStyle: string;
    driveStyle: string;
    pointStyle: string;
    workflow: { route: string; compatibleTools: string[] };
    issues: Array<{ code: string }>;
  };
  assert.equal(setScrewResult.form, "set-screw");
  assert.equal(setScrewResult.headStyle, "headless");
  assert.equal(setScrewResult.driveStyle, "hexagon-socket");
  assert.equal(setScrewResult.pointStyle, "cup");
  assert.equal(setScrewResult.workflow.route, "tapped-metal");
  assert.ok(setScrewResult.workflow.compatibleTools.includes("plasticity_create_blind_hole"));
  assert.ok(setScrewResult.issues.some((issue) => issue.code === "SET_SCREW_TENSION_LIMITATION"));
  const stack = await client.callTool({
    name: "plasticity_check_fastener_stack",
    arguments: {
      designation: "болт ISO 4017 M5x10 с гайкой",
      lengthMeasurement: "under-head",
      gripItems: [{ id: "plate", thicknessMm: 8 }],
      receiver: { kind: "nut", nutThicknessMm: 4, minimumProtrusionMm: 1.6 },
    },
  });
  assert.equal(stack.isError, undefined);
  const stackText = (stack.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const stackResult = JSON.parse(stackText ?? "null") as { status: string; minimumRequiredLengthMm: number; issues: Array<{ code: string }> };
  assert.equal(stackResult.status, "fail");
  assert.equal(stackResult.minimumRequiredLengthMm, 13.6);
  assert.deepEqual(stackResult.issues.map((issue) => issue.code), ["FASTENER_TOO_SHORT"]);
  const invalidFastener = await client.callTool({
    name: "plasticity_resolve_fastener_designation",
    arguments: { designation: "M5x10", holeDiameterMm: 5 },
  });
  assert.equal(invalidFastener.isError, true);
  const invalidFastenerGroup = await client.callTool({
    name: "plasticity_inspect_fastener_group",
    arguments: {
      bodyId: 7,
      cylindricalFaceIds: ["f1", "f1"],
      frame: { originMm: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0] },
      revision: "r1",
    },
  });
  assert.equal(invalidFastenerGroup.isError, true);
  const duplicatePinPattern = await client.callTool({
    name: "plasticity_create_locating_pin_pair_pattern",
    arguments: {
      maleTargetId: 7,
      femaleTargetId: 8,
      baseCentersMm: [[0, 0, 0], [0, 0, 0]],
      axis: [0, 0, 1],
      pinDiameterMm: 4,
      pinHeightMm: 6,
      radialClearanceMm: 0.2,
      axialClearanceMm: 0.2,
      revision: "r1",
      intent: "Reject duplicate test centers before any Plasticity mutation",
    },
  });
  assert.equal(duplicatePinPattern.isError, true);
  const malformedSplitScrew = await client.callTool({
    name: "plasticity_create_split_screw_insert_joint",
    arguments: {
      maleTargetId: 7,
      femaleTargetId: 8,
      screwEntryCentersMm: [[0, 0, 0]],
      insertEntryCentersMm: [[0, 0, 8], [0, 0, 8]],
      axis: [0, 0, 1],
      fastenerDesignation: "ISO 4762 M5x12",
      screwLengthMm: 12,
      minimumEngagementMm: 3,
      maximumEngagementMm: 5,
      insertPartNumber: "qualified-test-insert",
      insertThreadNominalDiameterMm: 5,
      insertThreadPitchMm: 0.8,
      insertSourceUrl: "https://manufacturer.example/qualified-test-insert",
      holeDiameterMm: 5.3,
      maleThroughDepthMm: 8,
      pilotDiameterMm: 3,
      pilotDepthMm: 8,
      insertDiameterMm: 4.6,
      insertDepthMm: 6,
      leadInDiameterMm: 5.4,
      leadInDepthMm: 1,
      femaleMaterialDepthMm: 10,
      revision: "r1",
      intent: "Reject a mismatched split screw pattern before Plasticity mutation",
    },
  });
  assert.equal(malformedSplitScrew.isError, true);
  const incompatibleInsertThread = await client.callTool({
    name: "plasticity_create_split_screw_insert_joint",
    arguments: {
      maleTargetId: 7,
      femaleTargetId: 8,
      screwEntryCentersMm: [[0, 0, 0]],
      insertEntryCentersMm: [[0, 0, 8]],
      axis: [0, 0, 1],
      fastenerDesignation: "ISO 4762 M5x12",
      screwLengthMm: 12,
      minimumEngagementMm: 3,
      maximumEngagementMm: 5,
      insertPartNumber: "M5x1.0-test-insert",
      insertThreadNominalDiameterMm: 5,
      insertThreadPitchMm: 1,
      insertSourceUrl: "https://manufacturer.example/m5x1-test-insert",
      holeDiameterMm: 5.3,
      maleThroughDepthMm: 8,
      pilotDiameterMm: 3,
      pilotDepthMm: 8,
      insertDiameterMm: 4.6,
      insertDepthMm: 6,
      leadInDiameterMm: 5.4,
      leadInDepthMm: 1,
      femaleMaterialDepthMm: 10,
      revision: "r1",
      intent: "Reject a thread-pitch mismatch before Plasticity mutation",
    },
  });
  assert.equal(incompatibleInsertThread.isError, true);
  assert.match(JSON.stringify(incompatibleInsertThread.content), /diameter and pitch must exactly match/i);

  const windows = await client.callTool({ name: "plasticity_list_windows", arguments: {} });
  assert.equal(windows.isError, undefined);
  assert.match(JSON.stringify(windows.content), /window-1/);

  const invalid = await client.callTool({
    name: "plasticity_create_box",
    arguments: { originMm: [0, 0, 0], sizeMm: [80, -40, 8] },
  });
  assert.equal(invalid.isError, true);
  const invalidSplitPlane = await client.callTool({
    name: "plasticity_split_solid_by_plane",
    arguments: { targetId: 1, originMm: [0, 0, 0], normal: [1, 0, 0], xDirection: [-2, 0, 0], intent: "Test invalid split frame", revision: "r1" },
  });
  assert.equal(invalidSplitPlane.isError, true);
  const invalidSplitPlanes = await client.callTool({
    name: "plasticity_split_solid_by_planes",
    arguments: { targetId: 1, planes: [], intent: "Test empty split plane list", revision: "r1" },
  });
  assert.equal(invalidSplitPlanes.isError, true);
  const invalidBuildVolume = await client.callTool({
    name: "plasticity_split_solid_to_build_volume",
    arguments: { targetId: 1, usableBuildVolumeMm: [20, 0, 20], intent: "Test invalid build volume", revision: "r1" },
  });
  assert.equal(invalidBuildVolume.isError, true);
  const invalidRegions = await client.callTool({
    name: "plasticity_extrude_regions",
    arguments: { regionIds: [], distanceMm: 8, revision: "r1" },
  });
  assert.equal(invalidRegions.isError, true);
  const invalidOffset = await client.callTool({
    name: "plasticity_offset_planar_curves",
    arguments: { ids: [7], distanceMm: 0, revision: "r1" },
  });
  assert.equal(invalidOffset.isError, true);
  const invalidRegionOffset = await client.callTool({
    name: "plasticity_offset_regions",
    arguments: { regionIds: ["12r34"], offsetsMm: [0], revision: "r1" },
  });
  assert.equal(invalidRegionOffset.isError, true);
  const invalidTrim = await client.callTool({
    name: "plasticity_trim_curve_fragments",
    arguments: { fragmentIds: [], revision: "r1" },
  });
  assert.equal(invalidTrim.isError, true);
  const invalidExtend = await client.callTool({
    name: "plasticity_extend_curve_endpoints",
    arguments: { endpointIds: ["10v42"], distanceMm: 0, revision: "r1" },
  });
  assert.equal(invalidExtend.isError, true);
  const invalidCurveFillet = await client.callTool({
    name: "plasticity_fillet_curve_vertices",
    arguments: { vertices: [{ bodyId: 7, vertexId: 42 }, { bodyId: 7, vertexId: 42 }], radiusMm: 3, revision: "r1" },
  });
  assert.equal(invalidCurveFillet.isError, true);
  const invalidCurveVertexConversion = await client.callTool({
    name: "plasticity_convert_curve_vertices_to_control_points",
    arguments: { vertices: [{ bodyId: 7, vertexId: 42 }, { bodyId: 7, vertexId: 42 }], revision: "r1" },
  });
  assert.equal(invalidCurveVertexConversion.isError, true);
  const invalidClosedHollow = await client.callTool({
    name: "plasticity_hollow_solids",
    arguments: { ids: [7, 7], wallThicknessMm: 2, direction: "inward", revision: "r1" },
  });
  assert.equal(invalidClosedHollow.isError, true);
  const invalidBodyOutlines = await client.callTool({
    name: "plasticity_create_body_outlines",
    arguments: { ids: [7, 7], plane: { id: "standard:top", sessionId: "session", documentToken: "doc", revision: "r1" }, placement: "workplane", revision: "r1" },
  });
  assert.equal(invalidBodyOutlines.isError, true);
  const invalidCurvePattern = await client.callTool({
    name: "plasticity_curve_pattern",
    arguments: { ids: [7], spineId: 9, count: 1, revision: "r1" },
  });
  assert.equal(invalidCurvePattern.isError, true);
  const invalidProjection = await client.callTool({
    name: "plasticity_project_curves_onto_body",
    arguments: { targetId: 7, curveIds: [11], direction: [0, 0, 0], revision: "r1" },
  });
  assert.equal(invalidProjection.isError, true);
  const invalidBodyIntersection = await client.callTool({
    name: "plasticity_create_body_intersection_curves",
    arguments: { targetId: 7, toolIds: [], revision: "r1" },
  });
  assert.equal(invalidBodyIntersection.isError, true);
  const invalidCurvePair = await client.callTool({
    name: "plasticity_project_curve_pair",
    arguments: { firstId: 11, firstDirection: [0, 0, 1], secondId: 12, secondDirection: [0, 1, 0], projectionDepthMm: 0, revision: "r1" },
  });
  assert.equal(invalidCurvePair.isError, true);
  const invalidIsoparam = await client.callTool({
    name: "plasticity_insert_isoparam_edges",
    arguments: { face: { bodyId: 7, faceId: "f1" }, direction: "world-x", count: 3, revision: "r1" },
  });
  assert.equal(invalidIsoparam.isError, true);
  const invalidImprint = await client.callTool({
    name: "plasticity_imprint_curves_on_body",
    arguments: { targetId: 7, curveIds: [11], direction: [0, 0, 0], revision: "r1" },
  });
  assert.equal(invalidImprint.isError, true);
  const invalidPatch = await client.callTool({
    name: "plasticity_patch_regions",
    arguments: { regionIds: [], revision: "r1" },
  });
  assert.equal(invalidPatch.isError, true);
  const invalidJoin = await client.callTool({
    name: "plasticity_join_sheets",
    arguments: { ids: [7], revision: "r1" },
  });
  assert.equal(invalidJoin.isError, true);
  const invalidSurface = await client.callTool({
    name: "plasticity_create_constrained_surface",
    arguments: { pointsMm: [[0, 0, 0]], normals: [[0, 0, 1]], revision: "r1" },
  });
  assert.equal(invalidSurface.isError, true);
  const invalidExtract = await client.callTool({
    name: "plasticity_extract_faces",
    arguments: { faces: [], revision: "r1" },
  });
  assert.equal(invalidExtract.isError, true);
  const invalidUnwrap = await client.callTool({
    name: "plasticity_unwrap_face",
    arguments: { face: { bodyId: 0, faceId: "f1" }, revision: "r1" },
  });
  assert.equal(invalidUnwrap.isError, true);
  const invalidEdgeExtract = await client.callTool({
    name: "plasticity_extract_edges",
    arguments: { edges: [], revision: "r1" },
  });
  assert.equal(invalidEdgeExtract.isError, true);
  const invalidSolidify = await client.callTool({
    name: "plasticity_create_solid_from_sheet",
    arguments: { id: 0, revision: "r1" },
  });
  assert.equal(invalidSolidify.isError, true);
  const invalidShellUnjoin = await client.callTool({
    name: "plasticity_unjoin_shells",
    arguments: { ids: [7, 7], revision: "r1" },
  });
  assert.equal(invalidShellUnjoin.isError, true);
  const invalidSheetInsert = await client.callTool({
    name: "plasticity_insert_sheet",
    arguments: { targetSheetId: 7, edgeIds: ["e1"], fillSheetId: 7, intent: "invalid same body", revision: "r1" },
  });
  assert.equal(invalidSheetInsert.isError, true);
  const invalidDeleteFaces = await client.callTool({
    name: "plasticity_delete_faces",
    arguments: { faces: [], revision: "r1" },
  });
  assert.equal(invalidDeleteFaces.isError, true);
  const invalidSheetPatch = await client.callTool({
    name: "plasticity_patch_sheet_hole",
    arguments: { id: 7, edgeIds: ["e1", "e2"], revision: "r1" },
  });
  assert.equal(invalidSheetPatch.isError, true);
  const invalidSheetCap = await client.callTool({
    name: "plasticity_cap_sheet_holes",
    arguments: { ids: [], revision: "r1" },
  });
  assert.equal(invalidSheetCap.isError, true);
  const invalidCounterbore = await client.callTool({
    name: "plasticity_create_counterbore",
    arguments: {
      targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1],
      throughDiameterMm: 8, counterboreDiameterMm: 6,
      counterboreDepthMm: 3, throughDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidCounterbore.isError, true);
  const invalidCountersink = await client.callTool({
    name: "plasticity_create_countersink",
    arguments: {
      targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1], radialDirection: [1, 0, 0],
      throughDiameterMm: 6, countersinkMajorDiameterMm: 6, includedAngleDeg: 90,
      throughDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidCountersink.isError, true);
  const invalidCountersinkPattern = await client.callTool({
    name: "plasticity_create_countersink_pattern",
    arguments: {
      targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1], radialDirection: [1, 0, 0],
      throughDiameterMm: 5.5, countersinkMajorDiameterMm: 10.4, includedAngleDeg: 90,
      throughDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidCountersinkPattern.isError, true);
  const invalidBlindHole = await client.callTool({
    name: "plasticity_create_blind_hole",
    arguments: {
      targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1],
      holeDiameterMm: 4.2, holeDepthMm: 8, materialDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidBlindHole.isError, true);
  const invalidBlindHolePattern = await client.callTool({
    name: "plasticity_create_blind_hole_pattern",
    arguments: {
      targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1],
      holeDiameterMm: 4.2, holeDepthMm: 8, materialDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidBlindHolePattern.isError, true);
  const invalidThroughHolePattern = await client.callTool({
    name: "plasticity_create_through_hole_pattern",
    arguments: {
      targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1],
      holeDiameterMm: 5.5, throughDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidThroughHolePattern.isError, true);
  const invalidCounterborePattern = await client.callTool({
    name: "plasticity_create_counterbore_pattern",
    arguments: {
      targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1],
      throughDiameterMm: 4, counterboreDiameterMm: 8, counterboreDepthMm: 3,
      throughDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidCounterborePattern.isError, true);
  const invalidHexNutPocket = await client.callTool({
    name: "plasticity_create_hex_nut_pocket",
    arguments: {
      targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1], flatNormalDirection: [0, 0, 1],
      acrossFlatsMm: 8, pocketDepthMm: 4, materialDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidHexNutPocket.isError, true);
  const invalidHexNutPocketPattern = await client.callTool({
    name: "plasticity_create_hex_nut_pocket_pattern",
    arguments: {
      targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1], flatNormalDirection: [1, 0, 0],
      acrossFlatsMm: 8, pocketDepthMm: 4, materialDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidHexNutPocketPattern.isError, true);
  const invalidSlottedHole = await client.callTool({
    name: "plasticity_create_slotted_hole",
    arguments: {
      targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1], slotDirection: [1, 0, 0],
      overallLengthMm: 6, widthMm: 6, throughDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidSlottedHole.isError, true);
  const invalidSlottedHolePattern = await client.callTool({
    name: "plasticity_create_slotted_hole_pattern",
    arguments: {
      targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1], slotDirection: [1, 0, 0],
      overallLengthMm: 20, widthMm: 6, throughDepthMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidSlottedHolePattern.isError, true);
  const invalidInsertPocket = await client.callTool({
    name: "plasticity_create_heat_set_insert_pocket",
    arguments: {
      targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1],
      pilotDiameterMm: 3, pilotDepthMm: 6,
      insertDiameterMm: 4.6, insertDepthMm: 6,
      leadInDiameterMm: 5.4, leadInDepthMm: 1, materialDepthMm: 12, revision: "r1",
    },
  });
  assert.equal(invalidInsertPocket.isError, true);
  const invalidInsertPocketPattern = await client.callTool({
    name: "plasticity_create_heat_set_insert_pocket_pattern",
    arguments: {
      targetId: 7, entryCentersMm: [[10, 10, 12], [10, 10, 12]], axis: [0, 0, -1],
      pilotDiameterMm: 3, pilotDepthMm: 8,
      insertDiameterMm: 4.6, insertDepthMm: 6,
      leadInDiameterMm: 5.4, leadInDepthMm: 1, materialDepthMm: 12, revision: "r1",
    },
  });
  assert.equal(invalidInsertPocketPattern.isError, true);
  const invalidScrewBoss = await client.callTool({
    name: "plasticity_create_screw_boss",
    arguments: {
      targetId: 7, baseCenterMm: [10, 10, 8], axis: [0, 0, 1],
      outerDiameterMm: 10, heightMm: 8,
      holeDiameterMm: 3, holeDepthMm: 9, revision: "r1",
    },
  });
  assert.equal(invalidScrewBoss.isError, true);
  const invalidScrewBossPattern = await client.callTool({
    name: "plasticity_create_screw_boss_pattern",
    arguments: {
      targetId: 7, baseCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, 1],
      outerDiameterMm: 10, heightMm: 8,
      holeDiameterMm: 3, holeDepthMm: 6, revision: "r1",
    },
  });
  assert.equal(invalidScrewBossPattern.isError, true);
  const invalidRib = await client.callTool({
    name: "plasticity_create_rib",
    arguments: {
      targetId: 7, profilePointsMm: [[0, 0, 0], [10, 0, 0], [0, 0, 10]],
      thicknessMm: 0, revision: "r1",
    },
  });
  assert.equal(invalidRib.isError, true);
  const invalidVentArray = await client.callTool({
    name: "plasticity_create_round_vent_array",
    arguments: {
      targetId: 7, firstCenterMm: [5, 5, 4], axis: [0, 0, -1],
      holeDiameterMm: 4, throughDepthMm: 4,
      direction1: [1, 0, 0], count1: 3, spacing1Mm: 4,
      direction2: [0, 1, 0], count2: 2, spacing2Mm: 8, revision: "r1",
    },
  });
  assert.equal(invalidVentArray.isError, true);
  const invalidSnapFit = await client.callTool({
    name: "plasticity_create_cantilever_snap_fit",
    arguments: {
      targetId: 7, baseCenterMm: [4, 10, 1],
      beamDirection: [1, 0, 0], thicknessDirection: [0, 0, 1],
      lengthMm: 20, widthMm: 6, thicknessMm: 2,
      hookLengthMm: 20, hookHeightMm: 4, revision: "r1",
    },
  });
  assert.equal(invalidSnapFit.isError, true);
  const invalidHinge = await client.callTool({
    name: "plasticity_create_hinge_barrel",
    arguments: {
      targetId: 7, axisStartMm: [20, 0, 10], axis: [0, 1, 0],
      lengthMm: 4, outerDiameterMm: 8, pinBoreDiameterMm: 8, revision: "r1",
    },
  });
  assert.equal(invalidHinge.isError, true);
  const invalidCableChannel = await client.callTool({
    name: "plasticity_cut_cable_channel",
    arguments: { targetId: 7, spineIds: [7], channelDiameterMm: 6, revision: "r1" },
  });
  assert.equal(invalidCableChannel.isError, true);
  const invalidConnectorOpening = await client.callTool({
    name: "plasticity_create_connector_opening",
    arguments: {
      targetId: 7, entryCenterMm: [10, 10, 10], axis: [0, 0, -1], widthDirection: [1, 0, 0],
      widthMm: 12, heightMm: 8, cornerRadiusMm: 4, throughDepthMm: 10, revision: "r1",
    },
  });
  assert.equal(invalidConnectorOpening.isError, true);
  const invalidMatingJoint = await client.callTool({
    name: "plasticity_create_mating_enclosure_joint",
    arguments: {
      maleTargetId: 7, femaleTargetId: 8, seamOriginMm: [0, 0, 10], outerWidthMm: 40, outerDepthMm: 30,
      wallThicknessMm: 2, lipThicknessMm: 1, lipHeightMm: 2, clearanceMm: 1, overlapMm: 1,
      revision: "r1",
    },
  });
  assert.equal(invalidMatingJoint.isError, true);
  const invalidLocatingPin = await client.callTool({
    name: "plasticity_create_locating_pin_pair",
    arguments: {
      maleTargetId: 7, femaleTargetId: 7, baseCenterMm: [10, 10, 10], axis: [0, 0, 1],
      pinDiameterMm: 5, pinHeightMm: 6, radialClearanceMm: 0.25, axialClearanceMm: 0.75,
      revision: "r1",
    },
  });
  assert.equal(invalidLocatingPin.isError, true);
  const invalidTongueGroove = await client.callTool({
    name: "plasticity_create_tongue_groove_joint",
    arguments: {
      tongueTargetId: 7, grooveTargetId: 7, baseCenterMm: [20, 15, 10], axis: [0, 0, 1], widthDirection: [1, 0, 0],
      tongueWidthMm: 12, tongueThicknessMm: 4, tongueHeightMm: 5,
      radialClearanceMm: 0.25, axialClearanceMm: 0.75, revision: "r1",
    },
  });
  assert.equal(invalidTongueGroove.isError, true);

  await client.close();
  await server.close();
});

test("Codex tool router catalogs and validates every registered operation", async () => {
  let state: RuntimeState = emptyState();
  let createBoxCalls = 0;
  const body: RuntimeState["bodies"][number] = {
    id: 42, versionId: 420, type: "Solid", name: "Routed box",
    boundsMm: { min: [0, 0, 0], max: [10, 20, 30] }, faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  const operations = {
    async state() { return state; },
    async createBox() { createBoxCalls += 1; state = { ...state, revision: "r2", bodies: [body] }; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "codex-tool-router-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const registered = await client.listTools();
  const router = registered.tools.find((tool) => tool.name === "plasticity_call");
  assert(router);
  assert.equal(registered.tools[0]?.name, "plasticity_call", "the fallback must stay visible to clients that cap large tool lists");
  assert.equal(router.annotations?.destructiveHint, true);
  assert.equal(router.annotations?.openWorldHint, true);
  const catalogResponse = await client.callTool({ name: "plasticity_call", arguments: {
    toolName: "catalog", query: "plasticity_create_box", limit: 1,
  } });
  assert.equal(catalogResponse.isError, undefined);
  const catalog = parseToolJson(catalogResponse);
  assert.equal(catalog.total, 1);
  assert.equal(catalog.tools[0]?.name, "plasticity_create_box");
  assert.equal(typeof catalog.tools[0]?.inputSchema, "object");
  assert.match(catalog.validationNote, /original server-side Zod schema is authoritative/i);

  const catalogNames = new Set<string>();
  let catalogOffset = 0;
  let catalogTotal = 0;
  do {
    const pageResponse = await client.callTool({ name: "plasticity_call", arguments: {
      toolName: "catalog", offset: catalogOffset, limit: 25,
    } });
    assert.equal(pageResponse.isError, undefined);
    const page = parseToolJson(pageResponse);
    catalogTotal = page.total;
    for (const item of page.tools as Array<{ name: string }>) catalogNames.add(item.name);
    catalogOffset = page.nextOffset ?? 0;
    if (page.nextOffset === null) break;
  } while (true);
  assert.equal(catalogTotal, registered.tools.length - 1);
  assert.equal(catalogNames.size, catalogTotal, "catalog pages must cover every registered operation without duplicates");

  const listing = parseToolJson(await client.callTool({ name: "plasticity_call", arguments: { toolName: "catalog", query: "hole", limit: 10 } }));
  assert.ok(listing.tools.length > 3);
  for (const item of listing.tools as Array<Record<string, unknown>>) {
    assert.equal("inputSchema" in item, false, "long catalog pages list summaries, not schemas");
    assert.equal(typeof item.summary, "string");
  }
  const forced = parseToolJson(await client.callTool({ name: "plasticity_call", arguments: { toolName: "catalog", query: "hole", limit: 10, schemas: true } }));
  assert.ok((forced.tools as Array<Record<string, unknown>>).every((item) => typeof item.inputSchema === "object"));
  const exactName = parseToolJson(await client.callTool({ name: "plasticity_call", arguments: { toolName: "catalog", query: "plasticity_create_through_hole" } }));
  assert.deepEqual((exactName.tools as Array<{ name: string }>).map((item) => item.name), ["plasticity_create_through_hole"],
    "an exact name selects that operation even when other names contain it");
  assert.equal(JSON.stringify(exactName).includes("prefixItems"), false, "uniform vectors are exported as fixed-length arrays");

  const invalid = await client.callTool({ name: "plasticity_call", arguments: {
    toolName: "plasticity_create_box",
    arguments: { originMm: [0, 0, 0], sizeMm: [0, 20, 30], revision: "r1" },
  } });
  assert.equal(invalid.isError, true);
  assert.equal(createBoxCalls, 0, "the registered schema must reject invalid dimensions before invoking CAD");

  const valid = await client.callTool({ name: "plasticity_call", arguments: {
    toolName: "plasticity_create_box",
    arguments: { originMm: [0, 0, 0], sizeMm: [10, 20, 30], revision: "r1" },
  } });
  assert.equal(valid.isError, undefined);
  assert.equal(createBoxCalls, 1);
  assert.equal(state.bodies[0]?.id, 42);

  const directStrength = await client.callTool({ name: "plasticity_strength_methods", arguments: {} });
  const routedStrength = await client.callTool({ name: "plasticity_call", arguments: {
    toolName: "plasticity_strength_methods", arguments: {},
  } });
  assert.equal(routedStrength.isError, undefined);
  assert.deepEqual(parseToolJson(routedStrength), parseToolJson(directStrength));

  const unknown = await client.callTool({ name: "plasticity_call", arguments: { toolName: "not_a_registered_tool", arguments: {} } });
  assert.equal(unknown.isError, true);
  assert.equal(createBoxCalls, 1);
  await client.close(); await server.close();
});

test("MCP validates and forwards selected-face shelling parameters", async () => {
  let received: unknown[] | undefined;
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async hollowFaces(...arguments_: unknown[]) { received = arguments_; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "hollow-faces-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_hollow_faces", arguments: {
    id: 8, faceIds: ["top-face"], wallThicknessMm: 2, direction: "inward", intent: "Create an open enclosure shell", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(received, [8, ["top-face"], 2, "inward", "r1"]);
  const emptyFaces = await client.callTool({ name: "plasticity_hollow_faces", arguments: { id: 8, faceIds: [], wallThicknessMm: 2, revision: "r1" } });
  const zeroThickness = await client.callTool({ name: "plasticity_hollow_faces", arguments: { id: 8, faceIds: ["top-face"], wallThicknessMm: 0, revision: "r1" } });
  const missingRevision = await client.callTool({ name: "plasticity_hollow_faces", arguments: { id: 8, faceIds: ["top-face"], wallThicknessMm: 2 } });
  assert.equal(emptyFaces.isError, true);
  assert.equal(zeroThickness.isError, true);
  assert.equal(missingRevision.isError, true);
  await client.close(); await server.close();
});

test("MCP creates a sphere using millimeter center and radius inputs", async () => {
  let received: unknown[] | undefined;
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async createSphere(...arguments_: unknown[]) { received = arguments_; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "sphere-tool-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_create_sphere", arguments: {
    centerMm: [12, -4, 8], radiusMm: 6.5, name: "Ball joint", intent: "Create spherical joint", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(received, [[12, -4, 8], 6.5, "Ball joint", "r1"]);
  const zeroRadius = await client.callTool({ name: "plasticity_create_sphere", arguments: { centerMm: [0, 0, 0], radiusMm: 0, revision: "r1" } });
  const badCenter = await client.callTool({ name: "plasticity_create_sphere", arguments: { centerMm: [0, 0], radiusMm: 1, revision: "r1" } });
  const missingRevision = await client.callTool({ name: "plasticity_create_sphere", arguments: { centerMm: [0, 0, 0], radiusMm: 1 } });
  assert.equal(zeroRadius.isError, true);
  assert.equal(badCenter.isError, true);
  assert.equal(missingRevision.isError, true);
  await client.close(); await server.close();
});

test("durable construction history survives MCP recreation and detects manual revision divergence", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-construction-history-mcp-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  let state: RuntimeState = emptyState();
  const body: RuntimeState["bodies"][number] = {
    id: 8, versionId: 80, type: "Solid", name: "Agent bracket",
    boundsMm: { min: [0, 0, 0], max: [40, 20, 5] }, faceIds: ["face-1"], edgeIds: ["edge-1"], faces: [], edges: [],
  };
  const operations = {
    async state() { return state; },
    async createBox() { state = { ...state, revision: "r2", bodies: [body] }; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const store = new ConstructionHistoryStore(join(root, "history"));
  const firstServer = createPlasticityServer(fake, undefined, undefined, undefined, store);
  const firstClient = new Client({ name: "construction-history-client-1", version: "1.0.0" });
  const [firstClientTransport, firstServerTransport] = InMemoryTransport.createLinkedPair();
  await firstServer.connect(firstServerTransport); await firstClient.connect(firstClientTransport);
  const mutation = await firstClient.callTool({ name: "plasticity_create_box", arguments: {
    originMm: [0, 0, 0], sizeMm: [40, 20, 5], intent: "Create the accepted reference-derived bracket body", revision: "r1",
  } });
  assert.equal(mutation.isError, undefined);
  await firstClient.close(); await firstServer.close();

  const secondServer = createPlasticityServer(fake, undefined, undefined, undefined, new ConstructionHistoryStore(join(root, "history")));
  const secondClient = new Client({ name: "construction-history-client-2", version: "1.0.0" });
  const [secondClientTransport, secondServerTransport] = InMemoryTransport.createLinkedPair();
  await secondServer.connect(secondServerTransport); await secondClient.connect(secondClientTransport);
  const persistedResponse = await secondClient.callTool({ name: "plasticity_construction_history", arguments: {} });
  const persisted = JSON.parse((persistedResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(persisted.total, 1);
  assert.equal(persisted.entries[0]?.operation, "create-box");
  assert.equal(persisted.entries[0]?.change.added[0]?.boundsMm.max[0], 40);
  let journalResponse = await secondClient.callTool({ name: "plasticity_construction_journal", arguments: {} });
  let journal = JSON.parse((journalResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(journal.durableSyncStatus, "in-sync");

  state = { ...state, revision: "r3" };
  journalResponse = await secondClient.callTool({ name: "plasticity_construction_journal", arguments: {} });
  journal = JSON.parse((journalResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(journal.durableSyncStatus, "manual-edit-detected");
  assert.equal(journal.latestDurableEvent.afterRevision, "r2");
  await secondClient.close(); await secondServer.close();
});

async function createBoxResponse(options?: ServerOptions): Promise<{ result: any; state: RuntimeState; boundsMm: { min: [number, number, number]; max: [number, number, number] } }> {
  const boundsMm = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  const face = {
    id: "face-1", surfaceType: "plane", planar: true, centerMm: [0, 0, 0] as [number, number, number],
    normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null,
    axisOriginMm: null, axisDirection: null, boundsMm, edgeIds: ["edge-1"],
  };
  const edge = {
    id: "edge-1", curveType: "line", line: true, circle: false, lengthMm: 1,
    centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number],
    boundsMm, faceIds: ["face-1"], vertexIds: [1, 2],
  };
  const makeBody = (id: number): RuntimeState["bodies"][number] => ({
    id, versionId: id + 100, type: "Solid", name: `Body ${id}`, boundsMm,
    faceIds: ["face-1"], edgeIds: ["edge-1"], faces: [face], edges: [edge],
    vertices: [{ id: 1, positionMm: [0, 0, 0], edgeIds: ["edge-1"], faceIds: ["face-1"] }],
  });
  let state: RuntimeState = { ...emptyState(), bodies: Array.from({ length: 60 }, (_, id) => makeBody(id)) };
  const operations = {
    async state() { return state; },
    async createBox() {
      const staleOperationResult = state;
      state = { ...state, revision: "r2", bodies: [...state.bodies, makeBody(60)] };
      return staleOperationResult;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake, undefined, undefined, undefined, options);
  const client = new Client({ name: "compact-mutation-response-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const response = await client.callTool({ name: "plasticity_create_box", arguments: {
    originMm: [0, 0, 0], sizeMm: [1, 1, 1], revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  const result = JSON.parse((response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  await client.close(); await server.close();
  return { result, state, boundsMm };
}

test("native mutation responses use the reconciled state and include a compact exact scene change", async () => {
  const { result, state, boundsMm } = await createBoxResponse();
  assert.equal(result.revision, "r2");
  assert.equal(result.bodyPagination.total, 61);
  assert.equal(result.bodyPagination.limit, 20);
  assert.equal(result.bodyPagination.nextOffset, 20);
  assert.equal(result.bodies.length, 20);
  assert.ok(result.bodies.every((body: Record<string, unknown>) => !("faces" in body) && !("edges" in body)
    && !("faceIds" in body) && !("edgeIds" in body) && !("vertices" in body)));
  assert.deepEqual(result.change.added, [{
    id: 60, versionId: 160, type: "Solid", name: "Body 60", boundsMm,
    faceCount: 1, edgeCount: 1, vertexCount: 1,
  }]);
  assert.equal(result.change.sceneChanged, true);
  assert.equal(result.change.revisionChanged, true);
  assert.doesNotMatch(JSON.stringify(result), /"surfaceType"|"curveType"|"vertexIds"/);
  assert.ok(JSON.stringify(result).length < JSON.stringify(state).length / 5,
    "mutation responses should not repeat the full native B-Rep payload");
});

test("changes-only mutation responses return what changed instead of the scene summary", async () => {
  const { result, boundsMm } = await createBoxResponse({ mutationResponses: "changes" });
  assert.equal(result.revision, "r2");
  assert.equal(result.bodyCount, 61);
  assert.equal("bodies" in result, false, "unchanged bodies are read with plasticity_status, not repeated after every edit");
  assert.deepEqual(result.construction, { activePlaneId: null, planeStateToken: "p0", viewStateToken: "v0", planeIds: [] });
  assert.equal(result.regionCount, 0);
  assert.equal("removed" in result.change, false, "empty change lists are omitted");
  assert.equal("groupsChanged" in result.change, false, "false change flags are omitted");
  assert.deepEqual(result.change.added, [{
    id: 60, versionId: 160, type: "Solid", name: "Body 60", boundsMm,
    faceCount: 1, edgeCount: 1, vertexCount: 1,
  }]);
  assert.equal(result.change.sceneChanged, true);
});

test("history storage failure remains visible without converting a completed CAD edit into an apparent failure", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-construction-history-failure-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const invalidStoreRoot = join(root, "not-a-directory");
  await writeFile(invalidStoreRoot, "occupied");
  let state = emptyState();
  const body: RuntimeState["bodies"][number] = {
    id: 9, versionId: 90, type: "Solid", name: "Completed edit",
    boundsMm: { min: [0, 0, 0], max: [10, 10, 10] }, faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  const operations = {
    async state() { return state; },
    async createBox() { state = { ...state, revision: "r2", bodies: [body] }; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createPlasticityServer(fake, undefined, undefined, undefined, new ConstructionHistoryStore(invalidStoreRoot));
  const client = new Client({ name: "construction-history-failure-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const mutation = await client.callTool({ name: "plasticity_create_box", arguments: {
    originMm: [0, 0, 0], sizeMm: [10, 10, 10], revision: "r1",
  } });
  assert.equal(mutation.isError, undefined);
  assert.equal(state.bodies.length, 1);
  const journalResponse = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journal = JSON.parse((journalResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(journal.entries.at(-1)?.status, "completed");
  assert.equal(journal.durableSyncStatus, "history-unavailable");
  assert.match(journal.journalPersistenceWarnings.at(-1)?.error ?? "", /EEXIST|ENOTDIR/i);
  await client.close(); await server.close();
});

test("MCP validates and forwards native closed-profile extrusion", async () => {
  let received: unknown[] | undefined;
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async extrudeProfile(...arguments_: unknown[]) { received = arguments_; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "extrude-profile-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_extrude_profile", arguments: {
    id: 21, distanceMm: -8, intent: "Extrude the closed plate profile downwards", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(received, [21, -8, "r1"]);
  const invalidId = await client.callTool({ name: "plasticity_extrude_profile", arguments: { id: 0, distanceMm: 8, revision: "r1" } });
  const missingRevision = await client.callTool({ name: "plasticity_extrude_profile", arguments: { id: 21, distanceMm: 8 } });
  assert.equal(invalidId.isError, true);
  assert.equal(missingRevision.isError, true);
  await client.close(); await server.close();
});
