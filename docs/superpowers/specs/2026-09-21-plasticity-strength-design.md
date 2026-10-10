# Plasticity MCP: strength calculation before choosing geometry

Date: 2026-09-21.
Status: approved by the user on 2026-09-21; implementation has not started.

## 1. Goal and agreed scope

Help the user design technical parts in Plasticity, starting from the part's
purpose, loads, material and allowable deflection. Thicknesses and sections
are chosen from design conditions and then checked on the geometry that was
actually built. A minimum printable wall does not replace a strength
calculation.

The main interface is the Codex chat. The user watches the model in Plasticity.
Workbench is optional: without it, questions, calculation, approval,
construction and the report still work. Confirmation of physical printing
remains a separate existing process and is outside this specification.

Plasticity remains the only CAD and the source of actual geometry. The MCP
provides native operations, calculation tools and agent instructions. It does
not create its own construction tree, geometry kernel or editor.

The user agreed to:

- input tasks from sketches and photos, including unscaled ones;
- a provisional model with explicitly undetermined dimensions;
- searching for available specifications before asking the user;
- an adaptive interview with plain everyday questions;
- approval of each logical change, not of each internal command;
- delegation through "давай сам" ("go ahead yourself") only for the assigned action;
- Codex API calls from the MCP for bounded analysis tasks;
- static strength and deflection calculation as the first priority;
- choosing a plastic and print settings for the load if the material is not yet chosen.

## 2. Development breakdown

This document describes the first standalone stage: static calculation and
sizing. Later stages get separate specifications:

1. A complete process for reconstructing a part from an unscaled photo or sketch.
2. Reworking an existing part for its purpose, taking manual edits into account.
3. Additional native operations for surfaces and complex geometry.
4. Extended calculations: a numerical solver, joints, impacts, fatigue,
   long-term deformation and other cases the first stage does not support.

The first stage accepts text, images and answers as context for the calculation
task. An image being present does not mean that reconstruction of an arbitrary
part is already implemented or that its dimensions are known.

## 3. Verified project basis

- `src/server.ts` registers the stdio MCP, operations, the journal and the
  reference workflow; `src/plasticity/` implements native commands and geometry reading.
- `src/plasticity/semantic.ts` finds faces and edges by their characteristics. It
  is a geometry selection mechanism, not a system for recognising calculation models.
- `workbench/src/server/codex/client.ts` contains a JSON-RPC client with initialize,
  thread/start and turn/start; the local contract accepts text and localImage.
- The installed `codex app-server --help` confirms stdio and protocol schema
  generation. A live image-analysis call through this adapter has not yet been
  tested in this stage. The existing mock tests do not prove that compatibility.
- Native B-Rep validity and a closed body's suitability for export are not
  results of a mechanical strength calculation.

## 4. Roles and workflow

The main agent receives the assignment and keeps the dialogue going. The MCP
calls the Codex App Server API for bounded analysis of the supplied context:
extracting data, proposing a calculation model, finding gaps and next questions.

Stresses, deflection and chosen dimensions are computed by a deterministic
calculation module with versioned methods. A model response does not replace it.

Workflow:

1. Collect the object, the mounting method, the load position and the service conditions.
2. Find available primary specifications of the object or material with the main
   agent's tools and pass the values together with their sources to the analysis.
3. Ask only the remaining questions. For example: "what will stand on the holder"
   instead of asking again for a force the user does not know.
4. Record the calculation model, input data, unknowns and criteria.
5. Calculate provisional dimensions or a range of candidates.
6. Show the logical change package in the chat and get approval, or check that
   the current delegation covers the specific assignment.
7. Build through the existing native Plasticity MCP tools.
8. Read the actual geometry, check that the model applies, and recalculate.
9. Check fits and manufacturability. Any later change of geometry, material or
   orientation requires the calculation conclusions to be checked again.

The finished report can be shown in the chat without starting Workbench.

## 5. Initial method catalogue: proposal for the first release

To give the first stage finite, verifiable bounds, two models are proposed:

