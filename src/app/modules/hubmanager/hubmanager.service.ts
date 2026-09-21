import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import ejs from "ejs";
import httpStatus from "http-status";
import path from "path";
import config from "../../config";
import { IQuery } from "../../interfaces";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { HubManagerVerificationStatus, Role } from "../../../generated/prisma/enums";
import { generateSystemPassword } from "../../utils/generateSystemPassword";
import { IAdminUpdateHubManagerPayload, IApplyAsHubManagerPayload, IHubManagerEmailVerifyPayload } from "./hubmanager.validation";
import { IApproveHubManagerPayload, IUpdateHubManagerProfilePayload } from "./hubmanager.intreface";
import { HubManagerWhereInput } from "../../../generated/prisma/models";
import {generateEmployeeId} from "../../utils/generateEmployeeId";




 const applyAsHubManager = async (
  payload: IApplyAsHubManagerPayload ,
  resume: Express.Multer.File | null,
  additionalFiles: Express.Multer.File[],
) => {
  const isUserExists = await prisma.user.findUnique({
    where: { email: payload.user.email },
  });

  if (isUserExists) {
    throw new AppError(httpStatus.CONFLICT, "User already exists with this email");
  }

  if (!resume) {
    throw new AppError(httpStatus.BAD_REQUEST, "Resume file is required");
  }

  const resumeUploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
          },

          async (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(
                new AppError(
                  httpStatus.INTERNAL_SERVER_ERROR,
                  "No result returned from Cloudinary",
                ),
              );
            }

            resolve(result);
          },
        )
        .end(resume.buffer);
    },
  );



  const additionalFilesUploadResults = await Promise.all(
    additionalFiles.map((file) => {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: "auto",
            },

            async (error, result) => {
              if (error) {
                return reject(error);
              }

              if (!result) {
                return reject(new Error("No result returned from Cloudinary"));
              }

              resolve(result);
            },
          )
          .end(file.buffer);
      });
    }),
  );

  const hubManagerApplication = await prisma.user.create({
    data: {
      name: payload.user.name,
      email: payload.user.email,
      phone: payload.user.phone,
      gender: payload.user.gender,
      role: Role.HUB_MANAGER,
      hubManager: {
        create: {
          bio: payload.hubManager.bio,
          qualifications: payload.hubManager.qualifications,
          experienceYears: payload.hubManager.experienceYears,
          resumeUrl: resumeUploadResult.secure_url,
          resumePublicId: resumeUploadResult.public_id,
          additionalFiles: additionalFilesUploadResults.map((file) => ({
            url: file.secure_url,
            publicId: file.public_id,
          })),
        },
      },
    },

    include: {
      hubManager: true,
    },
  });

  const expirationSeconds = 60 * 60;

  const otpKey = `hubManager-application-otp:${payload.user.email}`;
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
    name: payload.user.name,
    email: payload.user.email,
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
    subject: "Hub Manager Application - Email Verification",
    html,
  });

  return hubManagerApplication;
};


const verifyHubManagerEmail = async (payload : IHubManagerEmailVerifyPayload) => {
	const otp = payload.otp;
	const email = payload.email.trim().toLowerCase();

	const existingUser = await prisma.user.findUnique({
		where: { email, role: Role.HUB_MANAGER },
	});

	if (!existingUser) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Hub Manager Application Not Found. Please Apply Again.",
		);
	}

	if (existingUser.emailVerified) {
		throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
	}

	const otpKey = `hubManager-application-otp:${email}`;

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
		include: { hubManager: true },
	});

	return verifiedUser

}

