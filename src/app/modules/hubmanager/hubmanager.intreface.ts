import { HubManagerVerificationStatus } from "../../../generated/prisma/enums";


// export interface IApplyAsHubManagerPayload {
//     user: {
//         name: string;
//         email: string;
//     };
//     hubManager: {
//         address?: string;
//         specialization: string;
//         licenseNumber: string;
//         qualifications: string;
//         experienceYears: number;
//         bio?: string;
//         consultationFee?: number;
//         contactNumber?: string;
//     };
// }


export interface IVerifyHubManagerEmailPayload {
    email: string;
    otp: string;
}


export interface IApproveDoctorPayload {
    doctorId: string;
    verificationStatus: HubManagerVerificationStatus;
    rejectionReason: string;
}

export interface IUpdateDoctorProfilePayload {
    address?: string;
    bio?: string;
    consultationFee?: number;
    contactNumber?: string;
}