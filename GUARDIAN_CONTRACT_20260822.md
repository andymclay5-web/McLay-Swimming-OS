# MSOS Guardian contract — 22 Aug 2026

Guardian is the release gate, not a cosmetic diagnostics page.

1. Every candidate upload/PR must run the complete automated Guardian/regression/package suites in CI.
2. A candidate with any red Guardian, regression, package-integrity, runtime-contract, or known field-state issue must not be merged or called ready.
3. Known field failures must be converted into explicit regression tests before the next release candidate. A known failure cannot be hidden by replacing the full Guardian with a smaller test set.
4. The coaching-phone Guardian may render immediately, but it must report both:
   - full build/package regression status for the current build; and
   - live device-state checks that CI cannot see (identity, roster contamination, selected session, attendance persistence, local storage/hydration).
5. Test/placeholder athletes (for example `Swimmer A`, `Swimmer B`) are forbidden in the production roster. Device Guardian must fail if they are detected. Cleanup may remove them only after the failure is recorded/auditable.
6. Guardian must not silently mutate coaching truth in order to turn a red check green.
7. Physical Android acceptance remains separate from software Guardian and must be completed before release-ready attestation.
