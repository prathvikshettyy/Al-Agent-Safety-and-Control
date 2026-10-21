import os
import sys
import time
import json
import httpx
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [DemoAgent]: %(message)s")
logger = logging.getLogger("DemoAgent")

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://127.0.0.1:8000")

class AgentClient:
    def __init__(self, agent_id: str = "support-agent-1", agent_key: str = "key-support-secret-1"):
        self.agent_id = agent_id
        self.agent_key = agent_key
        self.headers = {
            "Content-Type": "application/json",
            "X-Agent-Key": self.agent_key
        }

    def execute_tool(self, tool: str, args: dict, task_context: str) -> dict:
        """Submits a tool call to the AgentGuard Gateway and handles pending approval polling."""
        payload = {
            "agent_id": self.agent_id,
            "task_context": task_context,
            "tool": tool,
            "args": args
        }
        logger.info(f"Submitting action to gateway: Tool '{tool}' with args {args}")

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(f"{GATEWAY_URL}/v1/execute", json=payload, headers=self.headers)
                
                if resp.status_code == 403:
                    logger.error(f"Action REJECTED by Gateway (403): {resp.text}")
                    return {"status": "forbidden", "error": resp.json().get("error")}
                if resp.status_code == 429:
                    logger.error(f"Action RATE LIMITED by Gateway (429): {resp.text}")
                    return {"status": "rate_limited", "error": resp.json().get("error")}
                if resp.status_code != 200:
                    logger.error(f"Gateway HTTP error {resp.status_code}: {resp.text}")
                    return {"status": "error", "error": resp.text}

                data = resp.json()
                decision = data.get("decision")
                action_id = data.get("action_id")
                status = data.get("status")

                logger.info(f"Gateway returned: Decision={decision}, Status={status}, ActionID={action_id}")

                if decision == "ALLOW":
                    logger.info(f"[SUCCESS] Action ALLOWED and executed: {data.get('result')}")
                    return data

                if decision == "BLOCK":
                    logger.warning(f"[BLOCKED] Action BLOCKED by policy: {data.get('reason')}")
                    return data

                if decision == "ESCALATE":
                    logger.info(f"[ESCALATED] Action ESCALATED for human review. Status is 'pending'. Polling gateway...")
                    # Poll for human approval (timeout after 15 seconds for automated demo)
                    start_time = time.time()
                    while time.time() - start_time < 20:
                        time.sleep(2)
                        poll_resp = client.get(f"{GATEWAY_URL}/v1/actions/{action_id}")
                        if poll_resp.status_code == 200:
                            poll_data = poll_resp.json()
                            curr_status = poll_data.get("status")
                            if curr_status in ("executed", "approved"):
                                logger.info(f"[APPROVED] Human approved action {action_id}! Result: {poll_data.get('result')}")
                                return poll_data
                            elif curr_status in ("denied", "expired"):
                                logger.warning(f"Action {action_id} was {curr_status.upper()} by reviewer.")
                                return poll_data
                            else:
                                logger.info(f"Awaiting human approval in dashboard (status={curr_status})...")
                    logger.info(f"Polling ended. Action {action_id} remains pending approval.")
                    return data

        except Exception as e:
            logger.exception(f"Network error connecting to AgentGuard Gateway: {e}")
            return {"status": "connection_error", "error": str(e)}

if __name__ == "__main__":
    agent = AgentClient()
    print("AgentClient ready. Use scenarios.py to run live demonstrations.")
