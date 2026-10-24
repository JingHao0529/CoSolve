import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreatePolicyBody,
  CreatePolicyResponse,
  ListPoliciesResponse,
  UpdatePolicyBody,
  UpdatePolicyParams,
  UpdatePolicyResponse,
} from "@workspace/api-zod";
import { db, policiesTable } from "@workspace/db";
import { addAuditEvent, makeId } from "./helpers";

const router: IRouter = Router();

router.get("/policies", async (_req, res): Promise<void> => {
  const policies = await db.select().from(policiesTable);
  res.json(ListPoliciesResponse.parse(policies));
});

router.post("/policies", async (req, res): Promise<void> => {
  const parsed = CreatePolicyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [policy] = await db
    .insert(policiesTable)
    .values({
      id: makeId("pol"),
      ...parsed.data,
      enabled: true,
    })
    .returning();
  await addAuditEvent(
    "SYSTEM",
    "Resolution policy created",
    "Support team",
    `Created policy: ${policy.name}.`,
  );
  res.status(201).json(CreatePolicyResponse.parse(policy));
});

router.patch("/policies/:id", async (req, res): Promise<void> => {
  const params = UpdatePolicyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePolicyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [policy] = await db
    .update(policiesTable)
    .set(parsed.data)
    .where(eq(policiesTable.id, params.data.id))
    .returning();
  if (!policy) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }
  await addAuditEvent(
    "SYSTEM",
    "Resolution policy updated",
    "Support team",
    `Updated policy: ${policy.name}.`,
  );
  res.json(UpdatePolicyResponse.parse(policy));
});

export default router;
