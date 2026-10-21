import os
import pytest
from app.policy import PolicyEngine

@pytest.fixture
def policy_engine():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    policy_path = os.path.join(base_dir, "policies", "default.yaml")
    return PolicyEngine(policy_path)

def test_tool_not_in_allowlist(policy_engine):
    res = policy_engine.evaluate("support-agent-1", "unauthorized.tool", {})
    assert res.decision == "BLOCK"
    assert "tool_not_allowed" in res.rule_ids

def test_unknown_agent(policy_engine):
    res = policy_engine.evaluate("unknown-hacker-agent", "crm.read_customer", {})
    assert res.decision == "BLOCK"

def test_refund_rules(policy_engine):
    # R1 refund cap: amount > 1000 -> ESCALATE
    # R2 refund hard cap: amount > 50000 -> BLOCK
    # 500 -> ALLOW
    res_allow = policy_engine.evaluate("support-agent-1", "payments.refund", {"customer_id": "c_101", "amount": 500})
    assert res_allow.decision == "ALLOW"

    # 4500 -> ESCALATE
    res_esc = policy_engine.evaluate("support-agent-1", "payments.refund", {"customer_id": "c_102", "amount": 4500})
    assert res_esc.decision == "ESCALATE"
    assert "R1_refund_cap" in res_esc.rule_ids

    # 60000 -> BLOCK
    res_block = policy_engine.evaluate("support-agent-1", "payments.refund", {"customer_id": "c_101", "amount": 60000})
    assert res_block.decision == "BLOCK"
    assert "R2_refund_hard_cap" in res_block.rule_ids

def test_email_rules(policy_engine):
    # email to @company.com -> ALLOW
    res_internal = policy_engine.evaluate("support-agent-1", "email.send", {
        "to": "supervisor@company.com", "subject": "Test", "body": "Hello"
    })
    assert res_internal.decision == "ALLOW"

    # external -> ESCALATE
    res_ext = policy_engine.evaluate("support-agent-1", "email.send", {
        "to": "attacker@external.com", "subject": "Exfil", "body": "Secrets"
    })
    assert res_ext.decision == "ESCALATE"
    assert "R3_external_email" in res_ext.rule_ids

def test_destructive_sql_rule(policy_engine):
    # DROP TABLE x -> BLOCK
    res = policy_engine.evaluate("ops-agent-2", "db.query", {"sql": "DROP TABLE mock_customers;"})
    assert res.decision == "BLOCK"
    assert "R5_destructive_sql" in res.rule_ids

def test_bulk_export_rule(policy_engine):
    # limit > 100 -> BLOCK
    res = policy_engine.evaluate("ops-agent-2", "crm.export", {"limit": 150})
    assert res.decision == "BLOCK"
    assert "R4_bulk_export" in res.rule_ids

def test_malformed_rule_fail_closed(policy_engine):
    # Evaluating a corrupt expression safely fails closed to True (triggering rule)
    res = policy_engine._eval_expression("undefined_variable_syntax_### + 99", {})
    assert res is True
