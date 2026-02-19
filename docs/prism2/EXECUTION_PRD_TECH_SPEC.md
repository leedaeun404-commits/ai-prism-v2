# PRISM 2.0 Execution PRD + Tech Spec (Executable Baseline)

## 1) Scope
- Goal: translate idea into shared structure for fast GO/STOP and safe execution.
- Tracks:
1. Screening (fast, shallow)
2. Execution (deep, build-ready)

## 2) Machine-readable Contracts
- Screening field schema: `docs/prism2/screening.fields.schema.json`
- Stage gate rules: `docs/prism2/gate.rules.json`
- Project state machine: `docs/prism2/state.machine.json`
- Approval/audit event schema: `docs/prism2/approval.event.schema.json`

## 3) Gate Policy Summary
1. Screening gate requires required field completion and explicit decision (`go|hold|stop`).
2. Hard-stop recommendation if `risk.severity=high` and `scope.automation_level=publish_or_decide`.
3. Execution entry only from approved `go`.
4. Tech Spec entry only when execution readiness is complete.
5. Freeze requires approver + version snapshot.

## 4) Required Artifacts by Stage
1. Screening: GO/STOP card, risk/cost/KPI hypothesis.
2. Execution: state model, automation policy, risk/ops plan, tech seed.
3. Tech Spec: API list, schema, pipeline, auth/rate limit, error codes, monitoring.
4. Artifacts: 1pager, Execution PRD, Technical Spec export.

## 5) Ownership and Decision
- AI scope: generate/recommend only.
- Final decision: `approver` role only.
- All approvals must emit event matching `approval.event.schema.json`.

## 6) Suggested Next Integration
1. Validate Screening form payload against `screening.fields.schema.json` on submit.
2. Add stage transition validator using `gate.rules.json` + `state.machine.json`.
3. Persist all approval actions as immutable audit events.
4. Block UI tab progression when gate exit conditions are not met.
