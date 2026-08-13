import "server-only";

import {
  emailHasCloudAccess,
  parseCloudAccessMode,
  parseCloudTesterEmails,
} from "@creed/cloud/lib/cloud-access-core";

export function getCloudAccessMode() {
  return parseCloudAccessMode(process.env.CREED_CLOUD_ACCESS);
}

export function isPrivateCloud(): boolean {
  return getCloudAccessMode() === "private";
}

export function canAccessCloud(email: string | null | undefined): boolean {
  return emailHasCloudAccess(
    getCloudAccessMode(),
    parseCloudTesterEmails(process.env.CREED_CLOUD_TESTER_EMAILS),
    email,
  );
}

export function hasPrivateCloudAccess(email: string | null | undefined): boolean {
  return isPrivateCloud() && canAccessCloud(email);
}
