import { Router, type IRouter } from "express";
import healthRouter from "./health";
import showsRouter from "./shows";
import tasksRouter from "./tasks";
import eblastsRouter from "./eblasts";
import linksRouter from "./links";
import calendarRouter from "./calendar";
import dashboardRouter from "./dashboard";
import exportRouter from "./export";
import officeTasksRouter from "./officeTasks";
import venuesRouter from "./venues";
import presetTasksRouter from "./presetTasks";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/shows", showsRouter);
router.use("/shows/:showId/tasks", tasksRouter);
router.use("/shows/:showId/eblasts", eblastsRouter);
router.use("/shows/:showId/links", linksRouter);
router.use("/calendar", calendarRouter);
router.use("/dashboard", dashboardRouter);
router.use("/export", exportRouter);
router.use("/office-tasks", officeTasksRouter);
router.use("/venues", venuesRouter);
router.use("/preset-tasks", presetTasksRouter);

export default router;
