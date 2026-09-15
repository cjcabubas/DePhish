import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.api.rate_limit import RequestBudget, install_rate_limit


def test_budget_resets_and_client_map_is_bounded():
    now = [0]
    budget = RequestBudget(limit=1, window=60, max_clients=2, clock=lambda: now[0])
    assert budget.take('a') == 0
    assert budget.take('a') == 60
    assert budget.take('b') == 0
    assert budget.take('c') == 60
    assert len(budget.clients) == 2
    now[0] = 61
    assert budget.take('c') == 0
    assert budget.take('a') == 0


def test_ml_middleware_limits_across_routes_without_blocking_health():
    app = FastAPI()
    install_rate_limit(app, RequestBudget(limit=1))
    app.get('/api/test')(lambda: {'ok': True})
    app.get('/health')(lambda: {'ok': True})
    client = TestClient(app)
    assert client.get('/api/test').status_code == 200
    response = client.get('/api/other')
    assert response.status_code == 429
    assert int(response.headers['retry-after']) > 0
    assert client.get('/health').status_code == 200
