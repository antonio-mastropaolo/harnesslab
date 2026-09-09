"""Claude Code session JSONL -> lab ledger.

Input contract (`~/.claude/projects/<project-slug>/<sessionId>.jsonl`, one JSON object
per line). What we rely on, verified against the reference decoder in
letta-ai/trajectory (`src/adapters/claude-code/`, bundled in the `agent-trajectory`
wheel as `trajectory/_vendor/trajectory-cli.mjs`) and against real session files:

  record.type        "user" | "assistant" | "summary" | plus transport rows we skip
                     ("progress", "queue-operation", "file-history-snapshot", "summary",
                      "system", "pr-link", "last-prompt", "custom-title", "ai-title",
                      "agent-name", "permission-mode", "attachment", "mode")
  record.uuid        line identity; record.parentUuid links a line to its predecessor
  record.timestamp   ISO-8601
  record.cwd         working directory (present on conversational rows)
  record.version     the Claude Code CLI version -> harness version
  record.sessionId   session identity
  record.gitBranch   branch, when known
  record.isSidechain true on subagent (Task) rows
  record.message     an Anthropic Messages API message:
      .role, .model (assistant only), .usage (assistant only),
      .content: str | [ {type:"text",text} | {type:"thinking",thinking}
                      | {type:"tool_use",id,name,input}
                      | {type:"tool_result",tool_use_id,is_error,content} ]

Tool mapping (see common.TOOL_MAP): Bash -> bash, Read/NotebookRead -> read_file,
Edit/MultiEdit/NotebookEdit -> edit_file, Write -> write_file, Grep/Glob/LS -> list_files,
Task -> bash (an opaque subagent unit), WebFetch/WebSearch/TodoWrite/mcp__* -> bash.

Sidechain handling follows the reference decoder: if the file contains *only* sidechain
conversational rows it is a standalone subagent transcript and we import it as the
conversation; otherwise sidechain rows are dropped so a Task subagent's steps are not
double-counted inside its parent.

Outcomes: a Claude Code session carries no verdict, so `hidden_pass` is None unless a
sidecar `results.json` / `report.json` next to the file supplies one (see common ­+
`_sidecar_outcome`). `visible_pass` is the usual "last agent-run test looked green".
"""
from __future__ import annotations

import json
import os
import re
from typing import Iterator, Optional

from .common import Event, Session, blocks_text, read_jsonl, peek_jsonl

NAME = "claude_code"
DESCRIPTION = "Claude Code session JSONL (~/.claude/projects/<project>/<session>.jsonl)"
PATTERNS = ["*.jsonl (records with type=user/assistant and message.content blocks)"]

TRANSPORT_TYPES = {"progress", "queue-operation", "file-history-snapshot", "summary", "system",
                   "pr-link", "last-prompt", "custom-title", "ai-title", "agent-name",
                   "permission-mode", "attachment", "mode", "x-anthropic-hook"}


def sniff(path: str) -> float:
    """Confidence that `path` is a Claude Code session file (0..1)."""
    if os.path.isdir(path):
        return 0.0
    if not path.endswith(".jsonl"):
        return 0.0
    rows = peek_jsonl(path, 40)
    if not rows:
        return 0.0
    conv = [r for r in rows if r.get("type") in ("user", "assistant") and isinstance(r.get("message"), dict)]
    if not conv:
        return 0.0
    score = 0.35
    if any("uuid" in r and "parentUuid" in r for r in rows):
        score += 0.3
    if any("sessionId" in r for r in rows):
        score += 0.15
    if any("version" in r and "cwd" in r for r in rows):
        score += 0.15
    if any(r.get("type") == "summary" for r in rows):
        score += 0.05
    return min(1.0, score)


def _content_events(rec: dict, ts: str, model: str) -> Iterator[Event]:
    msg = rec.get("message") or {}
    content = msg.get("content")
    usage = msg.get("usage") or {}
    use = {"input_tokens": int(usage.get("input_tokens") or 0),
           "output_tokens": int(usage.get("output_tokens") or 0)} if usage else {}
    if rec.get("type") == "user":
        if isinstance(content, str):
            if content.strip():
                yield Event("user", ts=ts, text=content)
            return
        texts = []
        for b in content if isinstance(content, list) else []:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_result":
                ok = (not b["is_error"]) if isinstance(b.get("is_error"), bool) else None
                yield Event("tool_result", ts=ts, text=blocks_text(b.get("content")),
                            call_id=b.get("tool_use_id") or "", ok=ok)
            elif b.get("type") == "text" and isinstance(b.get("text"), str):
                texts.append(b["text"])
            elif b.get("type") == "image":
                texts.append("[image]")
        if texts:
            yield Event("user", ts=ts, text="\n".join(texts))
        return
    # assistant
    if isinstance(content, str):
        if content.strip():
            yield Event("assistant", ts=ts, text=content, model=model, usage=use)
        return
    for b in content if isinstance(content, list) else []:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t == "thinking":
            yield Event("reasoning", ts=ts, text=b.get("thinking") or "", model=model)
        elif t == "text":
            yield Event("assistant", ts=ts, text=b.get("text") or "", model=model, usage=use)
        elif t == "tool_use":
            yield Event("tool_call", ts=ts, call_id=b.get("id") or "", name=b.get("name") or "",
                        args=b.get("input") if isinstance(b.get("input"), dict) else {"input": b.get("input")},
                        model=model, usage=use)


