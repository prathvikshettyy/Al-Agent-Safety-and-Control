import os
import sys
import sqlite3
import argparse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from app.models import DB_PATH
from app.audit import canonical_json
import hashlib

def tamper_audit_log():
    if not os.path.exists(DB_PATH):
        print(f"[!] Database not found at {DB_PATH}. Run seed.py first.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT seq, event_type, payload_json, hash FROM audit_log ORDER BY seq DESC LIMIT 1")
    row = cursor.fetchone()

    if not row:
        print("[!] No audit log records found to tamper with.")
        conn.close()
        return

    seq, event_type, payload_json, original_hash = row
    print(f"[*] Found target audit row Seq: {seq}")
    print(f"[*] Original Payload: {payload_json}")
    print(f"[*] Original Hash: {original_hash[:16]}...")

    # Save backup payload
    with open(os.path.join(os.path.dirname(__file__), "last_tamper.bak"), "w") as f:
        f.write(f"{seq}:::{payload_json}")

    # Mutate payload without recomputing hash
    tampered_payload = '{"tampered": true, "unauthorized_change": "Injected malicious payload via direct SQL"}'
    cursor.execute("UPDATE audit_log SET payload_json = ? WHERE seq = ?", (tampered_payload, seq))
    conn.commit()
    conn.close()

    print(f"[!] TAMPER APPLIED to seq {seq}!")
    print(f"[!] Mutated payload to: {tampered_payload}")
    print("[*] Now call GET /api/audit/verify or click 'Verify Chain Integrity' in the dashboard to see tamper detection in action!")

def restore_audit_log():
    bak_file = os.path.join(os.path.dirname(__file__), "last_tamper.bak")
    if not os.path.exists(bak_file):
        print("[!] No backup found to restore.")
        return

    with open(bak_file, "r") as f:
        data = f.read().split(":::")
    seq = int(data[0])
    orig_payload = data[1]

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE audit_log SET payload_json = ? WHERE seq = ?", (orig_payload, seq))
    conn.commit()
    conn.close()
    os.remove(bak_file)
    print(f"[OK] Restored Seq {seq} to original payload: {orig_payload}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit log tamper simulation")
    parser.add_argument("--restore", action="store_true", help="Restore tampered row back to original state")
    args = parser.parse_args()

    if args.restore:
        restore_audit_log()
    else:
        tamper_audit_log()
