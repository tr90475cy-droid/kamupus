import os
from datetime import timedelta

try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
except ImportError:
    print('⚠ python-dotenv not installed — run: pip install python-dotenv')

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def env_or(key, default):
    """Return env var if set and non-empty, else default."""
    val = os.environ.get(key)
    return val if val else default


class Config:
    SECRET_KEY = env_or('SECRET_KEY', 'fundar-dev-secret-change-in-prod')

    # ── Database ──
    db_url = env_or('DATABASE_URL', '')

    # Normalise legacy postgres:// → postgresql://
    if db_url and db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)

    if db_url:
        SQLALCHEMY_DATABASE_URI = db_url
    else:
        SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(BASE_DIR, 'fundar.db')

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Connection pool (fixes Neon idle disconnects) ──
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }

    # ── Uploads ──
    UPLOAD_FOLDER = env_or('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
    MAX_CONTENT_LENGTH = 20 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'pdf'}

    # ── Admin ──
    ADMIN_PATH = env_or('ADMIN_PATH', '/admin')
    ADMIN_KEY = env_or('ADMIN_KEY', 'kamupus-admin-2026')
    ADMIN_SESSION_MINUTES = int(env_or('ADMIN_SESSION_MINUTES', '30'))

    # ── Sessions ──
    PERMANENT_SESSION_LIFETIME = timedelta(days=365)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    # SESSION_COOKIE_SECURE = True   # uncomment once you have HTTPS custom domain