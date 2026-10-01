import crypto from "crypto";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type { ShipmentWhereInput } from "../../../generated/prisma/models";
import {
	CourierManAssignType,
	CourierManCurrentStatus,
	CourierManVerificationStatus,
	HubManagerStatus,
	HubManagerVerificationStatus,
	MerchantStatus,
	PaymentMethod,
	Role,
	ShipmentStatus,
	UserStatus,
} from "../../../generated/prisma/enums";
import { PaymentStatus } from "../../../generated/prisma/enums";
import { PricingRuleServices } from "../pricingrule/pricingrule.service";
import type {
	ICreateShipmentPayload,
	IUpdateShipmentStatusPayload,
	IAssignCourierPayload,
	IAddParcelPayload,
	IUpdateParcelPayload,
} from "./shipment.validation";
import type { IPayShipmentPayload, IQueryForShipment } from "./shipment.interface";
import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";

// ---- Helpers ----

const generateTrackingNumber = (): string => {
	const year = new Date().getFullYear();
	const random = crypto.randomBytes(4).toString("hex").toUpperCase();
	return `CLM-${year}-${random}`;
};

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const recalculateShipmentWeightAndPrice = async (
	tx: TxClient,
	shipmentId: string,
) => {
	const shipment = await tx.shipment.findUniqueOrThrow({
		where: { id: shipmentId },
		include: {
			parcels: true,
			originHub: true,
			destinationHub: true,
			payment: true,
		},
	});

	const newTotalWeightKg = shipment.parcels.reduce(
		(sum, parcel) => sum + parcel.weightKg.toNumber() * parcel.quantity,
		0,
	);

	const newDeliveryCharge = await PricingRuleServices.calculatePrice(
		shipment.originHub.zoneId,
		shipment.destinationHub.zoneId,
		newTotalWeightKg,
	);

	await tx.shipment.update({
		where: { id: shipmentId },
		data: {
			totalWeightKg: newTotalWeightKg,
			deliveryCharge: newDeliveryCharge,
		},
	});

	if (
		shipment.payment &&
		shipment.payment.status !== "PAID" &&
		shipment.deliveryCharge.toNumber() !== newDeliveryCharge
	) {
		await tx.payment.update({
			where: { shipmentId },
			data: { amount: newDeliveryCharge, gatewayReferenceId: null },
		});
	}
};

const getActiveHubManagerHubId = async (userId: string): Promise<string> => {
	const dbUser = await prisma.user.findUnique({
		where: { id: userId },
		include: { hubManager: true },
	});

	if (
		!dbUser ||
		dbUser.isDeleted ||
		dbUser.status !== UserStatus.ACTIVE ||
		!dbUser.hubManager ||
		dbUser.hubManager.isDeleted ||
		dbUser.hubManager.status !== HubManagerStatus.ACTIVE ||
		dbUser.hubManager.verificationStatus !==
			HubManagerVerificationStatus.APPROVED
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your hub manager account is inactive, on leave, suspended, or not verified.",
		);
	}

	if (!dbUser.hubManager.hubId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not assigned to any hub.",
		);
	}

	return dbUser.hubManager.hubId;
};

const assertShipmentBelongsToHub = (
	shipment: { originHubId: string; destinationHubId: string },
	hubId: string,
) => {
	if (shipment.originHubId !== hubId && shipment.destinationHubId !== hubId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only access shipments related to your hub",
		);
	}
};

// Main service functions start

