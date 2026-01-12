DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'control_plane') THEN
        CREATE DATABASE control_plane;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tenant_dev') THEN
        CREATE DATABASE tenant_dev;
    END IF;
END $$;
