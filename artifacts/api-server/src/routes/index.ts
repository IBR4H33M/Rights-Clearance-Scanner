import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clearanceRouter from "./clearance";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clearanceRouter);

export default router;