const createShipment = async (
	payload: ICreateShipmentPayload,
	user: RequestUser,
) => {
	if (user.role === Role.CUSTOMER || user.role === Role.MERCHANT) {
		const dbUser = await prisma.user.findUnique({
			where: { id: user.userId },
			include: {
				customer: true,
				merchantProfile: true,
			},
		});

		if (!dbUser || dbUser.isDeleted || dbUser.status !== UserStatus.ACTIVE) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Your account is suspended or deleted. You cannot create shipments.",
			);
		}

		if (user.role === Role.CUSTOMER) {
			if (!dbUser.customer || dbUser.customer.isDeleted) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Your customer account is deleted or incomplete. You cannot create shipments.",
				);
			}
		}

		if (user.role === Role.MERCHANT) {
			if (
				!dbUser.merchantProfile ||
				dbUser.merchantProfile.isDeleted ||
				dbUser.merchantProfile.status !== MerchantStatus.ACTIVE
			) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Your merchant account is suspended or deleted. You cannot create shipments.",
				);
			}
		}
	}

	const transactionResult = await prisma.$transaction(
		async (tx) => {
			const originHub = await tx.hub.findUnique({
				where: { id: payload.originHubId },
			});
			if (!originHub) {
				throw new AppError(httpStatus.NOT_FOUND, "Origin Hub Not Found");
			}

			const destinationHub = await tx.hub.findUnique({
				where: { id: payload.destinationHubId },
			});
			if (!destinationHub) {
				throw new AppError(httpStatus.NOT_FOUND, "Destination Hub Not Found");
			}

			if (payload.isCod && user.role === Role.MERCHANT) {
				const merchantProfile = await tx.merchantProfile.findUnique({
					where: { userId: user.userId },
				});

				if (!merchantProfile) {
					throw new AppError(
						httpStatus.NOT_FOUND,
						"Merchant Profile Not Found",
					);
				}

				if (payload.codAmount! > merchantProfile.codLimit.toNumber()) {
					throw new AppError(
						httpStatus.BAD_REQUEST,
						`COD amount exceeds your limit of ${merchantProfile.codLimit} BDT`,
					);
				}
			}

			const totalWeightKg = payload.parcels.reduce(
				(sum, parcel) => sum + parcel.weightKg * parcel.quantity,
				0,
			);

			const deliveryCharge = await PricingRuleServices.calculatePrice(
				originHub.zoneId,
				destinationHub.zoneId,
				totalWeightKg,
			);

			const trackingNumber = generateTrackingNumber();
			const amount = deliveryCharge.toString();

			const shipment = await tx.shipment.create({
				data: {
					trackingNumber,
					senderId: user.userId,

					senderAddressLine: payload.senderAddressLine,
					senderDistrict: payload.senderDistrict,
					senderThana: payload.senderThana,
					senderPostalCode: payload.senderPostalCode,
					senderLandmark: payload.senderLandmark,

					receiverName: payload.receiverName,
					receiverPhone: payload.receiverPhone,
					receiverAddressLine: payload.receiverAddressLine,
					receiverDistrict: payload.receiverDistrict,
					receiverThana: payload.receiverThana,
					receiverPostalCode: payload.receiverPostalCode,
					receiverLandmark: payload.receiverLandmark,

					originHubId: payload.originHubId,
					destinationHubId: payload.destinationHubId,

					totalWeightKg,
					deliveryCharge,
					codAmount: payload.isCod ? payload.codAmount : null,

					status: "PENDING",

					parcels: {
						create: payload.parcels.map((parcel) => ({
							description: parcel.description,
							category: parcel.category,
							quantity: parcel.quantity,
							weightKg: parcel.weightKg,
							declaredValue: parcel.declaredValue,
							isFragile: parcel.isFragile,
						})),
					},

					statusHistory: {
						create: {
							status: "PENDING",
							note: "Shipment created, awaiting payment",
							updatedById: user.userId,
						},
					},
				},
			});

			const bkashIdToken = await getBkashIdToken();

			if (!bkashIdToken) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					"No Bkash Access Token Found!",
				);
			}

			const bkashCreatePaymentResponse = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/create`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						Authorization: bkashIdToken,
						"X-App-Key": config.bkash_app_key,
					},
					body: JSON.stringify({
						mode: "0011",
						payerReference: user.email,
						callbackURL: `${config.bkash_callback_url}/shipment/create-shipment/payment/callback`,
						amount,
						currency: "BDT",
						intent: "sale",
						merchantInvoiceNumber: shipment.id,
					}),
				},
			);

			const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

			if (
				!bkashCreatePaymentResult?.paymentID ||
				!bkashCreatePaymentResult?.bkashURL
			) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					`Failed to initiate bKash payment: ${bkashCreatePaymentResult?.statusMessage ?? "Unknown error"}`,
				);
			}

			await tx.payment.create({
				data: {
					shipmentId: shipment.id,
					amount: deliveryCharge,
					method: PaymentMethod.BKASH,
					paymentGateway: "bkash",
					merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
					gatewayReferenceId: bkashCreatePaymentResult.paymentID,
					gatewayResponse: bkashCreatePaymentResult,
					payerReference: user.email,
					status: "UNPAID",
				},
			});

			return { paymentUrl: bkashCreatePaymentResult.bkashURL };
		},

		{ maxWait: 10000, timeout: 30000 },
	);

	return transactionResult;
};

const payShipment = async (payload: IPayShipmentPayload, user: RequestUser) => {
	const shipmentId = payload.shipmentId;

	const existingShipment = await prisma.shipment.findUnique({
		where: { id: shipmentId },
		include: { payment: true },
	});

	if (!existingShipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Does Not Exist");
	}

	if (existingShipment.senderId !== user.userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Can Only Pay For Your Own Shipments",
		);
	}

	if (existingShipment.status !== "PENDING") {
		throw new AppError(httpStatus.BAD_REQUEST, "Shipment Is Not Pending!");
	}

	if (!existingShipment.payment) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"No Existing Payment Record Found For This Shipment",
		);
	}

	if (existingShipment.payment.status === "PAID") {
		throw new AppError(
			httpStatus.CONFLICT,
			"This Shipment Has Already Been Paid For",
		);
	}

	const amount = existingShipment.deliveryCharge.toString();

	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
	}

	const bkashCreatePaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				mode: "0011",
				payerReference: user.email,
				callbackURL: `${config.bkash_callback_url}/shipment/create-shipment/payment/callback`,
				amount,
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: existingShipment.id,
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

	if (
		!bkashCreatePaymentResult?.paymentID ||
		!bkashCreatePaymentResult?.bkashURL
	) {
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			`Failed to initiate bKash payment: ${bkashCreatePaymentResult?.statusMessage ?? "Unknown error"}`,
		);
	}

	await prisma.payment.update({
		where: { shipmentId: existingShipment.id },
		data: {
			merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
			gatewayReferenceId: bkashCreatePaymentResult.paymentID,
			gatewayResponse: bkashCreatePaymentResult,
		},
	});

	return {
		paymentUrl: bkashCreatePaymentResult.bkashURL,
	};
};

const shipmentPaymentCallback = async (query: Record<string, any>) => {
	const transactionResult = await prisma.$transaction(
		async (tx) => {
			const paymentId = query.paymentID;

			if (!paymentId) {
				throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
			}

			const status = query.status;

			if (!status) {
				throw new AppError(httpStatus.BAD_REQUEST, "Payment Status is Missing");
			}
			const payment = await tx.payment.findUnique({
				where: { gatewayReferenceId: paymentId },
				include: {
					shipment: {
						include: {
							sender: true,
							parcels: true,
							statusHistory: true,
						},
					},
				},
			});

			if (!payment) {
				throw new AppError(
					httpStatus.NOT_FOUND,
					"This payment session is no longer valid. Please start the payment again.",
				);
			}

			const bkashIdToken = await getBkashIdToken();

			if (!bkashIdToken) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					"No Bkash Access Token Found!",
				);
			}

			const executedPaymentResponse = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/execute`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						Authorization: bkashIdToken,
						"X-App-Key": config.bkash_app_key,
					},
					body: JSON.stringify({ paymentID: paymentId }),
				},
			);

			const executedPaymentResult = await executedPaymentResponse.json();

			if (status === "success") {
				// const shipment = await tx.shipment.findUnique({
				//   where: {id: executedPaymentResult.merchantInvoiceNumber },
				//   include: {
				//     parcels: true,
				//     statusHistory: true,
				//     payment: true,
				//     sender: true,
				//    },
				// });
				const shipment = payment.shipment;

				if (!shipment) {
					throw new AppError(
						httpStatus.NOT_FOUND,
						"Shipment Record Not Found!",
					);
				}

				await tx.shipment.update({
					where: { id: executedPaymentResult.merchantInvoiceNumber },
					data: { status: ShipmentStatus.PICKUP_REQUESTED },
				});

				await tx.shipmentStatusHistory.create({
					data: {
						shipmentId: executedPaymentResult.merchantInvoiceNumber,
						status: ShipmentStatus.PICKUP_REQUESTED,
						note: "Payment confirmed, pickup requested",
						updatedById: shipment.senderId,
					},
				});

				await tx.payment.update({
					where: { shipmentId: executedPaymentResult.merchantInvioceNumber },
					data: {
						status: PaymentStatus.PAID,
						gatewayTransactionId: executedPaymentResult.trxID,
						paidAt: executedPaymentResult.paymentExecuteTime,
						gatewayResponse: executedPaymentResult,
					},
				});

				// ---- Invoice PDF ----

				const pdfDocument = new PDFDocument({ margin: 50, size: "A4" });

				const pdfChunks: Buffer[] = [];

				pdfDocument.on("data", (chunk: Buffer) => {
					pdfChunks.push(chunk);
				});

				const pdfReadyPromise = new Promise<Buffer>((resolve) => {
					pdfDocument.on("end", () => {
						resolve(Buffer.concat(pdfChunks));
					});
				});

				// HEADER

				pdfDocument
					.fontSize(20)
					.font("Helvetica-Bold")
					.text("COURIER & LOGISTICS MANAGEMENT");

				pdfDocument
					.fontSize(10)
					.font("Helvetica")
					.fillColor("#666666")
					.text("Shipment & Delivery Services");

				pdfDocument
					.moveUp(2)
					.fontSize(10)
					.fillColor("#333333")
					.text("PAYMENT RECEIPT", { align: "right" });

				pdfDocument.moveDown(1);

				pdfDocument
					.strokeColor("#dddddd")
					.moveTo(50, pdfDocument.y)
					.lineTo(545, pdfDocument.y)
					.stroke();

				pdfDocument.moveDown(1);

				// INVOICE TITLE

				pdfDocument
					.fontSize(18)
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text("PAYMENT INVOICE");

				pdfDocument.moveDown(0.5);

				pdfDocument
					.fontSize(10)
					.font("Helvetica")
					.fillColor("#555555")
					.text(`Invoice Date: ${new Date().toLocaleDateString("en-GB")}`);

				pdfDocument.text(`Tracking No: ${shipment.trackingNumber}`);

				pdfDocument.moveDown(1.5);

				// SENDER / RECEIVER

				const sectionY = pdfDocument.y;

				// Sender Box

				pdfDocument
					.roundedRect(50, sectionY, 235, 110, 5)
					.lineWidth(1)
					.strokeColor("#dddddd")
					.stroke();

				pdfDocument
					.fontSize(10)
					.font("Helvetica-Bold")
					.fillColor("#333333")
					.text("SENDER", 65, sectionY + 15);

				pdfDocument
					.fontSize(11)
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text(shipment.sender.name, 65, sectionY + 38);

				pdfDocument
					.fontSize(9)
					.font("Helvetica")
					.fillColor("#555555")
					.text(shipment.sender.email, 65, sectionY + 57);

				// Receiver Box

				pdfDocument
					.roundedRect(310, sectionY, 235, 110, 5)
					.strokeColor("#dddddd")
					.stroke();

				pdfDocument
					.fontSize(10)
					.font("Helvetica-Bold")
					.fillColor("#333333")
					.text("RECEIVER", 325, sectionY + 15);

				pdfDocument
					.fontSize(11)
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text(shipment.receiverName, 325, sectionY + 38);

				pdfDocument
					.fontSize(9)
					.font("Helvetica")
					.fillColor("#555555")
					.text(shipment.receiverPhone, 325, sectionY + 57);

				pdfDocument.text(
					`${shipment.receiverAddressLine}, ${shipment.receiverDistrict}`,
					325,
					sectionY + 74,
					{ width: 200 },
				);

				pdfDocument.y = sectionY + 135;

				// SHIPMENT DETAILS

				pdfDocument
					.fontSize(13)
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text("SHIPMENT DETAILS");

				pdfDocument.moveDown(0.5);

				pdfDocument
					.strokeColor("#dddddd")
					.moveTo(50, pdfDocument.y)
					.lineTo(545, pdfDocument.y)
					.stroke();

				pdfDocument.moveDown(0.8);

				const detailsY = pdfDocument.y;

				pdfDocument
					.fontSize(10)
					.font("Helvetica")
					.fillColor("#666666")
					.text("Tracking Number", 50, detailsY);

				pdfDocument
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text(shipment.trackingNumber, 200, detailsY);

				pdfDocument
					.font("Helvetica")
					.fillColor("#666666")
					.text("Destination", 50, detailsY + 22);

				pdfDocument
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text(
						`${shipment.receiverDistrict}, ${shipment.receiverThana}`,
						200,
						detailsY + 22,
					);

				pdfDocument
					.font("Helvetica")
					.fillColor("#666666")
					.text("Payment Method", 50, detailsY + 44);

				pdfDocument
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text("bKash", 200, detailsY + 44);

				pdfDocument.moveDown(4);

				// PAYMENT SUMMARY

				pdfDocument
					.fontSize(13)
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text("PAYMENT SUMMARY");

				pdfDocument.moveDown(0.5);

				pdfDocument
					.strokeColor("#dddddd")
					.moveTo(50, pdfDocument.y)
					.lineTo(545, pdfDocument.y)
					.stroke();

				pdfDocument.moveDown(1);

				const paymentY = pdfDocument.y;

				pdfDocument
					.fontSize(10)
					.font("Helvetica")
					.fillColor("#666666")
					.text("Amount Paid", 50, paymentY);

				pdfDocument
					.fontSize(18)
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text(
						`৳ ${Number(executedPaymentResult.amount).toFixed(2)}`,
						400,
						paymentY - 4,
						{ width: 145, align: "right" },
					);

				pdfDocument.moveDown(2);

				pdfDocument
					.fontSize(10)
					.font("Helvetica")
					.fillColor("#555555")
					.text(`Transaction ID: ${executedPaymentResult.trxID}`);

				pdfDocument.text(
					`Paid At: ${executedPaymentResult.paymentExecuteTime}`,
				);

				pdfDocument.moveDown(1.5);

				// PAYMENT STATUS

				const statusY = pdfDocument.y;

				pdfDocument
					.roundedRect(50, statusY, 495, 45, 5)
					.strokeColor("#cccccc")
					.stroke();
				pdfDocument
					.fontSize(11)
					.font("Helvetica-Bold")
					.fillColor("#111111")
					.text("✓ Payment Successfully Completed", 65, statusY + 15);

				pdfDocument.moveDown(4);

				// FOOTER

				pdfDocument
					.strokeColor("#dddddd")
					.moveTo(50, pdfDocument.y)
					.lineTo(545, pdfDocument.y)
					.stroke();
				pdfDocument.moveDown(1);

				pdfDocument
					.fontSize(9)
					.font("Helvetica")
					.fillColor("#777777")
					.text("Thank you for using our courier service.", {
						align: "center",
					});

				pdfDocument.text("This is a computer-generated payment receipt.", {
					align: "center",
				});

				pdfDocument.end();

				const pdfBuffer = await pdfReadyPromise;

				await transporter.sendMail({
					from: {
						name: "Courier & Logistics Management",
						address: config.email_sender,
					},
					to: shipment.sender.email,

					subject: "Your Shipment Payment Invoice",
					text: "Thank you for your payment. Please find your invoice attached.",
					attachments: [
						{
							filename: "invoice.pdf",
							content: pdfBuffer,
						},
					],
				});

				return {
					redirectUrl: `${config.frontend_url}/dashboard/my-shipments?status=success`,
				};
			} else if (status === "failure") {
				await tx.payment.update({
					where: {
						gatewayReferenceId: paymentId,
					},
					data: {
						status: PaymentStatus.FAILED,
						gatewayResponse: executedPaymentResult,
					},
				});

				return {
					redirectUrl: `${config.frontend_url}/dashboard/my-shipments?status=failure`,
				};
			} else if (status === "cancel") {
				await tx.payment.update({
					where: { gatewayReferenceId: paymentId },
					data: {
						status: PaymentStatus.CANCELLED,
						gatewayResponse: executedPaymentResult,
					},
				});

				return {
					redirectUrl: `${config.frontend_url}/dashboard/my-shipments?status=cancel`,
				};
			} else {
				return {
					redirectUrl: `${config.frontend_url}/dashboard/my-shipments?error=payment-failed`,
				};
			}
		},
		{ maxWait: 10000, timeout: 30000 },
	);

	return transactionResult;
};

