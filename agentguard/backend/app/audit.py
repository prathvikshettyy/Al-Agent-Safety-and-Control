import re
import json
import hashlib
import asyncio
import logging
from typing import Dict, Any, Optional, Tuple
import aiosqlite
from .models import DB_PATH

logger = logging.getLogger("agentguard.audit")

write_lock = asyncio.Lock()

def canonical_json(obj: Any) -> str:
    """Produces deterministic, compact JSON with sorted keys."""
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def redact_sensitive_data(data: Any) -> Any:
    """Recursively redacts credit cards, tokens, passwords, and sensitive keys."""
    if isinstance(data, dict):
        redacted = {}
        for k, v in data.items():
            k_lower = str(k).lower()
            if any(term in k_lower for term in ("card", "pan", "cvv", "secret", "password", "token", "api_key", "auth")):
                redacted[k] = "[REDACTED]"
            else:
                redacted[k] = redact_sensitive_data(v)
        return redacted
    elif isinstance(data, list):
        return [redact_sensitive_data(item) for item in data]
    elif isinstance(data, str):
        # Redact 16-digit card numbers with dashes, spaces or continuous
        card_pattern = r'\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b'
        data = re.sub(card_pattern, "[REDACTED_CARD]", data)
        # Redact bearer tokens or secrets
        token_pattern = r'(?i)\b(bearer\s+[A-Za-z0-9_\-\.]{15,}|sk_[a-zA-Z0-9]{20,})\b'
        data = re.sub(token_pattern, "[REDACTED_TOKEN]", data)
        return data
    else:
        return data

async def append_audit_entry(
    event_type: str,
    agent_id: Optional[str],
    action_id: Optional[str],
    actor: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """Append a tamper-evident audit record to SQLite."""
    clean_payload = redact_sensitive_data(payload)
    payload_str = canonical_json(clean_payload)

    async with write_lock:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            # Read last hash
            cursor = await db.execute("SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1")
            last_row = await cursor.fetchone()
            
            prev_hash = last_row["hash"] if last_row else "GENESIS"
            
            # Form entry fields for hashing
            # Note: seq is autoincrement, next_seq = (last_row['seq'] + 1) if last_row else 1
            next_seq = (last_row["seq"] + 1) if last_row else 1
            entry_dict = {
                "seq": next_seq,
                "agent_id": agent_id or "",
                "action_id": action_id or "",
                "event_type": event_type,
                "actor": actor,
                "payload": clean_payload
            }
            
            raw_data = prev_hash + canonical_json(entry_dict)
            entry_hash = hashlib.sha256(raw_data.encode('utf-8')).hexdigest()
            
            await db.execute("""
                INSERT INTO audit_log (seq, agent_id, action_id, event_type, actor, payload_json, prev_hash, hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (next_seq, agent_id, action_id, event_type, actor, payload_str, prev_hash, entry_hash))
            await db.commit()

            return {
                "seq": next_seq,
                "event_type": event_type,
                "prev_hash": prev_hash,
                "hash": entry_hash
            }

async def verify_chain() -> Dict[str, Any]:
    """Verifies cryptographic integrity of the entire audit chain."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT seq, agent_id, action_id, event_type, actor, payload_json, prev_hash, hash FROM audit_log ORDER BY seq ASC")
        rows = await cursor.fetchall()

    if not rows:
        return {"ok": True, "checked": 0, "first_bad_seq": None, "message": "Audit log is empty."}

    expected_prev = "GENESIS"
    for r in rows:
        seq = r["seq"]
        if r["prev_hash"] != expected_prev:
            return {
                "ok": False,
                "checked": seq - 1,
                "first_bad_seq": seq,
                "message": f"Broken chain pointer at seq {seq}. Expected prev_hash {expected_prev[:12]}..., got {r['prev_hash'][:12]}..."
            }

        try:
            payload_obj = json.loads(r["payload_json"])
        except Exception:
            payload_obj = {}

        entry_dict = {
            "seq": seq,
            "agent_id": r["agent_id"] or "",
            "action_id": r["action_id"] or "",
            "event_type": r["event_type"],
            "actor": r["actor"],
            "payload": payload_obj
        }
        
        raw_data = r["prev_hash"] + canonical_json(entry_dict)
        computed_hash = hashlib.sha256(raw_data.encode('utf-8')).hexdigest()

        if computed_hash != r["hash"]:
            return {
                "ok": False,
                "checked": seq - 1,
                "first_bad_seq": seq,
                "message": f"Tamper detected! Hash mismatch at seq {seq}. Row hash: {r['hash'][:12]}..., Computed: {computed_hash[:12]}..."
            }

        expected_prev = r["hash"]

    return {
        "ok": True,
        "checked": len(rows),
        "first_bad_seq": None,
        "message": f"All {len(rows)} audit log records verified successfully. Chain intact."
    }
