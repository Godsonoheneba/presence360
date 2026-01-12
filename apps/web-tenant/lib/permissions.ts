export function hasPermission(
  permissions: string[] | undefined,
  permission: string | undefined,
) {
  if (!permission) {
    return true;
  }
  if (!permissions || permissions.length === 0) {
    return true;
  }
  return permissions.includes(permission);
}
