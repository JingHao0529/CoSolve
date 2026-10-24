"""Submission entry point for the existing HTTP sentiment service.

Run from any directory with: python runpod/handler.py
The deployed Dockerfile continues to use the unchanged root app.py.
"""
from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).resolve().parents[1] / "app.py"), run_name="__main__")
