"""OpenAI Codex CLI rollout JSONL -> lab ledger.

Input contract (`~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`, one JSON object
per line). Field names verified against the reference decoder in letta-ai/trajectory
(`src/adapters/codex/`, bundled in the `agent-trajectory` wheel as
`trajectory/_vendor/trajectory-cli.mjs`), which is the only machine-readable spec we
could find for this format:

  {"type": "session_meta",  "timestamp": ..., "payload": {"id", "timestamp", "cwd",
                                                          "git": {"branch", ...},
                                                          "originator", "cli_version", "instructions"}}
  {"type": "turn_context",  "payload": {"cwd", "model", "approval_policy",
                                        "sandbox_policy", "effort", "summary"}}
  {"type": "event_msg",     "payload": {"type": "agent_reasoning", "text": ...}}
  {"type": "response_item", "payload": {"type": "message", "role", "content": [blocks]}}
  {"type": "response_item", "payload": {"type": "function_call", "call_id", "name",
                                        "arguments": "<json string>"}}
  {"type": "response_item", "payload": {"type": "function_call_output", "call_id",
                                        "output": str | {"output": str, ...} | [blocks]}}
  plus "custom_tool_call" / "custom_tool_call_output", "web_search_call",
       "tool_search_call" / "tool_search_output", "reasoning".

Schema variants we tolerate, because Codex's rollout format has moved more than once:
  * the payload may be flattened onto the record (no `payload` key) — we fall back to the
    record itself;
  * `arguments` may already be a dict rather than a JSON string;
  * `output` may be a string, an object with `output`/`content`, or a content-block list;
  * a bare `{"record_type": ...}` or `{"item": {...}}` envelope is unwrapped;
  * missing `session_meta` (chunked upload) — the session id then comes from the filename.

System-injected user turns (`<environment_context>`, `<user_instructions>`,
`<permissions instructions>`, `<turn_context>`) are dropped, matching the reference
decoder, so the first *real* user message is the one the task id is derived from.

Outcomes: a Codex rollout carries no verdict -> `hidden_pass` is None unless a sibling
`results.json`/`report.json` supplies one. `visible_pass` is the usual heuristic.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Iterator, Optional

from .common import Event, Session, blocks_text, read_jsonl, peek_jsonl
from .claude_code import _sidecar_outcome

NAME = "codex"
DESCRIPTION = "OpenAI Codex CLI rollout JSONL (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl)"
PATTERNS = ["rollout-*.jsonl", "*.jsonl (records with type=session_meta / response_item)"]

INJECTED_PREFIXES = ("<environment_context>", "<user_instructions>",
                     "<permissions instructions>", "<turn_context>")

TOOL_OVERRIDES = {"shell": "bash", "local_shell": "bash", "exec_command": "bash",
                  "container.exec": "bash", "apply_patch": "edit_file",
                  "update_plan": "bash", "view_image": "read_file"}


def sniff(path: str) -> float:
    if os.path.isdir(path) or not path.endswith(".jsonl"):
        return 0.0
    rows = peek_jsonl(path, 40)
    if not rows:
        return 0.0
    types = {r.get("type") for r in rows}
    score = 0.0
    if "session_meta" in types:
        score += 0.55
    if "response_item" in types:
        score += 0.35
    if "turn_context" in types or "event_msg" in types:
        score += 0.15
    if os.path.basename(path).startswith("rollout-"):
        score += 0.1
    if score == 0.0:
        # flattened variant: payloads at the top level
        payload_types = {r.get("payload", {}).get("type") if isinstance(r.get("payload"), dict) else r.get("type") for r in rows}
        if {"function_call", "function_call_output"} & payload_types:
            score = 0.5
    return min(1.0, score)


def _payload(rec: dict) -> dict:
    if isinstance(rec.get("payload"), dict):
        return rec["payload"]
    if isinstance(rec.get("item"), dict):
        return rec["item"]
    return rec


def _args_str(v: Any) -> dict:
    """Codex writes `arguments` as a JSON string; older/newer builds sometimes write a dict."""
    if isinstance(v, dict):
        return v
    if isinstance(v, str) and v.strip():
        try:
            d = json.loads(v)
            return d if isinstance(d, dict) else {"input": d}
        except json.JSONDecodeError:
            return {"input": v}
    return {}


def _output_text(v: Any) -> tuple[str, Optional[bool]]:
    """-> (text, ok). Codex only exposes an authoritative status on some builds
    (`{"output": ..., "success": bool}` / `{"metadata": {"exit_code": n}}`)."""
    if v is None:
        return "", None
    if isinstance(v, str):
        return v, None
    if isinstance(v, list):
        return blocks_text(v), None
    if isinstance(v, dict):
        ok = None
        if isinstance(v.get("success"), bool):
            ok = v["success"]
        meta = v.get("metadata") if isinstance(v.get("metadata"), dict) else {}
        if ok is None and isinstance(meta.get("exit_code"), int):
            ok = meta["exit_code"] == 0
        if ok is None and isinstance(v.get("exit_code"), int):
            ok = v["exit_code"] == 0
        for k in ("output", "content", "text", "stdout"):
            if isinstance(v.get(k), str):
                return v[k], ok
        return json.dumps(v, ensure_ascii=False, default=str)[:4000], ok
    return str(v), None


def parse_file(path: str) -> Optional[Session]:
    rows = read_jsonl(path)
    if not rows:
        return None
    events: list[Event] = []
    cwd = model = session_id = version = branch = ""
    instructions = ""
    approval = sandbox = ""
    temperature = None
    for rec in rows:
        rtype = rec.get("type") or rec.get("record_type") or ""
        p = _payload(rec)
        ts = rec.get("timestamp") or p.get("timestamp") or ""
        ptype = p.get("type") or ""
        if rtype == "session_meta":
            cwd = cwd or (p.get("cwd") or "")
            session_id = session_id or (p.get("id") or "")
            version = version or (p.get("cli_version") or p.get("version") or "")
            g = p.get("git") if isinstance(p.get("git"), dict) else {}
            branch = branch or (g.get("branch") or "")
            if isinstance(p.get("instructions"), str):
                instructions = instructions or p["instructions"]
            if isinstance(p.get("originator"), str) and not version:
                pass
            continue
        if rtype == "turn_context":
            cwd = cwd or (p.get("cwd") or "")
            model = model or (p.get("model") or "")
            approval = approval or (p.get("approval_policy") or "")
            sandbox = sandbox or (str(p.get("sandbox_policy") or "") if p.get("sandbox_policy") else "")
            if isinstance(p.get("temperature"), (int, float)):
                temperature = float(p["temperature"])
            continue
        if rtype == "event_msg":
            if ptype in ("agent_reasoning", "agent_reasoning_delta") and isinstance(p.get("text"), str) and p["text"].strip():
                events.append(Event("reasoning", ts=ts, text=p["text"]))
            continue
        if rtype and rtype != "response_item":
            continue
        # --- response items
        if ptype == "message":
            role = p.get("role")
            text = blocks_text(p.get("content"))
            if role == "user":
                if text.lstrip().startswith(INJECTED_PREFIXES):
                    continue
                events.append(Event("user", ts=ts, text=text))
            elif role == "assistant":
                events.append(Event("assistant", ts=ts, text=text, model=model))
            elif role == "system":
                instructions = instructions or text
            continue
        if ptype == "reasoning":
            txt = blocks_text(p.get("summary") or p.get("content"))
            if txt.strip():
                events.append(Event("reasoning", ts=ts, text=txt))
            continue
        if ptype in ("function_call", "custom_tool_call", "tool_search_call", "web_search_call"):
            if ptype == "custom_tool_call":
                args = {"input": p.get("input") or ""}
                name = p.get("name") or "custom_tool"
            elif ptype == "web_search_call":
                args = {k: v for k, v in p.items() if k not in ("type", "call_id", "status")}
                name = "web_search"
            elif ptype == "tool_search_call":
                args = _args_str(p.get("arguments"))
                name = "tool_search"
            else:
                args = _args_str(p.get("arguments"))
                name = p.get("name") or "function"
            events.append(Event("tool_call", ts=ts, call_id=p.get("call_id") or p.get("id") or "",
                                name=name, args=args, model=model))
            continue
        if ptype in ("function_call_output", "custom_tool_call_output", "tool_search_output"):
            if ptype == "tool_search_output":
                text, ok = json.dumps(p.get("tools") or [], ensure_ascii=False)[:4000], None
            else:
                text, ok = _output_text(p.get("output"))
            events.append(Event("tool_result", ts=ts, call_id=p.get("call_id") or "", text=text, ok=ok))
            continue
    if not events:
        return None
    sid = session_id or _sid_from_name(path)
    # approval_policy / sandbox_policy are the closest thing Codex has to the lab's `policy`
    policy_note = "; ".join(x for x in (f"approval={approval}" if approval else "",
                                        f"sandbox={sandbox}" if sandbox else "") if x)
    sess = Session(source=NAME, session_id=sid, path=path, model=model, cwd=cwd,
                   agent="codex", agent_version=version, events=events,
                   declared_tools=[], system_prompt=instructions, temperature=temperature,
                   extra={"git_branch": branch, "approval_policy": approval, "sandbox_policy": sandbox,
                          "policy_note": policy_note, "tool_overrides": TOOL_OVERRIDES})
    sess.hidden_pass, sess.outcome_source = _sidecar_outcome(path, sid)
    return sess


_ROLLOUT_RE = re.compile(r"rollout-(?:.*?)-([0-9a-fA-F-]{8,})\.jsonl$")


def _sid_from_name(path: str) -> str:
    m = _ROLLOUT_RE.search(os.path.basename(path))
    return m.group(1) if m else os.path.splitext(os.path.basename(path))[0]


def sessions(path: str) -> Iterator[Session]:
    if os.path.isdir(path):
        for dp, dn, fn in os.walk(path):
            dn[:] = [d for d in dn if not d.startswith(".")]
            for f in sorted(fn):
                if f.endswith(".jsonl"):
                    p = os.path.join(dp, f)
                    if sniff(p) >= 0.5:
                        s = parse_file(p)
                        if s:
                            yield s
        return
    s = parse_file(path)
    if s:
        yield s
