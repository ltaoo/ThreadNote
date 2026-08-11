import assert from "node:assert/strict";
import test from "node:test";

import {
  SnippetLauncherModel,
  launcherCommandSuggestion,
  mergeSearchItemGroups,
  parseLauncherQuery,
} from "./snippet-launcher-model.js";

test("plain input searches snippets and links", function () {
  const command = parseLauncherQuery("deploy docs");

  assert.equal(command.scope, "all");
  assert.deepEqual(command.requests, [
    { endpoint: "/api/snippets/search", query: "snippet deploy docs" },
    { endpoint: "/api/links/search", query: "link deploy docs" },
  ]);
});

test("command prefixes expose a tab completion suggestion", function () {
  assert.deepEqual(launcherCommandSuggestion("s"), {
    command: "snippet",
    prefix: "s",
    suffix: "nippet",
  });
  assert.deepEqual(launcherCommandSuggestion("lin"), {
    command: "link",
    prefix: "lin",
    suffix: "k",
  });
  assert.equal(launcherCommandSuggestion("snippet"), null);
  assert.equal(launcherCommandSuggestion("search words"), null);
});

test("model accepts the current command suggestion", function () {
  const model = new SnippetLauncherModel({}, { searchDebounceMs: 60_000 });
  model.setQuery("sn");

  assert.equal(model.acceptCommandSuggestion(), true);
  assert.equal(model.snapshot().query, "snippet");
  assert.equal(model.acceptCommandSuggestion(), false);
  model.destroy();
});

test("explicit prefixes still limit the result type", function () {
  assert.deepEqual(parseLauncherQuery("snippet deploy").requests, [
    { endpoint: "/api/snippets/search", query: "snippet deploy" },
  ]);
  assert.deepEqual(parseLauncherQuery("link docs").requests, [
    { endpoint: "/api/links/search", query: "link docs" },
  ]);
});

test("combined results alternate types instead of starving one type", function () {
  const snippets = [{ id: "snippet-1" }, { id: "snippet-2" }, { id: "snippet-3" }];
  const links = [{ id: "link-1" }, { id: "link-2" }];

  assert.deepEqual(mergeSearchItemGroups([snippets, links], 4), [
    snippets[0],
    links[0],
    snippets[1],
    links[1],
  ]);
});

test("model starts both plain-query requests before resolving results", async function () {
  const requestedUrls = [];
  const pending = [];
  const model = new SnippetLauncherModel({
    request(url) {
      requestedUrls.push(url);
      return new Promise(function (resolve) {
        pending.push(resolve);
      });
    },
  }, { searchDebounceMs: 60_000 });

  model.setQuery("deploy");
  const searching = model.searchNow();

  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0], /^\/api\/snippets\/search\?q=snippet%20deploy&/);
  assert.match(requestedUrls[1], /^\/api\/links\/search\?q=link%20deploy&/);

  pending[0]({ code: 0, data: { items: [{ id: "snippet-1" }] } });
  pending[1]({ code: 0, data: { items: [{ id: "link-1", url: "https://example.com" }] } });
  const items = await searching;

  assert.deepEqual(items.map(function (item) { return item.id; }), ["snippet-1", "link-1"]);
  model.destroy();
});
