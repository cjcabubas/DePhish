import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { learnRoutes } from "../src/routes/learnRoutes.js";

test("learning progress rejects malformed nested input and saves valid progress under the authenticated user", async (t) => {
  const writes = [];
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { userId: "owner" };
    next();
  });
  app.use(
    learnRoutes({
      users: { findById: async () => ({ _id: "owner" }) },
      progress: {
        save: async (owner, modules) => {
          writes.push({ owner, modules });
          return { modules };
        },
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const send = (body) =>
    fetch(`http://127.0.0.1:${server.address().port}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const mod = {
    moduleId: "phishing",
    completedLessons: ["intro"],
    sections: [
      {
        sectionIndex: 0,
        bestScore: 80,
        passed: true,
        quizAttempts: [
          { score: 80, passed: true, attemptedAt: "2026-10-18T00:00:00Z" },
        ],
      },
    ],
  };
  for (const body of [
    {},
    { modules: [null] },
    { modules: [mod, mod] },
    { modules: [{ ...mod, completedLessons: [null] }] },
    { modules: [{ ...mod, sections: [null] }] },
    {
      modules: [{ ...mod, sections: [{ ...mod.sections[0], bestScore: 101 }] }],
    },
    {
      modules: [
        {
          ...mod,
          sections: [
            { ...mod.sections[0], quizAttempts: [{ score: -1, passed: true }] },
          ],
        },
      ],
    },
    { modules: [{ ...mod, startedAt: "invalid" }] },
  ]) {
    assert.equal((await send(body)).status, 400);
  }
  assert.equal(writes.length, 0);
  assert.equal(
    (await send({ modules: [mod], userId: "someone-else" })).status,
    200,
  );
  assert.deepEqual(writes, [{ owner: "owner", modules: [mod] }]);
  assert.equal((await send({ modules: [] })).status, 200);
});
