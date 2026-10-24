import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import express from "express";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("email sending records only provider acceptance and safely reconciles uncertain sends", async () => {
  const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const schema = `email_test_${randomUUID().replaceAll("-", "")}`;
  const directory = path.join(api, ".local", schema);
  const admin = new pg.Pool({connectionString:process.env.DATABASE_URL,options:"-c search_path=public"});
  const previousOptions = process.env.PGOPTIONS;
  let pool, server;
  let mode = "accepted", sendCount = 0;
  const sent = new Map();
  globalThis.__testGmail = async (url, options) => {
    if (url.endsWith("/profile")) return Response.json(mode === "disconnected" ? {} : {emailAddress:"sender@example.com"}, {status:mode === "disconnected" ? 404 : 200});
    if (url.includes("/messages?q=")) {
      const query = decodeURIComponent(url.split("q=")[1].split("&")[0]);
      const entry = [...sent.entries()].find(([messageId]) => query.includes(messageId));
      return Response.json({messages:entry ? [{id:entry[1]}] : []});
    }
    if (url.endsWith("/messages/send")) {
      sendCount++;
      const mime = Buffer.from(options.body.raw,"base64url").toString("utf8");
      assert.match(mime,/Content-Disposition: attachment/);
      const identity = mime.match(/Message-ID: <([^>]+)>/)[1];
      if (mode === "rejected") return Response.json({error:"Rejected"},{status:400});
      if (mode === "unknown_not_sent") throw new Error("Synthetic transport lost");
      const id = `gmail-${sendCount}`;
      sent.set(identity,id);
      if (mode === "unknown_sent") throw new Error("Synthetic response lost after send");
      return Response.json({id});
    }
    throw new Error("Unexpected fixture transport request.");
  };
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    for (const table of ["cosolve_complaints","cosolve_customers","cosolve_orders","cosolve_compensations","cosolve_compensation_adjustments","cosolve_audit_events","cosolve_complaint_imports"]) {
      await admin.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await mkdir(directory,{recursive:true});
    const bundle = path.join(directory,"test.mjs");
    await build({
      stdin:{contents:'export {default as router} from "./src/routes/cosolve/complaints"; export {pool} from "@workspace/db";',resolveDir:api},
      outfile:bundle,bundle:true,platform:"node",format:"esm",logLevel:"silent",external:["pg","pg-native","express","*.node"],
      plugins:[{name:"fixture-services",setup(build){
        build.onResolve({filter:/\/staff-auth$/},()=>({path:"auth",namespace:"fixture"}));
        build.onResolve({filter:/^@replit\/connectors-sdk$/},()=>({path:"gmail",namespace:"fixture"}));
        build.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="gmail"
          ? 'export class ReplitConnectors { proxy(name,path,options) { if(name!=="google-mail") throw Error("Wrong connector"); return globalThis.__testGmail(path,options); } }'
          : 'export async function resolveStaffIdentity(req) {return req.get("x-test-anonymous")?null:{id:"synthetic-manager",role:"manager"};} export function staffAuthorizationStatus(identity){return identity?null:401;}'}));
      }}],
    });
    process.env.PGOPTIONS=`-c search_path=${schema}`;
    const fixture=await import(pathToFileURL(bundle).href); pool=fixture.pool;
    assert.equal((await pool.query("select current_schema() as name")).rows[0].name,schema);
    await pool.query(`insert into cosolve_customers(id,name) values ('customer','Synthetic customer')`);
    for (const id of ["normal","uncertain","missing","rejected","offline","closed"]) {
      await pool.query(`insert into cosolve_complaints(id,customer_id,customer_name,source,subject,message,status)
        values ($1,'customer','Synthetic customer','Test','Synthetic issue','Synthetic complaint',$2)`,
        [id,id==="closed"?"Closed":"Investigating"]);
    }
    const app=express(); app.use(express.json()); app.use(fixture.router);
    server=app.listen(0,"127.0.0.1"); await new Promise(resolve=>server.once("listening",resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const body={recipient:"customer@example.com",message:"Hello,\nWe are reviewing the missing item. 谢谢"};
    const request=(id,payload=body,anonymous=false)=>fetch(`${base}/complaints/${id}/send-email`,{
      method:"POST",headers:{"Content-Type":"application/json",...(anonymous?{"x-test-anonymous":"1"}:{})},body:JSON.stringify(payload),
    });
    assert.equal((await request("normal",body,true)).status,401);
    assert.equal((await request("normal",{...body,recipient:"not-an-email"})).status,400);
    assert.equal(sendCount,0);
    assert.equal((await request("closed")).status,409);
    assert.equal((await request("normal")).status,200);
    const receipt=await (await request("normal")).json();
    assert.equal(receipt.replayed,true); assert.equal(sendCount,1);
    mode="unknown_sent";
    assert.equal((await request("uncertain")).status,502);
    const patch=payload=>fetch(`${base}/complaints/uncertain`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    assert.equal((await patch({status:"Closed"})).status,409);
    assert.equal((await patch({responseDraft:"Different message"})).status,409);
    const recovered=await (await request("uncertain")).json();
    assert.equal(recovered.replayed,true); assert.equal(sendCount,2);
    mode="unknown_not_sent";
    assert.equal((await request("missing")).status,502);
    assert.equal((await request("missing")).status,409); assert.equal(sendCount,3);
    mode="rejected";
    assert.equal((await request("rejected")).status,502);
    mode="accepted";
    assert.equal((await request("rejected")).status,200); assert.equal(sendCount,5);
    mode="disconnected";
    assert.equal((await request("offline")).status,503);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_audit_events where case_id='offline'")).rows[0].n,0);
    const counts=await pool.query("select action,count(*)::int as n from cosolve_audit_events group by action");
    assert.equal(counts.rows.find(row=>row.action==="Customer email submitted").n,3);
    assert.equal(counts.rows.find(row=>row.action==="Customer email sending").n,1);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await pool?.end();
    if(previousOptions===undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS=previousOptions;
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
    delete globalThis.__testGmail;
    await rm(directory,{recursive:true,force:true});
  }
});
