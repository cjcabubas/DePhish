"""Bounded, per-process request limits for direct ML API access."""
import math
import time
from starlette.responses import JSONResponse


class RequestBudget:
    def __init__(self, limit=120, window=60, max_clients=10000, clock=time.monotonic):
        self.limit, self.window, self.max_clients, self.clock = limit, window, max_clients, clock
        self.clients = {}

    def take(self, client):
        now = self.clock()
        if client not in self.clients and len(self.clients) >= self.max_clients:
            self.clients = {key: value for key, value in self.clients.items() if value[0] > now}
            if len(self.clients) >= self.max_clients:
                return self.window
        end, count = self.clients.get(client, (now + self.window, 0))
        if end <= now:
            end, count = now + self.window, 0
        if count >= self.limit:
            return max(1, math.ceil(end - now))
        self.clients[client] = (end, count + 1)
        return 0


def install_rate_limit(app, budget=None):
    budget = budget or RequestBudget()

    @app.middleware('http')
    async def limit_requests(request, call_next):
        if request.url.path.startswith('/api/'):
            retry = budget.take(request.client.host if request.client else 'unknown')
            if retry:
                return JSONResponse({'detail': 'Too many ML API requests. Please try again later.'},
                                    status_code=429, headers={'Retry-After': str(retry), 'Cache-Control': 'no-store'})
        return await call_next(request)
