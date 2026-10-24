import test from "node:test";
import assert from "node:assert/strict";
import { buildEmailMessage, emailIdentity } from "./email-message.ts";

test("customer emails include the exact UTF-8 response in the body and a text attachment", () => {
  const message = "Hello,\nWe’re sorry about the missing items.\n谢谢 — Support";
  const identity = emailIdentity("case-1", "customer@example.com", message);
  const mime = Buffer.from(buildEmailMessage({
    sender:"sender@example.com",recipient:"customer@example.com",subject:"Response — 客户",
    message,caseId:"case-1",identity,
  }), "base64url").toString("utf8");
  assert.match(mime, /Content-Disposition: attachment; filename="CoSolve-case-1-response.txt"/);
  assert.match(mime, new RegExp(`Message-ID: <cosolve-${identity}@cosolve.invalid>`));
  const content = Buffer.from(message).toString("base64");
  assert.equal(mime.replace(/\r\n/g, "").split(content).length - 1, 2);
  assert.equal(emailIdentity("case-1","customer@example.com",message), identity);
  assert.notEqual(emailIdentity("case-1","other@example.com",message), identity);
  assert.notEqual(emailIdentity("case-1","customer@example.com",message+"!"), identity);
});

test("recipient header injection is rejected and Unicode subjects are safely folded", () => {
  assert.throws(() => buildEmailMessage({
    sender:"sender@example.com",recipient:"customer@example.com\r\nBcc: other@example.com",
    subject:"Hello",message:"Hello",caseId:"case-1",identity:"id",
  }), /Invalid email header/);
  const mime = Buffer.from(buildEmailMessage({
    sender:"sender@example.com",recipient:"customer@example.com",subject:"客户".repeat(100)+"\r\nBcc: hidden@example.com",
    message:"Hello",caseId:"case-1",identity:"id",
  }),"base64url").toString();
  assert.doesNotMatch(mime, /\r\nBcc:/);
  const subject = mime.match(/Subject: ([\s\S]+?)\r\nDate:/)[1];
  assert.ok(subject.split("\r\n ").every(word => word.length <= 75));
});
