import re
from datetime import datetime
from typing import Dict, Any, List, Tuple

SENSITIVE_TOOLS = {"payments.refund", "crm.export", "db.query"}

def contains_pii(args: Dict[str, Any]) -> bool:
    text = str(args)
    # Check for phone numbers, email patterns, card patterns, ssn
    phone_pattern = r'\b(\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b'
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    ssn_pattern = r'\b\d{3}-\d{2}-\d{4}\b'
    card_pattern = r'\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b'

    return bool(
        re.search(phone_pattern, text) or
        re.search(email_pattern, text) or
        re.search(ssn_pattern, text) or
        re.search(card_pattern, text)
    )

def is_off_hours() -> bool:
    now_hour = datetime.now().hour
    return now_hour < 9 or now_hour >= 18

def calculate_risk_score(
    tool: str,
    args: Dict[str, Any],
    is_first_tool_use: bool = False,
    is_tainted: bool = False
) -> Tuple[int, List[str]]:
    score = 0
    reasons = []

    # 1. Sensitive tool (+30)
    if tool in SENSITIVE_TOOLS:
        score += 30
        reasons.append(f"Sensitive operational tool invoked: '{tool}' (+30)")

    # 2. Large amount threshold (+20)
    amount = args.get("amount") or args.get("total") or 0
    try:
        amount_val = float(amount)
        if amount_val > 1000:
            score += 20
            reasons.append(f"Transaction amount ({amount_val}) exceeds auto-approve threshold 1,000 (+20)")
    except (ValueError, TypeError):
        pass

    # 3. External recipient (+25)
    recipient = args.get("to") or args.get("recipient") or args.get("email") or ""
    if recipient and not str(recipient).endswith("@company.com"):
        score += 25
        reasons.append(f"External recipient outside company domain: '{recipient}' (+25)")

    # 4. Off-hours (+10)
    if is_off_hours():
        score += 10
        reasons.append("Action attempted outside standard business hours 09:00-18:00 (+10)")

    # 5. First use of tool by agent (+10)
    if is_first_tool_use:
        score += 10
        reasons.append(f"First recorded usage of tool '{tool}' by this agent (+10)")

    # 6. PII in arguments (+15)
    if contains_pii(args):
        score += 15
        reasons.append("Customer PII (email, phone, or identity data) detected in tool arguments (+15)")

    # 7. Tainted injection context (+30)
    if is_tainted:
        score += 30
        reasons.append("Active prompt injection taint detected in agent session (+30)")

    final_score = min(100, max(0, score))
    return final_score, reasons
