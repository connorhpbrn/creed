// Ensures a missing onboarding seed never renders the empty composed preview.
//
//   npm test

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isAlreadyComposedConflict } from "./compose-response.ts";

test("only an already-composed conflict may advance to preview", () => {
  assert.equal(isAlreadyComposedConflict(409, { error: "already_composed" }), true);
  assert.equal(
    isAlreadyComposedConflict(409, {
      error: "Finish the onboarding questions first.",
    }),
    false,
  );
});
