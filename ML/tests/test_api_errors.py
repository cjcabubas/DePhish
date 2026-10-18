import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from src.api import main


def test_model_loading_failure_does_not_expose_internal_details(monkeypatch):
    def fail():
        raise RuntimeError("private model path and configuration")

    monkeypatch.setattr(main, "detector", None)
    monkeypatch.setattr(main, "PhishingDetector", fail)
    response = TestClient(main.app).post("/api/classify", json={"text": "hello"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Model artifacts are unavailable. Please try again later."}
