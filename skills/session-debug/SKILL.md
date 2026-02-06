---
name: session-debug
description: Debug and analyze Agent sessions by extracting stored data from JSONL logs. Use when user provides a SESSION_ID and wants to understand what happened during that session.
---

# Session Debug Skill

This skill helps you debug Agent sessions by locating, extracting, and analyzing session log data.

## Overview

Sessions are stored as JSONL files. Each line is a JSON object representing one message in the conversation.

**Trigger:** When user provides a SESSION_ID (e.g., `1376095313496117338`, `agent:tomato:discord:...`)

---

## Step 1: Locate Session Files

Session files are stored in `.deca/sessions/` directories. Search in these locations:

```bash
# Search by partial session ID
find /path/to/project -path "*/.deca/sessions/*" -name "*SESSION_ID*" 2>/dev/null

# Common locations:
# - packages/gateway/.deca/sessions/
# - packages/agent/.deca/sessions/
# - .deca/sessions/
```

**Session Key Format:**
```
agent:{agentId}:{channel}:{namespace}:{...context}:{sessionId}.jsonl
```

Example:
```
agent:tomato:discord:deca:guild:1467737355384258695:1468809337886740541:1376095313496117338.jsonl
```

---

## Step 2: Read Session Data

```bash
# Pretty print all messages
cat "path/to/session.jsonl" | python3 -c "import sys, json; [print(json.dumps(json.loads(line), indent=2, ensure_ascii=False)) for line in sys.stdin]"

# Count messages
wc -l "path/to/session.jsonl"

# Get last N messages
tail -N "path/to/session.jsonl" | python3 -c "import sys, json; [print(json.dumps(json.loads(line), indent=2, ensure_ascii=False)) for line in sys.stdin]"
```

---

## Step 3: Extract Data Fields

### Message Structure

Each message contains these fields:

| Field | Type | Description |
|-------|------|-------------|
| `role` | `"user"` \| `"assistant"` | Who sent this message |
| `content` | `string` \| `ContentBlock[]` | Message content |
| `timestamp` | `number` | Unix timestamp in milliseconds |

### Content Block Types

When `content` is an array, each block has a `type`:

| Type | Fields | Description |
|------|--------|-------------|
| `text` | `text` | Plain text response |
| `tool_use` | `id`, `name`, `input` | Tool call request |
| `tool_result` | `tool_use_id`, `content` | Tool execution result |

### Example: Tool Call Flow

```json
// 1. User message
{"role":"user","content":"list files","timestamp":1770352832521}

// 2. Assistant with tool_use
{"role":"assistant","content":[
  {"type":"text","text":"Let me list the files."},
  {"type":"tool_use","id":"call_abc123","name":"exec","input":{"command":"ls -la"}}
],"timestamp":1770352834815}

// 3. Tool result (role=user, but it's system)
{"role":"user","content":[
  {"type":"tool_result","tool_use_id":"call_abc123","content":"file1.txt\nfile2.txt"}
],"timestamp":1770352835000}

// 4. Final assistant response
{"role":"assistant","content":[
  {"type":"text","text":"Here are the files: file1.txt, file2.txt"}
],"timestamp":1770352836000}
```

---

## Step 4: Generate Debug Report

Use this template to present findings:

```markdown
## 🔍 Session Debug Report

### Session Info
| Field | Value |
|-------|-------|
| **Session ID** | {SESSION_ID} |
| **File Path** | {FILE_PATH} |
| **Agent** | {AGENT_ID} |
| **Channel** | {CHANNEL_TYPE} |
| **Total Messages** | {COUNT} |
| **Time Range** | {START_TIME} → {END_TIME} |
| **Duration** | {DURATION} |

### Message Summary
| # | Time | Role | Type | Preview |
|---|------|------|------|---------|
| 1 | HH:MM:SS | user | text | "First 50 chars..." |
| 2 | HH:MM:SS | assistant | text+tool | "Response..." → exec |
| 3 | HH:MM:SS | user | tool_result | [exec result] |
| ... | ... | ... | ... | ... |

### Tool Calls
| Tool | Input | Duration | Result |
|------|-------|----------|--------|
| exec | `ls -la` | 123ms | ✅ Success |
| read | `file.txt` | 45ms | ✅ Success |
| exec | `rm -rf /` | - | ❌ Rejected |

### Key Observations
- {OBSERVATION_1}
- {OBSERVATION_2}
- {OBSERVATION_3}

### Raw Data (Last 5 Messages)
```json
{PRETTY_JSON}
```
```

---

## Extraction Scripts

### Get Session Statistics

```bash
cat session.jsonl | python3 << 'EOF'
import sys, json
from datetime import datetime

messages = [json.loads(line) for line in sys.stdin if line.strip()]
if not messages:
    print("No messages found")
    sys.exit(0)

user_msgs = [m for m in messages if m["role"] == "user" and isinstance(m["content"], str)]
asst_msgs = [m for m in messages if m["role"] == "assistant"]
tool_uses = []
tool_results = []

for m in messages:
    if isinstance(m.get("content"), list):
        for block in m["content"]:
            if block.get("type") == "tool_use":
                tool_uses.append(block)
            elif block.get("type") == "tool_result":
                tool_results.append(block)

start_ts = messages[0]["timestamp"]
end_ts = messages[-1]["timestamp"]
start_dt = datetime.fromtimestamp(start_ts / 1000)
end_dt = datetime.fromtimestamp(end_ts / 1000)
duration = (end_ts - start_ts) / 1000

print(f"Total Messages: {len(messages)}")
print(f"User Messages: {len(user_msgs)}")
print(f"Assistant Messages: {len(asst_msgs)}")
print(f"Tool Calls: {len(tool_uses)}")
print(f"Tool Results: {len(tool_results)}")
print(f"Start: {start_dt.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"End: {end_dt.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"Duration: {duration:.1f}s")
EOF
```

### List All Tool Calls

```bash
cat session.jsonl | python3 << 'EOF'
import sys, json

for line in sys.stdin:
    if not line.strip():
        continue
    msg = json.loads(line)
    if isinstance(msg.get("content"), list):
        for block in msg["content"]:
            if block.get("type") == "tool_use":
                name = block.get("name", "unknown")
                input_preview = str(block.get("input", {}))[:80]
                print(f"[{name}] {input_preview}")
EOF
```

### Find Errors

```bash
cat session.jsonl | python3 << 'EOF'
import sys, json

for i, line in enumerate(sys.stdin, 1):
    if not line.strip():
        continue
    msg = json.loads(line)
    if isinstance(msg.get("content"), list):
        for block in msg["content"]:
            if block.get("type") == "tool_result":
                content = block.get("content", "")
                if "error" in content.lower() or "failed" in content.lower():
                    print(f"Line {i}: {content[:200]}")
EOF
```

---

## What's NOT Stored (Current Limitations)

| Missing Data | Description |
|--------------|-------------|
| Token usage | input_tokens, output_tokens |
| Model info | Which model/version was used |
| Latency | LLM response time |
| User info | Discord user ID, username |
| Message ID | Original platform message ID |
| Errors | Retry count, failure reasons |

---

## Quick Debug Commands

```bash
# Find all sessions for a specific agent
find . -path "*/.deca/sessions/*" -name "agent%3Atomato%3A*" | head -10

# Get session file size (indicates activity)
ls -lh .deca/sessions/*.jsonl | sort -k5 -h

# Recent sessions (last modified)
ls -lt .deca/sessions/*.jsonl | head -10

# Search for specific content in sessions
grep -l "error" .deca/sessions/*.jsonl
```
