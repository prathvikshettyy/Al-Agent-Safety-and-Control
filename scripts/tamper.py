import os
import sys

target = os.path.join(os.path.dirname(__file__), "..", "agentguard", "scripts", "tamper.py")
os.system(f'py "{target}" {" ".join(sys.argv[1:])}')