const cancelShipment = async (shipmentId: string, user: RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const existingShipment = await tx.shipment.findUnique({
			where: { id: shipmentId, senderId: user.userId },
			include: {
				payment: true,
				sender: true,
			},
		});

		if (!existingShipment) {
			throw new AppError(httpStatus.NOT_FOUND, "Shipment Does Not Exist");
		}

		const CANCELLABLE_STATUSES: ShipmentStatus[] = [
			"PENDING",
			"PICKUP_REQUESTED",
		];

		if (!CANCELLABLE_STATUSES.includes(existingShipment.status)) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`Shipment cannot be cancelled once it is ${existingShipment.status}`,
			);
		}

		const updatedShipment = await tx.shipment.update({
			where: { id: shipmentId },
			data: { status: "CANCELLED" },
		});

		await tx.shipmentStatusHistory.create({
			data: {
				shipmentId,
				status: "CANCELLED",
				note: "Cancelled by sender",
				updatedById: user.userId,
			},
		});

		// ---- Refund — when payment PAID  ----
		const isEligibleForRefund = existingShipment.payment?.status === "PAID";

		if (isEligibleForRefund && existingShipment.payment) {
			const bkashIdToken = await getBkashIdToken();

			if (!bkashIdToken) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					"No Bkash Access Token Found!",
				);
			}

			const bkashRefundPaymentResponse = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/payment/refund`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						Authorization: bkashIdToken,
						"X-App-Key": config.bkash_app_key,
					},
					body: JSON.stringify({
						paymentID: existingShipment.payment.gatewayReferenceId,
						trxID: existingShipment.payment.gatewayTransactionId,
						amount: existingShipment.payment.amount.toString(),
						sku: "Shipment Cancellation",
						reason: "Sender Cancelled The Shipment",
					}),
				},
			);

			const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();

			if (
				!bkashRefundPaymentResponse.ok ||
				bkashRefundPaymentResult.statusCode !== "0000"
			) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					`Refund failed: ${bkashRefundPaymentResult.statusMessage || "Unknown error from bKash"}`,
				);
			}

			await tx.payment.update({
				where: { shipmentId },
				data: {
					refundTransactionId: bkashRefundPaymentResult.refundTrxID,
					refundedAt: bkashRefundPaymentResult.completedTime,
					refundAmount: bkashRefundPaymentResult.amount,
					refundReason: "Sender Cancelled The Shipment",
					status: PaymentStatus.REFUNDED,
					gatewayResponse: bkashRefundPaymentResult,
				},
			});

			// ==============================
			//      REFUND INVOICE PDF
			// ==============================
			const pdfDocument = new PDFDocument({ margin: 50, size: "A4" });

			const pdfChunks: Buffer[] = [];
			pdfDocument.on("data", (chunk: Buffer) => {
				pdfChunks.push(chunk);
			});

			const pdfReadyPromise = new Promise<Buffer>((resolve) => {
				pdfDocument.on("end", () => {
					resolve(Buffer.concat(pdfChunks));
				});
			});

			// HEADER
			pdfDocument
				.fontSize(20)
				.font("Helvetica-Bold")
				.text("COURIER & LOGISTICS MANAGEMENT");

			pdfDocument
				.fontSize(10)
				.font("Helvetica")
				.fillColor("#666666")
				.text("Shipment & Delivery Services");

			pdfDocument
				.moveUp(2)
				.fontSize(10)
				.fillColor("#333333")
				.text("REFUND RECEIPT", { align: "right" });

			pdfDocument.moveDown(1);

			pdfDocument
				.strokeColor("#dddddd")
				.moveTo(50, pdfDocument.y)
				.lineTo(545, pdfDocument.y)
				.stroke();

			pdfDocument.moveDown(1);

			// TITLE
			pdfDocument
				.fontSize(18)
				.font("Helvetica-Bold")
				.fillColor("#111111")
				.text("REFUND INVOICE");

			pdfDocument.moveDown(0.5);

			pdfDocument
				.fontSize(10)
				.font("Helvetica")
				.fillColor("#555555")
				.text(`Invoice Date: ${new Date().toLocaleDateString("en-GB")}`);

			pdfDocument.text(`Tracking No: ${existingShipment.trackingNumber}`);

			pdfDocument.moveDown(1.5);

			// SENDER BOX
			const sectionY = pdfDocument.y;

			pdfDocument
				.roundedRect(50, sectionY, 495, 90, 5)
				.lineWidth(1)
				.strokeColor("#dddddd")
				.stroke();

			pdfDocument
				.fontSize(10)
				.font("Helvetica-Bold")
				.fillColor("#333333")
				.text("REFUNDED TO", 65, sectionY + 15);

			pdfDocument
				.fontSize(11)
				.font("Helvetica-Bold")
				.fillColor("#111111")
				.text(existingShipment.sender.name, 65, sectionY + 38);

			pdfDocument
				.fontSize(9)
				.font("Helvetica")
				.fillColor("#555555")
				.text(existingShipment.sender.email, 65, sectionY + 57);

			pdfDocument.y = sectionY + 110;

			// REFUND SUMMARY
			pdfDocument
				.fontSize(13)
				.font("Helvetica-Bold")
				.fillColor("#111111")
				.text("REFUND SUMMARY");

			pdfDocument.moveDown(0.5);

			pdfDocument
				.strokeColor("#dddddd")
				.moveTo(50, pdfDocument.y)
				.lineTo(545, pdfDocument.y)
				.stroke();

			pdfDocument.moveDown(1);

			const paymentY = pdfDocument.y;

			pdfDocument
				.fontSize(10)
				.font("Helvetica")
				.fillColor("#666666")
				.text("Amount Refunded", 50, paymentY);

			pdfDocument
				.fontSize(18)
				.font("Helvetica-Bold")
				.fillColor("#111111")
				.text(
					`৳ ${Number(bkashRefundPaymentResult.amount).toFixed(2)}`,
					400,
					paymentY - 4,
					{ width: 145, align: "right" },
				);

			pdfDocument.moveDown(2);

			pdfDocument
				.fontSize(10)
				.font("Helvetica")
				.fillColor("#555555")
				.text(`Refund Transaction ID: ${bkashRefundPaymentResult.refundTrxID}`);

			pdfDocument.text(
				`Refunded At: ${bkashRefundPaymentResult.completedTime}`,
			);

			pdfDocument.moveDown(1.5);

			// STATUS BOX
			const statusY = pdfDocument.y;

			pdfDocument
				.roundedRect(50, statusY, 495, 45, 5)
				.strokeColor("#cccccc")
				.stroke();

			pdfDocument
				.fontSize(11)
				.font("Helvetica-Bold")
				.fillColor("#111111")
				.text("✓ Refund Successfully Completed", 65, statusY + 15);

			pdfDocument.moveDown(4);

			// FOOTER
			pdfDocument
				.strokeColor("#dddddd")
				.moveTo(50, pdfDocument.y)
				.lineTo(545, pdfDocument.y)
				.stroke();

			pdfDocument.moveDown(1);

			pdfDocument
				.fontSize(9)
				.font("Helvetica")
				.fillColor("#777777")
				.text("Thank you for using our courier service.", { align: "center" });

			pdfDocument.text("This is a computer-generated refund receipt.", {
				align: "center",
			});

			pdfDocument.end();

			const pdfBuffer = await pdfReadyPromise;

			// Email
			await transporter.sendMail({
				from: {
					name: "Courier & Logistics Management",
					address: config.email_sender,
				},
				to: existingShipment.sender.email,
				subject: "Your Shipment Refund Invoice",
				text: "Your shipment has been cancelled and the payment has been refunded. Please find the refund invoice attached.",
				attachments: [
					{
						filename: "refund-invoice.pdf",
						content: pdfBuffer,
					},
				],
			});
		}

		const newPaymentInfo = await tx.payment.findUnique({
			where: { shipmentId },
		});

		return { shipment: updatedShipment, payment: newPaymentInfo };
	});

	return transactionResult;
};

const getMyShipments = async (user: RequestUser, query: IQueryForShipment) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: ShipmentWhereInput[] = [{ senderId: user.userId }];

	if (query.status) {
		andConditions.push({ status: query.status as ShipmentStatus });
	}

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ trackingNumber: { contains: query.searchTerm, mode: "insensitive" } },
				{ receiverName: { contains: query.searchTerm, mode: "insensitive" } },
				{ receiverPhone: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	const shipments = await prisma.shipment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			parcels: true,
			originHub: true,
			destinationHub: true,
			payment: true,
		},
	});

	const totalCount = await prisma.shipment.count({
		where: { AND: andConditions },
	});

	return {
		data: shipments,
		meta: {
			page,
			limit,
			total: totalCount,
			totalPages: Math.ceil(totalCount / limit),
		},
	};
};

//  Tracking number: shipment — public

const getShipmentByTrackingNumber = async (trackingNumber: string) => {
	const shipment = await prisma.shipment.findUnique({
		where: { trackingNumber },
		include: {
			parcels: true,
			statusHistory: { orderBy: { createdAt: "asc" } },
			originHub: true,
			destinationHub: true,
		},
	});

	if (!shipment) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Shipment Not Found With This Tracking Number",
		);
	}

	return shipment;
};

//  Admin/Hub Manager, mechant/customer: single shipment by ID

const getSingleShipmentById = async (shipmentId: string, user: RequestUser) => {
	const shipment = await prisma.shipment.findUnique({
		where: { id: shipmentId },
		include: {
			sender: { omit: { password: true } },
			parcels: true,
			statusHistory: { orderBy: { createdAt: "asc" } },
			originHub: true,
			destinationHub: true,
			transferCourierMan: { include: { user: { omit: { password: true } } } },
			lastMileCourierMan: { include: { user: { omit: { password: true } } } },
			payment: true,
			codCollection: true,
		},
	});

	if (!shipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	if (
		(user.role === "CUSTOMER" || user.role === "MERCHANT") &&
		shipment.senderId !== user.userId
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Are Not Allowed To View This Shipment",
		);
	}

	if (user.role === Role.HUB_MANAGER) {
		const hubId = await getActiveHubManagerHubId(user.userId);
		assertShipmentBelongsToHub(shipment, hubId);
	}

	return shipment;
};

//  Admin/Hub Manager: shipment list

const getAllShipments = async (query: IQueryForShipment, user: RequestUser) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: ShipmentWhereInput[] = [];

	if (user.role === Role.HUB_MANAGER) {
		const hubId = await getActiveHubManagerHubId(user.userId);
		andConditions.push({
			OR: [{ originHubId: hubId }, { destinationHubId: hubId }],
		});
	}

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ trackingNumber: { contains: query.searchTerm, mode: "insensitive" } },
				{ receiverName: { contains: query.searchTerm, mode: "insensitive" } },
				{ receiverPhone: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.status) {
		andConditions.push({ status: query.status as ShipmentStatus });
	}

	// COD filter
	if (query.isCod === "true") {
		andConditions.push({ codAmount: { not: null } });
	}

	if (query.isCod === "false") {
		andConditions.push({ codAmount: null });
	}

	if (query.originHubId) {
		andConditions.push({ originHubId: query.originHubId });
	}

	if (query.destinationHubId) {
		andConditions.push({ destinationHubId: query.destinationHubId });
	}

	const shipments = await prisma.shipment.findMany({
		where: { AND: andConditions.length > 0 ? andConditions : undefined },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			sender: { omit: { password: true } },
			originHub: true,
			destinationHub: true,
		},
	});

	const totalCount = await prisma.shipment.count({
		where: { AND: andConditions.length > 0 ? andConditions : undefined },
	});

	return {
		data: shipments,
		meta: {
			page,
			limit,
			total: totalCount,
			totalPages: Math.ceil(totalCount / limit),
		},
	};
};

// Status update — Hub Manager/Admin driven workflow progress

const updateShipmentStatus = async (
	shipmentId: string,
	payload: IUpdateShipmentStatusPayload,
	updater: RequestUser,
) => {
	let hubManagerHubId: string | null = null;

	if (updater.role === Role.HUB_MANAGER) {
		hubManagerHubId = await getActiveHubManagerHubId(updater.userId);
	}
	//   if (updater.role === Role.HUB_MANAGER) {
	//     const dbUser = await prisma.user.findUnique({
	//       where: { id: updater.userId },
	//       include: { hubManager: true },
	//     });

	//   if (
	//      !dbUser ||
	//      dbUser.isDeleted ||
	//      dbUser.status !== UserStatus.ACTIVE ||
	//     !dbUser.hubManager ||
	//      dbUser.hubManager.isDeleted ||
	//     dbUser.hubManager.status !== HubManagerStatus.ACTIVE ||
	//     dbUser.hubManager.verificationStatus !== HubManagerVerificationStatus.APPROVED
	//    ) {
	//       const reason =
	//       !dbUser || dbUser.isDeleted || dbUser.status !== UserStatus.ACTIVE
	//       ? "inactive or deleted"
	//       : !dbUser.hubManager || dbUser.hubManager.isDeleted
	//         ? "missing or deleted"
	//         : dbUser.hubManager.verificationStatus !== HubManagerVerificationStatus.APPROVED
	// ? "not verified"
	//           : dbUser.hubManager.status;

	//      throw new AppError(
	//     httpStatus.FORBIDDEN,
	//     `Your hub manager account is ${reason}. You cannot update shipment status.`,
	//     );
	//   }
	// }
	const existingShipment = await prisma.shipment.findUnique({
		where: { id: shipmentId },
		include: { codCollection: true },
	});

	if (!existingShipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	if (hubManagerHubId) {
		assertShipmentBelongsToHub(existingShipment, hubManagerHubId);
	}

	const FINAL_STATUSES: ShipmentStatus[] = [
		ShipmentStatus.DELIVERED,
		ShipmentStatus.FAILED_DELIVERY,
		ShipmentStatus.RETURNED,
		ShipmentStatus.CANCELLED,
	];

	if (FINAL_STATUSES.includes(existingShipment.status)) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Shipment is already in a final state (${existingShipment.status}), status cannot be changed further`,
		);
	}

	if (
		payload.status === ShipmentStatus.DELIVERED &&
		existingShipment.codAmount != null
	) {
		if (!existingShipment.codCollection) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Cash has not been recorded as collected from the receiver yet",
			);
		}

		if (!existingShipment.codCollection.submittedToHubAt) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Collected cash must be submitted to and confirmed by the hub before marking as delivered",
			);
		}
	}

	const isNewStatusTerminal = FINAL_STATUSES.includes(payload.status);

	const shouldFreeCouriers = isNewStatusTerminal;

	const updatedShipment = await prisma.$transaction(async (tx) => {
		const shipment = await tx.shipment.update({
			where: { id: shipmentId },
			data: {
				status: payload.status,
				deliveredAt:
					payload.status === ShipmentStatus.DELIVERED ? new Date() : undefined,
				returnedAt:
					payload.status === ShipmentStatus.RETURNED ? new Date() : undefined,
				failureReason:
					payload.status === ShipmentStatus.FAILED_DELIVERY
						? payload.note
						: undefined,
				deliveryAttemptCount:
					payload.status === ShipmentStatus.FAILED_DELIVERY
						? { increment: 1 }
						: undefined,
			},
		});

		await tx.shipmentStatusHistory.create({
			data: {
				shipmentId,
				status: payload.status,
				note: payload.note,
				updatedById: updater.userId,
			},
		});

		if (shouldFreeCouriers) {
			const courierIdsToFree = [
				existingShipment.transferCourierManId,
				existingShipment.lastMileCourierManId,
			].filter((id): id is string => id !== null);

			if (courierIdsToFree.length > 0) {
				await tx.courierMan.updateMany({
					where: { id: { in: courierIdsToFree } },
					data: { isAvailable: true },
				});
			}
		}

		return shipment;
	});

	return updatedShipment;
};

