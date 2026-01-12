import os
import re
import secrets
import uuid
from dataclasses import dataclass

import psycopg
from alembic import command
from alembic.config import Config
from psycopg import sql
from sqlalchemy import select
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import GlobalAuditLog, Tenant, TenantDbConnection
from app.providers.rekognition import get_rekognition_provider
from app.secrets import EnvSecretStore, FileSecretStore, SecretStore, SecretStoreError
from app.tenant_schema import Permission, Role, RolePermission, User, UserRole

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$")

DEFAULT_PERMISSIONS = [
    ("audit.read", "View audit logs"),
    ("config.manage", "Manage tenant configuration"),
    ("faces.delete", "Delete face profiles"),
    ("faces.enroll", "Enroll face profiles"),
    ("followups.manage", "Manage follow-up tasks"),
    ("locations.manage", "Manage locations and gates"),
    ("messages.send", "Send messages"),
    ("people.read", "View people"),
    ("people.write", "Manage people"),
    ("reports.read", "View reports"),
    ("services.manage", "Manage services and sessions"),
    ("users.manage", "Manage users and roles"),
]

DEFAULT_ROLES = [
    ("ChurchOwnerAdmin", "Full access"),
    ("BranchAdmin", "Branch-level admin"),
    ("Pastor", "Pastoral staff"),
    ("Usher", "Usher access"),
    ("FollowUpOfficer", "Follow-up officer"),
    ("Analyst", "Read-only analyst"),
]

ROLE_PERMISSION_MAP = {
    "ChurchOwnerAdmin": [perm[0] for perm in DEFAULT_PERMISSIONS],
    "BranchAdmin": [
        "config.manage",
        "faces.enroll",
        "followups.manage",
        "locations.manage",
        "messages.send",
        "people.read",
        "people.write",
        "reports.read",
        "services.manage",
        "users.manage",
        "audit.read",
    ],
    "Pastor": [
        "people.read",
        "reports.read",
        "services.manage",
        "followups.manage",
        "messages.send",
    ],
    "Usher": ["people.read", "people.write", "faces.enroll", "services.manage"],
    "FollowUpOfficer": ["people.read", "messages.send", "followups.manage"],
    "Analyst": ["reports.read", "audit.read"],
}


@dataclass
class ProvisioningResult:
    tenant: Tenant
    created: bool


class ProvisioningError(RuntimeError):
    def __init__(self, message: str, status_code: int = 409) -> None:
        super().__init__(message)
        self.status_code = status_code


