import os
from datetime import timedelta

try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
except ImportError:
    print('python-dotenv not installed - run: pip install python-dotenv')

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def env_or(key, default):
    """Return env var if set and non-empty, else default."""
    val = os.environ.get(key)
    return val if val else default


def normalize_db_url(url):
    """
    Rewrite Railway/Heroku-style postgres:// to postgresql:// so SQLAlchemy
    accepts it. Do NOT force a driver suffix - let SQLAlchemy use psycopg2
    (the default for postgresql://).
    """
    if not url:
        return url
    if url.startswith('postgres://'):
        return 'postgresql://' + url[len('postgres://'):]
    return url


class Config:
    SECRET_KEY = env_or('SECRET_KEY', 'fundar-dev-secret-change-in-prod')

    # ── Database ──
    db_url = env_or('DATABASE_URL', '')
    if db_url:
        SQLALCHEMY_DATABASE_URI = normalize_db_url(db_url)
    else:
        SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(BASE_DIR, 'fundar.db')

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Connection pool ──
    # pool_pre_ping + pool_recycle handle idle disconnects.
    # connect_args sends TCP keepalives so the server *sees* the connection
    # as alive and doesn't close it mid-idle. This is what fixes
    # "SSL SYSCALL error: EOF detected" on Neon / Supabase / RDS.
    # Only applied for PostgreSQL — SQLite doesn't accept these args.
    if (SQLALCHEMY_DATABASE_URI or '').startswith('postgresql'):
        SQLALCHEMY_ENGINE_OPTIONS = {
            'pool_pre_ping': True,
            'pool_recycle': 300,
            'connect_args': {
                'keepalives': 1,
                'keepalives_idle': 30,
                'keepalives_interval': 5,
                'keepalives_count': 5,
                'connect_timeout': 10,
                'sslmode': 'require',
            },
        }
    else:
        SQLALCHEMY_ENGINE_OPTIONS = {
            'pool_pre_ping': True,
            'pool_recycle': 300,
        }

    # ── Uploads ──
    UPLOAD_FOLDER = env_or('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))

    # Must be > 50 MB (video cap) + buffer for multipart overhead.
    MAX_CONTENT_LENGTH = 60 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'pdf'}

    # ── Admin ──
    ADMIN_PATH = env_or('ADMIN_PATH', '/admin')
    ADMIN_KEY = env_or('ADMIN_KEY', 'kamupus-admin-2026')
    ADMIN_SESSION_MINUTES = int(env_or('ADMIN_SESSION_MINUTES', '30'))

    # ── Sessions ──
    PERMANENT_SESSION_LIFETIME = timedelta(days=365)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

    # ── Password reset ──
    PASSWORD_RESET_TOKEN_MINUTES      = int(env_or('PASSWORD_RESET_TOKEN_MINUTES', '30'))
    PASSWORD_RESET_RATE_LIMIT_MINUTES = int(env_or('PASSWORD_RESET_RATE_LIMIT_MINUTES', '5'))
    APP_BASE_URL                      = env_or('APP_BASE_URL', '')

    # ── SMTP ──
    SMTP_HOST     = env_or('SMTP_HOST', '')
    SMTP_PORT     = int(env_or('SMTP_PORT', '587'))
    SMTP_USER     = env_or('SMTP_USER', '')
    SMTP_PASSWORD = env_or('SMTP_PASSWORD', '')
    SMTP_FROM     = env_or('SMTP_FROM', 'no-reply@kamupus.com')
    SMTP_USE_TLS  = env_or('SMTP_USE_TLS', 'true').lower() == 'true'