//  Courier man assign

const assignCourierMan = async (
	shipmentId: string,
	payload: IAssignCourierPayload,
	updater: RequestUser,
) => {
	let hubManagerHubId: string | null = null;

	if (updater.role === Role.HUB_MANAGER) {
		hubManagerHubId = await getActiveHubManagerHubId(updater.userId);
	}

	const existingShipment = await prisma.shipment.findUnique({
		where: { id: shipmentId },
	});

	if (!existingShipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	if (hubManagerHubId) {
		assertShipmentBelongsToHub(existingShipment, hubManagerHubId);
	}

	const courierMan = await prisma.courierMan.findUnique({
		where: { id: payload.courierManId },
	});

	if (!courierMan) {
		throw new AppError(httpStatus.NOT_FOUND, "Courier Man Not Found");
	}

	if (courierMan.isDeleted) {
		throw new AppError(httpStatus.GONE, "This Courier Man Has Been Deleted");
	}

	if (!courierMan.isAvailable) {
		throw new AppError(
			httpStatus.CONFLICT,
			"This Courier Man Is Not Available Right Now",
		);
	}

	if (courierMan.verificationStatus !== CourierManVerificationStatus.APPROVED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only verified courier men can be assigned",
		);
	}

	const ASSIGNABLE_STATUSES: ShipmentStatus[] = [
		"PICKUP_REQUESTED",
		"AT_ORIGIN_HUB",
		"IN_TRANSIT",
		"AT_DESTINATION_HUB",
	];

	if (!ASSIGNABLE_STATUSES.includes(existingShipment.status)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot assign courier when shipment is in ${existingShipment.status} status`,
		);
	}

	if (courierMan.currentStatus !== CourierManCurrentStatus.ACTIVE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Courier is currently ${courierMan.currentStatus}`,
		);
	}

	if (
		payload.assignmentType === CourierManAssignType.HUB_TRANSFER &&
		courierMan.courierManAssignType !== CourierManAssignType.HUB_TRANSFER
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only HUB_TRANSFER type courier men can be assigned for transfer",
		);
	}

	if (
		payload.assignmentType === CourierManAssignType.LAST_MILE &&
		courierMan.courierManAssignType !== CourierManAssignType.LAST_MILE
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only LAST_MILE type courier men can be assigned for last-mile delivery",
		);
	}

	const updateData =
		payload.assignmentType === CourierManAssignType.HUB_TRANSFER
			? { transferCourierManId: payload.courierManId }
			: { lastMileCourierManId: payload.courierManId };

	const newStatus: ShipmentStatus =
		payload.assignmentType === CourierManAssignType.HUB_TRANSFER
			? ShipmentStatus.COURIER_ASSIGNED
			: ShipmentStatus.OUT_FOR_DELIVERY;

	const updatedShipment = await prisma.$transaction(async (tx) => {
		const shipment = await tx.shipment.update({
			where: { id: shipmentId },
			data: { ...updateData, status: newStatus },
			include: {
				transferCourierMan: { include: { user: { omit: { password: true } } } },
				lastMileCourierMan: { include: { user: { omit: { password: true } } } },
			},
		});

		await tx.shipmentStatusHistory.create({
			data: {
				shipmentId,
				status: newStatus,
				note: `Assigned to courier (${payload.assignmentType})`,
				updatedById: updater.userId,
			},
		});

		await tx.courierMan.update({
			where: { id: payload.courierManId },
			data: { isAvailable: false },
		});

		return shipment;
	});

	return updatedShipment;
};

