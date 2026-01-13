export type AccessConfig = {
  permissions?: string[];
  roles?: string[];
};

export function hasAccess(
  user: AccessConfig | null | undefined,
  required?: { permissions?: string[]; roles?: string[] },
) {
  if (!required || (!required.permissions?.length && !required.roles?.length)) {
    return true;
  }

  const permissions = user?.permissions ?? [];
  const roles = user?.roles ?? [];

  if (permissions.length === 0 && roles.length === 0) {
    return true;
  }

  const permOk = required.permissions
    ? required.permissions.some((perm) => permissions.includes(perm))
    : true;
  const roleOk = required.roles
    ? required.roles.some((role) => roles.includes(role))
    : true;

  return permOk && roleOk;
}
