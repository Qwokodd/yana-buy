import type { Request } from "express";
import type { AdminRiderApplication, MyRiderApplication, RiderApplication } from "@yanabuy/shared";
import type { RiderApplicationRow, UserRow } from "../db/schema";
import { signedUrl } from "./private-files";

export function riderApplicationOut(req: Request, a: RiderApplicationRow): RiderApplication {
  return {
    id: a.id,
    vehicle: a.vehicle,
    plateNumber: a.plateNumber,
    city: a.city,
    areas: a.areas,
    emergencyName: a.emergencyName,
    emergencyPhone: a.emergencyPhone,
    status: a.status,
    statusReason: a.statusReason,
    submittedAt: a.submittedAt.toISOString(),
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    documents: {
      idType: a.idType,
      idFrontUrl: signedUrl(req, a.idFrontKey),
      idBackUrl: a.idBackKey ? signedUrl(req, a.idBackKey) : null,
      selfieUrl: signedUrl(req, a.selfieKey),
      licenseUrl: a.licenseKey ? signedUrl(req, a.licenseKey) : null,
    },
  };
}

export function myRiderApplication(req: Request, a: RiderApplicationRow): MyRiderApplication {
  return {
    ...riderApplicationOut(req, a),
    keys: { idFrontKey: a.idFrontKey, idBackKey: a.idBackKey, selfieKey: a.selfieKey, licenseKey: a.licenseKey },
  };
}

export function adminRiderApplication(
  req: Request,
  a: RiderApplicationRow,
  u: UserRow,
  reviewer: { id: string; fullName: string } | null
): AdminRiderApplication {
  return {
    ...riderApplicationOut(req, a),
    user: { id: u.id, fullName: u.fullName, phone: u.phone, avatarUrl: u.avatarUrl, role: u.role, status: u.status, createdAt: u.createdAt.toISOString() },
    reviewedBy: reviewer,
  };
}