const shipmentAsDelivered = async (shipmentId: string, user: RequestUser) => {
	// 1. Find courier profile
	const courierMan = await prisma.courierMan.findUnique({
		where: { userId: user.userId },
	});

	if (!courierMan) {
		throw new AppError(httpStatus.FORBIDDEN, "Courier Man Profile Not Found");
	}

	// 2. Find shipment
	const shipment = await prisma.shipment.findUnique({
		where: { id: shipmentId },
		include: {
			codCollection: true,
		},
	});

	if (!shipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	// 3. Check whether this courier is assigned
	// as the last-mile courier
	if (shipment.lastMileCourierManId !== courierMan.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Are Not Assigned To This Shipment",
		);
	}

	// 4. Shipment must be out for delivery
	if (shipment.status !== ShipmentStatus.OUT_FOR_DELIVERY) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only shipments out for delivery can be marked as delivered",
		);
	}

	// 5. If this is a COD shipment,
	// collection must be recorded before delivery
	if (shipment.codAmount !== null && !shipment.codCollection) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"COD Collection Must Be Recorded Before Delivery",
		);
	}

	// 6. Update shipment, create history,
	// and make courier available again
	const result = await prisma.$transaction(async (tx) => {
		const updatedShipment = await tx.shipment.update({
			where: { id: shipmentId },
			data: {
				status: ShipmentStatus.DELIVERED,
				deliveredAt: new Date(),
			},
		});

		// Create status history
		await tx.shipmentStatusHistory.create({
			data: {
				shipmentId,
				status: ShipmentStatus.DELIVERED,
				note: "Shipment delivered successfully",
				updatedById: user.userId,
			},
		});

		// Courier is now available for another shipment
		await tx.courierMan.update({
			where: { id: courierMan.id },
			data: {
				isAvailable: true,
			},
		});

		return updatedShipment;
	});

	return result;
};

