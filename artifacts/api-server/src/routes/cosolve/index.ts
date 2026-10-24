import { Router, type IRouter } from "express";
import aiRouter from "./ai";
import auditLogRouter from "./audit-log";
import complaintsRouter from "./complaints";
import customersRouter from "./customers";
import dashboardRouter from "./dashboard";
import policiesRouter from "./policies";
import { isPublicCoSolveRequest, resolveStaffIdentity } from "./staff-auth";
import whatsappRouter from "./whatsapp";

const router: IRouter = Router();

router.use(async (req, res, next): Promise<void> => {
  if (isPublicCoSolveRequest(req.method, req.path)) {
    next();
    return;
  }

  const identity = await resolveStaffIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in to access the CoSolve workspace." });
    return;
  }
  next();
});

router.use(aiRouter);
router.use(auditLogRouter);
router.use(complaintsRouter);
router.use(customersRouter);
router.use(dashboardRouter);
router.use(policiesRouter);
router.use(whatsappRouter);

export default router;
