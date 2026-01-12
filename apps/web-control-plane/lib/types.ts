export type TenantCreateRequest = {
  slug: string;
  name: string;
  admin_email: string;
};

export type TenantCreateResponse = {
  tenant_id: string;
  slug: string;
  provisioning_state: string;
  db_name: string;
};

export type Tenant = {
  id: string;
  slug?: string;
  name?: string;
  status?: string;
  provisioning_state?: string;
};

export type TenantListResponse = {
  items: Tenant[];
};