//  Parcel add/update/delete — in PENDING status

const addParcel = async (
	shipmentId: string,
	payload: IAddParcelPayload,
	user: RequestUser,
) => {
	const shipment = await prisma.shipment.findUnique({
		where: { id: shipmentId },
	});

	if (!shipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	if (shipment.senderId !== user.userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Can Only Modify Your Own Shipments",
		);
	}

	if (shipment.status !== "PENDING") {
		throw new AppError(
			httpStatus.CONFLICT,
			"Parcels can only be added while the shipment is still PENDING",
		);
	}

	const newParcel = await prisma.$transaction(async (tx) => {
		const parcel = await tx.parcel.create({
			data: {
				shipmentId,
				description: payload.description,
				category: payload.category,
				quantity: payload.quantity,
				weightKg: payload.weightKg,
				declaredValue: payload.declaredValue,
				isFragile: payload.isFragile,
			},
		});

		await recalculateShipmentWeightAndPrice(tx, shipmentId);
		return parcel;
	});

	return newParcel;
};

const updateParcel = async (
	shipmentId: string,
	parcelId: string,
	payload: IUpdateParcelPayload,
	user: RequestUser,
	file: Express.Multer.File | null,
) => {
	const shipment = await prisma.shipment.findUnique({
		where: { id: shipmentId },
	});

	if (!shipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	if (shipment.senderId !== user.userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Can Only Modify Your Own Shipments",
		);
	}

	if (shipment.status !== "PENDING") {
		throw new AppError(
			httpStatus.CONFLICT,
			"Parcels can only be updated while the shipment is still PENDING",
		);
	}

	const existingParcel = await prisma.parcel.findUnique({
		where: { id: parcelId },
	});

	if (!existingParcel || existingParcel.shipmentId !== shipmentId) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Parcel Not Found In This Shipment",
		);
	}

	let newImage: { url: string; publicId: string } | null = null;

	if (file) {
		const uploadResult = await new Promise<UploadApiResponse>(
			(resolve, reject) => {
				cloudinary.uploader
					.upload_stream({ resource_type: "auto" }, async (error, result) => {
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
					})
					.end(file.buffer);
			},
		);

		newImage = {
			url: uploadResult.secure_url,
			publicId: uploadResult.public_id,
		};
	}

	let updatedParcel: any;

	try {
		updatedParcel = await prisma.$transaction(async (tx) => {
			const parcel = await tx.parcel.update({
				where: { id: parcelId },
				data: {
					...payload,
					...(newImage && {
						parcelImageUrl: newImage.url,
						parcelImagePublicId: newImage.publicId,
					}),
				},
			});

			if (payload.weightKg !== undefined || payload.quantity !== undefined) {
				await recalculateShipmentWeightAndPrice(tx, shipmentId);
			}

			return parcel;
		});
	} catch (error) {
		if (newImage) {
			await cloudinary.uploader.destroy(newImage.publicId).catch(() => {});
		}
		throw error;
	}

	if (newImage && existingParcel.parcelImagePublicId) {
		await cloudinary.uploader
			.destroy(existingParcel.parcelImagePublicId)
			.catch(() => {});
	}

	return updatedParcel;
};

