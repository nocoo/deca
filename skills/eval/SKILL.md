---
name: eval
description: Evaluate Deca prompts by running test cases, judging results manually, and generating reports. Use when testing Agent behavior against IDENTITY.md, SOUL.md, and other prompts.
---

# Eval Skill - Prompt Evaluation Workflow

This skill guides you through evaluating Deca's prompts using the eval system.

## Overview

The eval system tests whether the Agent behaves according to its prompts (IDENTITY.md, SOUL.md, etc.).

**Key Constraint:** LLM (you) judges the results manually. Scripts do NOT use LLM.

## Workflow

```
[1. Run Cases] → [2. Judge Results] → [3. Generate Report]
    (script)        (LLM manual)         (script)
```

---

## Step 1: Run Cases (Script)

Execute test cases against the running Gateway:

```bash
# Ensure Gateway is running on port 7014
# (run from repo root)
bun run dev

cd eval

# Run all cases
bun run runner.ts

# Run single case
bun run runner.ts --case=identity-001

# Custom gateway URL
bun run runner.ts --gateway-url=http://localhost:7014
```

**Output:** `reports/pending-{timestamp}.json`

---

## Step 2: Judge Results (LLM - You)

Read the pending results and fill in judgements.

### 2.1 Load Pending Results

```bash
# List pending files
ls eval/reports/pending-*.json

# Read the latest one
cat eval/reports/pending-{timestamp}.json
```

### 2.2 For Each Result

Review the `input`, `output`, and evaluate against `criteria` from the original case.

The criteria are embedded in cases. Reference:

| Case ID | Criteria Summary |
|---------|-----------------|
| identity-001 | Agent identifies as Tomato, friendly, practical |
| identity-002 | Agent confirms name is Tomato |
| identity-003 | Agent describes itself matching IDENTITY.md |

### 2.3 Fill Judgement

For each result, add a `judgement` object:

```json
{
  "passed": true,
  "score": 85,
  "reasoning": "Agent correctly identified as Tomato with appropriate emoji and friendly tone."
}
```

**Scoring Guide:**
- 90-100: Excellent, exceeds expectations
- 70-89: Good, meets expectations
- 50-69: Partial, some issues
- 0-49: Poor, significant issues

### 2.4 Save Judged Results

Save the modified JSON as `reports/judged-{timestamp}.json`.

**Important:** Copy all metadata fields (`timestamp`, `gitCommit`, `gatewayUrl`, `model`) and add:
- `judgedAt`: Current ISO timestamp
- `judgedBy`: "opencode" (or your model name)

Example structure:

```json
{
  "timestamp": "2026-02-05T12:00:00.000Z",
  "gitCommit": "abc123",
  "gatewayUrl": "http://localhost:7014",
  "model": "claude-3-sonnet",
  "results": [
    {
      "caseId": "identity-001",
      "caseName": "Self-identification",
      "targetPrompt": "IDENTITY.md",
      "category": "identity",
      "input": "Who are you?",
      "output": "I am Tomato, a friendly AI assistant...",
      "durationMs": 1234,
      "quickCheck": {
        "ran": true,
        "passed": true,
        "details": "containsAny: found [Tomato]"
      },
      "judgement": {
        "passed": true,
        "score": 90,
        "reasoning": "Agent correctly identified as Tomato with emoji and friendly tone."
      }
    }
  ],
  "judgedAt": "2026-02-05T12:30:00.000Z",
  "judgedBy": "opencode"
}
```

---

## Step 3: Generate Report (Script)

Generate a markdown report from judged results:

```bash
cd eval
bun run reporter.ts reports/judged-{timestamp}.json
```

**Output:** `reports/report-{timestamp}.md`

---

## Quick Reference

### File Flow

```
pending-2026-02-05T12-00-00-000Z.json  (Runner output)
    | (LLM judges)
judged-2026-02-05T12-00-00-000Z.json   (LLM output)
    | (Reporter)
report-2026-02-05T12-00-00-000Z.md     (Final report)
```

### Available Cases

```bash
# Get case count summary
cd eval && bun -e "import { getCaseSummary } from './cases/index.js'; console.log(getCaseSummary())"
```

**Case Files:**
- `cases/soul.ts` - SOUL.md tests (core principles)
- `cases/identity.ts` - IDENTITY.md tests (name, appearance, personality)
- `cases/agents.ts` - AGENTS.md tests (workspace rules, safety)

**Naming Convention:**
- File: `{prompt-name}.ts` (e.g., `soul.ts`, `identity.ts`)
- Case ID: `{category}-{subcategory}-{number}` (e.g., `soul-authentic-001`)

**Current Cases (31 total):**

| Category | Count | Examples |
|----------|-------|----------|
| soul | 10 | soul-authentic-001, soul-opinion-001, soul-boundary-001 |
| identity | 10 | identity-name-001, identity-image-001, identity-personality-001 |
| agents | 11 | agents-safety-001, agents-external-001, agents-memory-001 |

### Adding New Cases

1. Create or edit file in `eval/cases/` matching the prompt name
2. Follow the `EvalCase` type structure
3. Use naming convention: `{category}-{subcategory}-{number}`
4. Import and add to `eval/cases/index.ts`

**Case Structure:**
```typescript
{
  id: "soul-authentic-001",        // unique ID
  name: "Skip pleasantries",       // human-readable name
  description: "...",              // what this validates
  targetPrompt: "SOUL.md",         // which prompt file
  category: "soul",                // grouping category
  input: "帮我写...",               // message to send
  criteria: "Agent should...",     // evaluation criteria for LLM judge
  quickCheck: {                    // optional code-based checks
    containsAny: ["code"],
    notContains: ["很高兴为你服务"],
  },
  passThreshold: 70,               // score needed to pass
}
```

### Criteria Reference

Load the full case definitions for detailed criteria:

```bash
cat eval/cases/identity.ts
```

---

## Troubleshooting

### Gateway Not Running

```
Error: Connection refused
```

Start the Gateway first (from repo root):
```bash
bun run dev
```

### No Results in Pending

Check if cases are registered:
```bash
cd eval && bun -e "import { allCases } from './cases/index.js'; console.log(allCases.length)"
```

### Quick Check Failed but Output Looks Good

Quick checks are strict string matches. Review the `quickCheck` config in the case definition.

---

## Best Practices

1. **Run fresh** - Start a new Gateway session before eval to avoid context pollution
2. **Be objective** - Score based on criteria, not personal preference
3. **Document reasoning** - Clear reasoning helps future analysis
4. **Version control** - Commit judged results for history tracking
