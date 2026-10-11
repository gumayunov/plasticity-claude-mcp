import { z } from "zod";
import { findEdges, findFaces } from "../../plasticity/semantic.ts";
import { vector, direction, ids, faceRef, edgeRef, curvatureWireSegmentRef, measurementVertexRef, revision, intent, faceQuerySchema, edgeQuerySchema } from "../schemas/common.ts";
import { circularEdgeMeasurementRef, sampledCurveEdgeRef, surfaceContinuityInputSchema, edgeCurvatureInputSchema, faceDraftInputSchema, bodyInterferenceInputSchema, solidPropertiesInputSchema, facePropertiesInputSchema, measurementPointRef, topologyMeasurementPointRef } from "../schemas/measure.ts";
import type { ToolContext } from "../context.ts";

export function registerMeasureTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_check_interference", "Check explicit pairs of current Solid bodies for exact volumetric interference by intersecting native B-Rep clones in a temporary database. The check does not change the document or Undo history. A no-volumetric-interference result does not distinguish touching from separation and is not a minimum-clearance measurement.", bodyInterferenceInputSchema, async ({ pairs, revision: current }) =>
    await session.get().checkInterference(pairs, current), true);
  tool("plasticity_measure_solid_properties", "Measure exact native B-Rep volume, surface area, and volume centroid for one or more current Solid bodies without changing the document or Undo history. Totals include the volume-weighted centroid. This is geometric evidence; physical mass still requires an explicit qualified density.", solidPropertiesInputSchema, async ({ ids: bodyIds, revision: current }) =>
    await session.get().measureSolidProperties(bodyIds, current), true);
  tool("plasticity_measure_face_properties", "Measure exact native B-Rep area, full trimmed boundary length, area centroid, surface type, and outer/inner loop counts for selected current Solid or Sheet faces without changing the document or Undo history. Totals include the area-weighted centroid; summed boundary length counts shared edges independently for each selected face.", facePropertiesInputSchema, async ({ faces, revision: current }) =>
    await session.get().measureFaceProperties(faces, current), true);
  tool("plasticity_list_bodies", "List exact native B-Rep body details with topology IDs. Results are paginated (bodyOffset default 0, bodyLimit default 10, maximum 100); follow bodyPagination.nextOffset and pass the previous page's revision as expectedRevision so edits cannot mix pages. Prefer plasticity_body_info when only one body is needed. Cone faces also report native basis radius, axis origin/direction, and semi-angle in radians when Plasticity provides them.", z.object({
    bodyOffset: z.number().int().min(0).max(1_000_000).default(0),
    bodyLimit: z.number().int().min(1).max(100).default(10),
    expectedRevision: z.string().min(1).optional(),
  }).strict(), async ({ bodyOffset, bodyLimit, expectedRevision }) => {
    const state = await session.get().state();
    if (expectedRevision !== undefined && expectedRevision !== state.revision) {
      throw new Error("CAD revision changed between body pages; restart pagination from bodyOffset 0");
    }
    const bodies = state.bodies.slice(bodyOffset, bodyOffset + bodyLimit);
    return {
      targetId: state.targetId,
      title: state.title,
      documentToken: state.documentToken,
      revision: state.revision,
      bodies,
      bodyPagination: {
        offset: bodyOffset,
        limit: bodyLimit,
        total: state.bodies.length,
        nextOffset: bodyOffset + bodies.length < state.bodies.length ? bodyOffset + bodies.length : null,
      },
    };
  }, true);
  tool("plasticity_body_info", "Read one body's exact native B-Rep faces, edges, and vertices from the current document revision. Each collection is paginated with offset/limit (default 0/50, maximum 500); follow pagination.<collection>.nextOffset and pass the prior page's revision as expectedRevision so edits cannot mix pages. Use include to read only the collections you need, or plasticity_find_faces/plasticity_find_edges for a semantic subset.", z.object({
    id: z.number().int().positive(),
    include: z.array(z.enum(["faces", "edges", "vertices"])).min(1).max(3).default(["faces", "edges", "vertices"]),
    offset: z.number().int().nonnegative().max(1_000_000).default(0),
    limit: z.number().int().min(1).max(500).default(50),
    expectedRevision: z.string().min(1).optional(),
  }).strict(), async ({ id, include, offset, limit, expectedRevision }) => {
    const state = await session.get().state();
    if (expectedRevision !== undefined && expectedRevision !== state.revision) {
      throw new Error("CAD revision changed between body pages; restart pagination from offset 0");
    }
    const body = state.bodies.find((candidate) => candidate.id === id);
    if (!body) throw new Error(`Unknown body ID: ${id}`);
    const { faceIds: _faceIds, edgeIds: _edgeIds, faces, edges, vertices, ...summary } = body;
    const collections = { faces, edges, vertices: vertices ?? [] };
    const pages = Object.fromEntries(include.map((name) => [name, collections[name].slice(offset, offset + limit)]));
    const pagination = Object.fromEntries(include.map((name) => {
      const total = collections[name].length;
      const shown = (pages[name] as unknown[]).length;
      return [name, { offset, limit, total, nextOffset: offset + shown < total ? offset + shown : null }];
    }));
    return {
      documentToken: state.documentToken,
      revision: state.revision,
      measurementSource: "native-brep",
      body: { ...summary, faceCount: faces.length, edgeCount: edges.length, vertexCount: vertices?.length ?? null, ...pages },
      pagination,
    };
  }, true);
  tool("plasticity_find_faces", "Find current B-Rep faces semantically by body, surface type, normal, radius, center, bounds, edge count, or adjacency.", z.object({ revision, query: faceQuerySchema }), async ({ revision: expected, query }) => {
    const state = await session.get().state();
    if (state.revision !== expected) throw new Error(`Stale reference: expected revision ${expected}, current revision is ${state.revision}`);
    const matches = findFaces(state, query);
    return { documentToken: state.documentToken, revision: state.revision, measurementSource: "native-brep", count: matches.length, matches };
  }, true);
  tool("plasticity_find_edges", "Find current B-Rep edges semantically by body, curve type, direction, exact length, center, bounds, or adjacent faces.", z.object({ revision, query: edgeQuerySchema }), async ({ revision: expected, query }) => {
    const state = await session.get().state();
    if (state.revision !== expected) throw new Error(`Stale reference: expected revision ${expected}, current revision is ${state.revision}`);
    const matches = findEdges(state, query);
    return { documentToken: state.documentToken, revision: state.revision, measurementSource: "native-brep", count: matches.length, matches };
  }, true);
  tool("plasticity_measure", "Measure a body's axis-aligned native B-Rep bounds in millimeters.", z.object({ id: z.number().int().positive() }), async ({ id }) => {
    const state = await session.get().state();
    const body = state.bodies.find((candidate) => candidate.id === id);
    if (!body?.boundsMm) throw new Error(`Body has no native B-Rep bounds: ${id}`);
    return { id, revision: state.revision, source: "native-brep", boundsMm: body.boundsMm, sizeMm: body.boundsMm.max.map((value, index) => value - body.boundsMm!.min[index]!) };
  }, true);
  tool("plasticity_measure_point_distance", "Measure the exact straight-line distance and XYZ delta between two explicit coordinates or current native B-Rep vertices, edge midpoints, or face points. Topology references are revision-bound.", z.object({ first: measurementPointRef, second: measurementPointRef, revision }).strict(), async ({ first, second, revision: current }) =>
    await session.get().measurePointDistance(first, second, current), true);
  tool("plasticity_measure_point_to_linear_edge", "Measure the exact distance from an explicit coordinate or current B-Rep vertex to a finite straight B-Rep edge centerline. Returns the projected point, the clamped closest point on the finite edge, supporting-line distance and finite-segment distance. This is centerline geometry, not minimum clearance to the owning faces or bodies; references are revision-bound.", z.object({ point: measurementPointRef, edge: edgeRef, revision }).strict(), async ({ point, edge, revision: current }) =>
    await session.get().measurePointToLinearEdge(point, edge, current), true);
  tool("plasticity_measure_point_to_curved_edge", "Estimate point distance to a non-linear, non-circular Solid/Sheet B-Rep edge or native Wire segment using an adaptively sampled polyline of native Plasticity edge evaluations. For Solid/Sheet, pass bodyId plus edgeId; for Wire, pass bodyId plus segmentEntityId from plasticity_list_curve_directions. Returns an explicitly approximate closest point/distance, sample count and maximum midpoint chord deviation observed at those samples. `toleranceObserved` only means the sampled deviation criterion was met; it is not a certified global error bound. For dimensions that need exact 0.01 mm proof, use exact line/circle tools or request a more suitable native analytic method; never report this estimate as exact or as body clearance. Current body/topology references are revision-bound.", z.object({ point: measurementPointRef, edge: sampledCurveEdgeRef, requestedToleranceMm: z.number().finite().positive().max(1).default(0.01), maxSegments: z.number().int().min(64).max(8192).default(2048), revision }).strict(), async ({ point, edge, requestedToleranceMm, maxSegments, revision: current }) =>
    await session.get().measurePointToSampledCurveEdge(point, edge, current, requestedToleranceMm, maxSegments), true);
  tool("plasticity_measure_point_to_circular_edge", "Measure exact distance from an explicit coordinate or current B-Rep vertex to a native circular boundary. Use bodyId plus edgeId for Solid/Sheet topology, or bodyId plus segmentEntityId from plasticity_list_curve_directions for a Wire. Returns distance to the supporting circle, minimum distance to the trimmed arc, closest point, normalized arc parameter, and endpoint-clamp status. Requires verified native circle basis and trim samples; unsupported or stale references are rejected. This is distance to the edge curve centerline, not clearance to adjacent faces or the owning body.", z.object({ point: measurementPointRef, edge: circularEdgeMeasurementRef, revision }).strict(), async ({ point, edge, revision: current }) =>
    await session.get().measurePointToCircularEdge(point, edge, current), true);
  tool("plasticity_measure_point_to_planar_face", "Measure the exact minimum distance from an explicit coordinate or current B-Rep vertex to a trimmed planar face. Supports closed polygonal loops, complete circles, and exact trimmed circular arcs, including holes; returns signed supporting-plane distance, minimum distance to the actual trimmed face, closest point, and whether that point lies in the face interior or on a boundary edge. Other curved boundaries, non-planar faces, incomplete topology, and stale references are rejected; this does not measure clearance between two bodies.", z.object({ point: measurementPointRef, face: faceRef, revision }).strict(), async ({ point, face, revision: current }) =>
    await session.get().measurePointToPlanarFace(point, face, current), true);
  tool("plasticity_measure_planar_faces", "Measure the angle between two current planar B-Rep faces and, when parallel, the signed/absolute separation of their infinite supporting planes in millimeters (separationKind='supporting-planes'). It does not test overlap of the trimmed faces or measure their actual gap/clearance; use only when supporting-plane spacing is the intended quantity.", z.object({ first: faceRef, second: faceRef, angularToleranceDeg: z.number().finite().positive().max(10).default(0.01), revision }).strict(), async ({ first, second, angularToleranceDeg, revision: current }) =>
    await session.get().measurePlanarFaces(first, second, current, angularToleranceDeg), true);
  tool("plasticity_measure_parallel_planar_face_clearance", "Measure exact minimum distance between two revision-bound parallel planar B-Rep faces, including polygonal regions, complete circular boundaries and exact trimmed circular arcs (including holes). Computes planar overlap or boundary separation together with the normal plane gap and closest 3D points. Requires parallel faces within 1e-7 degrees and closed boundaries composed of straight edges and exact circular edges, at most 512 edges per face; other curved edges, nonparallel faces, incomplete topology and stale references are rejected rather than approximated. This is face-to-face clearance, not body-to-body collision detection.", z.object({ first: faceRef, second: faceRef, revision }).strict(), async ({ first, second, revision: current }) =>
    await session.get().measureParallelPlanarFaceClearance(first, second, current), true);
  tool("plasticity_measure_nonparallel_planar_polygon_clearance", "Measure exact minimum Euclidean distance between two nonparallel trimmed planar B-Rep faces with simple straight-edged polygon boundaries. Concave outlines, holes and multiple nested/disjoint loops are supported; face regions use even-odd loop filling. Reports exact closest 3D points and zero when the finite face regions intersect. Limits each face to 512 boundary vertices and 4096 exact decomposition triangles. Faces with parallel supporting planes, circular/curved edges, self-intersecting or touching loops, incomplete native topology, or stale references are rejected; use plasticity_measure_parallel_planar_face_clearance for supported circular boundaries. This measures a selected face pair, not whole-body clearance or collision.", z.object({ first: faceRef, second: faceRef, revision }).strict(), async ({ first, second, revision: current }) =>
    await session.get().measureNonparallelPlanarPolygonFaceClearance(first, second, current), true);
  tool("plasticity_measure_linear_edges", "Measure the exact angle and closest approach between two current linear B-Rep edges. Returns both infinite supporting-line clearance and the exact distance/closest points between the finite edge centerline segments. Finite-edge distance is centerline geometry only; it is not minimum clearance between the owning faces or bodies.", z.object({ first: edgeRef, second: edgeRef, angularToleranceDeg: z.number().finite().positive().max(10).default(0.01), revision }).strict(), async ({ first, second, angularToleranceDeg, revision: current }) =>
    await session.get().measureLinearEdges(first, second, current, angularToleranceDeg), true);
  tool("plasticity_analyze_edge_curvature", "Sample Plasticity's native B-Rep curvature vector at 100 positions along each selected current edge. Reference Wire segments by bodyId plus segmentEntityId from plasticity_list_curve_directions; reference Solid or Sheet edges by bodyId plus edgeId from state. Returns curvature magnitude in 1/mm, finite radii of curvature in millimeters, extrema locations, and whether any sampled point is straight. This compact sampled analysis does not use the display mesh, does not claim an exact continuous maximum, and does not change the document.", edgeCurvatureInputSchema, async ({ edges, revision: current }) =>
    await session.get().analyzeEdgeCurvature(edges, current), true);
  tool("plasticity_analyze_face_draft", "Sample exact native B-Rep face normals on a finite interior grid and classify each selected Solid or Sheet face as positive, negative, neutral, or mixed draft relative to an explicit pull direction and minimum draft angle. Signed draft is asin(normal dot pull): walls parallel to pull are 0 degrees, outward normals toward pull are positive, and opposite normals are negative. The compact extrema do not prove continuous extrema, mold parting, release paths, or print support requirements.", faceDraftInputSchema, async ({ faces, pullDirection, minimumDraftDeg, samplesPerDirection, revision: current }) =>
    await session.get().analyzeFaceDraft(faces, pullDirection, minimumDraftDeg, samplesPerDirection, current), true);
  tool("plasticity_analyze_surface_continuity", "Sample Plasticity's native B-Rep continuity evaluator at 100 positions along each selected current Solid or Sheet edge shared by exactly two faces. Returns maximum G0 position deviation in millimeters, G1 normal-angle deviation in degrees, Plasticity's dimensionless relative G2 curvature deviation, their locations, and hierarchical G0/G1/G2 tolerance results. This is native surface sampling rather than an exact continuous maximum; it does not use the display mesh and does not change the document.", surfaceContinuityInputSchema, async ({ edges, positionToleranceMm, normalAngleToleranceDeg, relativeCurvatureTolerance, revision: current }) =>
    await session.get().analyzeSurfaceContinuity(edges, current, positionToleranceMm, normalAngleToleranceDeg, relativeCurvatureTolerance), true);
  tool("plasticity_list_measurements", "List native measurements stored in the Plasticity document with stable measurement IDs, current topology targets, and exact values when both targets still resolve.", z.object({}).strict(), async () =>
    await session.get().listMeasurements(), true);
  tool("plasticity_create_vertex_distance_measurement", "Create a persistent native Plasticity point-to-point distance measurement between two current B-Rep vertices. The measurement participates in document Undo/Redo and remains attached to its topology.", z.object({ first: measurementVertexRef, second: measurementVertexRef, name: z.string().trim().min(1).max(120).optional(), intent, revision }).strict(), async ({ first, second, name, intent: purpose, revision: current }) =>
    await journaled("create-vertex-distance-measurement", purpose, { first, second, name }, () => session.get().createVertexDistanceMeasurement(first, second, name, current)), false, { destructiveHint: false });
  tool("plasticity_create_topology_distance_measurement", "Create a persistent native Plasticity point-to-point distance measurement between two current Solid or Sheet topology points. Each endpoint may be an exact vertex, edge midpoint, or face center. The measurement remains attached to topology, participates in Undo/Redo, and is listed with stable measurement and topology identities.", z.object({ first: topologyMeasurementPointRef, second: topologyMeasurementPointRef, name: z.string().trim().min(1).max(120).optional(), intent, revision }).strict(), async ({ first, second, name, intent: purpose, revision: current }) =>
    await journaled("create-topology-distance-measurement", purpose, { first, second, name }, () => session.get().createTopologyDistanceMeasurement(first, second, name, current)), false, { destructiveHint: false });
  tool("plasticity_create_radius_measurement", "Create a persistent native Plasticity radius measurement on one exact current circular edge. Reference a Wire segment by bodyId plus segmentEntityId from plasticity_list_curve_directions, or a Solid/Sheet edge by bodyId plus edgeId from state. The measurement remains attached to topology, participates in Undo/Redo, and plasticity_list_measurements reports both radius and derived diameter in millimeters.", z.object({ edge: z.union([edgeRef, curvatureWireSegmentRef]), name: z.string().trim().min(1).max(120).optional(), intent, revision }).strict(), async ({ edge, name, intent: purpose, revision: current }) =>
    await journaled("create-radius-measurement", purpose, { edge, name }, () => session.get().createRadiusMeasurement(edge, name, current)), false, { destructiveHint: false });
  tool("plasticity_delete_measurement", "Delete one current native Plasticity measurement by stable measurement ID through document Undo/Redo history.", z.object({ id: z.number().int().positive(), intent, revision }).strict(), async ({ id, intent: purpose, revision: current }) =>
    await journaled("delete-measurement", purpose, { id }, () => session.get().deleteMeasurement(id, current)));
  tool("plasticity_list_section_analyses", "List the active native Plasticity viewport section plane, including its session-stable analysis ID, origin, clipped-half-space normal, visibility, and number of viewports using it. This reads the section currently applied by Plasticity shading state; sections are viewport state and do not modify B-Rep or Undo history.", z.object({}).strict(), async () =>
    await session.get().listSectionAnalyses(), true);
  tool("plasticity_create_section_analysis", "Apply a native Plasticity section plane to the current viewport from a world-space origin and normal. The normal points toward the half-space to clip. An optional nonparallel xDirection sets the plane helper orientation; otherwise MCP derives one. Plasticity supports one active section plane at a time; delete it before applying another. The change is immediately visible in Plasticity and changes the MCP revision, but does not modify B-Rep or Undo history.", z.object({ originMm: vector, normal: direction, xDirection: direction.optional(), name: z.string().trim().min(1).max(120).optional(), intent, revision }).strict(), async ({ originMm, normal, xDirection, name, intent: purpose, revision: current }) =>
    await journaled("create-section-analysis", purpose, { originMm, normal, xDirection, name }, () => session.get().createSectionAnalysis(originMm, normal, xDirection, name, current)), false, { destructiveHint: false });
  tool("plasticity_delete_section_analysis", "Clear the active native Plasticity section plane by its current session-stable analysis ID. The viewport returns to an unclipped state; B-Rep and Undo history are unchanged, while the MCP revision is updated.", z.object({ id: z.number().int().positive(), intent, revision }).strict(), async ({ id, intent: purpose, revision: current }) =>
    await journaled("delete-section-analysis", purpose, { id }, () => session.get().deleteSectionAnalysis(id, current)), false, { destructiveHint: false });
  tool("plasticity_validate_bodies", "Run Plasticity's native B-Rep Check and report exact topology closure and solid printability for current revision-bound bodies.", z.object({ ids, revision }).strict(), async ({ ids: bodyIds, revision: current }) =>
    await session.get().validateBodies(bodyIds, current), true);
}