class TenantProvisioner:
    def __init__(self, secret_store: SecretStore) -> None:
        self._secret_store = secret_store
        self._settings = get_settings()

    def provision(
        self,
        session: Session,
        slug: str,
        name: str,
        admin_email: str,
        idempotency_key: str | None,
    ) -> ProvisioningResult:
        slug = slug.strip().lower()
        if not SLUG_RE.match(slug):
            raise ProvisioningError("Invalid slug format", status_code=422)

        if idempotency_key:
            existing = session.scalar(
                select(Tenant).where(Tenant.idempotency_key == idempotency_key)
            )
            if existing:
                return ProvisioningResult(tenant=existing, created=False)

        existing_slug = session.scalar(select(Tenant).where(Tenant.slug == slug))
        if existing_slug:
            raise ProvisioningError("Slug already exists", status_code=409)

        tenant = Tenant(
            slug=slug,
            name=name.strip(),
            status="provisioning",
            provisioning_state="provisioning",
            idempotency_key=idempotency_key,
        )
        session.add(tenant)
        session.flush()
        tenant_id = str(tenant.id)
        session.add(
            GlobalAuditLog(
                actor_type="system",
                tenant_id=tenant.id,
                action="tenant.provisioning_started",
                target_type="tenant",
                target_id=tenant.id,
                metadata_json={"slug": slug},
            )
        )
        session.commit()

        db_name = f"tenant_{tenant_id}"
        db_user = f"tenant_{tenant_id}"
        db_password = secrets.token_urlsafe(32)
        admin_url = self._get_admin_url()
        created_db = False
        created_user = False
        try:
            secret_ref = None
            if self._settings.secret_store_backend.lower() == "env":
                try:
                    db_password = self._secret_store.get(self._settings.tenant_db_password_ref)
                except SecretStoreError as exc:  # noqa: PERF203
                    raise ProvisioningError(str(exc), status_code=500) from exc
                secret_ref = self._settings.tenant_db_password_ref
            self._create_db_and_user(admin_url, db_name, db_user, db_password)
            created_db = True
            created_user = True
            if secret_ref is None and isinstance(self._secret_store, FileSecretStore):
                secret_ref = self._secret_store.store_tenant_db_credentials(
                    tenant_id=tenant_id,
                    password=db_password,
                )
            if not secret_ref:
                raise ProvisioningError("Secret store not configured", status_code=500)
            tenant_db_url = self._build_db_url(admin_url, db_name, db_user, db_password)
            self._run_tenant_migrations(tenant_db_url)
            self._seed_tenant_db(tenant_db_url, admin_email)
            self._create_rekognition_collection(tenant_id)

            session.add(
                TenantDbConnection(
                    tenant_id=tenant.id,
                    db_host=admin_url.host or "",
                    db_port=str(admin_url.port or 5432),
                    db_name=db_name,
                    db_user=db_user,
                    secret_ref=secret_ref,
                    state="active",
                    is_primary=True,
                )
            )
            tenant.status = "active"
            tenant.provisioning_state = "ready"
            session.add(
                GlobalAuditLog(
                    actor_type="system",
                    tenant_id=tenant.id,
                    action="tenant.provisioning_succeeded",
                    target_type="tenant",
                    target_id=tenant.id,
                    metadata_json={"db_name": db_name},
                )
            )
            session.commit()
            return ProvisioningResult(tenant=tenant, created=True)
        except Exception as exc:  # noqa: BLE001
            tenant.status = "error"
            tenant.provisioning_state = "failed"
            session.add(
                GlobalAuditLog(
                    actor_type="system",
                    tenant_id=tenant.id,
                    action="tenant.provisioning_failed",
                    target_type="tenant",
                    target_id=tenant.id,
                    metadata_json={"error": str(exc)},
                )
            )
            session.commit()
            if created_db or created_user:
                self._drop_db_and_user(admin_url, db_name, db_user)
            raise

    def _get_admin_url(self) -> URL:
        raw_url = self._settings.postgres_admin_url or self._settings.database_url
        if not raw_url:
            raise ProvisioningError("POSTGRES_ADMIN_URL is not configured", status_code=500)
        return make_url(raw_url)

    def _create_db_and_user(
        self, admin_url: URL, db_name: str, db_user: str, db_password: str
    ) -> None:
        dsn = self._to_psycopg_dsn(admin_url)
        with psycopg.connect(dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
                if cur.fetchone():
                    raise ProvisioningError("Tenant database already exists", status_code=409)
                cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (db_user,))
                if cur.fetchone():
                    raise ProvisioningError("Tenant role already exists", status_code=409)
                cur.execute(
                    sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(
                        sql.Identifier(db_user), sql.Literal(db_password)
                    )
                )
                cur.execute(
                    sql.SQL("CREATE DATABASE {} OWNER {}").format(
                        sql.Identifier(db_name), sql.Identifier(db_user)
                    )
                )

    def _drop_db_and_user(self, admin_url: URL, db_name: str, db_user: str) -> None:
        dsn = self._to_psycopg_dsn(admin_url)
        with psycopg.connect(dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
                    (db_name,),
                )
                cur.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(db_name))
                )
                cur.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(db_user)))

    def _build_db_url(self, admin_url: URL, db_name: str, db_user: str, db_password: str) -> str:
        tenant_url = admin_url.set(database=db_name, username=db_user, password=db_password)
        return tenant_url.render_as_string(hide_password=False)

    def _run_tenant_migrations(self, tenant_db_url: str) -> None:
        migrations_path = os.path.join(os.path.dirname(__file__), "..", "tenant_migrations")
        config = Config(os.path.join(migrations_path, "alembic.ini"))
        config.set_main_option("script_location", migrations_path)
        config.set_main_option("sqlalchemy.url", tenant_db_url)
        command.upgrade(config, "head")

    def _seed_tenant_db(self, tenant_db_url: str, admin_email: str) -> None:
        from sqlalchemy import create_engine, insert

        engine = create_engine(tenant_db_url, future=True)
        role_rows = [
            {"id": uuid.uuid4(), "name": name, "description": desc, "is_system": True}
            for name, desc in DEFAULT_ROLES
        ]
        perm_rows = [
            {"id": uuid.uuid4(), "name": name, "description": desc}
            for name, desc in DEFAULT_PERMISSIONS
        ]
        role_map = {row["name"]: row["id"] for row in role_rows}
        perm_map = {row["name"]: row["id"] for row in perm_rows}
        role_perm_rows = []
        for role_name, permission_names in ROLE_PERMISSION_MAP.items():
            role_id = role_map.get(role_name)
            if not role_id:
                continue
            for perm_name in permission_names:
                perm_id = perm_map.get(perm_name)
                if perm_id:
                    role_perm_rows.append({"role_id": role_id, "permission_id": perm_id})

        admin_user_id = uuid.uuid4()
        user_rows = [{"id": admin_user_id, "email": admin_email, "status": "active"}]
        user_role_rows = [
            {
                "id": uuid.uuid4(),
                "user_id": admin_user_id,
                "role_id": role_map["ChurchOwnerAdmin"],
                "is_active": True,
            }
        ]

        with engine.begin() as conn:
            conn.execute(insert(Role), role_rows)
            conn.execute(insert(Permission), perm_rows)
            if role_perm_rows:
                conn.execute(insert(RolePermission), role_perm_rows)
            conn.execute(insert(User), user_rows)
            conn.execute(insert(UserRole), user_role_rows)

    def _create_rekognition_collection(self, tenant_id: str) -> None:
        provider = get_rekognition_provider()
        provider.create_collection(tenant_id)

    def _to_psycopg_dsn(self, url: URL) -> str:
        return url.set(drivername="postgresql").render_as_string(hide_password=False)


def get_secret_store() -> SecretStore:
    settings = get_settings()
    backend = settings.secret_store_backend.lower()
    if backend == "file":
        return FileSecretStore(settings.secret_store_path)
    return EnvSecretStore()


def get_provisioner() -> TenantProvisioner:
    return TenantProvisioner(secret_store=get_secret_store())
