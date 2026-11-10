import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBitextCsv, prepareBitextRows } from "../src/services/bitext.js";

test("parses Bitext columns, escaped quotes, commas, and multiline answers", () => {
  const rows = parseBitextCsv('flags,instruction,category,intent,response\nB,"How do I \"\"change\"\" my email?",ACCOUNT,change_email,"Open settings, choose Email.\nThen verify the new address."\n');
  assert.deepEqual(rows, [{ instruction: 'How do I "change" my email?', response: "Open settings, choose Email.\nThen verify the new address.", intent: "change_email" }]);
});

test("rejects files missing required Bitext columns", () => {
  assert.throws(() => parseBitextCsv("instruction,category\nquestion,account\n"), /must include instruction, response, and intent/);
});

test("removes duplicate and clarification-only rows and normalizes response placeholders", () => {
  const rows = prepareBitextRows([
    { instruction: " I forgot my password ", response: "Please go ahead and ask your question.", intent: "password_reset" },
    { instruction: "I forgot my password", response: "Use the Forgot Password link on the sign-in page.", intent: "password_reset" },
    { instruction: "Cancel order {{Order Number}}", response: "Open Orders for {{Order Number}} and select Cancel.", intent: "cancel_order" },
    { instruction: "How can I contact customer support?", response: "Reach them during our {{Customer Support Hours}} by phone or {{Customer Support Email}}.", intent: "contact_customer_service" }
  ]);
  assert.deepEqual(rows, [
    { instruction: "I forgot my password", response: "Use the Forgot Password link on the sign-in page.", intent: "password_reset" },
    { instruction: "Cancel order {{Order Number}}", response: "Open Orders for order number and select Cancel.", intent: "cancel_order" },
    { instruction: "How can I contact customer support?", response: "Reach them during our customer support hours by phone or email support.", intent: "contact_customer_service" }
  ]);
});
