import type { Role } from "@/generated/prisma/client";

export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "CLIENT":
      return "/client/dashboard";
    case "PARTNER":
      return "/partner/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
  }
}
