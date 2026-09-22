import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { IAdminUpdateCustomerPayload, IRegisterCustomerPayload, IUpdateCustomerProfilePayload } from "./customer.validation";
import config from "../../config";
import { Role } from "../../../generated/prisma/enums";
import { redisClient } from "../../lib/redis";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import { IVerifyCustomerEmailPayload } from "./customer.interface";
import { RequestUser } from "../../middleware/checkAuth";
import { IQuery } from "../../interfaces";
import { CustomerWhereInput } from "../../../generated/prisma/models";



const registerCustomer = async (payload: IRegisterCustomerPayload
  ) => {
  const { name, email, password, phone, gender } = payload.user;
  const {defaultAddressLine, defaultDistrict, defaultThana, defaultPostalCode } = payload.customer;

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    throw new AppError(
      httpStatus.CONFLICT,
      "User with this email already exists",
    );
  }

  const hashedPassword = await bcrypt.hash(password, Number(config.bcrypt_salt_rounds));

   // Create User + Customer
  const result = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      phone,
      gender,
      role: Role.CUSTOMER,

      customer: {
        create: {
          defaultAddressLine,
          defaultDistrict,
          defaultThana,
          defaultPostalCode,
        },
      },
    },
    omit: {password: true},

    include: {
      customer: true,
    },
  });

  const expirationSeconds = 60 * 60;
  
    const otpKey = `customer-application-otp:${payload.user.email}`;
    const otpValue = crypto.randomInt(100000, 1000000).toString();
  
    await redisClient.set(otpKey, otpValue, {
      expiration: {
        type: "EX",
        value: expirationSeconds,
      },
    });
  
    const tempatePath = path.join(
      process.cwd(),
      "src/app/templates/otp-for-one-hour.ejs",
    );
  
    const templateData = {
      name: name,
      email: email,
      otp: otpValue,
      expirationMinutes: expirationSeconds / 60,
    };
  
    const html = await ejs.renderFile(tempatePath, templateData);
  
    await transporter.sendMail({
      from: {
          name: "Courier & Logistics Management",
          address: config.email_sender,
        },
      to: payload.user.email,
      subject: "Customer Application - Email Verification",
      html,
    });
  
  return result;
};

