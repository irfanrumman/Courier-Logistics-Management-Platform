import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.STMP_USER,
        pass: process.env.STMP_PASSWORD,
    },
});