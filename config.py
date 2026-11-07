import os
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def env_or(key, default):
    """Return env var if set and non-empty, else default."""
    val = os.environ.get(key)
    return val if val else default


class Config:
    SECRET_KEY = env_or('SECRET_KEY', 'fundar-dev-secret-change-in-prod')

    db_url = env_or('DATABASE_URL', '')
    if db_url and db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)

    if db_url:
        SQLALCHEMY_DATABASE_URI = db_url
    else:
        SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(BASE_DIR, 'fundar.db')

        SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Connection pool — fixes Neon/Railway "SSL connection closed" errors ──
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,    # test connection before use
        'pool_recycle': 300,      # refresh every 5 min (Neon's idle timeout)
        'connect_args': {
            'keepalives': 1,          # enable TCP keepalives
            'keepalives_idle': 30,    # send keepalive after 30s of inactivity
            'keepalives_interval': 5, # retry every 5s if no ack
            'keepalives_count': 5,    # give up after 5 failed attempts
        },
    }

    UPLOAD_FOLDER = env_or('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
    MAX_CONTENT_LENGTH = 20 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'pdf'}

    ADMIN_PATH = env_or('ADMIN_PATH', '/admin')
    ADMIN_KEY = env_or('ADMIN_KEY', 'fundar-admin-2026')
    ADMIN_SESSION_MINUTES = int(env_or('ADMIN_SESSION_MINUTES', '30'))

    # ── SESSION PERSISTENCE ──
    # Users stay logged in for 365 days after their last visit,
    # even if they fully close the browser.
    PERMANENT_SESSION_LIFETIME = timedelta(days=365)
    SESSION_COOKIE_HTTPONLY = True        # JS cannot read the cookie (XSS protection)
    SESSION_COOKIE_SAMESITE = 'Lax'       # blocks cross-site form POSTs
    SESSION_COOKIE_SECURE = True        # uncomment ONLY if served over HTTPS