const approveHubManager = async (payload : IApproveHubManagerPayload, reviewer : RequestUser) => {
	const { hubManagerId, verificationStatus, rejectionReason } = payload;

	const existingHubManager = await prisma.hubManager.findUnique({
		where: { id: hubManagerId },
		include: { user: true },
	});

	if (!existingHubManager) {
		throw new AppError(httpStatus.NOT_FOUND, "Hub Manager Application Not Found");
	}

	if (existingHubManager.isDeleted) {
		throw new AppError(httpStatus.GONE, "Hub Manager Application Has Been Deleted");
	}

	if (!existingHubManager.user.emailVerified) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Hub Manager Has Not Verified Their Email Yet. Application Cannot Be Reviewed.",
		);
	}

	if (existingHubManager.verificationStatus !== HubManagerVerificationStatus.PENDING) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Hub Manager Application Has Already Been ${existingHubManager.verificationStatus.toLowerCase()}`,
		);
	}

	if (
		verificationStatus === HubManagerVerificationStatus.REJECTED &&
		!rejectionReason
 	) {
 		throw new AppError(
 			httpStatus.BAD_REQUEST,
 			"Rejection Reason Is Required When Rejecting A Hub Manager Application",
 		);
 	}

  const isApproved = verificationStatus === HubManagerVerificationStatus.APPROVED;

  let randomPassword: string | null = null;
  if (isApproved) {
    randomPassword = generateSystemPassword();
    const hashedPassword = await bcrypt.hash(randomPassword, Number(config.bcrypt_salt_rounds));

    await prisma.user.update({
      where: { id: existingHubManager.userId },
      data: { password: hashedPassword, needPasswordChange: true },
    });
  }

let employeeId: string | undefined = undefined;
if (isApproved) {
  employeeId = await generateEmployeeId(existingHubManager.hubId);
}

 	const updatedHubManager = await prisma.hubManager.update({
 		where: { id: hubManagerId },
 		data: {
 			verificationStatus,
 			rejectionReason:
 				verificationStatus === HubManagerVerificationStatus.REJECTED
				? rejectionReason
 					: null,
 			reviewedBy: reviewer.userId,
 			reviewedAt: new Date(),
      employeeId,
 		},
      include: {
        user: {
           omit: {
         password: true,
            },
        
        },
       hub: true,
      },
 	});


 	const tempatePath = path.join(
 		process.cwd(),
 		`src/app/templates/${isApproved
		? "hubManager-application-approved.ejs"
 			: "hubManager-application-rejected.ejs"
 		}`,
 	);

 	const templateData = {
 		name: updatedHubManager.user.name,
 		reason: updatedHubManager.rejectionReason,
 	};


 	const html = await ejs.renderFile(tempatePath, templateData);

	await transporter.sendMail({
 		from: {
        name: "Courier & Logistics Management",
        address: config.email_sender,
      },
 		to: updatedHubManager.user.email,
 		subject: isApproved
			? "Your Application Has Been Approved"
			: "Your Application Has Been Rejected",
		html,
 	});


 if (isApproved && randomPassword) {
    const passwordTemplatePath = path.join(
      process.cwd(),
      "src/app/templates/generated-password.ejs",
    );

    const passwordHtml = await ejs.renderFile(passwordTemplatePath, {
      name: updatedHubManager.user.name,
      password: randomPassword, 
    });

    await transporter.sendMail({
      from: {
        name: "Courier & Logistics Management",
        address: config.email_sender,
      },
      to: updatedHubManager.user.email,
      subject: "Your Password - Hub Manager Application",
      html: passwordHtml,
    });
  }

 	return updatedHubManager

 }



const getAllHubManagers = async (query: IQuery) => {

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	
  const andConditions: HubManagerWhereInput[] = []

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
        { 
          qualifications: { 
            contains: query.searchTerm, 
            mode: "insensitive" 
          } 
        },
        { 
          employeeId: { 
            contains: query.searchTerm, 
            mode: "insensitive" 
          } 
        },
         { 
          hub: { 
            name: { 
              contains: query.searchTerm, 
              mode: "insensitive" 
            } 
          } 
        },   
      { 
        hub: { 
          code: { 
            contains: query.searchTerm, 
            mode: "insensitive" 
          } 
        } 
      },
			],
		});
	}

	//filtering

  if (query.hubCode) {
  andConditions.push({
    hub: {
       code: { 
        contains: query.hubCode, 
        mode: "insensitive" } },
  });
}

if (query.hubName) {
  andConditions.push({
    hub: {
      name: {                
        contains: query.hubName,
        mode: "insensitive",
      },
    },
  });
}
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

	
	if (query.employeeId) {
    andConditions.push({
      employeeId: { equals: query.employeeId, mode: "insensitive" },
    });
  }

    if (query.verificationStatus) {
    andConditions.push({
      verificationStatus: query.verificationStatus as HubManagerVerificationStatus,
    });
  }

	andConditions.push({ isDeleted: false });

	const allHubManagers = await prisma.hubManager.findMany({
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

		 hub: true,
		}

	});

	const totalHubManagerCount = await prisma.hubManager.count({
		where: {
			AND: andConditions
		}
	})

	return {
		data: allHubManagers,
		meta: {
			page: page,
			limit: limit,
			total: totalHubManagerCount,
			totalPages: Math.ceil(totalHubManagerCount / limit)
		}
	}
}

const updateHubManagerProfile = async (payload : IUpdateHubManagerProfilePayload, user : RequestUser) => {

	const existingHubManager = await prisma.hubManager.findUnique({
		where: { userId: user.userId },
	});

	if (!existingHubManager) {
		throw new AppError(httpStatus.NOT_FOUND, "Hub Manager Profile Not Found");
	}

   if (existingHubManager.isDeleted) {              
    throw new AppError(httpStatus.GONE, "Hub Manager Profile Has Been Deleted");
  }

	const result = await prisma.$transaction(async (tx) => {

    let updatedUser = null;
    let updatedHubManager = null;

    if (payload.user) {
      const { name, phone, gender } = payload.user;

      updatedUser = await tx.user.update({
        where: { 
          id: user.userId
          },
        data: {
          name,
          phone,
          gender
        },
        omit: { password: true },
      });
    }

    if (payload.hubManager) {
      const { bio, qualifications, experienceYears } = payload.hubManager;

      updatedHubManager = await tx.hubManager.update({
        where: { userId: user.userId },
        data: {
          bio,
          qualifications,
          experienceYears,
        },
      });
    }

    return { 
      user: updatedUser,
      hubManager: updatedHubManager 
    };
  });

  return result;

}

const getSingleHubManagerById = async (hubManagerId: string) => {

  const hubManager = await prisma.hubManager.findUnique({
    where: { id: hubManagerId },
    include: {
      user: { omit: { password: true } },
      hub: true,
    },
  });

  if (!hubManager) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Manager Not Found");
  }

   if (hubManager.isDeleted) {                       
    throw new AppError(httpStatus.GONE, "Hub Manager Has Been Deleted");
  }

  return hubManager;
};

const adminUpdateHubManager = async (
  hubManagerId: string,
  payload: IAdminUpdateHubManagerPayload,
) => {
  const existingHubManager = await prisma.hubManager.findUnique({
    where: { id: hubManagerId },
  });

  if (!existingHubManager) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Manager Not Found");
  }

  if (existingHubManager.isDeleted) {
    throw new AppError(httpStatus.GONE, "Hub Manager Has Been Deleted");
  }

  if (payload.hubId) {
    const { hubId } = payload;
    const hub = await prisma.hub.findUnique({
      where: { id:hubId },
    });

    if (!hub) {
      throw new AppError(httpStatus.NOT_FOUND, "Hub Not Found");
    }
  }

  const { hubId, status } = payload;
  const updatedHubManager = await prisma.hubManager.update({
    
    where: { id: hubManagerId },
    data: {
      hubId: hubId,
      status: status,
    },
    include: {
      user: { omit: { password: true } },
      hub: true,
    },
  });

  return updatedHubManager;
};

const deleteHubManager = async (hubManagerId: string) => {

  const existingHubManager = await prisma.hubManager.findUnique({
    where: { id: hubManagerId },
  });

  if (!existingHubManager) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Manager Not Found");
  }

  if (existingHubManager.isDeleted) {
    throw new AppError(httpStatus.GONE, "Hub Manager Already Deleted");
  }

  const deletedHubManager = await prisma.hubManager.update({
    where: { id: hubManagerId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
    include: {
      user: { omit: { password: true } },
      hub: true,
    },
  });

  return deletedHubManager;
};



export const HubManagerServices = {
	applyAsHubManager,
  verifyHubManagerEmail,
	approveHubManager,
  getAllHubManagers,
	updateHubManagerProfile,
 getSingleHubManagerById,
 adminUpdateHubManager,
 deleteHubManager
};

