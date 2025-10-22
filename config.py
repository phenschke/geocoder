import os

class Config:
    """Application configuration"""
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    DATABASE_PATH = os.path.join(BASE_DIR, 'data', 'geocoder.db')
    MAPS_DIR = os.path.join(BASE_DIR, 'static', 'maps')
    UNDO_STACK_SIZE = 50
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    # Map georeferencing configuration
    # These can be set per map via the database or API
    DEFAULT_MAP_BOUNDS = {
        'min_lat': None,
        'max_lat': None,
        'min_lon': None,
        'max_lon': None
    }
