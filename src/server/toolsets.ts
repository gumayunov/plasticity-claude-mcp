export interface ToolsetInfo {
  name: string;
  title: string;
  description: string;
}

export const TOOLSETS: readonly ToolsetInfo[] = [
  { name: "session", title: "Session", description: "Windows, connection, status, change tracking, journal, toolsets and compatibility." },
  { name: "selection", title: "Selection", description: "Current selection and named selections." },
  { name: "measure", title: "Measure and analyze", description: "Distances, clearances, mass properties, curvature, draft, continuity, interference, section analyses and engineering inspections." },
  { name: "scene", title: "Scene", description: "Instances, reference meshes, groups, visibility, locking, materials, rename and delete." },
  { name: "construction", title: "Construction geometry", description: "Datum points and axes, construction planes and the active workplane." },
  { name: "curve-query", title: "Curve inspection", description: "Regions, curve fragments, endpoints, vertices, directions, structure, planarity and intersections." },
  { name: "sketch", title: "Sketch curves", description: "Polylines, NURBS, helices, circles, arcs, ellipses, polygons, rectangles, text and slot profiles." },
  { name: "curve-edit", title: "Curve editing", description: "Offset, trim, extend, join, rebuild, projection, outlines and curve patterns." },
  { name: "curve-control-points", title: "Curve control points", description: "Convert vertices and move, slide, rotate, scale or delete curve control points." },
  { name: "solids", title: "Solids", description: "Primitives, booleans, fillets, chamfers, extrude, revolve, pipes, hollow and imprint." },
  { name: "faces", title: "Direct face editing", description: "Draft, offset, move, rotate, scale and thicken faces; edge and vertex edits; face patterns." },
  { name: "surfaces", title: "Surfaces", description: "Sweep, loft, patch, bridge, join sheets, constrained surfaces, rebuild and match faces." },
  { name: "sheets", title: "Sheets and shells", description: "Sheet insertion, shell unjoin, solid from sheet, patch and cap holes, thicken, unwrap and cone development." },
  { name: "transform", title: "Transform", description: "Move, rotate, scale, set dimensions, mirror, patterns and align." },
  { name: "document", title: "Document", description: "Undo, redo, save, open, screenshots, views and images." },
  { name: "exchange", title: "Import and export", description: "STEP, Parasolid, STL, OBJ, 3MF and SVG import and export." },
  { name: "references", title: "Reference sources", description: "Download and register CAD references and reference assets." },
  { name: "recipes", title: "Feature recipes", description: "Holes, countersinks, counterbores, inserts, bosses, ribs, vents, joints, snap fits and hinges." },
  { name: "printing", title: "3D printing", description: "Printed threads and qualifications, print orientation and build volume splitting." },
  { name: "fasteners", title: "Fasteners", description: "Fastener designations, stacks, groups and layout checks." },
  { name: "strength", title: "Strength screening", description: "Material and interface tests, section, fastener and plate strength screening and FEM reports." },
];