- a straight member with a constant rectangular section under axial tension;
- a straight cantilever with a constant rectangular section, an idealised
  fixed support and one transverse static force at the free end.

These are calculation idealisations of the selected member. A cantilever check
does not confirm the strength of the wall, the screws, the contact with the base
or the whole bracket.

Each method must have: a source for its formulas, units, a coordinate system,
allowed geometry, a list of assumptions, applicability criteria and independent
numerical examples. Exact formulas and quantitative applicability limits are
checked against primary engineering sources before the method is implemented. A
method without such a passport is not included in the available catalogue.

Ribs, holes, a varying section, combined loads and other departures from the
method passport are not automatically reduced to the bounding box. The tool
returns an unsupported case and the reason. A calculation of a simplified model
is possible only as an explicitly labelled estimate with unverified conditions.

The first release does not include FEM, fastener calculation, buckling, impact,
fatigue, creep or thermomechanical analysis. When such conditions are detected,
the report cannot claim the part is fit for the full service scenario.

## 6. Input data and material

Each value stores a unit, a source, a status and applicability. Statuses:
measured, found in a source, derived, accepted as an assumption, unknown.
A derived value contains references to its input data and how it was obtained.
Model confidence is not a probability that the structure will not fail.

Public units: millimetres, newtons, kilograms for mass, megapascals,
degrees and degrees Celsius. Mass is not taken as force without an explicit conversion.
The calculation module has one internal unit system, documented in the passports.

A material set contains a specific product, the source of its mechanical
properties, the conditions they were determined under, temperature limits and
their match to the print conditions. It is linked to the printer profile, the
orientation and the available manufacturing settings. To work without
Workbench, the MCP receives and stores the set itself; an optional adapter can
read an existing profile.

The name "PLA" or a nozzle temperature setting does not by itself give allowable
stresses. Properties of another specimen or process are not marked as confirmed
for the current part. Unknown properties lead to a data request, a conditional
range or a proposal to test a specimen.

Allowable deflection and the safety-margin rule are set explicitly and explained
to the user. No universal hidden safety factor is used. For an input range, the
tool shows how the result bounds were obtained; simply evaluating several points
is not called a proven worst-case estimate.

## 7. Result contracts and CAD binding

A calculation task contains the goal, loading and support conditions, the
material, criteria, the method ID and the linked Plasticity elements, if any.
Before construction, dimensions have the source "candidate", not "measured geometry".

A result contains the method version, an input hash, calculated quantities, the
governing criterion, verified assumptions, unverified components and one of the statuses:

- `needs-input`: required data is missing;
- `unsupported`: the case is outside the implemented method;
- `conditional`: the estimate depends on unconfirmed assumptions;
- `pass`: all checked criteria are met within the explicitly stated calculation scope;
- `fail`: at least one checked criterion is not met.

A CAD-bound result also stores the session, document, revision, selected bodies
and the source of each dimension read. A change of the document, geometry or
inputs makes the result `stale`; the old report stays in the history but is not
shown as a current check.

A native bbox does not prove a constant section or the absence of holes. A
verifiable binding for the initial methods needs a separate bounded analysis of
the exact geometry; when the match cannot be proven, the method does not get the
`pass` status on the current body. A mesh bbox is acceptable only for orientation.

Plasticity Undo/Redo does not automatically roll back external input data. After
any such change, the MCP rereads the state and determines again whether the
report is current. The journal does not become a second CAD.

## 8. Codex API and instructions

The local Codex App Server is used over stdio with authorisation configured by
the user. No custom network endpoint is required. A shared transport is
extracted from Workbench only to the extent both clients need it.

Before development, the schemas of the installed Codex version and a live call
are checked: text, a local image, receiving the final response and validating it.
The turn/completed status by itself does not mean the analysis succeeded. An
error, an interruption and an invalid response structure are distinguished explicitly.

The analysis call gets no tools for changing Plasticity, printing or calling
itself again. This restriction is enforced by configuring the available
capabilities, not by a single instruction in the prompt. If the installed API
cannot provide such isolation, the integration stops with a concrete
description of the obstacle.

