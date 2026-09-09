import cookieParser from "cookie-parser";
import cors from "cors";

import express, { Application, Request, Response } from "express";
import httpStatus from "http-status";
import config from "./app/config";
import helmet from "helmet";
import { notFound } from "./app/middleware/notFound";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { AuthRoutes } from "./app/modules/auth/auth.route";
import rateLimit from "express-rate-limit";
import { HubManagerRoutes } from "./app/modules/hubmanager/hubmanager.route";


const app: Application = express();


//security-related HTTP headers
app.use(helmet());

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        message: "Too many requests, please try again later",
        errors: []
    }
})
);
// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());



//API
app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/hub-manager", HubManagerRoutes);



// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to Courier & Logistics Management Platform Backend",
	});
});

//globalError & notFound
app.use(globalErrorHandler);
app.use(notFound);


export default app;