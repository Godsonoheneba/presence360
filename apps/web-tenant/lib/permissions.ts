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
  if (!user) {
    return false;
  }

  const permissions = user.permissions ?? [];
  const roles = user.roles ?? [];

  const permOk = required.permissions
    ? required.permissions.some((perm) => permissions.includes(perm))
    : true;
  const roleOk = required.roles
    ? required.roles.some((role) => roles.includes(role))
    : true;

  return permOk && roleOk;
}
