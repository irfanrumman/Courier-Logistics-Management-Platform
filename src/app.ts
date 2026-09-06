import cookieParser from "cookie-parser";
import cors from "cors";

import express, { Application, Request, Response } from "express";
import httpStatus from "http-status";
import config from "./app/config";
import helmet from "helmet";


const app: Application = express();

//security-related HTTP headers
app.use(helmet());

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());



//API
app.use("/api/v1/auth", ()=>{});



// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to Courier & Logistics Management Platform Backend",
	});
});

//globalError & nOtFound


export default app;