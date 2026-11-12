# Stride Lab

Browser-based running movement research prototype. Static ES modules; no build step, server upload, API key, or database. Files remain in browser memory and are discarded on refresh. Third-party requests load Google fonts, pinned MediaPipe 0.10.32 code/WASM (jsDelivr), with Google's heavy pose model served locally from dist/models. This is not fully offline software.

## Run

```sh
cd stride-lab
npm run dev
# http://localhost:5173
npm test
```

Choose side, front, and/or rear clips. Normal-speed H.264 MP4 is recommended; actual MOV/HEVC support depends on the browser. Maximum 300 MB per clip; full duration sampled at 30 Hz. Clips under 5 seconds are rejected. Analysis uses GPU with CPU fallback, supports cancellation, displays landmarks, and exports JSON observations with research links.

## Scope and scientific limits

The prototype estimates side-view cadence from signed ankle-separation periodicity, projected median torso tilt, and front/rear projected pelvis-line tilt. Pixel aspect ratio is accounted for. Quality gates require 80% usable frames and at least 150 usable samples. Cadence needs an uninterrupted section, strong autocorrelation, and opposite half-cycle correlation. These are engineering heuristics, not validated clinical accuracy thresholds. Short gaps suppress cadence rather than compressing the timeline. Fixed camera alignment and user-selected view are assumed, not detected. A non-running rhythmic movement could still satisfy the heuristic. No automated action classifier is included.

No oxygen-cost model, running economy score, injury probability, contact time, force estimate, or calibrated 3D reconstruction is claimed. Different recordings are analyzed independently, not triangulated. No automatic "ideal" cadence or foot-strike correction. Recommendations are deterministic evidence-linked explanations, not an LLM interpretation. The optional calculator computes oxygen cost from user-supplied steady-state relative VO2 and speed: VO2 × 60 / km/h.

## Research reviewed 2026-11-10

- Van Hooren et al., 2024 systematic review/meta-analysis: https://pubmed.ncbi.nlm.nih.gov/38446400/ — observational associations do not establish effects of changing form.
- 2026 OpenCap running kinematics validity/reliability study: https://pubmed.ncbi.nlm.nih.gov/41418503/ — another system's validation must not be transferred to this prototype.
- Patoz et al., October 2026 narrative review: https://link.springer.com/article/10.1186/s40798-026-01120-y — challenges universal cadence and foot-strike prescriptions. Lower evidence tier than a systematic review.
- Implementation reference: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js

This is a focused evidence review, not an exhaustive systematic search through 2026.

## Validation needed before product claims

Collect consented running clips paired with manual step counts and reference kinematics across speeds, views, clothing, body types and devices. Quantify failure rates and measurement error on held-out runners. Any metabolic prediction needs paired steady-state gas-exchange data, participant-level separation of training/validation data, comparison against a speed-only baseline, calibration and external validation. No such dataset or model is included.

Unit tests cover cadence frequency/harmonics, poor and discontinuous signals, insufficient landmarks, aspect-ratio geometry, view restrictions, and unit conversion. Browser QA is recorded in QA.md. Real runner accuracy remains unvalidated.

## Local validation-data export

After a completed analysis, expand **Export data for model validation**. The JSON contract (`stride-lab.pose-session`, version 1) includes the pinned extractor, requested sample timestamps, normalized landmark coordinates/visibility, dimensions, quality observations, and speed/surface captured when analysis started. It excludes video bytes, original filenames, and blob URLs. It is still movement data and should be shared deliberately.

Lab values are **not** training labels by default. To attach one, enter a pseudonymous runner code, valid VO2, and explicitly confirm that the clips and VO2 belong to the same steady-state trial. The captured speed is used and shown in the panel. Changing the standalone speed calculator cannot retroactively change analysis context. Labels remain user-attested, not independently verified. Across trials, use the same runner code so eventual model evaluation can split by runner rather than leaking that runner's clips across train/test sets. Exports do not train or validate a model by themselves.

## Economy model feasibility audit (2026-11-10)

- Folland et al. (2017): https://pmc.ncbi.nlm.nih.gov/articles/PMC5473370/ — a laboratory regression uses stance-specific pelvis/knee/velocity measures from 3D motion capture. The current 2D median torso angle and cadence are not interchangeable inputs. Reusing reported associations as prediction coefficients would be invalid.
- Vision-based multimodal energy expenditure estimation (2025): https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2025.1666616/full — shows a research route using skeleton sequences, with raw data offered by the authors on request. Follow-up inspection located the public E3V-K5 video/JSON-label dataset (Apache-2.0 declared on its card), but no downloadable checkpoint validated for this app. General exercise energy expenditure performance is not equivalent to validated individual running-economy predictions.
- SwRI announcement (2026-06-23): https://www.swri.org/newsroom/press-releases/swri-st-mary-s-university-improve-metabolic-cost-prediction-using-enable-technology — describes ongoing metabolic prediction research, not a deployable validated checkpoint for this product.

