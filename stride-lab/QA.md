# Validation — 2026-11-10

- `npm test`: 5/5 passing. Tests include 120–220 spm signals; global autocorrelation harmonic bug found and fixed.
- `node --check dist/app.js`: passed.
- Browser: rendered at 1440 × 1000 and 390 × 844; layout inspected, no observed overflow in the primary workspace.
- Actual pinned MediaPipe 0.10.32 WASM and model loaded successfully in the browser.
- A generated 6-second H.264 no-person clip was selected through the file chooser and analyzed. Result: 0% usable frames, no invented metrics, recording-improvement advice.
- JSON export downloaded and was read back; contained quality failure and null cadence/angles.
- Lab calculator UI: 35 mL/kg/min at 10 km/h produced 210 mL/kg/km.
- Final sampling loop adjusted to include 150 samples for a 5-second clip; syntax and unit tests rerun. A second browser test with an exactly 5-second H.264 clip completed successfully and correctly returned 0% usable frames.
- Real runner video and measurement accuracy have not been validated. No user footage was supplied. Safari/iOS/Android native devices, HEVC support, CPU fallback, offline failure, and multi-clip runtime performance remain unverified.

The screenshot `preview.jpg` records the desktop empty state, not an analyzed athlete.

## Validation export increment

- 8/8 unit tests pass; JavaScript syntax check passes.
- Validation contract tests verify absence of filenames/blob URLs, preservation of missing frames and 33 landmarks, explicit lab attestation, retained raw lab inputs, unit conversion, and rejection of incomplete/invalid pairing.
- Analysis context is captured at analysis start instead of relabelling an earlier video when standalone calculator inputs change.
- Browser check of new validation panel: analyzed a five-second no-person fixture and downloaded the unlabelled dataset JSON. Readback verified 150 null-pose samples, captured 10 km/h context, and a null lab label. No server upload occurred.
- Public E3V-K5 training fixture smoke test: 10-second real side-view running clip, 299/300 frames returned landmarks, rounded UI usable coverage 100%, projected torso tilt 12.5°. Cadence was conservatively withheld because the signal failed the opposite-half-cycle gate. This is a functional test on one clip, not a measurement-accuracy validation. Pose export was downloaded for analysis at research/data/fixture-poses.json.
- Public label audit: 6,759 running clips / 20 participant codes; 12/5/3 participants in provided train/valid/test splits; no participant overlap or missing annotated archive paths. No estimator has yet been fitted.


## Pace/HR and research evaluation increment

- Project moved to `/Users/ad_workstation_56/yaro/running-economy/stride-lab`; existing files reused.
- Fixed asynchronous preview-loading race with a shared loading guard.
- Added optional HR input and immutable validated context. Twelve app tests and three research-feature tests pass; syntax checks pass.
- Pose pilot: 46 clips extracted, 31 included. Validation-selected model did not beat its baseline on three test runners. Details in `research/pilot-evaluation.json`.
- Pace/HR pilot: corrected missing zero-HR handling, retained one prespecified view instead of merging unequal cross-view metabolic labels. Nested runner-separated evaluation over 2,334 windows / 18 runners produced 23.0% mean runner-relative error and 79.9% worst-runner error. No estimator deployed.
- Original gas-exchange workbooks read without modification. Confirmed units and one example of each sex code; treadmill speed remains inferred from protocol.
- Latest browser check could not execute: automatic browser approval reported workspace credits exhausted. This is not a test pass. Existing local server returned HTTP 200 and was left running because this turn did not own it.


## Leg alignment correction — 2026-11-11

- Replaced full with official MediaPipe heavy model (float16 version 1), bundled locally. Reset temporal model state between views and analysis runs.
- Display refresh uses presented video frame timestamps. Full clip sampling replaces the previous 20-second limit. Longest continuous quality segment now uses a linear scan.
- Low-visibility but geometrically plausible positions are displayed in dashed amber; metric gating remains at 0.65. No coordinates are repositioned by the renderer.
- Same 10-second treadmill fixture analyzed in the in-app browser: 300/300 frames with poses, 0 frames with rejected leg chains in visualization mode. Reviewed all 300 browser-generated frames on 12 contact sheets under research/tracking-review. No prior leg-on-console failure observed; small foot offsets and occluded-knee uncertainty remain. This is visual QA, not ground-truth accuracy validation.
- 16 unit tests pass, covering separate visualization/measurement thresholds and overlay timestamps.
- Full-body measurement coverage is only 6% with the heavy model on this occluded clip; measurements remain withheld. Do not lower measurement gates just to obtain a score.


## Recreational-runner report — 2026-11-12

- 22 unit tests pass, including missing far-leg tolerance, withholding unsupported cadence, evidence timestamps, matched-condition comparisons and missing effort ratings.
- Browser analysis of the same 10-second fixture produced 148 steps/min from the continuously visible leg, 13.2-degree projected torso median, and 119–164-degree central knee-angle range. These are observations, not validated reference measurements.
- Evidence button verified by reading video currentTime = 9.1 seconds. Report styling checked at the browser's narrow viewport (40px metric text).
- Explicit local baseline save/readback showed zero deltas against itself and retained test effort/comfort; test baseline was then cleared. Example speed 10 km/h was entered solely to exercise comparison matching.
- Print/PDF control exists; pagination and PDF output have not yet been visually validated. Latest Update comparison button needs browser verification.
- User selected recreational runners improving comfort and efficiency. Product usefulness and willingness to pay remain untested.
