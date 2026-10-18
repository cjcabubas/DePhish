import test from "node:test";
import assert from "node:assert/strict";
import session from "express-session";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config/env.js";
import { dashboardController } from "../src/controllers/dashboardController.js";
import { fakeOtp } from "./fakeOtp.js";

const empty = {
  total: 0,
  phishing: 0,
  suspicious: 0,
  legitimate: 0,
  unclassified: 0,
  active_accounts: 0,
  activity: [],
  indicators: [],
};

test("dashboard endpoints enforce account ownership and admin role, ignoring query overrides", async (t) => {
  const records = new Map();
  const users = {
    create: async (fields) => {
      const user = {
        ...fields,
        _id: String(records.size + 1).padStart(24, "0"),
      };
      records.set(user._id, user);
      return user;
    },
    findByEmail: async (email) =>
      [...records.values()].find((user) => user.email === email),
    findById: async (id) => records.get(id),
  };
  const calls = [];
  const scans = {
    stats: async (owner, since) => {
      calls.push({ owner, since });
      return {
        ...empty,
        total: owner ? 123 : 456,
        legitimate: owner ? 123 : 456,
      };
    },
  };
  const store = new session.MemoryStore();
  let identifierReads = 0;
  const identifiers = {
    list: async (limit) => {
      identifierReads++;
      return [{ kind: "email", value: "flagged@example.com" }];
    },
  };
  const server = createApp({
    config: readConfig({
      SESSION_SECRET: "test-only-secret-at-least-32-characters",
    }),
    users,
    store,
    scans,
    identifiers,
    otpService: fakeOtp(users),
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        store.clear(() => {});
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, cookie) =>
    fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal((await get("/api/scans/stats")).status, 401);
  assert.equal((await get("/api/scans/admin/stats")).status, 401);
  assert.equal((await get("/api/scans/admin/identifiers")).status, 401);
  const register = (body) =>
    fetch(base + "/api/auth/" + body.path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DePhish-Client": "web",
      },
      body: JSON.stringify(body.data),
    });
  await register({
    path: "signup",
    data: { name: "Dashboard Test", email: "dashboard@example.com" },
  });
  const signup = await register({
    path: "signup/verify",
    data: {
      name: "Dashboard Test",
      email: "dashboard@example.com",
      password: "test-dashboard-password",
      code: "000042",
    },
  });
  assert.equal(signup.status, 201);
  const cookie = signup.headers
    .getSetCookie()
    .find((value) => value.includes("Path=/api;"))
    .split(";")[0];
  const user = (await signup.json()).user;
  const response = await get(
    "/api/scans/stats?userId=another-account&admin=true&limit=1",
    cookie,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.equal(data.total, 123); // Totals aren't inferred from the 50-row history page.
  assert.equal(data.scope, "account");
  assert.equal(calls[0].owner, user.id);
  assert.equal(data.activity.length, 30);
  assert.equal((await get("/api/scans/admin/stats", cookie)).status, 403);
  assert.equal((await get("/api/scans/admin/identifiers", cookie)).status, 403);
  assert.equal(identifierReads, 0);
  assert.equal(calls.length, 1);
  records.get(user.id).role = "admin";
  const registry = await get("/api/scans/admin/identifiers", cookie);
  assert.equal(registry.status, 200);
  assert.equal((await registry.json()).identifiers[0].kind, "email");
  assert.equal(
    (await get("/api/scans/admin/identifiers?limit=101", cookie)).status,
    400,
  );
  assert.equal(identifierReads, 1);
  const admin = await get("/api/scans/admin/stats", cookie);
  assert.equal(admin.status, 200);
  assert.equal((await admin.json()).scope, "all_accounts");
  assert.equal(calls.at(-1).owner, null);
  scans.stats = async () => {
    throw new Error("private database details");
  };
  const failed = await get("/api/scans/stats", cookie);
  assert.equal(failed.status, 503);
  assert.ok(!JSON.stringify(await failed.json()).includes("private database"));
});

test("30-day UTC activity fills empty dates across a year boundary and preserves real zero totals", async () => {
  let since;
  const scans = {
    stats: async (_, start) => {
      since = start;
      return {
        ...empty,
        total: 2,
        suspicious: 2,
        activity: [
          {
            date: "2026-12-31",
            total: 2,
            phishing: 0,
            suspicious: 2,
            legitimate: 0,
          },
        ],
      };
    },
  };
  let data;
  await dashboardController(scans, {
    now: () => new Date("2027-01-05T14:23:00Z"),
  })(
    { user: { _id: "owner" } },
    {
      json: (value) => {
        data = value;
      },
    },
  );
  assert.equal(since.toISOString(), "2026-12-07T00:00:00.000Z");
  assert.equal(data.activity.length, 30);
  assert.equal(data.activity.at(-1).date, "2027-01-05");
  assert.equal(
    data.activity.find((day) => day.date === "2026-12-31").suspicious,
    2,
  );
  assert.equal(data.activity[0].total, 0);
  let status;
  await dashboardController(undefined)(
    {},
    {
      status: (value) => {
        status = value;
        return { json() {} };
      },
    },
  );
  assert.equal(status, 503);
});

