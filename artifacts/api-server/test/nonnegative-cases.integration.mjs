import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("negative-only cleanup preserves negative cases, cleans linked history atomically and refuses in-flight emails", async () => {
  const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const schema = `sentiment_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({connectionString:process.env.DATABASE_URL,options:"-c search_path=public"});
  const directory = path.join(api,".local",schema);
  const previousOptions=process.env.PGOPTIONS;
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    for (const table of ["cosolve_complaints","cosolve_customers","cosolve_compensations",
      "cosolve_compensation_adjustments","cosolve_audit_events","cosolve_complaint_imports"]) {
      await admin.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await mkdir(directory,{recursive:true});
    const bundle=path.join(directory,"fixture.mjs");
    await build({
      stdin:{contents:'export {deleteNonnegativeCases} from "./src/routes/cosolve/nonnegative-cases"; export {pool} from "@workspace/db";',resolveDir:api},
      outfile:bundle,bundle:true,platform:"node",format:"esm",logLevel:"silent",external:["pg","pg-native","*.node"],
    });
    process.env.PGOPTIONS=`-c search_path=${schema}`;
    const fixture=await import(pathToFileURL(bundle).href); pool=fixture.pool;
    assert.equal((await pool.query("select current_schema() as name")).rows[0].name,schema,"Never test deletion against public data.");
    await pool.query("insert into cosolve_customers(id,name,complaint_count) values ('customer','Synthetic customer',4)");
    for (const [id,sentiment] of [["negative","Negative"],["positive","Positive"],["neutral","Neutral"],["unknown","Unknown"]]) {
      await pool.query(`insert into cosolve_complaints(id,customer_id,customer_name,source,subject,message,sentiment)
        values ($1,'customer','Synthetic customer','Test','Synthetic review','Synthetic text',$2)`,[id,sentiment]);
      await pool.query("insert into cosolve_audit_events(id,case_id,action,actor,details) values ($1,$2,'Case received','Test','Synthetic history')",[`${id}-audit`,id]);
      await pool.query("insert into cosolve_complaint_imports(key,complaint_id) values ($1,$2)",[`${id}-key`,id]);
    }
    await pool.query(`insert into cosolve_compensations(id,case_id,type,amount,status) values
      ('remove-payout','positive','Refund',20,'Approved'), ('keep-payout','negative','Refund',5,'Approved')`);
    await pool.query(`insert into cosolve_compensation_adjustments(id,case_id,compensation_id,base_type,base_amount,type,amount,amount_delta,rationale,requested_by)
      values ('remove-adjustment','positive','remove-payout','Refund',20,'Refund',10,-10,'Synthetic adjustment','synthetic-manager')`);
    await pool.query(`insert into cosolve_audit_events(id,case_id,action,actor,details)
      values ('sending','unknown','Customer email sending','Test','Synthetic pending email')`);
    await assert.rejects(()=>fixture.deleteNonnegativeCases({actor:"Test",reason:"Synthetic confirmation"}),/pending Gmail/);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_complaints")).rows[0].n,4);
    await pool.query("delete from cosolve_audit_events where id='sending'");
    const result=await fixture.deleteNonnegativeCases({actor:"Test",reason:"Synthetic confirmation"});
    assert.deepEqual(result,{deletedCount:3,approvedCount:1,approvedAmount:20});
    assert.deepEqual((await pool.query("select id from cosolve_complaints")).rows.map(row=>row.id),["negative"]);
    assert.deepEqual((await pool.query("select id from cosolve_compensations")).rows.map(row=>row.id),["keep-payout"]);
    assert.deepEqual((await pool.query("select key from cosolve_complaint_imports")).rows.map(row=>row.key),["negative-key"]);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_compensation_adjustments")).rows[0].n,0);
    assert.equal((await pool.query("select complaint_count from cosolve_customers")).rows[0].complaint_count,1);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_audit_events where case_id='negative'")).rows[0].n,1);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_audit_events where case_id='workspace'")).rows[0].n,1);
    assert.equal((await fixture.deleteNonnegativeCases({actor:"Test",reason:"Repeat"})).deletedCount,0);
    await pool.query(`insert into cosolve_audit_events(id,case_id,action,actor,details)
      values ('negative-sending','negative','Customer email sending','Test','Synthetic pending email')`);
    await assert.rejects(()=>fixture.deleteNonnegativeCases({
      ids:["negative"],confirmedSentiment:"Positive",actor:"Test",reason:"Synthetic reclassification",
    }),/pending Gmail/);
    assert.equal((await pool.query("select sentiment from cosolve_complaints where id='negative'")).rows[0].sentiment,"Negative");
    await pool.query("delete from cosolve_audit_events where id='negative-sending'");
    const reclassified=await fixture.deleteNonnegativeCases({
      ids:["negative"],confirmedSentiment:"Positive",actor:"Test",reason:"Synthetic reclassification",
    });
    assert.equal(reclassified.deletedCount,1);
    assert.equal((await pool.query("select count(*)::int as n from cosolve_complaints")).rows[0].n,0);
  } finally {
    await pool?.end();
    if(previousOptions===undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS=previousOptions;
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end();
    await rm(directory,{recursive:true,force:true});
  }
});
