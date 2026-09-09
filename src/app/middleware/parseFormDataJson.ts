import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import httpStatus from "http-status";
import { catchAsync } from "../utils/catchAsync";

export const parseFormDataJson = () => {
  return catchAsync (
    (req: Request, res: Response, next: NextFunction)=>{
        if (typeof req.body?.data === "string") {
    try {
      req.body = JSON.parse(req.body.data);
    } catch {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid JSON in 'data' field");
    }
  }
  next();
    }
  )
};