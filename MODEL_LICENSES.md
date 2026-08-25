# MODEL_LICENSES.md — Unflatten Offline

No trained model weights are bundled with this application (see
`MODEL_CARD.md`, `MODEL_MANIFEST.json`). There is therefore nothing to
license-clear for redistribution in this build.

This file is kept (rather than omitted) precisely so that a future
contributor adding a real model does not skip the licensing review the
brief's §40 requires — the checklist to fill in at that time is:

- [ ] Inspect the exact license of the model weights (not just the
      training code's license — weights and code are often licensed
      separately).
- [ ] Confirm the license explicitly permits redistribution of the
      weights (or a derivative/fine-tuned/distilled version of them)
      inside a binary application, not just research use.
- [ ] Record required attribution text here, verbatim.
- [ ] Add a real entry to `MODEL_MANIFEST.json` (name, version, source,
      license, SHA-256, precision, runtime backend).
- [ ] Add the entry to `SBOM.json` and `THIRD_PARTY_NOTICES.md`.