const verifyCustomerEmail = async (payload: IVerifyCustomerEmailPayload
) => {

    const otp = payload.otp;
	const email = payload.email.trim().toLowerCase();

	const existingUser = await prisma.user.findUnique({
		where: { email, role: Role.CUSTOMER },
	});

	if (!existingUser) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Customer Application Not Found. Please Apply Again.",
		);
	}

	if (existingUser.emailVerified) {
		throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
	}

	const otpKey = `customer-application-otp:${email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"OTP Expired. Your Application Window Has Closed, Please Apply Again.",
		);
	}

	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
	}

	await redisClient.del(otpKey);

	const verifiedUser = await prisma.user.update({
		where: { id: existingUser.id },
		data: { emailVerified: true },
		omit: { password: true },
		include: { customer: true },
	});

	return verifiedUser

};

const getMyCustomerProfile = async (user: RequestUser) => {

  const customer = await prisma.customer.findFirst({
    where: {
      userId: user.userId,
      isDeleted: false,
    },
    include: { 
        user: {
             omit: { 
                password: true 
            } 
        } 
    },
  });

  if (!customer) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Customer Profile not found",
    );
  }

  return customer;
};

const updateMyCustomerProfile = async (
  user: RequestUser,
  payload: IUpdateCustomerProfilePayload,
) => {

  const existingCustomer = await prisma.customer.findUnique({
    where: {
      userId: user.userId,
      isDeleted: false,
    },
  });

  if (!existingCustomer) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Customer Profile not found",
    );
  }

   if (existingCustomer.isDeleted) {
    throw new AppError(httpStatus.GONE, "Customer Profile Has Been Deleted");
  }


 const result = await prisma.$transaction(async (tx) => {
    let updatedUser = null;
    let updatedCustomerProfile = null;

    if (payload.user) {
      const { name, phone, gender } = payload.user;
      updatedUser = await tx.user.update({
        where: { id: user.userId },
        data: { name, phone, gender },
        omit: { password: true },
      });
    }

    if (payload.customer) {
      const { defaultAddressLine,
    defaultDistrict,
    defaultThana,
    defaultPostalCode } =
        payload.customer;

      updatedCustomerProfile = await tx.customer.update({
        where: { userId: user.userId },
        data: { defaultAddressLine,
    defaultDistrict,
    defaultThana,
    defaultPostalCode },
      });
    }

    return { user: updatedUser, customerProfile: updatedCustomerProfile };
  });

  return result;
};

const getAllCustomers = async (query: IQuery) => {

   const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"
  
   
    const andConditions: CustomerWhereInput[] = []


    //Searching
    if (query.searchTerm) {
        andConditions.push({
            OR: [
             { 
        user:{ 
          name: { 
            contains: query.searchTerm, 
             mode: "insensitive" 
            }
           } 
          },
        {
           user: { 
            email: { 
              contains: query.searchTerm, 
              mode: "insensitive" 
            } 
          } 
        },
            ],
        });
    }

    //filtering

    if (query.email) {
        andConditions.push({
      user: { 
        email: { 
          contains: query.email, 
          mode: "insensitive" 
        } 
      },
    });
    }

    
    if (query.name) {
    andConditions.push({
      user: {
        name: { equals: query.name, mode: "insensitive" }
      }
    });
  }

    andConditions.push({ isDeleted: false });


    const allCustomers = await prisma.customer.findMany({
        where : {
            AND : andConditions.length > 0 ? andConditions : undefined
        },

        take: limit,
        skip: skip,


        orderBy: {
            [sortBy]: sortOrder
        },

        include:{
            user: {
                omit:{
                    password: true
                }
            },
        }

    });

    const totalCustomerCount = await prisma.customer.count({
        where: {
            AND: andConditions
        }
    })

    return {
        data: allCustomers,
        meta: {
            page: page,
            limit: limit,
            total: totalCustomerCount,
            totalPages: Math.ceil(totalCustomerCount / limit)
        }
    }
};

const getSingleCustomerById = async (customerId: string) => {


  

  const customer = await prisma.customer.findUnique({
    where: {
      id: customerId,
      isDeleted: false,
    },
    include: {
      user: { omit: { password: true } },
    },
  });

  if (!customer) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Customer Profile not found",
    );
  }
  

   if (customer.isDeleted) {                       
    throw new AppError(httpStatus.GONE, "Customer Has Been Deleted");
  }
  return customer;
};


const adminUpdateCustomerStatus = async (
  customerId: string,
  payload: IAdminUpdateCustomerPayload,
) => {

    const { status } = payload;

  const existingCustomer = await prisma.customer.findUnique({
    where: {
      id: customerId,
      isDeleted: false,
    },
  });

  if (!existingCustomer) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Customer not found",
    );
  }

  if (existingCustomer.isDeleted) {
    throw new AppError(httpStatus.GONE, "Customer Has Been Deleted");
  }


  const result = await prisma.customer.update({
    where: {
      id: customerId,
    },
    data: {
      user:{
      update:{
        
        status,
     
      }
      }
    },
    include: {
      user: { omit: { password: true } },
  
  }
  });

  return result;
};

const adminDeleteCustomer = async (customerId: string) => {


   
  const existingCustomer = await prisma.customer.findUnique({
    where: {
      id: customerId,
      isDeleted: false,
    },
  });
  




  if (!existingCustomer) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Customer not found",
    );
  }

    if (existingCustomer.isDeleted) {
    throw new AppError(httpStatus.GONE, "Customer Already Deleted");
  }
  

   await prisma.customer.update({
    where: { id: customerId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
    include: {
      user: { omit: { password: true } },
      
    },
  });

  return null;
};

export const CustomerService = {
  registerCustomer,
  verifyCustomerEmail,
  getMyCustomerProfile,
  updateMyCustomerProfile,
  getAllCustomers,
  getSingleCustomerById,
  adminUpdateCustomerStatus,
  adminDeleteCustomer,
};