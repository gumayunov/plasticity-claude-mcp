---
name: plasticity-reference-intake
description: Use when a Plasticity part must be designed from a photo, sketch or drawing, or must fit a named purchased product whose CAD model or datasheet should be found online.
---

# Photos, sketches and product references

Full rules live in the MCP resource `plasticity://design/reference-workflow`; read it before the first analysis in a session.

## Photo or sketch

1. The image must be a file inside a trusted image root: the server's asset root or a directory listed in `PLASTICITY_STRENGTH_IMAGE_ROOTS`. Images pasted into chat are not on disk; ask the user to save them into a trusted directory first.
2. Call `plasticity_analyze_design_reference` with a new `requestId`, the task text, `imagePaths` (up to four PNG/JPEG/HEIC), and empty `evidence` and `answers`. An isolated headless Claude turn with no tools inspects the views and returns observations, interfaces, feature candidates, `scaleStatus` and at most one question.
3. Ask the user that one question. Call again with a new `requestId` and `answers: [{ questionId, question, answer }]`, repeating the full question text.
4. A request that ends in `failed` with `INVALID_ANALYSIS_RESULT` means the server rejected an answer that broke its evidence rules. Rephrase and retry under a new `requestId`; do not reuse the id.

Dimensions: the server accepts a millimetre value only from a dimensioned image (with a locator), a source URL with hash, or a user answer (`sourceLocator: "answer:<questionId>"`). Do not put millimetre numbers in the task `prompt`: they cannot be traced, and the analysis will be rejected. Ask for them as answers instead. An unscaled photo never yields millimetres.

## Named product

1. `plasticity_reference_search_status`, then `plasticity_search_product_references` with `query`, `intendedUse` and, when you know the manufacturer, `allowedDomains`. A headless Claude turn with only WebSearch and WebFetch looks for manufacturer CAD and drawings; every returned URL was present in a search or successfully fetched page.
2. Results are leads. Check `licenseStatus`, `accessStatus` and `limitations` before using any of them. Many manufacturer sites block automated fetches; say so instead of guessing.
3. If a catalog page has no direct asset URL, `plasticity_list_reference_assets` with that page and the same allowed domains lists exact links. Never construct a file URL.
4. Import with `plasticity_download_and_import_step` (exact native CAD) or the reference-mesh importers (approximate). Record which one you used: a mesh is not an exact dimensional source.