The call receives only explicitly passed images, text, sources and a geometry
summary. The full chat and the user's directory are not passed automatically.
The model is chosen from those available in the current configuration; there is
no hard-coded model name. A time limit and a limit on the number of internal
calls are set. Recursive launching of analysis tasks is forbidden.

An error or timeout is returned to the main agent; there is no automatic paid
retry. The live check must confirm that the child job terminates and that no
background call is left running.

The MCP ships prompts/resources: collecting conditions, image analysis, the
clarification tree, method selection, material selection, reading the result,
change approval and error recovery. The key restrictions are also included in
the tool descriptions, because a client may not load a separate prompt.

## 9. Approval and delegation

A logical package describes the goal, the current document revision, exact
parameters, the expected changes and the checks. The main agent shows the
package in the chat. The user accepts it, rejects it or changes the conditions.

"Давай сам" ("go ahead yourself") authorises only the named assignment with its
limits. Delegation ends on completion, cancellation or revocation. It is not
restored automatically after a restart. A change of the task by the user
requires the assignment's limits to be reviewed. A manual CAD edit requires the
current state to be reconciled before continuing; old parameters are not applied blindly.

In the first calculation stage this is a policy of the main agent, provided
through MCP instructions. The server cannot prove human approval from an
`approved=true` passed by the agent; such a record must not be presented as
independent protection. The new analysis and calculation tools do not change CAD
themselves. A server-side permission mechanism covering all existing CAD commands
would need a separate compatibility specification, if it is ever needed.

A package can consist of several native history steps. It does not promise one
atomic transaction or a single Undo. On failure, confirmed steps are kept; when
the outcome is uncertain, the existing reconciliation applies, without retry or rollback.

## 10. Storage and module boundaries

The MCP stores separate versioned records of conditions, sources and
calculations in its local working directory. Workbench and its SQLite are not
required. Records do not store Codex authorisation and are not executed as code.
After a restart an old report can be read, but its old CAD binding does not
become current.

Separation of responsibilities:

- Codex adapter: call lifecycle and response validation;
- task contracts: inputs, sources, units and unknowns;
- method catalogue: applicability and reproducible computation;
- geometry adapter: exact dimensions and revision binding;
- report store: reproducibility and currency;
- MCP registration and instructions: public use.

Numerical formulas and image processing are not added to the already large
`operations.ts` or `recipes.ts`. Changes to their structure are allowed only
for a specifically required integration.

## 11. Acceptance

1. The passports of both methods are checked against primary sources; numerical
   tests use independent reference values, not a copy of the implementation formula.
2. Units, axes, signs, invalid inputs, ranges and non-applicability are tested.
3. Missing material properties or conditions do not produce an unconditional `pass`.
4. A real MCP client calls the analysis through the Codex API and gets a structured
   response and a report. Invalid response, refusal, interruption and timeout are tested.
5. An unscaled photo does not produce "exact" dimensions. Questions build on known
   answers; a fact found earlier is not requested again without reason.
6. In a dedicated Plasticity document, after approval, a simple rectangular
   member is built. Its size is chosen by calculation and read back from the
   B-Rep with a control tolerance of 0.01 mm; the calculation is repeated on that result.
7. A manual section change, Undo/Redo and a document switch make the previous
   conclusion out of date until it is checked again. A geometrically unsuitable
   part is rejected even when its bbox matches.
8. The whole scenario runs without Workbench; confirmations stay in the chat.
9. The report shows exactly what was checked. An idealised support and
   unverified joints do not turn into a confirmation of the whole product.
10. Existing Plasticity MCP/Workbench tests and operations do not regress.

Automated and live checks confirm the implementation of the calculation method
and the integration. The physical properties of a specific print and the real
load capacity of the part are not considered experimentally confirmed without a
separate test.

## 12. Next step

After the user reviews this specification, an implementation plan is written.
The first items of the plan will be checking the Codex API capabilities and
preparing the calculation method passports. Approval of this specification does
not mean approval of the not-yet-written plan or the start of changes to the
product code.
