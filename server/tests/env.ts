// Imported first so the environment is set before the app reads it.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://unique:unique_dev_pw@localhost:5441/unique_test?schema=public";
process.env.ADMIN_JWT_SECRET = "test-admin-secret-0123456789abcdef0123";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
