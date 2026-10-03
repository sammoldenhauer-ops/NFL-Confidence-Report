# Tiny .env loader (no extra dependency). Looks for .env in the repo root or the pipeline folder.
import os
def load_env():
    here = os.path.dirname(os.path.abspath(__file__))
    for p in (os.path.join(here, '..', '.env'), os.path.join(here, '.env')):
        if os.path.exists(p):
            for line in open(p, encoding='utf-8'):
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
