import { createHash, randomUUID } from "node:crypto";

export function emailIdentity(caseId: string, recipient: string, message: string) {
  return createHash("sha256").update(JSON.stringify([caseId, recipient, message])).digest("hex");
}

function encodedSubject(subject: string) {
  const words: string[] = [];
  let chunk = "";
  for (const character of subject.replace(/[\r\n]/g, " ")) {
    if (Buffer.byteLength(chunk + character) > 36) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`); chunk = "";
    }
    chunk += character;
  }
  if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
  return words.join("\r\n ");
}

export function buildEmailMessage(input: {
  sender: string; recipient: string; subject: string; message: string; caseId: string; identity: string;
}) {
  if (/[\r\n]/.test(input.sender + input.recipient)) throw new Error("Invalid email header.");
  const boundary = `cosolve_${randomUUID().replaceAll("-", "")}`;
  const content = Buffer.from(input.message, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const filename = `CoSolve-${input.caseId.replace(/[^a-zA-Z0-9_-]/g, "")}-response.txt`;
  const textPart = [
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", content,
  ];
  const mime = [
    `From: ${input.sender}`, `To: ${input.recipient}`, `Subject: ${encodedSubject(input.subject)}`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <cosolve-${input.identity}@cosolve.invalid>`,
    "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    ...textPart, `--${boundary}`, `Content-Type: text/plain; charset="UTF-8"; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`, "Content-Transfer-Encoding: base64", "", content,
    `--${boundary}--`, "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}
