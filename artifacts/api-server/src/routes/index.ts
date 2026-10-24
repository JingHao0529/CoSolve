import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cosolveRouter from "./cosolve";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cosolveRouter);

export default router;