const deleteParcel = async (
	shipmentId: string,
	parcelId: string,
	user: RequestUser,
) => {
	const shipment = await prisma.shipment.findUnique({
		where: { id: shipmentId },
		include: { parcels: true },
	});

	if (!shipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	if (shipment.senderId !== user.userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Can Only Modify Your Own Shipments",
		);
	}

	if (shipment.status !== "PENDING") {
		throw new AppError(
			httpStatus.CONFLICT,
			"Parcels can only be removed while the shipment is still PENDING",
		);
	}

	const existingParcel = shipment.parcels.find((p) => p.id === parcelId);

	if (!existingParcel) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Parcel Not Found In This Shipment",
		);
	}

	if (shipment.parcels.length === 1) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot delete the only parcel in a shipment. Cancel the shipment instead.",
		);
	}

	if (existingParcel.parcelImagePublicId) {
		await cloudinary.uploader
			.destroy(existingParcel.parcelImagePublicId)
			.catch(() => {});
	}

	await prisma.$transaction(async (tx) => {
		await tx.parcel.delete({ where: { id: parcelId } });
		await recalculateShipmentWeightAndPrice(tx, shipmentId);
	});

	if (existingParcel.parcelImagePublicId) {
		await cloudinary.uploader
			.destroy(existingParcel.parcelImagePublicId)
			.catch(() => {});
	}

	return { message: "Parcel deleted successfully" };
};

export const ShipmentServices = {
	createShipment,
	payShipment,
	shipmentPaymentCallback,
	cancelShipment,
	getMyShipments,
	getShipmentByTrackingNumber,
	getSingleShipmentById,
	getAllShipments,
	updateShipmentStatus,
	assignCourierMan,
	shipmentAsDelivered,
	addParcel,
	updateParcel,
	deleteParcel,
};
