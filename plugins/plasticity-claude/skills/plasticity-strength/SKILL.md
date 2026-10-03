---
name: plasticity-strength
description: Use when checking whether a Plasticity part is strong or stiff enough - load estimates, bolted joints, sections, printed threads, inserts, or a linear static FEM run on a solid.
---

# Strength checks for Plasticity parts

Keep the effort proportional to the risk. A provisional enclosure or stand needs a practical review of load, mounting, clearances, wall thickness and printability. Escalate to calculated checks when the load, the consequences or a design decision require it. State assumptions and what is not covered.

Workflow detail lives in MCP resources: `plasticity://strength/workflow` (start here), `plasticity://strength/methods`, `plasticity://strength/recovery`.

## Deterministic methods

1. `plasticity_strength_methods` lists the versioned methods (axial, cantilever, plate, Euler buckling, section resultants, fasteners, threaded receivers, heat-set inserts, fastener groups, tongue roots) with required inputs, assumptions and exclusions.
2. To turn a task into inputs, use `plasticity_analyze_strength_task`: one isolated headless Claude turn extracts facts, proposes a method and asks one question. Loop on its question with `answers` as in design-reference intake.
3. Material values need evidence: datasheet URL with hash, coupon data, or a user answer. Do not invent E, strengths or safety factors; ask.
4. Run the method through `plasticity_call` (catalog query "strength", "section", "fastener") and report utilisation, margins and the method's exclusions.

## Linear static FEM

`plasticity_analyze_static_fem` runs Gmsh + CalculiX on one solid.

- Linear elastic, C3D4 tetrahedra; no contact, bolts, preload or remote loads. Supports and loads attach to planar faces only.
- E and ν must come with evidence. The output has no safety factor; compare stresses with allowables yourself.
- Limits: estimated mesh ≤ 300k cells, solver container 1 GB / 2 CPU, 120 s per job, ≤ 12 jobs per call. Check convergence with `plasticity_compare_static_fem_refinement_reports`.
- Model a bolted base as a fixed planar face and a rod or pin as a load on the bore's flat end face or a fused stub. Bolt forces come from a hand calculation. Say clearly that this is a simplification.
- Prerequisites in the checkout: `mise run fea:setup` (Gmsh in a uv venv) and `npm run build:fem-solver` (CalculiX image; Docker must be running).

## Before calling a part ready

List the load case, material basis, method or FEM setup, worst utilisation, and every unsupported effect: fatigue, creep, impact, temperature, anisotropy of prints. Never authorise printing or production from a calculation alone; the user decides.