Remaining requirement: acquire an appropriately licensed, applicable model with external validation, or acquire consented paired running video/gas-exchange data and train/evaluate one. A baseline-only speed equation would not meet the requested individualized video-based economy estimate. No external source-code publication or athlete-data transfer is authorized; keep development and recordings local.

Public dataset inspection: `research/inspect_dataset.py` read only the ZIP central directory (about 2.8 MB), and `research/read_labels.py` fetched JSON annotations without downloading the video archive or deserializing pickle. `research/audit_labels.py` found 6,759 labelled running clips across 20 participant codes, with 12/5/3 running participants in train/validation/test and no participant overlap. These released running counts differ from aggregate article descriptions. Every annotation path was found in the archive. Labels are kcal/min, not oxygen uptake; there is no explicit speed field. Protocol speed mappings and steady-state eligibility need verification before treating labels as running economy. Audit output is `research/label-audit.json`. No model is trained or shipped yet.


## Pace and heart-rate pilot

The UI now accepts optional average heart rate (30–240 bpm) alongside speed. Use settled HR at the recorded pace, not an average for an entire workout. Context is captured immutably when analysis starts and preserved in local exports. It does not create a metabolic label. A preview-loading guard prevents competing video selections and analysis while a clip is loading.

`research/pilot.py` selected 46 side-view clips across participant-separated source splits, downloaded about 41 MB of video, and extracted 300 frames each with MediaPipe full 0.10.32. `research/evaluate_pilot.py` rejected 15 clips at its quality gate, leaving 31. The validation-selected context-plus-pose ridge model had a test runner-averaged relative error of 40.0%, compared with 17.5% for context without pose. Only three test runners were available. No weights were integrated into the app.

After the user confirmed speed and HR are available, `research/evaluate_multimodal.py` evaluated pace/HR and optional profile inputs against gross energy cost in kcal/kg/km. It uses nested leave-one-runner-out folds, runner-weighted fitting and evaluation, and excludes missing/implausible HR (outside 30–240 bpm). The corrected evaluation has 2,334 windows from 18 runners. Pace plus HR gives 23.0% runner-averaged relative error, versus 23.6% for pace alone; worst-runner mean relative error is 79.9%. This does not support a useful personalized economy claim. These are exploratory results from one dataset, not external validation or calibrated uncertainty bounds.

Speed is inferred from the published protocol: men 8/10/12 km/h and women 7/9/11 km/h for slow/medium/fast. Original workbook metadata confirmed one example of each sex code (0 male, 1 female). In the inspected raw workbook, GPS/marker speed fields are zero and cannot be used as treadmill-speed measurements. Nominal 300–1500-second exercise windows do not independently establish metabolic steady state. Equal timestamps across different camera files can have differing metabolic labels, so the evaluation uses one prespecified side view per runner/intensity and does not assume synchronized views.

Research outputs: `research/pilot-evaluation.json`, `research/multimodal-evaluation.json`, and `research/reproducibility.json`. The temporary Python environment is `/tmp/stride-lab-research-env`; package versions are recorded in `research/research-requirements.lock.txt`. Eight original app tests plus four context tests pass, along with three research-feature tests. New browser verification is blocked by the browser approval service's workspace-credit error. The existing user-started local server was not stopped.

Remaining work includes testing the user's actual videos, validating event-level gait observations, and obtaining a model/data combination that adds credible personal economy information beyond a pace baseline. No economy score, percentage improvement, or injury-risk claim is currently supported.


## Technique report for recreational runners (2026-11-12)

The report evaluates torso and each leg separately, so an obscured far leg no longer discards a clear visible-leg rhythm or torso observation. It includes estimated cadence from one continuous leg signal, projected torso-angle distribution, and a visible-knee angle distribution. Each finding links to a representative video time, explains its practical use and limits, and provides a next check.

A next-run plan supports a repeatable baseline and an optional modest cadence experiment after manual verification. Comfort and perceived effort are self-reported, not inferred. Explicitly saved baselines stay in browser localStorage; no video or pose coordinates are saved there. Comparisons require matching view, recorded speed within 0.2 km/h, and surface. Click Update comparison after entering a new effort rating. Report JSON and browser print/PDF are available.

Commercial readiness remains unproven: no customer has yet validated usefulness or willingness to pay. Measurements are still experimental, and a coach-reviewed set of real recreational-runner clips is needed before claiming personalized corrective accuracy.
