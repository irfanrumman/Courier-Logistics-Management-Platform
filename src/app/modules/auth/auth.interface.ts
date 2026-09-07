import type { CustomerType, Gender, Role } from "../../../generated/prisma/enums";

export interface ILoginUserPayload {
	email: string;
	password: string;
}


export interface IRegisterCustomerPayload {
    name: string;
    email: string;
    password: string;
    phone?: string;
    gender?: Gender;

    defaultAddressLine?: string;
    defaultDistrict?: string;
    defaultThana?: string;
    defaultPostalCode?: string;
}

export interface IVerifyEmailPayload {
	email: string;
	otp: string;
}

export interface IRequestUser {
	userId: string;
	email: string;
	name: string;
	role: Role;
}

export interface IGoogleLoginPayload {
	idToken: string;
}

export interface IForgotPasswordPayload {
	email: string;
}
export interface IResetPasswordPayload {
	email: string;
	newPassword: string;
	otp: string;
}