import sys
from pathlib import Path

# Add the root directory to the python path so imports work correctly
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.app.main import app
