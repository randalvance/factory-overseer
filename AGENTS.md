# Factory Overseer

A 3D factory that shows an agentic system at work. Start with `README.md`
for what it is and how to run it, `GLOSSARY.md` for the vocabulary, and
`docs/adr/` for the decisions that shape the code.

Every project command runs inside the devcontainer:
`devcontainer exec --workspace-folder . <command>`.

## Agent skills

### Issue tracker

Issues and specs live in this repo's GitHub Issues, driven with the gh CLI from inside the devcontainer. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels, each named after its role. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.