test("all activity ranges use inclusive UTC dates, preserve KPIs, and exclude future scans", async () => {
  const now = new Date("2028-03-01T08:00:00Z");
  const dates = [
    "2027-11-01T00:00:00Z",
    "2027-12-03T00:00:00Z",
    "2028-02-01T00:00:00Z",
    "2028-02-23T23:59:59Z",
    "2028-02-24T00:00:00Z",
    "2028-03-01T08:00:00Z",
    "2028-03-01T08:00:01Z",
  ];
  for (const [range, start, expected] of [
    ["7", "2028-02-24", 2],
    ["30", "2028-02-01", 4],
    ["90", "2027-12-03", 5],
    ["all", "2027-11-01", 6],
  ]) {
    let data;
    const scans = {
      stats: async (owner, since, end) => {
        assert.equal(owner, null);
        assert.equal(end.toISOString(), now.toISOString());
        assert.equal(
          since?.toISOString().slice(0, 10) ?? null,
          range === "all" ? null : start,
        );
        const byDate = new Map();
        for (const timestamp of dates) {
          const date = new Date(timestamp);
          if ((since && date < since) || date > end) continue;
          const key = timestamp.slice(0, 10);
          const row = byDate.get(key) || {
            date: key,
            total: 0,
            phishing: 0,
            suspicious: 0,
            legitimate: 0,
          };
          row.total++;
          row.suspicious++;
          byDate.set(key, row);
        }
        return {
          ...empty,
          total: 7,
          suspicious: 7,
          indicators: [{ category: "urgency_pressure", count: 7 }],
          activity: [...byDate.values()],
        };
      },
    };
    await dashboardController(scans, { admin: true, now: () => now })(
      { query: { range } },
      {
        json: (value) => {
          data = value;
        },
      },
    );
    assert.equal(data.activity[0].date, start);
    assert.equal(data.activity.at(-1).date, "2028-03-01");
    assert.equal(
      data.activity.reduce((sum, row) => sum + row.total, 0),
      expected,
    );
    assert.equal(data.activity.length, range === "all" ? 122 : Number(range));
    assert.equal(data.total, 7);
    assert.deepEqual(data.indicators, [
      { category: "urgency_pressure", count: 7 },
    ]);
    assert.equal(data.period.timezone, "UTC");
    assert.equal(data.period.range, range);
  }
});

test("empty ranges remain valid and unsupported ranges never query the database", async () => {
  for (const range of ["7", "30", "90", "all"]) {
    let data;
    await dashboardController({ stats: async () => empty }, { admin: true })(
      { query: { range } },
      {
        json: (value) => {
          data = value;
        },
      },
    );
    assert.equal(data.activity.length, range === "all" ? 0 : Number(range));
    assert.equal(
      data.activity.reduce((sum, row) => sum + row.total, 0),
      0,
    );
    if (range === "all") assert.equal(data.period.start, null);
  }
  for (const range of ["0", "365", "", "ALL", ["7", "90"], { $gt: "" }]) {
    let status;
    await dashboardController({
      stats: async () => assert.fail("must not query"),
    })(
      { query: { range } },
      {
        status: (value) => {
          status = value;
          return { json() {} };
        },
      },
    );
    assert.equal(status, 400);
  }
});

test("MongoDB aggregation applies range bounds only to activity and groups dates in UTC", async () => {
  const { default: mongoose } = await import("mongoose");
  const { createScanRepository } = await import("../src/models/ScanReport.js");
  const repository = createScanRepository();
  const model = mongoose.models.ScanReport;
  const original = model.aggregate;
  const end = new Date("2028-03-01T08:00:00Z");
  try {
    for (const days of [7, 30, 90, null]) {
      const since = days ? new Date(Date.UTC(2028, 2, 2 - days)) : null;
      model.aggregate = (pipeline) => {
        const facets = pipeline[1].$facet;
        assert.deepEqual(facets.activity[0].$match.createdAt, {
          ...(since ? { $gte: since } : {}),
          $lte: end,
        });
        assert.equal(
          facets.activity[1].$group._id.$dateToString.timezone,
          "UTC",
        );
        assert.deepEqual(facets.activity.at(-1), { $sort: { _id: 1 } });
        for (const key of ["totals", "accounts", "indicators"])
          assert.ok(!JSON.stringify(facets[key]).includes("createdAt"));
        assert.ok(JSON.stringify(pipeline[0]).includes("expiresAt"));
        return {
          option: async () => [
            { totals: [], accounts: [], activity: [], indicators: [] },
          ],
        };
      };
      assert.deepEqual((await repository.stats(null, since, end)).activity, []);
    }
  } finally {
    model.aggregate = original;
  }
});
