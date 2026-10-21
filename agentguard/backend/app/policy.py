import os
import re
import yaml
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any
from simpleeval import SimpleEval, NameNotDefined, FunctionNotDefined

logger = logging.getLogger("agentguard.policy")

class DotDict(dict):
    """Allows dot notation access to dictionary attributes with safe None defaults."""
    def __getattr__(self, item):
        val = self.get(item)
        if isinstance(val, dict):
            return DotDict(val)
        return val

    def __getitem__(self, item):
        val = super().get(item)
        if isinstance(val, dict):
            return DotDict(val)
        return val

@dataclass
class Rule:
    id: str
    tool: str
    when: str
    action: str # BLOCK | ESCALATE | ALLOW
    severity: str # low | medium | high | critical

@dataclass
class AgentPolicy:
    role: str
    allowed_tools: List[str] = field(default_factory=list)
    limits: Dict[str, Any] = field(default_factory=dict)
    rules: List[Rule] = field(default_factory=list)
    time_windows: Dict[str, str] = field(default_factory=dict)

@dataclass
class PolicyResult:
    decision: str # ALLOW | BLOCK | ESCALATE
    rule_ids: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)
    severity: str = "low" # low | medium | high | critical

def regex_matches(pattern: str, text: Any) -> bool:
    if text is None:
        return False
    try:
        # Restore regex word boundary tokens if python string literal parsed \b as backspace (\x08)
        clean_pat = pattern.replace('\x08', r'\b').replace(chr(92) + chr(92), chr(92))
        if re.search(clean_pat, str(text)):
            return True
        return bool(re.search(pattern, str(text)))
    except Exception as e:
        logger.warning(f"Regex error for pattern {pattern}: {e}")
        return False

class PolicyEngine:
    def __init__(self, policy_path: str = None):
        if not policy_path:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            policy_path = os.path.join(base_dir, "policies", "default.yaml")
        self.policy_path = policy_path
        self.last_mtime: float = 0.0
        self.agents: Dict[str, AgentPolicy] = {}
        self.default_action: str = "BLOCK"
        self._load_if_changed()

    def _load_if_changed(self):
        try:
            if not os.path.exists(self.policy_path):
                logger.error(f"Policy file not found: {self.policy_path}")
                return
            mtime = os.path.getmtime(self.policy_path)
            if mtime > self.last_mtime:
                self._load_policies()
                self.last_mtime = mtime
                logger.info(f"Loaded policy from {self.policy_path} (mtime {mtime})")
        except Exception as e:
            logger.error(f"Error checking policy mtime: {e}")

    def _load_policies(self):
        with open(self.policy_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        self.default_action = data.get("default", "BLOCK").upper()
        self.agents = {}

        agents_data = data.get("agents", {})
        for agent_id, a_cfg in agents_data.items():
            rules = []
            for r in a_cfg.get("rules", []):
                rules.append(Rule(
                    id=r["id"],
                    tool=r["tool"],
                    when=r["when"],
                    action=r.get("action", "BLOCK").upper(),
                    severity=r.get("severity", "medium").lower()
                ))
            self.agents[agent_id] = AgentPolicy(
                role=a_cfg.get("role", "default"),
                allowed_tools=a_cfg.get("allowed_tools", []),
                limits=a_cfg.get("limits", {}),
                rules=rules,
                time_windows=a_cfg.get("time_windows", {})
            )

    def _eval_expression(self, expr: str, args_dot: DotDict) -> bool:
        """Safely evaluates rule 'when' expressions without using raw eval."""
        # Normalize custom 'matches' operator: e.g., 'args.sql matches "pattern"' -> 'matches("pattern", args.sql)'
        matches_pattern = re.compile(r'([a-zA-Z0-9_.]+)\s+matches\s+([\'"].*?[\'"])')
        def _repl(m):
            return f"matches({m.group(2)}, {m.group(1)})"
        normalized_expr = matches_pattern.sub(_repl, expr)

        s = SimpleEval()
        s.names = {
            "args": args_dot,
            "len": len,
            "str": str,
            "int": int,
            "float": float,
            "bool": bool,
            "matches": regex_matches,
        }
        s.functions = {
            "len": len,
            "matches": regex_matches,
            "str": str,
            "int": int,
            "float": float,
            "bool": bool,
        }

        try:
            res = s.eval(normalized_expr)
            return bool(res)
        except Exception as e:
            logger.warning(f"Error evaluating rule expression '{expr}': {e}. Failing closed to True.")
            # Fail closed: expression error triggers the rule
            return True

    def _check_time_window(self, window_str: str) -> bool:
        """Format: 'HH:MM-HH:MM' or 'HH:MM-HH:MM TimeZone'. Returns True if within window."""
        try:
            parts = window_str.split()
            times = parts[0].split("-")
            start_t = datetime.strptime(times[0].strip(), "%H:%M").time()
            end_t = datetime.strptime(times[1].strip(), "%H:%M").time()
            now_t = datetime.now().time()
            if start_t <= end_t:
                return start_t <= now_t <= end_t
            else:
                # crosses midnight
                return now_t >= start_t or now_t <= end_t
        except Exception as e:
            logger.warning(f"Error parsing time window '{window_str}': {e}")
            return True

    def evaluate(self, agent_id: str, tool: str, args: Dict[str, Any]) -> PolicyResult:
        self._load_if_changed()

        if agent_id not in self.agents:
            return PolicyResult(
                decision=self.default_action,
                reasons=[f"Agent '{agent_id}' has no configured policy."],
                severity="critical"
            )

        agent_policy = self.agents[agent_id]
        dot_args = DotDict(args or {})

        # 1. Tool allowlist
        if tool not in agent_policy.allowed_tools:
            return PolicyResult(
                decision="BLOCK",
                rule_ids=["tool_not_allowed"],
                reasons=[f"Tool '{tool}' is not in allowed_tools for agent '{agent_id}'."],
                severity="high"
            )

        # 2. Check time window if specified for tool
        if tool in agent_policy.time_windows:
            window = agent_policy.time_windows[tool]
            if not self._check_time_window(window):
                return PolicyResult(
                    decision="BLOCK",
                    rule_ids=["time_window_violation"],
                    reasons=[f"Action on '{tool}' outside allowed operating window ({window})."],
                    severity="high"
                )

        # Separate rules into hard BLOCK and ESCALATE
        block_rules = [r for r in agent_policy.rules if r.tool == tool and r.action == "BLOCK"]
        escalate_rules = [r for r in agent_policy.rules if r.tool == tool and r.action == "ESCALATE"]

        # 3. Hard BLOCK rules
        for r in block_rules:
            if self._eval_expression(r.when, dot_args):
                return PolicyResult(
                    decision="BLOCK",
                    rule_ids=[r.id],
                    reasons=[f"Violated hard block rule {r.id}: {r.when}"],
                    severity=r.severity
                )

        # 4. ESCALATE rules
        for r in escalate_rules:
            if self._eval_expression(r.when, dot_args):
                return PolicyResult(
                    decision="ESCALATE",
                    rule_ids=[r.id],
                    reasons=[f"Triggered escalation rule {r.id}: {r.when}"],
                    severity=r.severity
                )

        # 5. Passed all rules
        return PolicyResult(
            decision="ALLOW",
            rule_ids=[],
            reasons=["All policy checks passed."],
            severity="low"
        )

# Global singleton engine
policy_engine = PolicyEngine()