def parse_file(path: str) -> Optional[Session]:
    rows = read_jsonl(path)
    if not rows:
        return None
    conv = [r for r in rows if r.get("type") in ("user", "assistant") and isinstance(r.get("message"), dict)]
    if not conv:
        return None
    standalone_sidechain = (all(r.get("isSidechain") is True for r in conv) and
                            any(r.get("isSidechain") is True for r in conv))
    events: list[Event] = []
    cwd, version, session_id, model, branch = "", "", "", "", ""
    agent_id = ""
    for r in rows:
        if r.get("type") in TRANSPORT_TYPES:
            continue
        if r.get("isSidechain") is True and not standalone_sidechain:
            continue                      # subagent steps live in their own transcript
        cwd = cwd or (r.get("cwd") or "")
        version = version or (r.get("version") or "")
        session_id = session_id or (r.get("sessionId") or "")
        branch = branch or (r.get("gitBranch") or "")
        if standalone_sidechain:
            agent_id = agent_id or (r.get("agentId") or "")
        if r.get("type") not in ("user", "assistant") or not isinstance(r.get("message"), dict):
            continue
        m = (r.get("message") or {}).get("model")
        if isinstance(m, str) and m and not model:
            model = m
        events += list(_content_events(r, r.get("timestamp") or "", m if isinstance(m, str) else ""))
    if not events:
        return None
    sid = agent_id or session_id or os.path.splitext(os.path.basename(path))[0]
    sess = Session(source=NAME, session_id=sid, path=path, model=model, cwd=cwd,
                   agent="claude-code", agent_version=version, events=events,
                   declared_tools=[], system_prompt="",
                   task_id_hint="", extra={"git_branch": branch, "standalone_sidechain": standalone_sidechain})
    hp, why = _sidecar_outcome(path, sid)
    sess.hidden_pass, sess.outcome_source = hp, why
    _infer_exit(sess, rows)
    return sess


def _infer_exit(sess: Session, rows: list[dict]) -> None:
    """Claude Code writes no exit status. We only report what the trace shows."""
    txt = " ".join((r.get("message") or {}).get("stop_reason") or "" for r in rows if isinstance(r.get("message"), dict))
    if "max_tokens" in txt:
        sess.exit_status = "max_tokens"


def _sidecar_outcome(path: str, session_id: str) -> tuple[Optional[bool], str]:
    """A verdict only if a sibling `results.json` / `report.json` says so.

    Accepted shapes (all seen in SWE-bench-style eval harnesses):
      {"<id>": {"resolved": true}}      {"resolved": ["<id>", ...]}
      {"resolved": true}                {"<id>": true}
    """
    d = os.path.dirname(os.path.abspath(path))
    stem = os.path.splitext(os.path.basename(path))[0]
    for fn in ("results.json", "report.json", f"{stem}.results.json", f"{stem}.report.json"):
        p = os.path.join(d, fn)
        if not os.path.exists(p):
            continue
        try:
            with open(p, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        for key in (stem, session_id):
            if isinstance(data, dict) and key in data:
                v = data[key]
                if isinstance(v, bool):
                    return v, f"sidecar {fn}"
                if isinstance(v, dict) and isinstance(v.get("resolved"), bool):
                    return v["resolved"], f"sidecar {fn}"
        if isinstance(data, dict) and isinstance(data.get("resolved"), bool):
            return data["resolved"], f"sidecar {fn}"
        if isinstance(data, dict) and isinstance(data.get("resolved"), list):
            return (stem in data["resolved"] or session_id in data["resolved"]), f"sidecar {fn}"
    return None, ""


def sessions(path: str) -> Iterator[Session]:
    """One Session per session file. A directory is walked for `*.jsonl`."""
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
