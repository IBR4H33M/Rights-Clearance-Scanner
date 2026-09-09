import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clearanceRouter from "./clearance";
import analyticsRouter from "./analytics";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clearanceRouter);
router.use(analyticsRouter);
router.use(authRouter);

export default router;
